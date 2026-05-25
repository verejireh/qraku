from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
import json
import logging
import os
import stripe
from database import get_session
from models import Menu, Order, OrderItem, PendingPayPayOrder, Store, Table, WebhookEvent
from utils.time_helpers import now_utc_naive

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

@router.post("/stripe")
async def stripe_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    if not endpoint_secret:
        raise HTTPException(
            status_code=503,
            detail="Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in environment."
        )
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError as e:
        # Invalid payload
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the checkout.session.completed event
    if event['type'] == 'checkout.session.completed':
        session_obj = event['data']['object']
        
        # Fulfill the purchase...
        await fulfill_checkout(session_obj, session)

    # Passed signature verification
    return {"status": "success"}


async def fulfill_checkout(session_obj, db_session: AsyncSession):
    metadata = session_obj.get("metadata", {})
    order_id_str = metadata.get("order_id")
    shop_id = metadata.get("shop_id")
    table_number_str = metadata.get("table_number")
    
    if not order_id_str:
        print("Webhook Warning: No order_id found in metadata")
        return

    order_id = int(order_id_str)
    
    # 1. Update Order Status
    order = await db_session.get(Order, order_id)
    if order:
        order.payment_status = "paid"
        order.status = "paid"
        db_session.add(order)
        print(f"Webhook Success: Order {order_id} marked as paid.")
    
    # 2. Seamless Table Turnover Automation
    if shop_id and table_number_str:
        # First find the store id using the shop_id slug
        store_result = await db_session.execute(select(Store).where(Store.slug == shop_id))
        store = store_result.scalar_one_or_none()
        
        if not store and shop_id.isdigit():
            store = await db_session.get(Store, int(shop_id))
            
        if store:
            # Find the table based on store_id and table_number
            table_result = await db_session.execute(
                select(Table).where(
                    Table.store_id == store.id, 
                    Table.table_number == table_number_str
                )
            )
            table = table_result.scalar_one_or_none()
            
            if table:
                # AUTO-CLEAR THE TABLE for the next guest
                table.status = "READY"
                table.session_token = None
                table.join_window_end = None
                db_session.add(table)
                print(f"Seamless Turnover: Table {table_number_str} at Store {shop_id} cleared for next guest.")

    # Commit all changes atomically
    await db_session.commit()
    
    if store:
        from utils.events import emit
        await emit(db_session, store.id, "NEW_ORDER", {
            "order_id": order_id,
            "table_number": table_number_str,
        })


async def _auto_create_order_from_pending(
    session: AsyncSession,
    merchant_payment_id: str,
    paypay_payment_id: str | None,
) -> Order | None:
    """PendingPayPayOrder snapshot 기반으로 Order + OrderItem 자동 생성.

    호출 조건: webhook 이 state=COMPLETED 를 수신했으나 폴링 경로(PayPayCompleteView)
    가 Order 를 만들지 않은 케이스 (손님이 콜백 페이지를 닫음 등).

    Returns 생성된 Order 또는 None (snapshot 없음/만료/이미 소비됨).

    멱등성:
      - PendingPayPayOrder.consumed_at 으로 동일 webhook 중복 처리 차단
      - Order.square_payment_id UNIQUE INDEX 로 폴링 경로와의 race condition 차단
        (IntegrityError → rollback 후 기존 Order 반환)
    """
    if not paypay_payment_id:
        return None

    res = await session.execute(
        select(PendingPayPayOrder).where(
            PendingPayPayOrder.merchant_payment_id == merchant_payment_id
        ).limit(1)
    )
    pending = res.scalar_one_or_none()
    if not pending:
        return None
    if pending.consumed_at is not None:
        return None
    if pending.expires_at < now_utc_naive():
        logger.warning(
            "PayPay webhook: pending snapshot expired for mid=%s (expired_at=%s)",
            merchant_payment_id, pending.expires_at,
        )
        return None

    try:
        cart = json.loads(pending.cart_snapshot)
    except json.JSONDecodeError:
        logger.exception("PayPay webhook: cart_snapshot JSON parse failed mid=%s", merchant_payment_id)
        return None
    if not isinstance(cart, list) or not cart:
        return None

    order = Order(
        shop_id=str(pending.store_id),
        table_number="0",
        session_token="takeout",
        guest_uuid=pending.guest_uuid,
        order_type="take_out",
        payment_method="PAYPAY_DIRECT",
        payment_status="paid",
        square_payment_id=paypay_payment_id,
        total_amount=float(pending.amount),
        stamp_reward_used=pending.stamp_reward_used,
        used_coupon_id=pending.coupon_id,
        status="paid",
        needs_serving=True,
    )
    session.add(order)
    try:
        await session.flush()
    except IntegrityError:
        # 동시 폴링 경로가 먼저 Order 생성 — rollback 후 기존 Order 반환
        await session.rollback()
        res = await session.execute(
            select(Order).where(Order.square_payment_id == paypay_payment_id).limit(1)
        )
        return res.scalar_one_or_none()

    # cart 의 각 item → OrderItem (unit_price 는 DB Menu 기준 재계산)
    for raw in cart:
        if not isinstance(raw, dict):
            continue
        menu_id = raw.get("menu_id")
        if menu_id is None:
            continue
        try:
            menu = await session.get(Menu, int(menu_id))
        except (TypeError, ValueError):
            continue
        if not menu:
            continue

        opt_details = raw.get("option_details")
        extra_price = 0.0
        if opt_details and menu.options and menu.options != "[]":
            try:
                selected = json.loads(opt_details) if isinstance(opt_details, str) else opt_details
                db_options = json.loads(menu.options)
                if isinstance(selected, dict) and isinstance(db_options, list):
                    for group_name, choice_name in selected.items():
                        group = next(
                            (g for g in db_options if g.get("group_name") == group_name), None
                        )
                        if group:
                            choice = next(
                                (c for c in group.get("choices", []) if c.get("name") == choice_name),
                                None,
                            )
                            if choice:
                                extra_price += float(choice.get("extra_price", 0))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

        unit_price = float(menu.price or 0) + extra_price
        oi = OrderItem(
            order_id=order.id,
            menu_item_id=str(menu_id),
            quantity=int(raw.get("quantity", 1)),
            unit_price=unit_price,
            option_details=(
                opt_details if isinstance(opt_details, str)
                else json.dumps(opt_details, ensure_ascii=False) if opt_details else None
            ),
        )
        session.add(oi)

    pending.consumed_at = now_utc_naive()
    session.add(pending)
    return order


@router.post("/paypay")
async def paypay_webhook(
    request: Request,
    x_signature: str = Header(...),
    session: AsyncSession = Depends(get_session),
):
    raw = await request.body()

    from services.pos.adapters.paypay_direct_adapter import verify_paypay_signature
    if not verify_paypay_signature(raw, x_signature):
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid JSON body")

    notification_id = payload.get("notification_id") or payload.get("notificationId", "")
    merchant_payment_id = payload.get("merchant_payment_id") or payload.get("merchantPaymentId", "")
    state = payload.get("state", "")

    if not notification_id:
        raise HTTPException(status_code=400, detail="notification_id missing")

    # 멱등성: 동일 notification_id 두 번 수신 시 즉시 반환
    event = WebhookEvent(
        provider="paypay",
        event_id=notification_id,
        signature_valid=True,
        payload_raw=raw.decode("utf-8"),
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return {"status": "duplicate"}

    order = None
    store_id_for_log = None

    # merchant_payment_id 형식: qraku_{store_id}_{random} — store_id 추출
    parts = merchant_payment_id.split("_") if merchant_payment_id else []
    if len(parts) >= 3 and parts[0] == "qraku":
        try:
            store_id_for_log = int(parts[1])
        except (ValueError, IndexError):
            pass

    order_auto_created = False
    if state == "COMPLETED":
        paypay_payment_id = payload.get("paymentId") or payload.get("payment_id")
        if paypay_payment_id:
            res = await session.execute(
                select(Order).where(Order.square_payment_id == paypay_payment_id).limit(1)
            )
            order = res.scalar_one_or_none()

        # Order 미발견 — PendingPayPayOrder snapshot 으로 자동 생성 시도
        if not order and merchant_payment_id:
            order = await _auto_create_order_from_pending(
                session, merchant_payment_id, paypay_payment_id
            )
            if order is not None and order.id is None:
                order = None  # rollback 경로
            elif order is not None:
                order_auto_created = True

        from utils.event_log import log_event
        if order:
            if order.payment_status != "paid":
                order.payment_status = "paid"
            await log_event(
                session,
                store_id=store_id_for_log or 0,
                actor_type="webhook",
                action="payment.completed.auto_created" if order_auto_created else "payment.completed",
                target_type="order",
                target_id=order.id,
                external_payload_raw=raw.decode("utf-8"),
            )
        elif store_id_for_log:
            # 안전망: 결제는 완료됐으나 Order 미생성 + snapshot 도 없음/만료
            # — 수동 처리 필요 (예: 만료 30분 초과한 결제)
            await log_event(
                session,
                store_id=store_id_for_log,
                actor_type="webhook",
                action="payment.completed.order_missing",
                external_payload_raw=raw.decode("utf-8"),
            )
            event.processed = False

    elif state in ("CANCELED", "FAILED") and store_id_for_log:
        from utils.event_log import log_event
        await log_event(
            session,
            store_id=store_id_for_log,
            actor_type="webhook",
            action="payment.failed",
            external_payload_raw=raw.decode("utf-8"),
        )

    if event.processed is not False:
        event.processed = True
    await session.commit()

    if state == "COMPLETED" and order and store_id_for_log:
        from utils.events import emit_order_created, emit_payment_completed
        if order_auto_created:
            # KDS / staff 가 자동 생성된 주문을 인지하도록 NEW_ORDER 도 emit
            await emit_order_created(session, store_id_for_log, order)
        await emit_payment_completed(session, store_id_for_log, order)

    return {"status": "ok"}

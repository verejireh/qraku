from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
import json
import os
import stripe
from database import get_session
from models import Order, Table, Store, WebhookEvent

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

    if state == "COMPLETED":
        paypay_payment_id = payload.get("paymentId") or payload.get("payment_id")
        if paypay_payment_id:
            res = await session.execute(
                select(Order).where(Order.square_payment_id == paypay_payment_id).limit(1)
            )
            order = res.scalar_one_or_none()

        from utils.event_log import log_event
        if order:
            if order.payment_status != "paid":
                order.payment_status = "paid"
            await log_event(
                session,
                store_id=store_id_for_log or 0,
                actor_type="webhook",
                action="payment.completed",
                target_type="order",
                target_id=order.id,
                external_payload_raw=raw.decode("utf-8"),
            )
        elif store_id_for_log:
            # 안전망: 결제는 완료됐으나 Order 미생성 — 수동 처리 필요
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
        from utils.events import emit_payment_completed
        await emit_payment_completed(session, store_id_for_log, order)

    return {"status": "ok"}

from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks, Request
import logging
import math
from sqlmodel import select, SQLModel

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from database import get_session, async_session_maker
from models import Order, OrderItem, Menu, Table, OrderCreate, Customer, DeviceSession, PaymentSettings, TabehoudaiSession, MenuGroupItem, Store, PendingPayPayOrder
from utils.jwt import require_staff_or_admin
from utils.time_helpers import today_start_jst_as_utc_naive, now_utc_naive
from utils.pickup_code import next_pickup_code
from datetime import datetime
import os
import time
from collections import defaultdict

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

router = APIRouter(prefix="/orders", tags=["orders"])

from sqlalchemy.orm import selectinload
from services.pos.factory import get_payment_adapter, get_pos_adapter

# ── Simple in-memory rate limiter (IP → [timestamps]) ────────────────────────
_rate_limit_window = 60  # seconds
_rate_limit_max = 10     # max orders per IP per window
_rate_limit_store: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(client_ip: str):
    """Raise 429 if client exceeds order creation rate limit."""
    now = time.time()
    window_start = now - _rate_limit_window
    # Prune old entries
    _rate_limit_store[client_ip] = [t for t in _rate_limit_store[client_ip] if t > window_start]
    if len(_rate_limit_store[client_ip]) >= _rate_limit_max:
        raise HTTPException(status_code=429, detail="注文の回数制限を超えました。しばらくお待ちください。")
    _rate_limit_store[client_ip].append(now)

# --- Read Schemas ---
class TableRead(SQLModel):
    id: int
    table_number: str
    status: str

class MenuRead(SQLModel):
    id: int
    name_jp: Optional[str] = None
    name_en: Optional[str] = None
    name_ko: Optional[str] = None
    price: Optional[int] = 0
    category: Optional[str] = "Other"
    image_url: Optional[str] = None
    description_ko: Optional[str] = None
    description_jp: Optional[str] = None
    description_en: Optional[str] = None

class OrderItemRead(SQLModel):
    id: int
    menu_item_id: str
    quantity: int
    unit_price: float
    option_details: Optional[str] = None
    status: Optional[str] = "pending"
    is_takeout_item: Optional[bool] = False

class OrderRead(SQLModel):
    id: int
    shop_id: str
    table_number: str
    session_token: Optional[str] = None
    guest_uuid: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = "unpaid"
    order_type: Optional[str] = "eat_in"
    pickup_code: Optional[str] = None
    pickup_time: Optional[str] = None
    status: str
    needs_serving: Optional[bool] = True
    total_amount: float
    created_at: datetime
    items: List[OrderItemRead] = []

class OrderCreateResponse(SQLModel):
    order_id: int
    total_amount: float
    payment_method: Optional[str] = None
    pickup_code: Optional[str] = None

def calculate_distance(lat1, lon1, lat2, lon2):
    # Haversine formula
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.asin(math.sqrt(a))

@router.post("/", response_model=OrderCreateResponse)
async def create_order(
    order_in: OrderCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
):
    import json
    # ── Rate limit ──
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    order_type = getattr(order_in, "order_type", "eat_in") or "eat_in"
    is_take_out = (order_type == "take_out")

    # ── 1. Resolve Store and Payment Settings ──────────────────────────────
    from models import Store
    store_result = await session.execute(
        select(Store)
        .options(selectinload(Store.payment_settings), selectinload(Store.display_settings))
        .where(Store.slug == order_in.shop_id)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        try:
            store_result = await session.execute(
                select(Store)
                .options(selectinload(Store.payment_settings), selectinload(Store.display_settings))
                .where(Store.id == int(order_in.shop_id))
            )
            store = store_result.scalar_one_or_none()
        except (ValueError, TypeError):
            store = None
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # ── 영업시간 외 주문 거부 (사장님 수동 OFF 또는 영업시간 외) ──────────────
    from utils.business_hours import is_store_open_now
    is_open, reason = is_store_open_now(store)
    if not is_open:
        msg_map = {
            'manual_off': '現在準備中のため、ご注文を受け付けておりません。',
            'before_open': '営業時間前のため、ご注文を受け付けておりません。',
            'after_close': '本日の営業時間が終了しました。',
        }
        raise HTTPException(status_code=400, detail=msg_map.get(reason, '営業時間外のため、ご注文を受け付けておりません。'))

    # ── 구독 만료 체크: 만료된 스토어는 신규 주문 불가 ──────────────────────────
    if store.subscription_expires_at and now_utc_naive() > store.subscription_expires_at:
        from models import SubscriptionStatus
        status_val = store.subscription_status.value if hasattr(store.subscription_status, "value") else store.subscription_status
        if status_val != "EXPIRED":
            store.subscription_status = SubscriptionStatus.EXPIRED
            session.add(store)
            await session.commit()
        raise HTTPException(
            status_code=503,
            detail="このお店は現在ご利用いただけません。しばらくお待ちください。"
        )

    pos_mode = getattr(store, "pos_mode", "basic") or "basic"

    # ── 2. Resolve Table + Session (eat_in only) ──────────────────────────────
    if not is_take_out:
        table_result = await session.execute(
            select(Table).where(
                Table.store_id == store.id,
                Table.table_number == str(order_in.table_number)
            )
        )
        table = table_result.scalar_one_or_none()
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")

        table_status_val = table.status.value if hasattr(table.status, "value") else table.status
        if table_status_val != "OCCUPIED" or table.session_token != order_in.session_token:
            logger.warning("Session token mismatch or table not occupied: table_id=%s", table.id)
            raise HTTPException(status_code=403, detail="Invalid session token or table is not occupied.")

    # ── 3. 食べ放題: 활성 세션 + 대상 메뉴 ID 미리 조회 ───────────────────────
    tabehoudai_menu_ids: set[int] = set()
    tabehoudai_session_id: Optional[int] = None
    if not is_take_out and table:
        sess_res = await session.execute(
            select(TabehoudaiSession).where(
                TabehoudaiSession.table_id == table.id,
                TabehoudaiSession.status == "active",
            )
        )
        active_session = sess_res.scalar_one_or_none()
        if active_session and active_session.expires_at >= now_utc_naive():
            tabehoudai_session_id = active_session.id
            items_res = await session.execute(
                select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == active_session.group_id)
            )
            tabehoudai_menu_ids = {r[0] for r in items_res.all()}

    # ── 3.1. Server-side price calculation (never trust client prices) ──────────
    items_data: list = []          # (menu, item_in, unit_price, is_tabehoudai_item)
    line_items_for_square: list = []
    total_amount = 0.0

    for item_in in order_in.items:
        if item_in.quantity <= 0:
            raise HTTPException(status_code=400, detail="数量は1以上で入力してください")
        try:
            menu_id_int = int(item_in.menu_item_id)
        except ValueError:
            continue

        menu = await session.get(Menu, menu_id_int)
        if not menu:
            logger.warning("Order: menu_id=%s not found, skipping", menu_id_int)
            continue
        if str(menu.store_id) != str(store.id) and str(menu.store_id) != str(order_in.shop_id):
            logger.warning("Order: menu_id=%s store_id mismatch, skipping", menu_id_int)
            continue
        if not menu.is_available:
            raise HTTPException(status_code=400, detail=f"「{menu.name_jp or menu.name_en or menu.name_ko}」は現在売り切れです。")

        extra_price = 0.0
        if item_in.option_details:
            try:
                client_options = json.loads(item_in.option_details)
                if menu.options and menu.options != "[]":
                    db_options = json.loads(menu.options)
                    for group_name, selected_name in client_options.items():
                        for db_group in db_options:
                            if db_group.get("group_name") == group_name:
                                for db_choice in db_group.get("choices", []):
                                    if db_choice.get("name") == selected_name:
                                        extra_price += float(db_choice.get("extra_price", 0))
                                        break
                                break
            except Exception as e:
                logger.warning("Option parse error for menu_id=%s: %s", menu_id_int, e)

        # 食べ放題 대상 메뉴: unit_price = 0
        is_tabehoudai_item = menu_id_int in tabehoudai_menu_ids
        if is_tabehoudai_item:
            unit_price = 0.0
        else:
            unit_price = float(menu.price) + extra_price
        total_amount += unit_price * item_in.quantity
        items_data.append((menu, item_in, unit_price, is_tabehoudai_item))
        line_items_for_square.append({
            "name": menu.name_jp or menu.name_en or f"Item {menu.id}",
            "quantity": item_in.quantity,
            "unit_price": int(unit_price),
        })

    # ── 3.5. Reject empty orders (no valid items) ────────────────────────────
    if not items_data:
        raise HTTPException(status_code=400, detail="有効な注文アイテムがありません (No valid items)")

    # ── 3.6. LINE Digital Stamp CRM: Apply Reward or Accumulate Stamp ─────────
    stamp_reward_used = False
    discount_amount = 0.0
    from models import StampCard
    
    # guest_uuid가 line: 으로 시작하는 경우만 스탬프 대상이라고 가정 (또는 범용으로 사용)
    is_line_user = bool(order_in.guest_uuid and order_in.guest_uuid.startswith("line:"))
    stamp_card = None
    
    if store.stamp_active and is_line_user:
        stamp_result = await session.execute(
            select(StampCard).where(
                StampCard.store_id == store.id,
                StampCard.guest_uuid == order_in.guest_uuid
            )
        )
        stamp_card = stamp_result.scalar_one_or_none()
        
        if order_in.use_stamp_reward:
            # 보상 사용 — eligibility 재검증 (클라이언트 신뢰 금지)
            if stamp_card and stamp_card.stamp_count >= store.stamp_target and store.stamp_target > 0:
                discount_amount = min(total_amount, float(store.stamp_reward_discount or 0))
                if discount_amount > 0:
                    total_amount = max(0.0, total_amount - discount_amount)
                    stamp_reward_used = True
                    # 음수 방지 + race condition 시 안전
                    stamp_card.stamp_count = max(0, stamp_card.stamp_count - store.stamp_target)
                    session.add(stamp_card)
            else:
                logger.warning("Stamp reward 사용 시도 거부 (stamp 부족): uuid=%s count=%s target=%s",
                               order_in.guest_uuid,
                               stamp_card.stamp_count if stamp_card else 0,
                               store.stamp_target)
                # 자격 미달 → 보상 없이 처리하되, 1 스탬프 적립으로 대체
                if not stamp_card:
                    stamp_card = StampCard(
                        store_id=store.id,
                        guest_uuid=order_in.guest_uuid,
                        stamp_count=1,
                        last_stamped_at=now_utc_naive()
                    )
                else:
                    stamp_card.stamp_count += 1
                    stamp_card.last_stamped_at = now_utc_naive()
                session.add(stamp_card)
        else:
            # 보상 미사용 시 1 스탬프 적립
            if not stamp_card:
                stamp_card = StampCard(
                    store_id=store.id, 
                    guest_uuid=order_in.guest_uuid, 
                    stamp_count=1,
                    last_stamped_at=now_utc_naive()
                )
            else:
                stamp_card.stamp_count += 1
                stamp_card.last_stamped_at = now_utc_naive()
            session.add(stamp_card)

    # ── 3.7. Photo Review Contest Coupon ──────────────────────────────────────
    # Atomic update 패턴: UPDATE ... WHERE is_used=FALSE → 동시 사용 race 방지
    used_coupon_id = None
    if order_in.use_coupon_id and order_in.guest_uuid:
        from models import RewardCoupon
        from sqlalchemy import update as _sa_update
        coupon = await session.get(RewardCoupon, order_in.use_coupon_id)
        valid = (
            coupon
            and coupon.guest_uuid == order_in.guest_uuid
            and coupon.store_id == store.id
            and not coupon.is_used
            and (coupon.expires_at is None or coupon.expires_at >= now_utc_naive())
        )
        if valid:
            # 동시성 안전: WHERE is_used=FALSE 인 행만 업데이트
            res = await session.execute(
                _sa_update(RewardCoupon)
                .where(RewardCoupon.id == coupon.id, RewardCoupon.is_used == False)  # noqa: E712
                .values(is_used=True, used_at=now_utc_naive())
            )
            if res.rowcount == 1:
                coupon_discount = min(total_amount, float(coupon.discount_amount))
                if coupon_discount > 0:
                    total_amount = max(0.0, total_amount - coupon_discount)
                    discount_amount += coupon_discount  # UI 표시용
                    used_coupon_id = coupon.id
            else:
                logger.warning("Coupon race condition: 이미 사용됨 coupon_id=%s", coupon.id)
        else:
            logger.warning("Invalid coupon usage attempt: uuid=%s coupon=%s expired=%s",
                           order_in.guest_uuid, order_in.use_coupon_id,
                           bool(coupon and coupon.expires_at and coupon.expires_at < now_utc_naive()))

    # ── 4. Unified Payment Adapter: charge card BEFORE creating DB order ─────────────
    square_payment_id = None
    sq_payment_order_id = None
    pending_paypay_order = None

    # 설정 가져오기 (없으면 구형 Square 기본값)
    payment_method_type = store.payment_settings.payment_method_type if store.payment_settings else "SQUARE_INTEGRATED"
    payment_method_value = getattr(payment_method_type, "value", payment_method_type)

    # ── 테이크아웃 활성화 여부 체크 ──
    # Admin에서 takeout_enabled=false로 꺼둔 매장은 테이크아웃 주문 자체를 거부
    if is_take_out:
        if not getattr(store, 'takeout_enabled', False):
            raise HTTPException(
                status_code=400,
                detail="この店舗ではテイクアウト注文を受け付けていません。"
            )

    # ── 테이크아웃 선결제 필수 체크 ──
    # Square/PayPay 미설정 매장은 선결제가 불가 → 테이크아웃 주문 자체를 거부
    if is_take_out:
        has_square = bool(getattr(store, 'square_access_token', None) and getattr(store, 'square_location_id', None))
        ps = store.payment_settings
        has_payment_ps = ps and ps.payment_method_type != "PAY_AT_COUNTER" and (
            (ps.square_access_token and ps.square_location_id) or
            ps.paypay_api_key
        )
        if not has_square and not has_payment_ps:
            raise HTTPException(
                status_code=400,
                detail="このお店はオンライン決済が未設定のため、テイクアウト注文はご利用いただけません。"
            )
        if not order_in.source_id:
            raise HTTPException(status_code=400, detail="テイクアウトには決済情報が必要です (source_id required)")

        # ── 멱등성: source_id (PayPay merchant_payment_id) 로 이미 주문 만들어졌으면 그대로 반환 ──
        # PayPayCompleteView 가 두 번 호출되거나 새로고침해도 중복 주문 방지
        existing_by_source = await session.execute(
            select(Order).where(Order.session_token == order_in.session_token,
                                Order.store_id == store.id,
                                Order.square_payment_id != None)  # noqa: E711
            .order_by(Order.created_at.desc()).limit(1)
        )
        # 더 정확한 검사는 결제 후 payment_id 받은 뒤 진행

        # New Adapter Flow (Square: card nonce, PayPay: merchant_payment_id)
        payment_adapter = get_payment_adapter(store, store.payment_settings)
        if payment_adapter:
            pay_result = await payment_adapter.process_payment(
                amount=total_amount,
                source_id=order_in.source_id,
                note=f"Take-out order for store {store.id}"
            )
            if pay_result.get("status") != "ok":
                raise HTTPException(status_code=402, detail=pay_result.get("message", "Payment failed"))
            square_payment_id = pay_result.get("payment_id")
            sq_payment_order_id = pay_result.get("square_order_id")
            logger.info("Pre-payment OK: payment_id=%s", square_payment_id)
        else:
            # Fallback Legacy
            from utils.square_client import process_square_payment
            pay_result = await process_square_payment(
                store=store,
                source_id=order_in.source_id,
                amount=int(total_amount),
                note=f"Take-out order for store {store.id}",
            )
            if pay_result.get("status") != "ok":
                raise HTTPException(status_code=402, detail=pay_result.get("message", "Payment failed"))
            square_payment_id = pay_result.get("payment_id")
            sq_payment_order_id = pay_result.get("square_order_id")
            logger.info("Square legacy pre-payment OK: payment_id=%s", square_payment_id)

        # ── 멱등성: 동일 payment_id 로 이미 Order 가 있으면 그것을 반환 ──
        if square_payment_id:
            dup_res = await session.execute(
                select(Order).where(Order.square_payment_id == square_payment_id).limit(1)
            )
            dup_order = dup_res.scalar_one_or_none()
            if dup_order:
                logger.info("Idempotent: 동일 payment_id 주문 이미 존재 order_id=%s payment_id=%s",
                            dup_order.id, square_payment_id)
                return OrderCreateResponse(
                    order_id=dup_order.id,
                    total_amount=dup_order.total_amount,
                    payment_method=dup_order.payment_method,
                    pickup_code=dup_order.pickup_code,
                )

        if (
            square_payment_id
            and order_in.source_id
            and payment_method_value == "PAYPAY_DIRECT"
        ):
            pending_res = await session.execute(
                select(PendingPayPayOrder)
                .where(PendingPayPayOrder.merchant_payment_id == order_in.source_id)
                .with_for_update()
                .limit(1)
            )
            pending_paypay_order = pending_res.scalar_one_or_none()
            if pending_paypay_order and pending_paypay_order.consumed_at is not None:
                dup_res = await session.execute(
                    select(Order).where(Order.square_payment_id == square_payment_id).limit(1)
                )
                dup_order = dup_res.scalar_one_or_none()
                if dup_order:
                    return OrderCreateResponse(
                        order_id=dup_order.id,
                        total_amount=dup_order.total_amount,
                        payment_method=dup_order.payment_method,
                        pickup_code=dup_order.pickup_code,
                    )
                logger.warning(
                    "PayPay pending already consumed but order missing: mid=%s payment_id=%s",
                    order_in.source_id,
                    square_payment_id,
                )
                raise HTTPException(status_code=409, detail="PayPay payment is already being processed")

    # [이트인 일반 주문] pay_at_counter 경로 — 선결제 없이 바로 DB 생성
    # (eat_in 주문은 기존 로직 그대로)

    # ── 5. Create DB Order ────────────────────────────────────────────────────
    # 테이크아웃 주문에는 101번부터 시작하는 당일 순차 접수번호 생성
    # (PG-PAYPAY-AUTO-ORDER-HOTFIX: webhook 자동 생성 경로와 helper 공유)
    pickup_code = await next_pickup_code(session, order_in.shop_id) if is_take_out else None

    # 결제 상태 결정: 테이크아웃 선결제 완료 → "paid" / 이트인 → "unpaid"
    is_paid = bool(is_take_out and square_payment_id)
    payment_status = "paid" if is_paid else "unpaid"
    # payment_method: 서버 설정 기준으로 저장 (클라이언트 값 무시)
    resolved_payment_method = payment_method_value if is_take_out else (order_in.payment_method or "PAY_AT_COUNTER")
    # order status: 결제 완료된 테이크아웃 → "pending" (바로 주방 가능), 이트인 → "pending_payment"
    order_status = "pending" if is_paid else "pending_payment"

    db_order = Order(
        store_id=store.id,                 # 정규 FK
        shop_id=order_in.shop_id,          # dual-write (레거시 호환)
        table_number=order_in.table_number,
        session_token=order_in.session_token,
        guest_uuid=order_in.guest_uuid,
        order_type=order_type,
        payment_method=resolved_payment_method,
        payment_status=payment_status,
        square_payment_id=square_payment_id,
        square_order_id=sq_payment_order_id,
        pickup_time=order_in.pickup_time,
        pickup_code=pickup_code,
        status=order_status,
        total_amount=total_amount,
        stamp_reward_used=stamp_reward_used,
        used_coupon_id=used_coupon_id,
        discount_amount=discount_amount,
    )
    # Keep Order and OrderItems in one transaction. Committing the parent first can
    # expose empty takeout orders if the second commit fails or the webhook races in.
    try:
        async with session.begin_nested():
            session.add(db_order)
            await session.flush()
    except IntegrityError:
        try:
            session.expunge(db_order)
        except Exception:
            pass
        if square_payment_id:
            dup_res = await session.execute(
                select(Order).where(Order.square_payment_id == square_payment_id).limit(1)
            )
            existing = dup_res.scalar_one_or_none()
            if existing:
                logger.warning(
                    "IntegrityError 회복: payment_id=%s 기존 order_id=%s 반환",
                    square_payment_id,
                    existing.id,
                )
                return OrderCreateResponse(
                    order_id=existing.id,
                    total_amount=existing.total_amount,
                    payment_method=existing.payment_method,
                    pickup_code=existing.pickup_code,
                )
        logger.exception("Order flush 실패")
        raise HTTPException(status_code=500, detail="注文の保存に失敗しました")

    # ── 6. Add Order Items ────────────────────────────────────────────────────
    for menu, item_in, unit_price, is_tabehoudai_item in items_data:
        session.add(OrderItem(
            order_id=db_order.id,
            menu_item_id=str(menu.id),
            quantity=item_in.quantity,
            unit_price=unit_price,
            option_details=item_in.option_details,
            is_takeout_item=getattr(item_in, 'is_takeout_item', False),
            is_tabehoudai=is_tabehoudai_item,
            tabehoudai_session_id=tabehoudai_session_id if is_tabehoudai_item else None,
        ))

    # ── 6.5. Stock 재고 차감 + 자동 품절 처리 (SPC-09) ─────────────────────────
    for menu, item_in, _unit_price, _is_tabehoudai in items_data:
        if menu.stock_today_total is not None:
            menu.stock_today_sold = (menu.stock_today_sold or 0) + item_in.quantity
            if menu.stock_today_sold >= menu.stock_today_total:
                menu.is_available = False
            session.add(menu)

    # ── 7. Update GuestProfile ────────────────────────────────────────────────
    if order_in.guest_uuid:
        from models import GuestProfile
        guest = await session.get(GuestProfile, order_in.guest_uuid)
        if not guest:
            guest = GuestProfile(guest_uuid=order_in.guest_uuid, visit_count=1, last_visit=now_utc_naive())
        else:
            guest.prev_last_visit = guest.last_visit  # 직전 방문일 보존
            guest.visit_count += 1
            guest.last_visit = now_utc_naive()
        session.add(guest)

    if pending_paypay_order is not None:
        pending_paypay_order.consumed_at = now_utc_naive()
        session.add(pending_paypay_order)

    try:
        await session.commit()
        await session.refresh(db_order)
    except Exception:
        await session.rollback()
        logger.exception("Order commit 실패")
        raise HTTPException(status_code=500, detail="注文の保存に失敗しました")

    # ── 8. WebSocket broadcast to Kitchen (디스플레이 조건 분리) ───────────────────
    # 기존에는 무조건 전송했으나, 이제 StoreDisplaySettings.use_kitchen_page 토글 상태를 확인합니다.
    use_kitchen = True
    if getattr(store, "display_settings", None):
        use_kitchen = store.display_settings.use_kitchen_page
        
    if use_kitchen:
        from utils.events import emit_order_created
        await emit_order_created(session, store.id, db_order)

    # ── 9. Async Background POS dispatch (Square, Smaregi, AirRegi) ──
    async def dispatch_pos_background(store_id: int, order_id: int, items_payload: list):
        async with async_session_maker() as bg_session:
            bg_store_result = await bg_session.execute(
                select(Store).options(
                    selectinload(Store.payment_settings),
                    selectinload(Store.display_settings)
                ).where(Store.id == store_id)
            )
            bg_store = bg_store_result.scalar_one_or_none()
            
            bg_order = await bg_session.get(Order, order_id)
            if not bg_store or not bg_order:
                print(f"[Background POS] store {store_id} or order {order_id} not found.")
                return

            pos_adapter = get_pos_adapter(bg_store, bg_store.payment_settings)
            if pos_adapter:
                try:
                    result = await pos_adapter.send_order_to_pos(bg_order, items_payload)
                    if result.get("status") == "ok" and result.get("order_id"):
                        bg_order.square_order_id = result["order_id"] # POS 통합 주문번호로 재활용
                        bg_session.add(bg_order)
                        await bg_session.commit()
                        print(f"[Background POS] Success: {result['order_id']}")
                except Exception as e:
                    print(f"[Background POS] Adapter failed: {e}")
            else:
                # Legacy Fallback
                if getattr(bg_store, "pos_mode", "basic") == "square":
                    try:
                        from utils.square_client import create_square_order
                        sq_result = await create_square_order(
                            store=bg_store, order=bg_order, line_items=items_payload
                        )
                        sq_order_id = (sq_result.get("order") or {}).get("id")
                        if sq_order_id and not bg_order.square_order_id:
                            bg_order.square_order_id = sq_order_id
                            bg_session.add(bg_order)
                            await bg_session.commit()
                        print(f"[Square Legacy] Dispatched to Square POS for store {bg_store.id}")
                    except Exception as sq_err:
                        print(f"[Square Legacy] Failed to dispatch order {bg_order.id}: {sq_err}")

    # Fire and forget
    background_tasks.add_task(dispatch_pos_background, store.id, db_order.id, line_items_for_square)

    return {
        "order_id": db_order.id,
        "total_amount": db_order.total_amount,
        "payment_method": db_order.payment_method,
        "pickup_code": db_order.pickup_code,
    }

class OrderStatusUpdate(SQLModel):
    status: str

async def _resolve_store_by_shop_id(shop_id: str, session: AsyncSession) -> Store:
    """Order.shop_id(slug 또는 str(id))로 Store를 조회한다. (레거시 폴백 전용)"""
    store_result = await session.execute(select(Store).where(Store.slug == shop_id))
    store = store_result.scalar_one_or_none()
    if not store:
        try:
            store = await session.get(Store, int(shop_id))
        except (ValueError, TypeError):
            store = None
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


async def _store_of_order(order: Order, session: AsyncSession) -> Store:
    """주문의 매장을 정규 store_id 로 조회. 구 데이터(store_id 미설정)는 shop_id 로 폴백."""
    if order.store_id is not None:
        store = await session.get(Store, order.store_id)
        if store:
            return store
    return await _resolve_store_by_shop_id(order.shop_id, session)


async def _store_of_order_opt(order: Order, session: AsyncSession) -> Optional[Store]:
    """best-effort(알림 등) — 못 찾으면 None. store_id 우선, shop_id 폴백."""
    if order.store_id is not None:
        store = await session.get(Store, order.store_id)
        if store:
            return store
    store_result = await session.execute(select(Store).where(Store.slug == order.shop_id))
    store = store_result.scalar_one_or_none()
    if not store and (order.shop_id or "").isdigit():
        store = await session.get(Store, int(order.shop_id))
    return store


@router.patch("/{order_id}/status", response_model=Order)
async def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    store = await _store_of_order(order, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    order.status = status_update.status
    session.add(order)
    await session.commit()
    await session.refresh(order)
    
    # Broadcast status change to the customer device when kitchen marks cooking_complete
    if order.status == "cooking_complete":
        from utils.websocket import manager
        import json
        try:
            # Load order items with their menu names for the notification modal
            items_result = await session.execute(
                select(OrderItem, Menu).join(Menu, Menu.id == OrderItem.menu_item_id.cast(int), isouter=True)
                .where(OrderItem.order_id == order.id)
            )
            item_names = []
            for oi, menu in items_result.all():
                name = (menu.name_jp or menu.name_ko or menu.name_en or f"Item #{oi.menu_item_id}") if menu else f"Item #{oi.menu_item_id}"
                item_names.append({"name_jp": menu.name_jp if menu else None,
                                   "name_ko": menu.name_ko if menu else None,
                                   "name_en": menu.name_en if menu else None,
                                   "quantity": oi.quantity})

            # 정규 store_id 로 매장 조회 (best-effort)
            notify_store = await _store_of_order_opt(order, session)

            if notify_store:
                from utils.events import emit_order_completed_customer
                await emit_order_completed_customer(session, notify_store.id, order.table_number, order, item_names)
        except Exception as e:
            print("Customer WS Broadcast exception:", e)


    return order

@router.patch("/{order_id}/pay", response_model=Order)
async def pay_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order_store = await _store_of_order(order, session)
    if order_store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    order.payment_status = "paid"
    order.status = "paid"
    session.add(order)

    # Check if ALL unpaid orders for this table session are now paid → close table
    store = order_store

    closed_table = None
    if store and order.order_type != "take_out":
        table_result = await session.execute(
            select(Table).where(
                Table.store_id == store.id,
                Table.table_number == str(order.table_number)
            )
        )
        table = table_result.scalar_one_or_none()
        if table and table.session_token == order.session_token:
            # Count remaining unpaid orders for this table session (excluding current)
            remaining = await session.execute(
                select(Order).where(
                    Order.store_id == order.store_id,
                    Order.table_number == order.table_number,
                    Order.session_token == order.session_token,
                    Order.payment_status == "unpaid",
                    Order.id != order.id
                )
            )
            if not remaining.scalars().first():
                # All paid → close table
                table.status = "READY"
                table.session_token = None
                table.guest_count = None
                session.add(table)
                closed_table = table

    await session.commit()
    await session.refresh(order)

    if store:
        from utils.events import emit_payment_completed, emit_table_update
        await emit_payment_completed(session, store.id, order)
        if closed_table:
            await emit_table_update(session, store.id, closed_table, extra={"status": "READY", "guest_count": None})

    return order

class ItemStatusUpdate(SQLModel):
    status: str  # cooking_complete | served | pickup_ready

@router.patch("/items/{item_id}/status")
async def update_item_status(
    item_id: int,
    body: ItemStatusUpdate,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """Update individual order item status (cooking_complete or served)"""
    item = await session.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    item_order = await session.get(Order, item.order_id)
    if item_order:
        item_store = await _store_of_order(item_order, session)
        if item_store.id != auth_store.id:
            raise HTTPException(status_code=403, detail="Access denied")

    item.status = body.status
    session.add(item)

    order = await session.get(Order, item.order_id)

    # If all items in this order are cooking_complete or served → auto-update order
    all_items_result = await session.execute(
        select(OrderItem).where(OrderItem.order_id == item.order_id)
    )
    all_items = all_items_result.scalars().all()
    TERMINAL_STATUSES = ('cooking_complete', 'served', 'pickup_ready')
    all_done = all(i.status in TERMINAL_STATUSES for i in all_items)
    any_unserved = any(i.status not in ('served', 'pickup_ready') for i in all_items)
    all_pickup_ready = all(i.status == 'pickup_ready' for i in all_items)

    if all_done and order:
        order.status = "pickup_ready" if all_pickup_ready else "cooking_complete"
        order.needs_serving = any_unserved
        session.add(order)

    await session.commit()

    if order:
        from utils.events import emit_item_status_update, emit_item_ready_customer, emit_pickup_ready_customer
        store = await _store_of_order_opt(order, session)
        if store:
            await emit_item_status_update(session, store.id, item, order)
            if body.status == "cooking_complete":
                menu_result = await session.execute(select(Menu).where(Menu.id == int(item.menu_item_id)))
                menu = menu_result.scalar_one_or_none()
                await emit_item_ready_customer(session, store.id, order.table_number, item, menu)
            if body.status == "pickup_ready" and all_pickup_ready and order.pickup_code:
                await emit_pickup_ready_customer(session, store.id, order.table_number, order)

    return {"item_id": item.id, "status": body.status, "order_status": order.status if order else None}


@router.patch("/items/bulk-served")
async def bulk_mark_items_served(
    body: dict,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """Mark multiple order items as served at once"""
    item_ids = body.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="No item_ids provided")

    affected_order_ids = set()
    for iid in item_ids:
        item = await session.get(OrderItem, iid)
        if item:
            item.status = "served"
            session.add(item)
            affected_order_ids.add(item.order_id)

    # Auto-update parent orders if all items served
    for oid in affected_order_ids:
        order = await session.get(Order, oid)
        if not order:
            continue
        all_items_result = await session.execute(
            select(OrderItem).where(OrderItem.order_id == oid)
        )
        all_items = all_items_result.scalars().all()
        if all(i.status == 'served' for i in all_items):
            order.status = "served"
            order.needs_serving = False
            session.add(order)

    await session.commit()

    if affected_order_ids:
        from utils.events import emit_items_served
        sample_order = await session.get(Order, list(affected_order_ids)[0])
        if sample_order:
            store = await _store_of_order_opt(sample_order, session)
            if store:
                await emit_items_served(session, store.id, item_ids)

    return {"message": f"Marked {len(item_ids)} items as served"}


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order_store = await _store_of_order(order, session)
    if order_store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete order items first
    items_result = await session.execute(select(OrderItem).where(OrderItem.order_id == order_id))
    for item in items_result.scalars().all():
        await session.delete(item)

    await session.delete(order)
    await session.commit()
    return {"message": "Order deleted", "order_id": order_id}

@router.get("/{order_id}", response_model=OrderRead)
async def read_order(order_id: int, session: AsyncSession = Depends(get_session)):
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(
            selectinload(Order.items)
        )
    )
    result = await session.execute(stmt)
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    return order

@router.get("/", response_model=List[OrderRead])
async def read_orders(
    store_id: str,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    # store_id 는 slug 일 수도 있고 수치 ID 일 수도 있다.
    # Order.shop_id 에는 주문 생성 시점의 slug/shop_id 값이 그대로 저장된다.
    # → Store 를 먼저 resolve 한 뒤, slug 와 str(id) 양쪽 모두로 조회한다.
    store_result = await session.execute(
        select(Store).where(Store.slug == store_id)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        try:
            store = await session.get(Store, int(store_id))
        except (ValueError, TypeError):
            store = None

    if not store:
        return []

    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # 정규 store_id 로 조회.
    query = (
        select(Order)
        .where(Order.store_id == store.id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )

    if status:
        query = query.where(Order.status == status)

    result = await session.execute(query)
    orders = result.scalars().all()

    return orders

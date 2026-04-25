from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks, Request
import math
from sqlmodel import select, SQLModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from database import get_session, async_session_maker
from models import Order, OrderItem, Menu, Table, OrderCreate, Customer, DeviceSession, PaymentSettings
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
    print(f"DEBUG: Processing order | Shop={order_in.shop_id} Table={order_in.table_number} Type={order_type}")

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

    # ── 구독 만료 체크: 만료된 스토어는 신규 주문 불가 ──────────────────────────
    if store.subscription_expires_at and datetime.utcnow() > store.subscription_expires_at:
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

        print(f"DEBUG Table - ID:{table.id} No:{table.table_number} Status:{table.status} Token:{table.session_token}")
        table_status_val = table.status.value if hasattr(table.status, "value") else table.status
        if table_status_val != "occupied" or table.session_token != order_in.session_token:
            print(f"SECURITY ALERT: Token mismatch or table not occupied. Expected:{table.session_token} Got:{order_in.session_token}")
            raise HTTPException(status_code=403, detail="Invalid session token or table is not occupied.")

    # ── 3. Server-side price calculation (never trust client prices) ──────────
    items_data: list = []          # (menu, item_in, unit_price)
    line_items_for_square: list = []
    total_amount = 0.0

    for item_in in order_in.items:
        try:
            menu_id_int = int(item_in.menu_item_id)
        except ValueError:
            continue

        menu = await session.get(Menu, menu_id_int)
        if not menu:
            print(f"DEBUG CART: Menu {menu_id_int} missing from DB")
            continue
        if str(menu.store_id) != str(store.id) and str(menu.store_id) != str(order_in.shop_id):
            print(f"DEBUG CART: Menu {menu_id_int} store_id mismatch")
            continue

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
                print(f"DEBUG CART: Option parse error: {e}")

        unit_price = float(menu.price) + extra_price
        total_amount += unit_price * item_in.quantity
        items_data.append((menu, item_in, unit_price))
        line_items_for_square.append({
            "name": menu.name_jp or menu.name_en or f"Item {menu.id}",
            "quantity": item_in.quantity,
            "unit_price": int(unit_price),
        })

    # ── 3.5. Reject empty orders (no valid items) ────────────────────────────
    if not items_data:
        raise HTTPException(status_code=400, detail="有効な注文アイテムがありません (No valid items)")

    # ── 4. Unified Payment Adapter: charge card BEFORE creating DB order ─────────────
    square_payment_id = None
    sq_payment_order_id = None

    # 설정 가져오기 (없으면 구형 Square 기본값)
    payment_method_type = store.payment_settings.payment_method_type if store.payment_settings else "square_integrated"

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
        has_payment_ps = ps and ps.payment_method_type != "pay_at_counter" and (
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
            print(f"[Payment] Pre-payment OK: payment_id={square_payment_id}")
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
            print(f"[Square Legacy] Pre-payment OK: payment_id={square_payment_id}")

    # [이트인 일반 주문] pay_at_counter 경로 — 선결제 없이 바로 DB 생성
    # (eat_in 주문은 기존 로직 그대로)

    # ── 5. Create DB Order ────────────────────────────────────────────────────
    # 테이크아웃 주문에는 4자리 알파뉴메릭 픽업 코드 생성
    pickup_code = None
    if is_take_out:
        import random, string
        pickup_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

    # 결제 상태 결정: 테이크아웃 선결제 완료 → "paid" / 이트인 → "unpaid"
    is_paid = bool(is_take_out and square_payment_id)
    payment_status = "paid" if is_paid else "unpaid"
    # payment_method: 서버 설정 기준으로 저장 (클라이언트 값 무시)
    resolved_payment_method = str(payment_method_type) if is_take_out else (order_in.payment_method or "pay_at_counter")
    # order status: 결제 완료된 테이크아웃 → "pending" (바로 주방 가능), 이트인 → "pending_payment"
    order_status = "pending" if is_paid else "pending_payment"

    db_order = Order(
        shop_id=order_in.shop_id,
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
    )
    session.add(db_order)
    await session.commit()
    await session.refresh(db_order)

    # ── 6. Add Order Items ────────────────────────────────────────────────────
    for menu, item_in, unit_price in items_data:
        session.add(OrderItem(
            order_id=db_order.id,
            menu_item_id=str(menu.id),
            quantity=item_in.quantity,
            unit_price=unit_price,
            option_details=item_in.option_details,
            is_takeout_item=getattr(item_in, 'is_takeout_item', False),
        ))

    # ── 7. Update GuestProfile ────────────────────────────────────────────────
    if order_in.guest_uuid:
        from models import GuestProfile
        guest = await session.get(GuestProfile, order_in.guest_uuid)
        if not guest:
            guest = GuestProfile(guest_uuid=order_in.guest_uuid, visit_count=1, last_visit=datetime.utcnow())
        else:
            guest.prev_last_visit = guest.last_visit  # 직전 방문일 보존
            guest.visit_count += 1
            guest.last_visit = datetime.utcnow()
        session.add(guest)

    await session.commit()

    # ── 8. WebSocket broadcast to Kitchen (디스플레이 조건 분리) ───────────────────
    # 기존에는 무조건 전송했으나, 이제 StoreDisplaySettings.use_kitchen_page 토글 상태를 확인합니다.
    use_kitchen = True
    if getattr(store, "display_settings", None):
        use_kitchen = store.display_settings.use_kitchen_page
        
    if use_kitchen:
        try:
            from utils.websocket import manager
            msg = json.dumps({
                "type": "NEW_ORDER",
                "order_id": db_order.id,
                "table_number": db_order.table_number,
                "order_type": order_type,
            })
            await manager.broadcast(msg, store.id)
        except Exception as e:
            print("WS Broadcast exception:", e)

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

@router.patch("/{order_id}/status", response_model=Order)
async def update_order_status(order_id: int, status_update: OrderStatusUpdate, session: AsyncSession = Depends(get_session)):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
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

            # store_id 조회: shop_id(str)로 Store를 다시 조회
            from models import Store
            store_result = await session.execute(select(Store).where(Store.slug == order.shop_id))
            notify_store = store_result.scalar_one_or_none()
            if not notify_store:
                try:
                    notify_store = await session.get(Store, int(order.shop_id))
                except (ValueError, TypeError):
                    notify_store = None

            if notify_store:
                msg = json.dumps({
                    "type": "order_completed",
                    "order_id": order.id,
                    "table_number": order.table_number,
                    "items": item_names
                })
                await manager.broadcast_to_customer(msg, notify_store.id, order.table_number)
                print(f"[WS] Broadcast order_completed to store {notify_store.id} table {order.table_number}")
            else:
                print(f"[WS] Could not resolve store for shop_id={order.shop_id}")
        except Exception as e:
            print("Customer WS Broadcast exception:", e)


    return order

@router.patch("/{order_id}/pay", response_model=Order)
async def pay_order(order_id: int, session: AsyncSession = Depends(get_session)):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.payment_status = "paid"
    order.status = "paid"
    session.add(order)

    # Check if ALL unpaid orders for this table session are now paid → close table
    from models import Store
    store_result = await session.execute(select(Store).where(Store.slug == order.shop_id))
    store = store_result.scalar_one_or_none()
    if not store:
        try:
            store = await session.get(Store, int(order.shop_id))
        except (ValueError, TypeError):
            store = None

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
                    Order.shop_id == order.shop_id,
                    Order.table_number == order.table_number,
                    Order.session_token == order.session_token,
                    Order.payment_status == "unpaid",
                    Order.id != order.id
                )
            )
            if not remaining.scalars().first():
                # All paid → close table
                table.status = "ready"
                table.session_token = None
                table.guest_count = None
                session.add(table)
                closed_table = table

    await session.commit()
    await session.refresh(order)

    # Broadcast to staff screens
    if store:
        try:
            from utils.websocket import manager
            import json
            msg = json.dumps({
                "type": "PAYMENT_COMPLETE",
                "order_id": order.id,
                "table_number": order.table_number
            })
            await manager.broadcast(msg, store.id)
            if closed_table:
                msg2 = json.dumps({
                    "type": "TABLE_UPDATE",
                    "table_id": closed_table.id,
                    "table_number": closed_table.table_number,
                    "status": "ready",
                    "guest_count": None
                })
                await manager.broadcast(msg2, store.id)
        except Exception as e:
            print("WS Broadcast exception:", e)

    return order

class ItemStatusUpdate(SQLModel):
    status: str  # cooking_complete | served | pickup_ready

@router.patch("/items/{item_id}/status")
async def update_item_status(item_id: int, body: ItemStatusUpdate, session: AsyncSession = Depends(get_session)):
    """Update individual order item status (cooking_complete or served)"""
    item = await session.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")

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

    # Broadcast to kitchen + staff screens
    if order:
        try:
            from utils.websocket import manager
            from models import Store
            import json
            store_result = await session.execute(select(Store).where(Store.slug == order.shop_id))
            store = store_result.scalar_one_or_none()
            if not store:
                try:
                    store = await session.get(Store, int(order.shop_id))
                except (ValueError, TypeError):
                    store = None

            if store:
                msg = json.dumps({
                    "type": "ITEM_STATUS_UPDATE",
                    "item_id": item.id,
                    "order_id": item.order_id,
                    "table_number": order.table_number,
                    "item_status": body.status,
                    "order_status": order.status
                })
                await manager.broadcast(msg, store.id)

                # Notify customer when cooking complete
                if body.status == "cooking_complete":
                    menu_result = await session.execute(select(Menu).where(Menu.id == int(item.menu_item_id)))
                    menu = menu_result.scalar_one_or_none()
                    customer_msg = json.dumps({
                        "type": "item_ready",
                        "item_id": item.id,
                        "name_jp": menu.name_jp if menu else None,
                        "name_ko": menu.name_ko if menu else None,
                        "name_en": menu.name_en if menu else None,
                        "quantity": item.quantity
                    })
                    await manager.broadcast_to_customer(customer_msg, store.id, order.table_number)

                # Notify takeout customer when ALL items are pickup_ready
                if body.status == "pickup_ready" and all_pickup_ready and order.pickup_code:
                    pickup_msg = json.dumps({
                        "type": "pickup_ready",
                        "order_id": order.id,
                        "pickup_code": order.pickup_code
                    })
                    await manager.broadcast_to_customer(pickup_msg, store.id, order.table_number)
        except Exception as e:
            print(f"WS broadcast exception (item status): {e}")

    return {"item_id": item.id, "status": body.status, "order_status": order.status if order else None}


@router.patch("/items/bulk-served")
async def bulk_mark_items_served(body: dict, session: AsyncSession = Depends(get_session)):
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

    # Broadcast
    if affected_order_ids:
        try:
            from utils.websocket import manager
            from models import Store
            import json
            sample_order = await session.get(Order, list(affected_order_ids)[0])
            if sample_order:
                store_result = await session.execute(select(Store).where(Store.slug == sample_order.shop_id))
                store = store_result.scalar_one_or_none()
                if not store:
                    try:
                        store = await session.get(Store, int(sample_order.shop_id))
                    except (ValueError, TypeError):
                        store = None
                if store:
                    msg = json.dumps({"type": "ITEMS_SERVED", "item_ids": item_ids})
                    await manager.broadcast(msg, store.id)
        except Exception as e:
            print(f"WS broadcast exception (bulk served): {e}")

    return {"message": f"Marked {len(item_ids)} items as served"}


@router.delete("/{order_id}")
async def delete_order(order_id: int, session: AsyncSession = Depends(get_session)):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

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
    session: AsyncSession = Depends(get_session)
):
    from models import Store

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

    # Order.shop_id 에 slug 또는 str(id) 어느 쪽이 저장돼 있어도 조회한다.
    candidate_ids = {store_id}
    if store.slug:
        candidate_ids.add(store.slug)
    candidate_ids.add(str(store.id))

    from sqlalchemy import or_
    conditions = [Order.shop_id == cid for cid in candidate_ids]

    query = (
        select(Order)
        .where(or_(*conditions))
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )

    if status:
        query = query.where(Order.status == status)

    result = await session.execute(query)
    orders = result.scalars().all()

    return orders

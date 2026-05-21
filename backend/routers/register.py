"""
Register (카운터/레지스터) 전용 API 라우터

엔드포인트:
  GET  /register/tables              - 전체 테이블 현황 (정렬: checkout 요청 오래된 순 → 착석 중 → 빈 테이블)
  GET  /register/table/{table_id}    - 테이블 상세 (주문 항목 포함)
  POST /register/table/{table_id}/pay        - 결제 완료 처리
  GET  /register/today-sales         - 오늘 매출 요약
  GET  /register/takeout             - 오늘 테이크아웃 주문 목록
  POST /register/takeout/{order_id}/complete - 테이크아웃 픽업 완료
  DELETE /register/order-item/{item_id}      - 주문 항목 삭제 (실수 대응)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional
from database import get_session
from models import (
    Store, Table, TableStatus, Order, OrderItem, Menu,
    CustomerPoint, PointHistory, PointTransactionType, PointAccrualType,
    GuestProfile, TabehoudaiSession, MenuGroup,
)
from utils.jwt import require_staff_or_admin
from utils.db_compat import date_only
from datetime import datetime, date
import uuid
import json

router = APIRouter(prefix="/register", tags=["register"])


# ── 내부 헬퍼 ──────────────────────────────────────────────────────────────────

async def _resolve_store(shop_id: str, session: AsyncSession) -> Store:
    """slug 또는 숫자 ID 문자열로 Store를 조회한다."""
    result = await session.execute(select(Store).where(Store.slug == shop_id))
    store = result.scalar_one_or_none()
    if not store:
        try:
            store = await session.get(Store, int(shop_id))
        except (ValueError, TypeError):
            store = None
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _shop_id_variants(store: Store) -> list[str]:
    """Order.shop_id 에 저장될 수 있는 값들 (slug 또는 str(id)) 반환"""
    variants = [str(store.id)]
    if store.slug:
        variants.append(store.slug)
    return variants


async def _get_unpaid_orders_for_table(
    store: Store, table: Table, session: AsyncSession
) -> list[Order]:
    """해당 테이블의 현재 세션(unpaid) 주문 목록 반환"""
    shop_variants = _shop_id_variants(store)
    stmt = select(Order).where(
        Order.shop_id.in_(shop_variants),
        Order.table_number == table.table_number,
        Order.payment_status == "unpaid",
        Order.order_type == "eat_in",
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def _build_item_list(orders: list[Order], session: AsyncSession) -> list[dict]:
    """주문 목록에서 항목 리스트(메뉴명, 수량, 단가, 소계 포함)를 반환"""
    items_out = []
    for order in orders:
        stmt = (
            select(Order)
            .where(Order.id == order.id)
            .options(selectinload(Order.items))
        )
        res = await session.execute(stmt)
        order_with_items = res.scalar_one()
        for item in order_with_items.items:
            try:
                menu = await session.get(Menu, int(item.menu_item_id))
            except (ValueError, TypeError):
                menu = None
            name = menu.name_jp if menu else f"Item #{item.menu_item_id}"
            options_label = ""
            if item.option_details:
                try:
                    opts = json.loads(item.option_details)
                    if isinstance(opts, list):
                        options_label = ", ".join(
                            f"{o.get('group_name','')}: {o.get('choice_name','')}"
                            for o in opts if o.get("choice_name")
                        )
                except Exception:
                    pass
            items_out.append({
                "order_item_id": item.id,
                "order_id": order.id,
                "menu_item_id": item.menu_item_id,
                "name": name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": item.unit_price * item.quantity,
                "options": options_label,
                "item_status": item.status,
            })
    return items_out


# ── 1. 전체 테이블 현황 ───────────────────────────────────────────────────────

@router.get("/tables")
async def get_register_tables(
    shop_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """
    전체 테이블 현황 반환.
    정렬: CHECKOUT_REQUESTED(오래된 순) → OCCUPIED → READY
    각 테이블에 unpaid 합계 금액 포함.
    """
    store = await _resolve_store(shop_id, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    shop_variants = _shop_id_variants(store)

    # 모든 테이블 조회
    t_result = await session.execute(
        select(Table).where(Table.store_id == store.id)
    )
    tables = t_result.scalars().all()

    # 테이블별 unpaid 합계 한 번에 집계
    sum_result = await session.execute(
        select(
            Order.table_number,
            func.sum(Order.total_amount).label("total"),
            func.count(Order.id).label("order_count"),
        ).where(
            Order.shop_id.in_(shop_variants),
            Order.payment_status == "unpaid",
            Order.order_type == "eat_in",
        ).group_by(Order.table_number)
    )
    unpaid_map: dict[str, dict] = {
        str(row.table_number): {"total": float(row.total), "order_count": int(row.order_count)}
        for row in sum_result.all()
    }

    rows = []
    for t in tables:
        unpaid = unpaid_map.get(t.table_number, {"total": 0.0, "order_count": 0})
        rows.append({
            "table_id": t.id,
            "table_number": t.table_number,
            "status": t.status,
            "guest_count": t.guest_count,
            "checkout_requested_at": t.checkout_requested_at.isoformat() if t.checkout_requested_at else None,
            "total_amount": unpaid["total"],
            "order_count": unpaid["order_count"],
            "call_staff": t.call_staff,
        })

    # 정렬: checkout_requested 오래된 순 → occupied → ready
    def sort_key(row):
        status = row["status"]
        if hasattr(status, "value"):
            status = status.value
        if status == "checkout_requested":
            # None은 뒤로
            ts = row["checkout_requested_at"] or "9999"
            return (0, ts)
        if status == "occupied":
            return (1, "")
        return (2, "")

    rows.sort(key=sort_key)
    return rows


# ── 2. 테이블 상세 ─────────────────────────────────────────────────────────────

@router.get("/table/{table_id}")
async def get_table_detail(
    table_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """테이블 정보 + 미결제 주문 항목 전체 리스트 반환"""
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    store = await session.get(Store, table.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    orders = await _get_unpaid_orders_for_table(store, table, session)
    items = await _build_item_list(orders, session)
    items_subtotal = sum(o.total_amount for o in orders)

    # ── 食べ放題: 미결제 세션(active or expired) 정산 라인 추가 ─────────────────
    tabehoudai_lines: list[dict] = []
    tabehoudai_total = 0
    sess_res = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == table.id,
            TabehoudaiSession.status.in_(["active", "expired"]),
        )
    )
    pending_sessions = sess_res.scalars().all()
    for s in pending_sessions:
        group = await session.get(MenuGroup, s.group_id)
        if not group:
            continue
        line_total = group.price_per_person * s.num_people
        tabehoudai_total += line_total
        tabehoudai_lines.append({
            "session_id": s.id,
            "name": group.name,
            "course_type": group.course_type,
            "price_per_person": group.price_per_person,
            "num_people": s.num_people,
            "total": line_total,
            "status": s.status,
        })

    total_amount = items_subtotal + tabehoudai_total

    # ── guest 방문 정보 조회 ──────────────────────────────────────────────────
    guest_info = None
    guest_uuids = list({o.guest_uuid for o in orders if o.guest_uuid and o.guest_uuid != "POS_MANUAL"})
    if guest_uuids:
        guest_uuid = guest_uuids[0]
        guest = await session.get(GuestProfile, guest_uuid)
        if guest:
            now = datetime.utcnow()
            days = None
            if guest.prev_last_visit:
                days = (now.replace(tzinfo=None) - guest.prev_last_visit.replace(tzinfo=None)).days
            guest_info = {
                "visit_count": guest.visit_count,
                "days_since_last_visit": days,
            }

    return {
        "table_id": table.id,
        "table_number": table.table_number,
        "status": table.status,
        "guest_count": table.guest_count,
        "checkout_requested_at": table.checkout_requested_at.isoformat() if table.checkout_requested_at else None,
        "items_subtotal": items_subtotal,
        "tabehoudai_total": tabehoudai_total,
        "tabehoudai_lines": tabehoudai_lines,
        "total_amount": total_amount,
        "order_ids": [o.id for o in orders],
        "items": items,
        "payment_options": store.payment_options,
        "guest_info": guest_info,
    }


# ── 3. 결제 완료 ───────────────────────────────────────────────────────────────

class PayRequest:
    pass

from pydantic import BaseModel

class PayRequest(BaseModel):
    payment_method: str = "cash"   # cash | card | square


@router.post("/table/{table_id}/pay")
async def complete_payment(
    table_id: int,
    body: PayRequest,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """
    결제 완료 처리:
    1. 해당 테이블의 unpaid 주문 → paid 처리 (payment_method 기록)
    2. 포인트 적립 (store 설정에 따라)
    3. 테이블 리셋 (READY, 새 QR 토큰)
    4. WebSocket 브로드캐스트
    """
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    store = await session.get(Store, table.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    orders = await _get_unpaid_orders_for_table(store, table, session)

    # 食べ放題 미결제 세션 합산 + settle 마킹
    sess_res = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == table.id,
            TabehoudaiSession.status.in_(["active", "expired"]),
        )
    )
    pending_sessions = sess_res.scalars().all()
    tabehoudai_total = 0
    for s in pending_sessions:
        group = await session.get(MenuGroup, s.group_id)
        if group:
            tabehoudai_total += group.price_per_person * s.num_people
        s.status = "settled"
        s.settled_at = datetime.utcnow()
        session.add(s)

    if not orders and not pending_sessions:
        raise HTTPException(status_code=400, detail="No unpaid orders for this table")

    items_subtotal = sum(o.total_amount for o in orders)
    total_amount = items_subtotal + tabehoudai_total
    customer_id = orders[0].guest_uuid if orders else None

    # 1. 주문 → paid
    for order in orders:
        order.payment_status = "paid"
        order.status = "served"
        order.payment_method = body.payment_method
        session.add(order)

    # 2. 포인트 적립
    if store.points_enabled and customer_id:
        points_to_award = 0
        if store.point_accrual_type == PointAccrualType.PERCENT:
            points_to_award = int((total_amount / 100) * store.point_rate)
        elif store.point_accrual_type == PointAccrualType.FIXED:
            points_to_award = store.point_fixed_amount

        if points_to_award > 0:
            pt_stmt = select(CustomerPoint).where(
                CustomerPoint.customer_id == customer_id,
                CustomerPoint.store_id == store.id,
            )
            pt_res = await session.execute(pt_stmt)
            pt_record = pt_res.scalar_one_or_none()
            if not pt_record:
                pt_record = CustomerPoint(
                    customer_id=customer_id, store_id=store.id, balance=0
                )
            pt_record.balance += points_to_award
            pt_record.updated_at = datetime.utcnow()
            session.add(pt_record)

            history = PointHistory(
                customer_id=customer_id,
                store_id=store.id,
                amount=points_to_award,
                tx_type=PointTransactionType.EARNED,
                description=f"Table {table.table_number} payment ¥{int(total_amount)}",
                related_order_id=orders[0].id,
            )
            session.add(history)

    # 3. 테이블 리셋
    table.last_order_id = orders[0].id
    table.qr_token = str(uuid.uuid4())
    table.status = TableStatus.READY
    table.session_token = None
    table.guest_count = None
    table.checkout_requested_at = None
    table.call_staff = False
    session.add(table)

    await session.commit()

    from utils.events import emit, emit_table_update
    await emit(session, store.id, "PAYMENT_COMPLETE", {
        "table_id": table.id,
        "table_number": table.table_number,
        "payment_method": body.payment_method,
        "total_amount": total_amount,
    })
    await emit_table_update(session, store.id, table)

    return {
        "message": "Payment completed",
        "total_amount": total_amount,
        "payment_method": body.payment_method,
        "new_qr_token": table.qr_token,
    }


# ── 4. 오늘 매출 요약 ──────────────────────────────────────────────────────────

@router.get("/today-sales")
async def get_today_sales(
    shop_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """
    오늘(로컬 날짜 기준) 결제 완료된 주문의 매출 요약:
    총 매출, 결제 건수, 평균 단가, 결제 수단별 내역
    """
    store = await _resolve_store(shop_id, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    shop_variants = _shop_id_variants(store)
    today = date.today()

    stmt = select(Order).where(
        Order.shop_id.in_(shop_variants),
        Order.payment_status == "paid",
        date_only(Order.created_at) == today,
    )
    result = await session.execute(stmt)
    paid_orders = result.scalars().all()

    total_sales = sum(o.total_amount for o in paid_orders)
    total_orders = len(paid_orders)
    avg_order = round(total_sales / total_orders, 0) if total_orders > 0 else 0

    # 결제 수단별 집계
    method_map: dict[str, dict] = {}
    for o in paid_orders:
        method = o.payment_method or "unknown"
        if method not in method_map:
            method_map[method] = {"count": 0, "amount": 0.0}
        method_map[method]["count"] += 1
        method_map[method]["amount"] += o.total_amount

    # eat_in / take_out 분리
    eatin_orders = [o for o in paid_orders if o.order_type == "eat_in"]
    takeout_orders = [o for o in paid_orders if o.order_type == "take_out"]

    return {
        "date": today.isoformat(),
        "total_sales": total_sales,
        "total_orders": total_orders,
        "avg_order_value": avg_order,
        "eat_in_sales": sum(o.total_amount for o in eatin_orders),
        "eat_in_orders": len(eatin_orders),
        "takeout_sales": sum(o.total_amount for o in takeout_orders),
        "takeout_orders": len(takeout_orders),
        "by_payment_method": [
            {"method": k, "count": v["count"], "amount": v["amount"]}
            for k, v in method_map.items()
        ],
    }


# ── 5. 테이크아웃 주문 목록 ────────────────────────────────────────────────────

@router.get("/takeout")
async def get_takeout_orders(
    shop_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """
    오늘의 테이크아웃 주문 목록.
    미결제 주문 전체 + 오늘 결제 완료된 주문 포함.
    """
    store = await _resolve_store(shop_id, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    shop_variants = _shop_id_variants(store)
    today = date.today()

    # 픽업 완료(served)된 주문은 픽업 큐에서 제외
    stmt = select(Order).where(
        Order.shop_id.in_(shop_variants),
        Order.order_type == "take_out",
        Order.status != "served",
        (
            (Order.payment_status == "unpaid") |
            (date_only(Order.created_at) == today)
        ),
    ).order_by(
        # 픽업시간 있는 것부터 시간 순, 그 다음 생성시간 순
        Order.pickup_time.asc().nulls_last(),
        Order.created_at.asc(),
    )

    result = await session.execute(stmt)
    orders = result.scalars().all()

    # 각 주문의 항목 수와 금액만 반환 (간단 목록)
    out = []
    for o in orders:
        stmt2 = (
            select(Order)
            .where(Order.id == o.id)
            .options(selectinload(Order.items))
        )
        res2 = await session.execute(stmt2)
        o_with_items = res2.scalar_one()
        item_names = []
        for item in o_with_items.items:
            try:
                menu = await session.get(Menu, int(item.menu_item_id))
                item_names.append(f"{menu.name_jp if menu else '?'} x{item.quantity}")
            except Exception:
                item_names.append(f"#{item.menu_item_id} x{item.quantity}")

        out.append({
            "order_id": o.id,
            "payment_status": o.payment_status,
            "payment_method": o.payment_method,
            "total_amount": o.total_amount,
            "pickup_time": o.pickup_time,
            "pickup_code": o.pickup_code,
            "order_status": o.status,  # pending_payment | pending | cooking_complete | pickup_ready | served
            "created_at": o.created_at.isoformat(),
            "items_summary": ", ".join(item_names),
            "square_payment_id": o.square_payment_id,
        })

    return out


# ── 6. 테이크아웃 픽업 완료 ────────────────────────────────────────────────────

@router.post("/takeout/{order_id}/complete")
async def complete_takeout(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """테이크아웃 주문 → status=served (픽업 완료)"""
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    store = await _resolve_store(order.shop_id, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.order_type != "take_out":
        raise HTTPException(status_code=400, detail="Not a take-out order")

    order.status = "served"
    if order.payment_status == "unpaid":
        # Square 선결제가 없는 경우 → 카운터에서 결제 후 완료 처리 허용
        order.payment_status = "paid"
        order.payment_method = order.payment_method or "cash"

    session.add(order)
    await session.commit()

    return {"message": "Takeout order completed", "order_id": order_id}


# ── 7. 주문 항목 삭제 (실수 대응) ──────────────────────────────────────────────

@router.delete("/order-item/{item_id}")
async def delete_order_item(
    item_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    """
    주문 항목 삭제 후 해당 Order.total_amount 재계산.
    결제 완료(paid)된 주문 항목은 삭제 불가.
    """
    item = await session.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="OrderItem not found")

    order = await session.get(Order, item.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    store = await _resolve_store(order.shop_id, session)
    if store.id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Cannot delete item from a paid order")

    subtotal = item.unit_price * item.quantity
    await session.delete(item)

    # total_amount 재계산
    order.total_amount = max(0.0, order.total_amount - subtotal)
    session.add(order)
    await session.commit()

    return {"message": "Item deleted", "item_id": item_id, "refunded_amount": subtotal}

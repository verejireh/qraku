from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from database import get_session
from models import Order, OrderItem, Menu, Store
from datetime import datetime, date, timedelta
from utils.jwt import require_admin

router = APIRouter(prefix="/stats", tags=["stats"])


async def _resolve_shop_id(shop_id: str, session: AsyncSession) -> Optional[str]:
    """slug 혹은 숫자 ID 문자열 그대로 Order.shop_id 형식으로 반환"""
    # Order.shop_id에는 Store.slug 또는 str(store.id)가 저장됩니다
    # → 보내온 shop_id를 그대로 사용 가능
    return shop_id


@router.get("/summary")
async def get_summary(
    shop_id: str = Query(...),
    days: int = Query(7),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """KPI 요약: 총 매출, 주문 수, 평균 객단가 (기간 필터 포함)"""
    since = datetime.utcnow() - timedelta(days=days)

    q_sales = select(
        func.coalesce(func.sum(Order.total_amount), 0).label("total_sales"),
        func.count(Order.id).label("total_orders")
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    )
    result = await session.execute(q_sales)
    row = result.one()
    total_sales = float(row.total_sales)
    total_orders = int(row.total_orders)
    avg_order = round(total_sales / total_orders, 0) if total_orders > 0 else 0

    return {
        "total_sales": total_sales,
        "total_orders": total_orders,
        "avg_order_value": avg_order,
        "days": days
    }


@router.get("/daily")
async def get_daily_sales(
    shop_id: str = Query(...),
    days: int = Query(7),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """기간별 일별 매출 집계"""
    since = datetime.utcnow() - timedelta(days=days)

    query = select(
        func.date(Order.created_at).label("day"),
        func.coalesce(func.sum(Order.total_amount), 0).label("sales"),
        func.count(Order.id).label("orders")
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(
        func.date(Order.created_at)
    ).order_by(
        func.date(Order.created_at)
    )

    result = await session.execute(query)
    rows = result.all()

    return [
        {"day": str(row.day), "sales": float(row.sales), "orders": int(row.orders)}
        for row in rows
    ]


@router.get("/hourly")
async def get_hourly_orders(
    shop_id: str = Query(...),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """오늘 시간대별 주문 수 (0~23시)"""
    today = date.today()

    query = select(
        func.hour(Order.created_at).label("hour"),
        func.count(Order.id).label("count")
    ).where(
        Order.shop_id == shop_id,
        func.date(Order.created_at) == today
    ).group_by(
        func.hour(Order.created_at)
    ).order_by(
        func.hour(Order.created_at)
    )

    result = await session.execute(query)
    rows = result.all()
    hourly_map = {row.hour: row.count for row in rows}

    return [
        {"hour": h, "label": f"{h:02d}:00", "count": hourly_map.get(h, 0)}
        for h in range(24)
    ]


@router.get("/top-menus")
async def get_top_menus(
    shop_id: str = Query(...),
    days: int = Query(7),
    limit: int = Query(5),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """기간 내 인기 메뉴 Top N (판매량 기준)"""
    since = datetime.utcnow() - timedelta(days=days)

    # OrderItem.menu_item_id는 str이므로 int 캐스팅 후 Menu와 조인
    query = select(
        OrderItem.menu_item_id,
        func.sum(OrderItem.quantity).label("total_qty"),
        func.sum(OrderItem.quantity * OrderItem.unit_price).label("total_revenue")
    ).join(
        Order, Order.id == OrderItem.order_id
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(
        OrderItem.menu_item_id
    ).order_by(
        desc(func.sum(OrderItem.quantity))
    ).limit(limit)

    result = await session.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        try:
            menu = await session.get(Menu, int(row.menu_item_id))
        except (ValueError, TypeError):
            menu = None
        items.append({
            "menu_item_id": row.menu_item_id,
            "name_jp": menu.name_jp if menu else f"Item #{row.menu_item_id}",
            "name_ko": menu.name_ko if menu else None,
            "name_en": menu.name_en if menu else None,
            "image_url": menu.image_url if menu else None,
            "category": menu.category if menu else None,
            "total_qty": int(row.total_qty),
            "total_revenue": float(row.total_revenue)
        })

    return items


@router.get("/sales-by-category")
async def get_sales_by_category(
    shop_id: str = Query(...),
    days: int = Query(7),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """카테고리별 매출 집계"""
    since = datetime.utcnow() - timedelta(days=days)

    query = select(
        Menu.category,
        func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0).label("revenue"),
        func.coalesce(func.sum(OrderItem.quantity), 0).label("qty")
    ).join(
        Order, Order.id == OrderItem.order_id
    ).join(
        Menu, Menu.id == func.cast(OrderItem.menu_item_id, Menu.id.type)
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(Menu.category).order_by(desc(func.sum(OrderItem.quantity * OrderItem.unit_price)))

    result = await session.execute(query)
    rows = result.all()
    return [
        {"category": row.category or "その他", "revenue": float(row.revenue), "qty": int(row.qty)}
        for row in rows
    ]


@router.get("/sales-by-menu")
async def get_sales_by_menu(
    shop_id: str = Query(...),
    days: int = Query(7),
    limit: int = Query(20),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """메뉴별 매출 집계"""
    since = datetime.utcnow() - timedelta(days=days)

    query = select(
        OrderItem.menu_item_id,
        func.sum(OrderItem.quantity).label("total_qty"),
        func.sum(OrderItem.quantity * OrderItem.unit_price).label("total_revenue")
    ).join(
        Order, Order.id == OrderItem.order_id
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(OrderItem.menu_item_id).order_by(
        desc(func.sum(OrderItem.quantity * OrderItem.unit_price))
    ).limit(limit)

    result = await session.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        try:
            menu = await session.get(Menu, int(row.menu_item_id))
        except (ValueError, TypeError):
            menu = None
        items.append({
            "menu_item_id": row.menu_item_id,
            "name": menu.name_jp if menu else f"Item #{row.menu_item_id}",
            "category": menu.category if menu else None,
            "total_qty": int(row.total_qty),
            "total_revenue": float(row.total_revenue)
        })
    return items


@router.get("/hourly-guests")
async def get_hourly_guests(
    shop_id: str = Query(...),
    target_date: Optional[str] = Query(None),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """시간대별 손님수 (유니크 테이블 수 기준)"""
    d = date.fromisoformat(target_date) if target_date else date.today()

    query = select(
        func.hour(Order.created_at).label("hour"),
        func.count(func.distinct(Order.table_number)).label("guests")
    ).where(
        Order.shop_id == shop_id,
        func.date(Order.created_at) == d
    ).group_by(func.hour(Order.created_at)).order_by(func.hour(Order.created_at))

    result = await session.execute(query)
    rows = result.all()
    guest_map = {row.hour: row.guests for row in rows}

    return [
        {"hour": h, "label": f"{h:02d}:00", "guests": guest_map.get(h, 0)}
        for h in range(24)
    ]


@router.get("/monthly")
async def get_monthly_sales(
    shop_id: str = Query(...),
    months: int = Query(6),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """월별 매출 집계"""
    since = datetime.utcnow() - timedelta(days=months * 31)

    query = select(
        func.year(Order.created_at).label("yr"),
        func.month(Order.created_at).label("mo"),
        func.coalesce(func.sum(Order.total_amount), 0).label("sales"),
        func.count(Order.id).label("orders")
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(
        func.year(Order.created_at), func.month(Order.created_at)
    ).order_by(
        func.year(Order.created_at), func.month(Order.created_at)
    )

    result = await session.execute(query)
    rows = result.all()
    return [
        {"month": f"{row.yr}-{row.mo:02d}", "sales": float(row.sales), "orders": int(row.orders)}
        for row in rows
    ]


@router.get("/weekly")
async def get_weekly_sales(
    shop_id: str = Query(...),
    days: int = Query(30),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """요일별 매출 집계 (0=월~6=일)"""
    since = datetime.utcnow() - timedelta(days=days)

    query = select(
        func.dayofweek(Order.created_at).label("dow"),
        func.coalesce(func.sum(Order.total_amount), 0).label("sales"),
        func.count(Order.id).label("orders")
    ).where(
        Order.shop_id == shop_id,
        Order.created_at >= since
    ).group_by(
        func.dayofweek(Order.created_at)
    ).order_by(
        func.dayofweek(Order.created_at)
    )

    result = await session.execute(query)
    rows = result.all()
    day_names = ["日", "月", "火", "水", "木", "金", "土"]  # MySQL DAYOFWEEK: 1=Sun
    return [
        {"dow": int(row.dow), "day_name": day_names[(int(row.dow) - 1) % 7], "sales": float(row.sales), "orders": int(row.orders)}
        for row in rows
    ]

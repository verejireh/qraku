from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Store, Order, OrderItem, Menu
from datetime import datetime, timedelta
from utils.jwt import require_admin
from utils.db_compat import date_only
from utils.time_helpers import days_ago_jst_as_utc_naive

router = APIRouter(prefix="/admin/insights", tags=["insights"])


def _assert_access(admin_store: Store, shop_id: str):
    if shop_id.isdigit():
        if int(shop_id) != admin_store.id:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Access denied")
    elif shop_id != (admin_store.slug or ""):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/visitors")
async def get_visitors(
    shop_id: str = Query(...),
    days: int = Query(14, ge=7, le=90),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """일별 주문 건수 (방문자 프록시)."""
    _assert_access(admin_store, shop_id)
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b] JST calendar

    rows = (await session.execute(
        select(
            date_only(Order.created_at).label("day"),
            func.count(Order.id).label("orders"),
            func.count(func.distinct(Order.guest_uuid)).label("unique_guests"),
        ).where(Order.shop_id == shop_id, Order.created_at >= since)
        .group_by(date_only(Order.created_at))
        .order_by(date_only(Order.created_at))
    )).all()

    return {
        "days": days,
        "data": [
            {"day": str(r.day), "orders": int(r.orders), "unique_guests": int(r.unique_guests)}
            for r in rows
        ],
    }


@router.get("/popular_menus")
async def get_popular_menus(
    shop_id: str = Query(...),
    days: int = Query(30, ge=7, le=90),
    limit: int = Query(5, ge=3, le=10),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """인기 메뉴 Top N (판매 수량 기준)."""
    _assert_access(admin_store, shop_id)
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b] JST calendar

    rows = (await session.execute(
        select(
            OrderItem.menu_item_id,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.shop_id == shop_id, Order.created_at >= since)
        .group_by(OrderItem.menu_item_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    )).all()

    menu_ids = [int(r.menu_item_id) for r in rows if r.menu_item_id.isdigit()]
    menus_by_id: dict = {}
    if menu_ids:
        menu_rows = (await session.execute(
            select(Menu.id, Menu.name_jp, Menu.name_en).where(Menu.id.in_(menu_ids))
        )).all()
        menus_by_id = {m.id: {"name_jp": m.name_jp, "name_en": m.name_en} for m in menu_rows}

    total_qty = sum(int(r.qty) for r in rows) or 1
    return {
        "days": days,
        "items": [
            {
                "menu_item_id": r.menu_item_id,
                "name_jp": menus_by_id.get(int(r.menu_item_id) if r.menu_item_id.isdigit() else -1, {}).get("name_jp", "—"),
                "qty": int(r.qty),
                "revenue": float(r.revenue),
                "pct": round(int(r.qty) / total_qty * 100, 1),
            }
            for r in rows
        ],
    }


@router.get("/rescue_effect")
async def get_rescue_effect(
    shop_id: str = Query(...),
    days: int = Query(30, ge=7, le=90),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """마감 할인(discount_amount > 0) 주문 vs 일반 주문 비교."""
    _assert_access(admin_store, shop_id)
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b] JST calendar

    rows = (await session.execute(
        select(
            (Order.discount_amount > 0).label("is_rescue"),
            func.count(Order.id).label("cnt"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.coalesce(func.avg(Order.total_amount), 0).label("avg_amount"),
        )
        .where(Order.shop_id == shop_id, Order.created_at >= since)
        .group_by((Order.discount_amount > 0))
    )).all()

    rescue = next((r for r in rows if r.is_rescue), None)
    normal = next((r for r in rows if not r.is_rescue), None)

    rescue_cnt = int(rescue.cnt) if rescue else 0
    normal_cnt = int(normal.cnt) if normal else 0
    total = rescue_cnt + normal_cnt

    return {
        "days": days,
        "rescue": {
            "orders": rescue_cnt,
            "revenue": float(rescue.revenue) if rescue else 0.0,
            "avg_amount": float(rescue.avg_amount) if rescue else 0.0,
        },
        "normal": {
            "orders": normal_cnt,
            "revenue": float(normal.revenue) if normal else 0.0,
            "avg_amount": float(normal.avg_amount) if normal else 0.0,
        },
        "rescue_pct": round(rescue_cnt / total * 100, 1) if total else 0.0,
    }


@router.get("/neighborhood_avg")
async def get_neighborhood_avg(
    shop_id: str = Query(...),
    days: int = Query(30, ge=7, le=90),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """동네(동일 prefecture) 매장 평균 vs 내 매장 비교."""
    _assert_access(admin_store, shop_id)
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b] JST calendar

    # 내 매장 지표
    my_row = (await session.execute(
        select(
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.coalesce(func.avg(Order.total_amount), 0).label("avg_amount"),
        ).where(Order.shop_id == shop_id, Order.created_at >= since)
    )).one()

    # 동네 매장 slug 목록 (같은 prefecture, 공개 허용)
    prefecture = admin_store.prefecture
    if not prefecture:
        return {
            "days": days,
            "my": {"orders": int(my_row.orders), "revenue": float(my_row.revenue), "avg_amount": float(my_row.avg_amount)},
            "neighborhood": None,
            "note": "prefecture 미설정 — AdminHomePageView 에서 설정하세요",
        }

    neighbor_slugs_rows = (await session.execute(
        select(Store.slug).where(
            Store.prefecture == prefecture,
            Store.allow_public_listing == True,
            Store.slug != admin_store.slug,
        )
    )).all()
    neighbor_slugs = [r.slug for r in neighbor_slugs_rows]

    if not neighbor_slugs:
        return {
            "days": days,
            "my": {"orders": int(my_row.orders), "revenue": float(my_row.revenue), "avg_amount": float(my_row.avg_amount)},
            "neighborhood": None,
            "note": "同じエリアの掲載店舗がまだありません",
        }

    nb_row = (await session.execute(
        select(
            func.count(Order.id).label("orders"),
            func.coalesce(func.avg(Order.total_amount), 0).label("avg_amount"),
        ).where(Order.shop_id.in_(neighbor_slugs), Order.created_at >= since)
    )).one()

    return {
        "days": days,
        "my": {"orders": int(my_row.orders), "revenue": float(my_row.revenue), "avg_amount": float(my_row.avg_amount)},
        "neighborhood": {
            "store_count": len(neighbor_slugs),
            "avg_amount": float(nb_row.avg_amount),
            "orders_per_store": round(int(nb_row.orders) / len(neighbor_slugs), 1),
        },
        "note": f"{prefecture} エリア {len(neighbor_slugs)} 店舗との比較",
    }

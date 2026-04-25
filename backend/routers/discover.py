"""
Public Discovery API — 업주가 동의한 가게/메뉴를 랭킹 형식으로 제공
인증 불필요 (공개 API)
"""
from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import case, literal_column, text
from typing import Optional, List, Dict, Any
from database import get_session
from models import Store, Menu, Order, OrderItem, Table
from datetime import datetime, timedelta

router = APIRouter(prefix="/public/discover", tags=["discover"])

SORT_OPTIONS = {
    "popular":     "테이블당 주문 수 (인기순)",
    "newest":      "최근 추가된 메뉴순",
    "most_orders": "총 주문 수 많은순",
    "most_menus":  "메뉴 수 많은순",
}


async def _get_store_order_stats(session: AsyncSession, store_ids: List[int], days: int = 30) -> Dict[int, Dict]:
    """최근 N일간 가게별 주문 통계 (총 주문수, 테이블 수)"""
    if not store_ids:
        return {}

    since = datetime.utcnow() - timedelta(days=days)

    # 최근 N일 주문수
    order_result = await session.execute(
        select(Order.store_id, func.count(Order.id).label("order_count"))
        .where(Order.store_id.in_(store_ids))
        .where(Order.created_at >= since)
        .group_by(Order.store_id)
    )
    order_counts = {row.store_id: row.order_count for row in order_result}

    # 테이블 수
    table_result = await session.execute(
        select(Table.store_id, func.count(Table.id).label("table_count"))
        .where(Table.store_id.in_(store_ids))
        .group_by(Table.store_id)
    )
    table_counts = {row.store_id: row.table_count for row in table_result}

    stats = {}
    for sid in store_ids:
        orders = order_counts.get(sid, 0)
        tables = max(table_counts.get(sid, 1), 1)  # 0 나누기 방지
        stats[sid] = {
            "order_count": orders,
            "table_count": tables,
            "orders_per_table": round(orders / tables, 2),
        }
    return stats


@router.get("/menus")
async def discover_menus(
    prefecture: Optional[str] = Query(None, description="도도부현 필터 (예: 東京都)"),
    city: Optional[str] = Query(None, description="시구정촌 필터 (예: 渋谷区)"),
    category: Optional[str] = Query(None, description="메뉴 카테고리 필터"),
    store_id: Optional[int] = Query(None, description="특정 가게 필터"),
    sort: str = Query("popular", description="정렬: popular | newest | most_orders | most_menus"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """공개 메뉴 디스커버리 — 업주가 노출 동의한 가게의 메뉴 랭킹"""

    # 1. 공개 동의한 가게 목록 조회
    store_query = select(Store).where(Store.allow_public_listing == True)
    if prefecture:
        store_query = store_query.where(Store.prefecture == prefecture)
    if city:
        store_query = store_query.where(Store.city == city)
    if store_id:
        store_query = store_query.where(Store.id == store_id)

    store_result = await session.execute(store_query)
    stores = store_result.scalars().all()
    if not stores:
        return {"items": [], "total": 0, "page": page, "sort": sort, "sort_options": SORT_OPTIONS}

    store_map = {s.id: s for s in stores}
    store_ids = list(store_map.keys())

    # 2. 주문 통계
    stats = await _get_store_order_stats(session, store_ids)

    # 3. 메뉴 조회
    menu_query = (
        select(Menu)
        .where(Menu.store_id.in_(store_ids))
        .where(Menu.is_available == True)
    )
    if category:
        menu_query = menu_query.where(Menu.category == category)

    menu_result = await session.execute(menu_query)
    menus: List[Menu] = menu_result.scalars().all()

    # 4. 메뉴별 주문 수 집계 (최근 30일)
    since = datetime.utcnow() - timedelta(days=30)
    item_order_result = await session.execute(
        select(OrderItem.menu_id, func.sum(OrderItem.quantity).label("qty"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.store_id.in_(store_ids))
        .where(Order.created_at >= since)
        .group_by(OrderItem.menu_id)
    )
    menu_order_counts = {row.menu_id: row.qty for row in item_order_result}

    # 5. 가게별 메뉴 수 집계
    store_menu_counts: Dict[int, int] = {}
    for m in menus:
        store_menu_counts[m.store_id] = store_menu_counts.get(m.store_id, 0) + 1

    # 6. 메뉴 데이터 구성
    items = []
    for m in menus:
        s = store_map[m.store_id]
        st = stats.get(m.store_id, {"order_count": 0, "table_count": 1, "orders_per_table": 0})
        items.append({
            "menu_id": m.id,
            "menu_name_jp": m.name_jp,
            "menu_name_en": m.name_en,
            "menu_name_ko": m.name_ko,
            "menu_name_zh": m.name_zh,
            "price": m.price,
            "category": m.category,
            "image_url": m.image_url,
            "description_jp": m.description_jp,
            "menu_order_count": menu_order_counts.get(m.id, 0),
            "store_id": s.id,
            "store_name": s.name,
            "store_category": s.category,
            "prefecture": s.prefecture,
            "city": s.city,
            "theme": s.theme,
            "store_order_count": st["order_count"],
            "store_table_count": st["table_count"],
            "orders_per_table": st["orders_per_table"],
            "store_menu_count": store_menu_counts.get(s.id, 0),
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    # 7. 정렬
    if sort == "popular":
        items.sort(key=lambda x: (x["orders_per_table"], x["menu_order_count"]), reverse=True)
    elif sort == "most_orders":
        items.sort(key=lambda x: x["menu_order_count"], reverse=True)
    elif sort == "newest":
        # Menu has no created_at; sort by menu_id descending (newer menus have higher IDs)
        items.sort(key=lambda x: x["menu_id"], reverse=True)
    elif sort == "most_menus":
        items.sort(key=lambda x: x["store_menu_count"], reverse=True)

    # 8. 페이지네이션
    total = len(items)
    start = (page - 1) * limit
    paged = items[start: start + limit]

    return {
        "items": paged,
        "total": total,
        "page": page,
        "limit": limit,
        "sort": sort,
        "sort_options": SORT_OPTIONS,
    }


@router.get("/stores")
async def discover_stores(
    prefecture: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    sort: str = Query("popular"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """공개 가게 목록 — 지역별/랭킹별"""
    query = select(Store).where(Store.allow_public_listing == True)
    if prefecture:
        query = query.where(Store.prefecture == prefecture)
    if city:
        query = query.where(Store.city == city)

    result = await session.execute(query)
    stores = result.scalars().all()
    if not stores:
        return {"items": [], "total": 0}

    store_ids = [s.id for s in stores]
    stats = await _get_store_order_stats(session, store_ids)

    items = []
    for s in stores:
        st = stats.get(s.id, {"order_count": 0, "table_count": 1, "orders_per_table": 0})
        items.append({
            "store_id": s.id,
            "store_name": s.name,
            "category": s.category,
            "prefecture": s.prefecture,
            "city": s.city,
            "theme": s.theme,
            "order_count": st["order_count"],
            "table_count": st["table_count"],
            "orders_per_table": st["orders_per_table"],
        })

    if sort == "popular":
        items.sort(key=lambda x: x["orders_per_table"], reverse=True)
    elif sort == "most_orders":
        items.sort(key=lambda x: x["order_count"], reverse=True)

    total = len(items)
    start = (page - 1) * limit
    return {"items": items[start: start + limit], "total": total, "page": page}


@router.get("/filters")
async def discover_filters(session: AsyncSession = Depends(get_session)):
    """필터 옵션 목록 (지역, 카테고리)"""
    result = await session.execute(
        select(Store.prefecture, Store.city)
        .where(Store.allow_public_listing == True)
        .distinct()
    )
    regions = [{"prefecture": r.prefecture, "city": r.city} for r in result if r.prefecture]

    # 카테고리 목록
    cat_result = await session.execute(
        select(Menu.category)
        .join(Store, Store.id == Menu.store_id)
        .where(Store.allow_public_listing == True)
        .where(Menu.is_available == True)
        .distinct()
    )
    categories = [r.category for r in cat_result if r.category]

    return {
        "regions": regions,
        "categories": sorted(categories),
        "sort_options": SORT_OPTIONS,
    }

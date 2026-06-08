"""
Public Discovery API — 업주가 동의한 가게/메뉴를 랭킹 형식으로 제공
인증 불필요 (공개 API)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import case, literal_column, text
from typing import Optional, List, Dict, Any
from database import get_session
from models import Store, Menu, Order, OrderItem, Table
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
from utils.takeout import can_accept_takeout, can_accept_takeout_from_store

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

    since = now_utc_naive() - timedelta(days=days)

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
    store_query = (
        select(Store)
        .where(Store.allow_public_listing == True)
        .options(selectinload(Store.payment_settings))
    )
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
    store_takeout = {s.id: can_accept_takeout_from_store(s) for s in stores}
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
    since = now_utc_naive() - timedelta(days=30)
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
            "slug": s.slug,
            "can_accept_takeout": store_takeout.get(s.id, False),
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
    query = (
        select(Store)
        .where(Store.allow_public_listing == True)
        .options(selectinload(Store.payment_settings))
    )
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
            "slug": s.slug,
            "can_accept_takeout": can_accept_takeout_from_store(s),
        })

    if sort == "popular":
        items.sort(key=lambda x: x["orders_per_table"], reverse=True)
    elif sort == "most_orders":
        items.sort(key=lambda x: x["order_count"], reverse=True)

    total = len(items)
    start = (page - 1) * limit
    return {"items": items[start: start + limit], "total": total, "page": page}


@router.get("/nearby")
async def discover_nearby(
    lat: float = Query(..., description="현재 위도 (예: 35.3093)"),
    lng: float = Query(..., description="현재 경도 (예: 138.9337)"),
    radius: int = Query(800, ge=100, le=5000, description="검색 반경(m). 기본 800m = 도보 10분"),
    food_rescue_only: bool = Query(False, description="마감 할인 진행 중 매장만"),
    takeout_only: bool = Query(False, description="온라인 선결제 가능 매장만"),
    session: AsyncSession = Depends(get_session),
):
    """위경도 기준 반경 내 공개 매장 목록 (PostGIS ST_DWithin, 거리 오름차순, max 20).

    food_rescue_only=true 시 food_rescue_manual_active=True 매장만 반환.
    google_maps_url 필드로 외부 지도 링크 제공 (SDK 미사용, 0원).
    """
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="위경도 범위 초과")

    food_rescue_clause = (
        "AND s.food_rescue_manual_active = TRUE AND s.food_rescue_active = TRUE"
        if food_rescue_only
        else ""
    )

    sql = text(f"""
        SELECT
            s.id,
            s.name,
            s.slug,
            s.category,
            s.prefecture,
            s.city,
            s.address,
            s.phone,
            s.theme,
            s.latitude,
            s.longitude,
            s.is_open,
            s.food_rescue_active,
            s.food_rescue_manual_active,
            s.food_rescue_msg,
            s.food_rescue_auto_minutes,
            s.about_description,
            s.specialty,
            s.business_hours,
            s.takeout_enabled,
            (s.square_access_token IS NOT NULL AND s.square_location_id IS NOT NULL) AS has_store_square,
            ps.payment_method_type AS ps_method_type,
            (ps.square_access_token IS NOT NULL AND ps.square_location_id IS NOT NULL) AS has_ps_square,
            (ps.paypay_api_key IS NOT NULL) AS has_ps_paypay,
            ST_Distance(
                ST_MakePoint(s.longitude, s.latitude)::geography,
                ST_MakePoint(:lng, :lat)::geography
            ) AS distance_m
        FROM store s
        LEFT JOIN paymentsettings ps ON ps.store_id = s.id
        WHERE s.allow_public_listing = TRUE
          AND s.latitude IS NOT NULL
          AND s.longitude IS NOT NULL
          AND ST_DWithin(
              ST_MakePoint(s.longitude, s.latitude)::geography,
              ST_MakePoint(:lng, :lat)::geography,
              :radius
          )
          {food_rescue_clause}
        ORDER BY distance_m ASC
        LIMIT 20
    """)

    result = await session.execute(sql, {"lat": lat, "lng": lng, "radius": radius})
    rows = result.mappings().all()

    items = []
    for r in rows:
        items.append({
            "store_id": r["id"],
            "store_name": r["name"],
            "slug": r["slug"],
            "category": r["category"],
            "prefecture": r["prefecture"],
            "city": r["city"],
            "address": r["address"],
            "phone": r["phone"],
            "theme": r["theme"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "is_open": r["is_open"],
            "food_rescue_active": r["food_rescue_active"],
            "food_rescue_manual_active": r["food_rescue_manual_active"],
            "food_rescue_msg": r["food_rescue_msg"],
            "food_rescue_auto_minutes": r["food_rescue_auto_minutes"],
            "about_description": r["about_description"],
            "specialty": r["specialty"],
            "business_hours": r["business_hours"],
            "distance_m": round(float(r["distance_m"]), 1),
            "google_maps_url": f"https://www.google.com/maps/?q={r['latitude']},{r['longitude']}",
            "can_accept_takeout": can_accept_takeout(
                takeout_enabled=bool(r["takeout_enabled"]),
                has_store_square=bool(r["has_store_square"]),
                ps_method_type=r["ps_method_type"],
                has_ps_square=bool(r["has_ps_square"]),
                has_ps_paypay=bool(r["has_ps_paypay"]),
            ),
        })

    if takeout_only:
        # 참고: SQL LIMIT 이후의 파이썬 필터이므로 밀집 지역에선 20개 미만이 나올 수 있음(v1 허용).
        items = [it for it in items if it["can_accept_takeout"]]

    return {
        "items": items,
        "total": len(items),
        "center": {"lat": lat, "lng": lng},
        "radius_m": radius,
        "food_rescue_only": food_rescue_only,
        "takeout_only": takeout_only,
    }


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

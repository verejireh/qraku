"""
플랫폼 무관 근처 매장 검색 코어 (LINE, WhatsApp 등 어댑터에서 재사용 가능).
SECURITY: 암호화 토큰 컬럼은 절대 SELECT 하지 않는다 — IS NOT NULL 불리언 플래그만 사용.
"""
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.takeout import can_accept_takeout
from utils.takeout_wait import compute_dynamic_waits


async def find_nearby_stores(
    session: AsyncSession,
    lat: float,
    lng: float,
    radius: int,
    limit: int = 20,
    open_only: bool = False,
    food_rescue_only: bool = False,
    takeout_only: bool = False,
) -> List[dict]:
    """위경도 기준 반경 내 공개 매장 목록을 반환한다.

    Parameters
    ----------
    session : AsyncSession
    lat, lng : float — 중심 좌표
    radius : int — 반경(m)
    limit : int — 최종 반환 건수 (기본 20)
    open_only : bool — True 시 is_open=TRUE 매장만
    food_rescue_only : bool — True 시 food_rescue_manual_active=TRUE & food_rescue_active=TRUE 매장만
    takeout_only : bool — True 시 can_accept_takeout=True 매장만 (LIMIT 전에 필터)

    Returns
    -------
    list[dict] — 가게당 하나의 dict, /nearby 엔드포인트와 동일한 키셋:
        store_id, store_name, slug, category, prefecture, city, address, phone,
        theme, latitude, longitude, is_open, food_rescue_active,
        food_rescue_manual_active, food_rescue_msg, food_rescue_auto_minutes,
        about_description, specialty, business_hours, distance_m,
        google_maps_url, can_accept_takeout, takeout_default_wait_minutes,
        takeout_dynamic_wait_minutes
    """
    # takeout_only 시 SQL 단에서 여유 후보를 확보해 파이썬 필터 후 limit 건을 채운다.
    sql_limit = max(limit, 60) if takeout_only else limit
    food_rescue_clause = (
        "AND s.food_rescue_manual_active = TRUE AND s.food_rescue_active = TRUE"
        if food_rescue_only
        else ""
    )
    open_clause = "AND s.is_open = TRUE" if open_only else ""

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
            s.takeout_default_wait_minutes,
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
          {open_clause}
        ORDER BY distance_m ASC
        LIMIT :limit
    """)

    result = await session.execute(sql, {"lat": lat, "lng": lng, "radius": radius, "limit": sql_limit})
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
            "takeout_default_wait_minutes": r["takeout_default_wait_minutes"],
        })

    # 동적 픽업 대기 (Redis 60s 캐시, 실패 시 직접 계산 폴백)
    wait_keys = [(it["store_id"], it["slug"], it["takeout_default_wait_minutes"]) for it in items]
    try:
        dyn = await compute_dynamic_waits(session, wait_keys)
    except Exception:
        dyn = {}
    for it in items:
        it["takeout_dynamic_wait_minutes"] = dyn.get(it["store_id"])

    if takeout_only:
        items = [it for it in items if it["can_accept_takeout"]]

    return items[:limit]

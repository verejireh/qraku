"""
플랫폼 무관 카드 모델 — 근처 매장 결과를 LINE/WhatsApp 등 어댑터가 사용할 수 있는 중립 dict 로 변환.
URL/포맷은 각 어댑터가 생성한다.
"""
from typing import List


def _dist_label(m: float) -> str:
    return f"{round(m)}m" if m < 1000 else f"{m/1000:.1f}km"


def to_store_cards(stores: List[dict]) -> List[dict]:
    """가게 결과(list[dict]) → 플랫폼 무관 카드 데이터. URL/포맷은 각 어댑터가 생성."""
    cards = []
    for s in stores:
        cards.append({
            "store_id": s["store_id"],
            "name": s["store_name"],
            "distance_label": _dist_label(s["distance_m"]),
            "category": s.get("category"),
            "is_open": bool(s.get("is_open")),
            "can_accept_takeout": bool(s.get("can_accept_takeout")),
            "food_rescue": bool(s.get("food_rescue_manual_active") and s.get("food_rescue_active")),
            "wait_minutes": s.get("takeout_dynamic_wait_minutes") or s.get("takeout_default_wait_minutes") or 0,
            "slug": s.get("slug"),
            "google_maps_url": s.get("google_maps_url"),
        })
    return cards

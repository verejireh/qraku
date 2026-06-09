"""Order ↔ Store 연결의 단일 진실 공급원.

Order.shop_id 에는 주문 생성 시점의 slug 또는 str(id) 가 그대로 저장된다(polymorphic,
routers/orders.py 의 _resolve_store_by_shop_id 참고). 따라서 매장↔주문 집계는 반드시 이
헬퍼로 매장당 후보 집합 {slug, str(id)} 을 만들어 Order.shop_id 와 매칭한다.

금지: Order.store_id (존재하지 않는 컬럼) 또는 Order.shop_id == <int> 직접 비교.
      → 이것이 discover 집계 버그의 재발 원인이었다.
"""
from typing import Iterable, Optional, Tuple

StoreKey = Tuple[int, Optional[str]]  # (store_id, slug)


def store_shop_id_candidates(store_id: int, slug: Optional[str]) -> set[str]:
    """한 매장의 가능한 Order.shop_id 값 전체."""
    cands = {str(store_id)}
    if slug:
        cands.add(slug)
    return cands


def all_shop_id_candidates(stores: Iterable[StoreKey]) -> list[str]:
    """여러 매장의 모든 후보 shop_id 문자열(중복 제거). WHERE shop_id IN (...) 용."""
    out: set[str] = set()
    for store_id, slug in stores:
        out |= store_shop_id_candidates(store_id, slug)
    return list(out)


def shop_id_to_store_id(stores: Iterable[StoreKey]) -> dict[str, int]:
    """후보 shop_id 문자열 → 정규 Store.id 역매핑. 집계 결과를 매장으로 되돌릴 때."""
    m: dict[str, int] = {}
    for store_id, slug in stores:
        for c in store_shop_id_candidates(store_id, slug):
            m[c] = store_id
    return m

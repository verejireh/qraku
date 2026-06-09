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
    """후보 shop_id 문자열 → 정규 Store.id 역매핑. 집계 결과를 매장으로 되돌릴 때.

    결정성 보장: slug 를 먼저 채운 뒤 str(id) 로 덮어쓴다. 따라서 숫자 slug 가 다른 매장의
    실제 id 와 충돌하면 **정규키인 id 가 항상 우선**한다(입력 순서와 무관). id 는 유일하므로
    str(id) 끼리는 충돌하지 않는다. (근본 위생: 숫자 전용 slug 금지·slug UNIQUE 는 후속 과제.)
    """
    stores = list(stores)
    m: dict[str, int] = {}
    for store_id, slug in stores:
        if slug:
            m[slug] = store_id
    for store_id, _ in stores:
        m[str(store_id)] = store_id  # id 우선 — 숫자 slug 충돌 시 id 가 이긴다
    return m

from utils.order_store import (
    store_shop_id_candidates, all_shop_id_candidates, shop_id_to_store_id,
)


def test_candidates_include_id_and_slug():
    assert store_shop_id_candidates(7, "ramen-ya") == {"7", "ramen-ya"}


def test_candidates_id_only_when_no_slug():
    assert store_shop_id_candidates(7, None) == {"7"}


def test_all_candidates_dedup():
    got = set(all_shop_id_candidates([(1, "a"), (2, None)]))
    assert got == {"1", "a", "2"}


def test_reverse_map_each_candidate_to_store():
    m = shop_id_to_store_id([(1, "a"), (2, "b")])
    assert m == {"1": 1, "a": 1, "2": 2, "b": 2}


def test_reverse_map_numeric_slug_collision_id_wins():
    # A.slug == "123" 가 B.id == 123 과 충돌 → 정규키 id(B)가 우선, 결정적
    m_ab = shop_id_to_store_id([(7, "123"), (123, "b")])
    m_ba = shop_id_to_store_id([(123, "b"), (7, "123")])  # 입력 순서 뒤집어도 동일
    assert m_ab["123"] == 123
    assert m_ba["123"] == 123
    assert m_ab == m_ba

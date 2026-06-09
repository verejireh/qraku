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

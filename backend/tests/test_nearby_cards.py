from utils.nearby_cards import to_store_cards, _dist_label


def test_dist_label():
    assert _dist_label(999) == "999m"
    assert _dist_label(1500) == "1.5km"


def test_to_store_cards_maps_fields():
    stores = [{
        "store_id": 1, "store_name": "A", "distance_m": 320, "category": "cafe",
        "is_open": True, "can_accept_takeout": True,
        "food_rescue_manual_active": True, "food_rescue_active": True,
        "takeout_default_wait_minutes": 15, "slug": "a-cafe",
        "google_maps_url": "https://maps/x",
    }]
    cards = to_store_cards(stores)
    c = cards[0]
    assert c["name"] == "A"
    assert c["distance_label"] == "320m"
    assert c["is_open"] is True
    assert c["can_accept_takeout"] is True
    assert c["food_rescue"] is True
    assert c["wait_minutes"] == 15
    assert c["slug"] == "a-cafe"


def test_to_store_cards_food_rescue_requires_both_flags():
    cards = to_store_cards([{
        "store_id": 2, "store_name": "B", "distance_m": 100,
        "food_rescue_manual_active": True, "food_rescue_active": False,
        "takeout_default_wait_minutes": 0, "slug": None, "google_maps_url": None,
    }])
    assert cards[0]["food_rescue"] is False
    assert cards[0]["wait_minutes"] == 0


def test_to_store_cards_prefers_dynamic_wait():
    # 동적 대기시간이 있으면 정적값보다 우선
    cards = to_store_cards([{
        "store_id": 3, "store_name": "C", "distance_m": 50,
        "takeout_default_wait_minutes": 15, "takeout_dynamic_wait_minutes": 27,
        "slug": "c", "google_maps_url": None,
    }])
    assert cards[0]["wait_minutes"] == 27


def test_to_store_cards_falls_back_to_static_wait():
    # 동적값이 없으면(None) 정적값 사용
    cards = to_store_cards([{
        "store_id": 4, "store_name": "D", "distance_m": 50,
        "takeout_default_wait_minutes": 15, "takeout_dynamic_wait_minutes": None,
        "slug": "d", "google_maps_url": None,
    }])
    assert cards[0]["wait_minutes"] == 15


def test_to_store_cards_empty():
    assert to_store_cards([]) == []

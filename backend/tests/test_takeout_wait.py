from utils.takeout_wait import dynamic_wait_minutes, MINUTES_PER_ORDER, SURCHARGE_CAP_MINUTES


def test_no_backlog_returns_base():
    assert dynamic_wait_minutes(15, 0) == 15


def test_backlog_adds_minutes_per_order():
    assert dynamic_wait_minutes(15, 3) == 15 + 3 * MINUTES_PER_ORDER  # 24


def test_surcharge_cap_applies_to_addon_only():
    # 큰 backlog 라도 가산분만 상한 — base 는 그대로 더해진다
    assert dynamic_wait_minutes(15, 100) == 15 + SURCHARGE_CAP_MINUTES


def test_base_above_cap_is_preserved():
    # admin 은 최대 120분 base 를 허용 — 상한이 base 를 깎으면 안 된다
    assert dynamic_wait_minutes(90, 0) == 90
    assert dynamic_wait_minutes(120, 5) == 120 + 5 * MINUTES_PER_ORDER


def test_none_base_defaults_to_15():
    assert dynamic_wait_minutes(None, 0) == 15
    assert dynamic_wait_minutes(0, 2) == 15 + 2 * MINUTES_PER_ORDER


def test_negative_backlog_normalized_to_zero():
    assert dynamic_wait_minutes(15, -5) == 15

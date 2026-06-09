from utils.takeout_wait import dynamic_wait_minutes, MINUTES_PER_ORDER, WAIT_CAP_MINUTES


def test_no_backlog_returns_base():
    assert dynamic_wait_minutes(15, 0) == 15


def test_backlog_adds_minutes_per_order():
    assert dynamic_wait_minutes(15, 3) == 15 + 3 * MINUTES_PER_ORDER  # 24


def test_cap_applies():
    assert dynamic_wait_minutes(15, 100) == WAIT_CAP_MINUTES


def test_none_base_defaults_to_15():
    assert dynamic_wait_minutes(None, 0) == 15
    assert dynamic_wait_minutes(0, 2) == 15 + 2 * MINUTES_PER_ORDER

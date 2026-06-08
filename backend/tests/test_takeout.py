from types import SimpleNamespace
from utils.takeout import (
    can_accept_takeout,
    can_accept_takeout_from_store,
    has_online_payment_from_store,
)


def _ps(method="SQUARE_INTEGRATED", sq_tok=None, sq_loc=None, paypay=None):
    return SimpleNamespace(
        payment_method_type=method,
        square_access_token=sq_tok,
        square_location_id=sq_loc,
        paypay_api_key=paypay,
    )


def test_store_level_square_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=True,
        ps_method_type=None, has_ps_square=False, has_ps_paypay=False,
    ) is True


def test_ps_square_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="SQUARE_INTEGRATED", has_ps_square=True, has_ps_paypay=False,
    ) is True


def test_ps_paypay_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="PAYPAY_DIRECT", has_ps_square=False, has_ps_paypay=True,
    ) is True


def test_counter_pay_blocks_even_with_creds():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="PAY_AT_COUNTER", has_ps_square=True, has_ps_paypay=True,
    ) is False


def test_no_online_payment_disabled():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="SQUARE_INTEGRATED", has_ps_square=False, has_ps_paypay=False,
    ) is False


def test_takeout_off_disabled():
    assert can_accept_takeout(
        takeout_enabled=False, has_store_square=True,
        ps_method_type=None, has_ps_square=False, has_ps_paypay=False,
    ) is False


def test_from_store_square_only():
    store = SimpleNamespace(
        takeout_enabled=True, square_access_token="t", square_location_id="l",
        payment_settings=None,
    )
    assert can_accept_takeout_from_store(store) is True
    assert has_online_payment_from_store(store) is True


def test_from_store_counter_blocked():
    store = SimpleNamespace(
        takeout_enabled=True, square_access_token=None, square_location_id=None,
        payment_settings=_ps(method="PAY_AT_COUNTER", sq_tok="t", sq_loc="l"),
    )
    assert can_accept_takeout_from_store(store) is False


def test_has_online_payment_independent_of_takeout_flag():
    store = SimpleNamespace(
        takeout_enabled=False, square_access_token="t", square_location_id="l",
        payment_settings=None,
    )
    assert has_online_payment_from_store(store) is True
    assert can_accept_takeout_from_store(store) is False


def test_paypay_method_with_only_square_is_false():
    assert can_accept_takeout(takeout_enabled=True, has_store_square=False,
        ps_method_type="PAYPAY_DIRECT", has_ps_square=True, has_ps_paypay=False) is False


def test_square_method_with_only_paypay_is_false():
    assert can_accept_takeout(takeout_enabled=True, has_store_square=False,
        ps_method_type="SQUARE_INTEGRATED", has_ps_square=False, has_ps_paypay=True) is False


def test_counter_pay_with_legacy_store_square_is_false():
    assert can_accept_takeout(takeout_enabled=True, has_store_square=True,
        ps_method_type="PAY_AT_COUNTER", has_ps_square=False, has_ps_paypay=False) is False

import pytest
from config.countries import allowed_methods


def test_gb_disallows_paypay_in_catalog():
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")
    assert "SQUARE_INTEGRATED" in allowed_methods("GB")


def test_assert_method_allowed_rejects_disallowed():
    from fastapi import HTTPException
    from utils.payment_methods import assert_method_allowed
    # GB 에서 PAYPAY_DIRECT → 거부 (UI 숨김만으로는 강제가 아님 — 쓰기 경계 차단)
    with pytest.raises(HTTPException) as ei:
        assert_method_allowed("PAYPAY_DIRECT", "GB")
    assert ei.value.status_code == 422


def test_assert_method_allowed_passes_allowed():
    from utils.payment_methods import assert_method_allowed
    # 예외 없이 통과
    assert_method_allowed("SQUARE_INTEGRATED", "GB")
    assert_method_allowed("PAYPAY_DIRECT", "JP")


def test_assert_method_allowed_fails_closed_on_unknown_country():
    from fastapi import HTTPException
    from utils.payment_methods import assert_method_allowed
    # 잘못된 country_code (DB 변조 등)는 JP 폴백하지 않고 거부
    with pytest.raises(HTTPException) as ei:
        assert_method_allowed("SQUARE_INTEGRATED", "ZZ")
    assert ei.value.status_code == 422

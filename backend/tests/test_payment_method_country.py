import pytest
from config.countries import allowed_methods


def test_gb_disallows_paypay_in_catalog():
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")
    assert "SQUARE_INTEGRATED" in allowed_methods("GB")


def test_assert_method_allowed_rejects_disallowed():
    from fastapi import HTTPException
    from routers.admin import _assert_method_allowed
    # GB 에서 PAYPAY_DIRECT → 거부 (UI 숨김만으로는 강제가 아님 — 쓰기 경계 차단)
    with pytest.raises(HTTPException) as ei:
        _assert_method_allowed("PAYPAY_DIRECT", "GB")
    assert ei.value.status_code == 422


def test_assert_method_allowed_passes_allowed():
    from routers.admin import _assert_method_allowed
    # 예외 없이 통과
    _assert_method_allowed("SQUARE_INTEGRATED", "GB")
    _assert_method_allowed("PAYPAY_DIRECT", "JP")

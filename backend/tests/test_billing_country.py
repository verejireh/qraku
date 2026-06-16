import importlib
import pytest


def test_resolve_price_id_jp_backcompat(monkeypatch):
    # JP 는 기존 변수명(STRIPE_<PLAN>[_OPEN]_PRICE_ID) 하위호환
    monkeypatch.setenv("STRIPE_MONTHLY_PRICE_ID", "price_jp_m")
    monkeypatch.setenv("STRIPE_YEARLY_OPEN_PRICE_ID", "price_jp_yo")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "JP") == "price_jp_m"
    assert billing._resolve_price_id("yearly", True, "JP") == "price_jp_yo"


def test_resolve_price_id_gb_prefixed(monkeypatch):
    # 그 외 국가는 prefix (STRIPE_<PREFIX>_<PLAN>[_OPEN]_PRICE_ID)
    monkeypatch.setenv("STRIPE_GB_MONTHLY_PRICE_ID", "price_gb_m")
    monkeypatch.setenv("STRIPE_GB_SIXMONTH_OPEN_PRICE_ID", "price_gb_so")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "GB") == "price_gb_m"
    assert billing._resolve_price_id("sixmonth", True, "GB") == "price_gb_so"


def test_resolve_price_id_unknown_country_fails_closed():
    # billing 은 돈 쓰기 경계 — 미지원 국가를 JP 로 폴백하지 않고 거부 (잘못된 JPY 청구 방지)
    billing = importlib.import_module("routers.billing")
    with pytest.raises(ValueError):
        billing._resolve_price_id("monthly", False, "ZZ")


def test_resolve_price_id_invalid_plan_raises():
    billing = importlib.import_module("routers.billing")
    with pytest.raises(ValueError):
        billing._resolve_price_id("weekly", False, "JP")     # 미지원 plan → ValueError (입력오류)


def test_resolve_price_id_missing_returns_empty(monkeypatch):
    monkeypatch.delenv("STRIPE_GB_YEARLY_PRICE_ID", raising=False)
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("yearly", False, "GB") == ""


def test_price_env_var_naming():
    billing = importlib.import_module("routers.billing")
    assert billing._price_env_var("monthly", False, "JP") == "STRIPE_MONTHLY_PRICE_ID"
    assert billing._price_env_var("yearly", True, "JP") == "STRIPE_YEARLY_OPEN_PRICE_ID"
    assert billing._price_env_var("sixmonth", False, "GB") == "STRIPE_GB_SIXMONTH_PRICE_ID"
    assert billing._price_env_var("monthly", True, "gb") == "STRIPE_GB_MONTHLY_OPEN_PRICE_ID"

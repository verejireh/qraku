import importlib


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


def test_resolve_price_id_unknown_country_falls_back_jp(monkeypatch):
    monkeypatch.setenv("STRIPE_MONTHLY_PRICE_ID", "price_jp_m")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "ZZ") == "price_jp_m"


def test_resolve_price_id_missing_returns_empty(monkeypatch):
    monkeypatch.delenv("STRIPE_GB_YEARLY_PRICE_ID", raising=False)
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("yearly", False, "GB") == ""

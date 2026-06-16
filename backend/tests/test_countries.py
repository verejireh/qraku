import dataclasses
import pytest
from config.countries import (
    COUNTRIES, get_country, normalize_country, currency_of, decimals_of, symbol_of,
    allowed_methods, default_tax, default_languages, stripe_prefix, DEFAULT_COUNTRY,
)
from utils.currency import decimals_for


def test_default_country_is_jp():
    assert DEFAULT_COUNTRY == "JP"


def test_currency_of():
    assert currency_of("JP") == "JPY"
    assert currency_of("GB") == "GBP"
    assert currency_of("gb") == "GBP"          # 대소문자 무관


def test_get_country_strips_and_falls_back():
    assert get_country(" gb ").currency == "GBP"   # 공백 제거
    assert get_country("ZZ").currency == "JPY"      # 미지 → JP 폴백 (읽기 경로)
    assert get_country(None).currency == "JPY"
    assert get_country(123).currency == "JPY"       # 비문자 → JP 폴백 (crash 안 함)


def test_normalize_country_strict():
    assert normalize_country(" gb ") == "GB"        # 쓰기 경로 정규화
    with pytest.raises(ValueError):
        normalize_country("ZZ")                     # 미지원 거부 (조용한 변질 방지)
    with pytest.raises(ValueError):
        normalize_country("")
    with pytest.raises(TypeError):
        normalize_country(None)


def test_decimals_and_symbol():
    assert decimals_of("JP") == 0
    assert decimals_of("GB") == 2
    assert symbol_of("GB") == "£"


def test_allowed_methods():
    assert "PAYPAY_DIRECT" in allowed_methods("JP")
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")   # 영국은 PayPay 없음
    assert "SQUARE_INTEGRATED" in allowed_methods("GB")


def test_default_tax_and_languages():
    assert default_tax("JP") == (10.0, True)
    assert default_tax("GB") == (20.0, True)
    assert default_languages("GB") == ["en"]
    assert "ja" in default_languages("JP")


def test_stripe_prefix():
    assert stripe_prefix("JP") == "JP"
    assert stripe_prefix("GB") == "GB"


def test_country_config_is_frozen():
    with pytest.raises(dataclasses.FrozenInstanceError):
        get_country("GB").currency = "EUR"          # 전역 카탈로그 불변


def test_accessor_copies_do_not_mutate_catalog():
    allowed_methods("GB").append("PAYPAY_DIRECT")
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")
    default_languages("GB").append("ja")
    assert default_languages("GB") == ["en"]


def test_allowed_methods_match_enum():
    # countries.py 의 문자열이 실제 PaymentMethodType 값과 동기화돼 있는지 보증
    from models import PaymentMethodType
    valid = {m.value for m in PaymentMethodType}
    for cfg in COUNTRIES.values():
        for method in cfg.allowed_payment_methods:
            assert method in valid, f"{method} not in PaymentMethodType"


def test_catalog_invariants():
    assert DEFAULT_COUNTRY in COUNTRIES
    for cfg in COUNTRIES.values():
        decimals_for(cfg.currency)              # 지원 통화여야 함 (미지원이면 raise)
        assert cfg.stripe_price_env_prefix       # prefix 비어있지 않음
        assert cfg.default_languages             # 언어 1개 이상
        assert cfg.allowed_payment_methods       # 결제수단 1개 이상


def test_config_code_matches_key():
    # code 필드와 딕셔너리 키 불일치(예: "GB": CountryConfig(code="JP")) 방지
    assert all(key == cfg.code for key, cfg in COUNTRIES.items())


def test_countries_mapping_is_immutable():
    with pytest.raises(TypeError):
        COUNTRIES["XX"] = COUNTRIES["JP"]       # MappingProxyType — 변조 불가

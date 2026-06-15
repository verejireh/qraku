from config.countries import (
    get_country, currency_of, decimals_of, symbol_of,
    allowed_methods, default_tax, default_languages, stripe_prefix, DEFAULT_COUNTRY,
)


def test_default_country_is_jp():
    assert DEFAULT_COUNTRY == "JP"


def test_currency_of():
    assert currency_of("JP") == "JPY"
    assert currency_of("GB") == "GBP"
    assert currency_of("gb") == "GBP"          # 대소문자 무관


def test_unknown_code_falls_back_to_jp():
    assert currency_of("ZZ") == "JPY"
    assert currency_of(None) == "JPY"
    assert get_country("ZZ")["currency"] == "JPY"


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

"""국가별 설정 카탈로그 (접근 1 — 코드 설정).

국가는 거의 바뀌지 않고 플랫폼 팀이 PR 로 관리한다. Stripe Price ID 등
민감/환경별 값은 여기 두지 않고 `stripe_price_env_prefix` 로 .env 키를 조회한다.
미지 코드는 JP 로 폴백하여 기존(일본) 동작을 보존한다.
"""
from utils.currency import decimals_for, symbol_for

DEFAULT_COUNTRY = "JP"

COUNTRIES = {
    "JP": {
        "currency": "JPY",
        "default_tax_rate": 10.0,
        "default_tax_included": True,
        "default_languages": ["ja", "en", "ko", "zh"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAYPAY_DIRECT", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "JP",
    },
    "GB": {
        "currency": "GBP",
        "default_tax_rate": 20.0,
        "default_tax_included": True,
        "default_languages": ["en"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "GB",
    },
}


def get_country(code: str) -> dict:
    return COUNTRIES.get((code or "").upper(), COUNTRIES[DEFAULT_COUNTRY])


def currency_of(code: str) -> str:
    return get_country(code)["currency"]


def decimals_of(code: str) -> int:
    return decimals_for(currency_of(code))


def symbol_of(code: str) -> str:
    return symbol_for(currency_of(code))


def allowed_methods(code: str) -> list:
    return list(get_country(code)["allowed_payment_methods"])


def default_tax(code: str) -> tuple:
    c = get_country(code)
    return (c["default_tax_rate"], c["default_tax_included"])


def default_languages(code: str) -> list:
    return list(get_country(code)["default_languages"])


def stripe_prefix(code: str) -> str:
    return get_country(code)["stripe_price_env_prefix"]

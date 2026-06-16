"""국가별 설정 카탈로그 (접근 1 — 코드 설정).

국가는 거의 바뀌지 않고 플랫폼 팀이 PR 로 관리한다. Stripe Price ID 등
민감/환경별 값은 여기 두지 않고 `stripe_price_env_prefix` 로 .env 키를 조회한다.

읽기/쓰기 경계 분리:
- `get_country` (읽기): 미지/빈 코드는 JP 로 폴백 — 기존(일본) 데이터에 절대 crash 하지 않는다.
- `normalize_country` (쓰기): 명시된 미지원/빈 코드를 거부 — 오타가 조용히 JPY/일본 세율로
  변질되는 것을 막는다. 신규 가입 등 입력 경계에서 사용.

`allowed_payment_methods` 는 PaymentMethodType enum 값(문자열)과 동기화되어야 한다
(countries 가 ORM 모델을 import 하지 않도록 문자열로 두되, 불변식 테스트로 보증 —
test_countries.py::test_allowed_methods_match_enum).
"""
from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from utils.currency import decimals_for, symbol_for

DEFAULT_COUNTRY = "JP"


@dataclass(frozen=True, slots=True)
class CountryConfig:
    code: str
    currency: str
    default_tax_rate: float                   # Store.tax_rate(float) 시드용 — 모델과 타입 일치
    default_tax_included: bool
    default_languages: tuple[str, ...]        # 불변
    allowed_payment_methods: tuple[str, ...]  # PaymentMethodType 값
    stripe_price_env_prefix: str


_COUNTRIES = {
    "JP": CountryConfig(
        code="JP",
        currency="JPY",
        default_tax_rate=10.0,
        default_tax_included=True,
        default_languages=("ja", "en", "ko", "zh"),
        allowed_payment_methods=("SQUARE_INTEGRATED", "PAYPAY_DIRECT", "PAY_AT_COUNTER"),
        stripe_price_env_prefix="JP",
    ),
    "GB": CountryConfig(
        code="GB",
        currency="GBP",
        default_tax_rate=20.0,
        default_tax_included=True,
        default_languages=("en",),
        allowed_payment_methods=("SQUARE_INTEGRATED", "PAY_AT_COUNTER"),
        stripe_price_env_prefix="GB",
    ),
}

# 카탈로그 매핑 자체도 불변화 (런타임 변조/삭제 방지).
COUNTRIES: Mapping[str, CountryConfig] = MappingProxyType(_COUNTRIES)


def _clean(code: object) -> str:
    return code.strip().upper() if isinstance(code, str) else ""


def get_country(code: object) -> CountryConfig:
    """읽기 경로 — '이미 저장된' country_code 를 해석한다.

    미지/빈/비문자 코드는 JP 로 폴백한다(레거시·이상 데이터에 crash 하지 않음).
    **입력 경계(가입·결제수단 변경 등)에서는 이 함수가 아니라 normalize_country()
    를 먼저 호출해 미지원 코드를 거부해야 한다** — 그래야 오타가 조용히 JP 정책으로
    검증되는 일이 없다. currency_of/stripe_prefix 등 아래 접근자는 모두 이 폴백 규약을
    따른다(저장된 유효 코드를 전제).
    """
    return COUNTRIES.get(_clean(code), COUNTRIES[DEFAULT_COUNTRY])


def normalize_country(code: str) -> str:
    """쓰기 경로 — 명시된 미지원/빈 코드를 거부 (조용한 JP 변질 방지)."""
    if not isinstance(code, str):
        raise TypeError("country code must be a string")
    normalized = code.strip().upper()
    if not normalized:
        raise ValueError("country code is required")
    if normalized not in COUNTRIES:
        raise ValueError(f"Unsupported country: {normalized}")
    return normalized


def currency_of(code: object) -> str:
    return get_country(code).currency


def decimals_of(code: object) -> int:
    return decimals_for(currency_of(code))


def symbol_of(code: object) -> str:
    return symbol_for(currency_of(code))


def allowed_methods(code: object) -> list[str]:
    return list(get_country(code).allowed_payment_methods)


def default_tax(code: object) -> tuple[float, bool]:
    c = get_country(code)
    return (c.default_tax_rate, c.default_tax_included)


def default_languages(code: object) -> list[str]:
    return list(get_country(code).default_languages)


def stripe_prefix(code: object) -> str:
    return get_country(code).stripe_price_env_prefix

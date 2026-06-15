"""통화 최소단위·반올림·포맷 — 도메인 무지식 순수 함수.

금액은 통화의 '최소단위 정수'로 저장한다 (JPY=엔, GBP=펜스).
기존 엔화 데이터는 이미 최소단위이므로 그대로 유효하다.
"""
from decimal import Decimal, ROUND_HALF_UP

CURRENCY_DECIMALS = {"JPY": 0, "GBP": 2, "EUR": 2, "USD": 2}
CURRENCY_SYMBOLS = {"JPY": "¥", "GBP": "£", "EUR": "€", "USD": "$"}


def decimals_for(currency: str) -> int:
    return CURRENCY_DECIMALS.get((currency or "").upper(), 2)


def symbol_for(currency: str) -> str:
    code = (currency or "").upper()
    return CURRENCY_SYMBOLS.get(code, f"{code} ")


def to_minor_units(amount, currency: str) -> int:
    """표시 금액(소수)을 최소단위 정수로 변환 (통화별 자리수, HALF_UP 반올림)."""
    d = decimals_for(currency)
    quantum = Decimal(1).scaleb(-d)                       # d=0 → 1, d=2 → 0.01
    q = Decimal(str(amount)).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(q.scaleb(d))


def from_minor_units(minor: int, currency: str) -> Decimal:
    d = decimals_for(currency)
    return Decimal(int(minor)) / (Decimal(10) ** d)


def format_amount(minor: int, currency: str) -> str:
    d = decimals_for(currency)
    value = from_minor_units(minor, currency)
    return f"{symbol_for(currency)}{value:,.{d}f}"

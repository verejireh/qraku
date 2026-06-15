"""통화 최소단위·반올림·포맷 — 도메인 무지식 순수 함수.

금액은 통화의 '최소단위 정수'로 저장한다 (JPY=엔, GBP=펜스).
기존 엔화 데이터는 이미 최소단위이므로 그대로 유효하다.

설계 원칙 (결제 경계의 안전성):
- 지원 통화만 허용한다. 미지 통화는 추정하지 않고 ValueError (자릿수 추정은
  KRW(0)/KWD(3) 같은 통화에서 금액을 조용히 변질시킨다).
- `to_minor_units` 는 확정 금액의 '정확' 변환만 한다. 통화 허용 자릿수를
  초과하는 소수는 데이터 오류로 보고 거부한다(묵시적 반올림 금지).
- 반올림이 필요한 계산(세금·할인)은 정책이 드러나는 `round_to_currency` 사용.
- float 는 결제 경계에서 거부한다(부동소수 오차). str / int / Decimal 만 허용.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

CURRENCY_DECIMALS = {"JPY": 0, "GBP": 2, "EUR": 2, "USD": 2}
CURRENCY_SYMBOLS = {"JPY": "¥", "GBP": "£", "EUR": "€", "USD": "$"}


def normalize_currency(currency) -> str:
    """통화 코드 정규화 + 지원 여부 검증 (단일 진입점)."""
    if not isinstance(currency, str):
        raise TypeError("currency must be a string")
    code = currency.strip().upper()
    if not code:
        raise ValueError("currency is required")
    if code not in CURRENCY_DECIMALS:
        raise ValueError(f"Unsupported currency: {code}")
    return code


def decimals_for(currency) -> int:
    return CURRENCY_DECIMALS[normalize_currency(currency)]


def symbol_for(currency) -> str:
    return CURRENCY_SYMBOLS[normalize_currency(currency)]


def _to_decimal_strict(amount) -> Decimal:
    """결제 경계용 엄격 변환 — float/bool 거부, str/int/Decimal 만 허용."""
    if isinstance(amount, bool):
        raise TypeError("amount must be int, str, or Decimal — not bool")
    if isinstance(amount, float):
        raise TypeError("amount must be int, str, or Decimal — not float (precision loss)")
    if isinstance(amount, (int, Decimal)):
        return Decimal(amount)
    if isinstance(amount, str):
        try:
            return Decimal(amount)
        except InvalidOperation:
            raise ValueError(f"Invalid decimal string: {amount!r}")
    raise TypeError("amount must be int, str, or Decimal")


def to_minor_units(amount, currency) -> int:
    """확정 금액을 최소단위 정수로 '정확히' 변환.

    통화 허용 자릿수를 초과하는 소수는 거부한다(묵시적 반올림 금지).
    반올림이 필요하면 round_to_currency() 를 사용한다.
    """
    code = normalize_currency(currency)
    d = CURRENCY_DECIMALS[code]
    value = _to_decimal_strict(amount)
    scaled = value.scaleb(d)
    if scaled != scaled.to_integral_value():
        raise ValueError(
            f"Amount {value} has more fractional digits than {code} allows ({d})"
        )
    return int(scaled)


def round_to_currency(amount, currency, rounding=ROUND_HALF_UP) -> int:
    """계산 결과(세금·할인 등)를 최소단위로 반올림. 정책은 호출자가 명시.

    기본 ROUND_HALF_UP 이지만 국가·결제사 규칙에 따라 rounding 인자로 교체.
    """
    code = normalize_currency(currency)
    d = CURRENCY_DECIMALS[code]
    value = _to_decimal_strict(amount)
    q = value.quantize(Decimal(1).scaleb(-d), rounding=rounding)
    return int(q.scaleb(d))


def from_minor_units(minor, currency) -> Decimal:
    code = normalize_currency(currency)
    if isinstance(minor, bool) or not isinstance(minor, int):
        raise TypeError("minor must be an integer")
    d = CURRENCY_DECIMALS[code]
    return (Decimal(minor) / (Decimal(10) ** d)).quantize(Decimal(1).scaleb(-d))


def format_amount(minor, currency) -> str:
    """영문/GBP식 표시 (접두 기호, '.' 소수점, ',' 천단위 구분).

    로케일별 표시(예: '10,00 €')는 저장/변환과 분리된 별도 표시 계층에서
    처리한다 — 이 함수는 영문 표시 규칙으로 한정한다.
    """
    code = normalize_currency(currency)
    d = CURRENCY_DECIMALS[code]
    sign = "-" if minor < 0 else ""
    value = abs(from_minor_units(minor, code))
    return f"{sign}{symbol_for(code)}{value:,.{d}f}"

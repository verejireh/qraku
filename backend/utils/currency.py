"""통화 최소단위·반올림·포맷 — 도메인 무지식 순수 함수.

금액은 통화의 '최소단위 정수'로 저장한다 (JPY=엔, GBP=펜스).
기존 엔화 데이터는 이미 최소단위이므로 그대로 유효하다.

설계 원칙 (결제 경계의 안전성):
- 지원 통화만 허용한다. 미지 통화는 추정하지 않고 ValueError (자릿수 추정은
  KRW(0)/KWD(3) 같은 통화에서 금액을 조용히 변질시킨다).
- `to_minor_units` 는 확정 금액의 '정확' 변환만 한다. 통화 허용 자릿수를
  초과하는 소수는 데이터 오류로 보고 거부한다(묵시적 반올림 금지). 변환은
  Decimal context 정밀도에 의존하지 않도록 정수 연산으로 구현한다.
- 반올림이 필요한 계산(세금·할인)은 정책이 드러나는 `round_to_minor_units` 사용.
- float·NaN·Infinity 는 결제 경계에서 거부한다. str / int / Decimal(유한) 만 허용.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation, localcontext

# 통화 메타데이터 단일 테이블 (decimals/symbol 키 불일치 방지)
CURRENCIES = {
    "JPY": {"decimals": 0, "symbol": "¥"},
    "GBP": {"decimals": 2, "symbol": "£"},
    "EUR": {"decimals": 2, "symbol": "€"},
    "USD": {"decimals": 2, "symbol": "$"},
}


def normalize_currency(currency: str) -> str:
    """통화 코드 정규화 + 지원 여부 검증 (단일 진입점)."""
    if not isinstance(currency, str):
        raise TypeError("currency must be a string")
    code = currency.strip().upper()
    if not code:
        raise ValueError("currency is required")
    if code not in CURRENCIES:
        raise ValueError(f"Unsupported currency: {code}")
    return code


def decimals_for(currency: str) -> int:
    return CURRENCIES[normalize_currency(currency)]["decimals"]


def symbol_for(currency: str) -> str:
    return CURRENCIES[normalize_currency(currency)]["symbol"]


def _to_decimal_strict(amount) -> Decimal:
    """결제 경계용 엄격 변환 — float/bool/비유한 거부, str/int/Decimal 만 허용."""
    if isinstance(amount, bool):
        raise TypeError("amount must be int, str, or Decimal — not bool")
    if isinstance(amount, float):
        raise TypeError("amount must be int, str, or Decimal — not float (precision loss)")
    if isinstance(amount, (int, Decimal)):
        value = Decimal(amount)
    elif isinstance(amount, str):
        try:
            value = Decimal(amount)
        except InvalidOperation:
            raise ValueError(f"Invalid decimal string: {amount!r}")
    else:
        raise TypeError("amount must be int, str, or Decimal")
    if not value.is_finite():
        raise ValueError("amount must be finite")
    return value


def _validate_minor(minor) -> int:
    if isinstance(minor, bool) or not isinstance(minor, int):
        raise TypeError("minor must be an integer")
    return minor


def to_minor_units(amount: "int | str | Decimal", currency: str) -> int:
    """확정 금액을 최소단위 정수로 '정확히' 변환 (Decimal context 비의존, 정수 연산).

    통화 허용 자릿수를 초과하는 소수는 거부한다(묵시적 반올림 금지).
    반올림이 필요하면 round_to_minor_units() 를 사용한다.
    """
    code = normalize_currency(currency)
    d = CURRENCIES[code]["decimals"]
    value = _to_decimal_strict(amount)
    numerator, denominator = value.as_integer_ratio()   # denominator > 0 보장
    minor, remainder = divmod(numerator * (10 ** d), denominator)
    if remainder:
        raise ValueError(
            f"Amount {value} has more fractional digits than {code} allows ({d})"
        )
    return minor


def round_to_minor_units(amount: "int | str | Decimal", currency: str,
                         rounding: str = ROUND_HALF_UP) -> int:
    """계산 결과(세금·할인 등)를 최소단위로 반올림. 정책은 호출자가 명시.

    ambient Decimal context 정밀도에 영향받지 않도록 값에 맞춰 정밀도를 확보한다.
    """
    code = normalize_currency(currency)
    d = CURRENCIES[code]["decimals"]
    value = _to_decimal_strict(amount)
    with localcontext() as ctx:
        ctx.prec = max(ctx.prec, len(value.as_tuple().digits) + d + 1)
        q = value.quantize(Decimal(1).scaleb(-d), rounding=rounding)
        return int(q.scaleb(d))


def from_minor_units(minor: int, currency: str) -> Decimal:
    """최소단위 정수 → 표시용 Decimal (고정 scale, context 비의존)."""
    code = normalize_currency(currency)
    _validate_minor(minor)
    d = CURRENCIES[code]["decimals"]
    if d == 0:
        return Decimal(minor)
    neg = minor < 0
    digits = str(abs(minor)).rjust(d + 1, "0")
    result = Decimal(f"{digits[:-d]}.{digits[-d:]}")
    return -result if neg else result


def format_amount(minor: int, currency: str) -> str:
    """영문/GBP식 표시 (접두 기호, '.' 소수점, ',' 천단위 구분).

    로케일별 표시(예: '10,00 €')는 저장/변환과 분리된 별도 표시 계층에서
    처리한다 — 이 함수 경계가 추후 로케일 표시 계층으로 교체할 분리 지점이다.
    """
    code = normalize_currency(currency)
    _validate_minor(minor)
    d = CURRENCIES[code]["decimals"]
    sign = "-" if minor < 0 else ""
    value = abs(from_minor_units(minor, code))
    return f"{sign}{symbol_for(code)}{value:,.{d}f}"

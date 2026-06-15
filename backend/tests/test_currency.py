import pytest
from decimal import Decimal, ROUND_DOWN, localcontext
from utils.currency import (
    CURRENCIES, normalize_currency, decimals_for, symbol_for,
    to_minor_units, round_to_minor_units, from_minor_units, format_amount,
)


def test_currency_table_has_complete_metadata():
    for code, meta in CURRENCIES.items():
        assert "decimals" in meta and "symbol" in meta   # 키 불일치 클래스 차단


def test_normalize_currency():
    assert normalize_currency(" gbp ") == "GBP"      # trim + 대문자
    with pytest.raises(ValueError):
        normalize_currency("")                       # 빈 문자열 거부
    with pytest.raises(ValueError):
        normalize_currency("XYZ")                    # 미지원 거부
    with pytest.raises(TypeError):
        normalize_currency(None)


def test_decimals_for():
    assert decimals_for("JPY") == 0
    assert decimals_for("GBP") == 2
    assert decimals_for("eur") == 2
    with pytest.raises(ValueError):
        decimals_for("KRW")          # 미지원 → 명시적 실패 (묵시적 2자리 금지)


def test_symbol_for():
    assert symbol_for("JPY") == "¥"
    assert symbol_for("GBP") == "£"
    assert symbol_for("EUR") == "€"
    with pytest.raises(ValueError):
        symbol_for("XYZ")


def test_to_minor_units_exact():
    assert to_minor_units("1000", "JPY") == 1000     # 엔: 최소단위=엔
    assert to_minor_units("10.00", "GBP") == 1000    # 파운드: 펜스
    assert to_minor_units(10, "GBP") == 1000          # int 입력
    assert to_minor_units(Decimal("10.50"), "GBP") == 1050
    assert to_minor_units("-10.50", "GBP") == -1050   # 음수 정확 변환


def test_to_minor_units_context_independent():
    # ambient context 정밀도가 낮아도 정상 금액이 변조되면 안 됨 (정수 연산)
    with localcontext() as ctx:
        ctx.prec = 6
        assert to_minor_units("123456.78", "GBP") == 12345678


def test_to_minor_units_rejects_excess_precision():
    with pytest.raises(ValueError):
        to_minor_units("10.005", "GBP")   # 통화 자릿수 초과 → 묵시적 반올림 금지
    with pytest.raises(ValueError):
        to_minor_units("10.5", "JPY")     # JPY 는 소수 불가


def test_to_minor_units_rejects_bad_input():
    with pytest.raises(TypeError):
        to_minor_units(10.0, "GBP")       # float 거부 (부동소수 오차)
    with pytest.raises(TypeError):
        to_minor_units(True, "GBP")       # bool 거부
    with pytest.raises(ValueError):
        to_minor_units("NaN", "GBP")      # 비유한 거부
    with pytest.raises(ValueError):
        to_minor_units(Decimal("Infinity"), "GBP")


def test_round_to_minor_units():
    assert round_to_minor_units("10.005", "GBP") == 1001                      # HALF_UP 기본
    assert round_to_minor_units("10.005", "GBP", rounding=ROUND_DOWN) == 1000  # 정책 교체
    assert round_to_minor_units(Decimal("100.4"), "JPY") == 100


def test_from_minor_units():
    assert from_minor_units(1000, "GBP") == Decimal("10.00")
    assert from_minor_units(1000, "JPY") == Decimal("1000")
    assert from_minor_units(5, "GBP") == Decimal("0.05")
    assert from_minor_units(-1000, "GBP") == Decimal("-10.00")


def test_from_minor_units_strict_int():
    with pytest.raises(TypeError):
        from_minor_units(1.9, "GBP")      # float 거부
    with pytest.raises(TypeError):
        from_minor_units(True, "GBP")     # bool 거부


def test_format_amount():
    assert format_amount(1000, "JPY") == "¥1,000"
    assert format_amount(1000, "GBP") == "£10.00"
    assert format_amount(123456, "GBP") == "£1,234.56"


def test_format_amount_negative():
    assert format_amount(-1000, "GBP") == "-£10.00"   # 부호는 기호 앞


def test_format_amount_validates_minor_first():
    with pytest.raises(TypeError):
        format_amount(None, "GBP")        # 비교(<) 전에 타입 검증

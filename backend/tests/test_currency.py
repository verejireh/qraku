from decimal import Decimal
from utils.currency import decimals_for, symbol_for, to_minor_units, from_minor_units, format_amount


def test_decimals_for():
    assert decimals_for("JPY") == 0
    assert decimals_for("GBP") == 2
    assert decimals_for("eur") == 2          # 대소문자 무관
    assert decimals_for("XYZ") == 2          # 미지 통화 → 2 폴백


def test_symbol_for():
    assert symbol_for("JPY") == "¥"
    assert symbol_for("GBP") == "£"
    assert symbol_for("EUR") == "€"
    assert symbol_for("XYZ") == "XYZ "       # 미지 통화 → 코드+공백


def test_to_minor_units():
    assert to_minor_units("1000", "JPY") == 1000     # 엔: 최소단위=엔
    assert to_minor_units("10.00", "GBP") == 1000    # 파운드: 펜스
    assert to_minor_units("10.005", "GBP") == 1001   # 반올림 HALF_UP
    assert to_minor_units(10, "GBP") == 1000          # int 입력


def test_from_minor_units():
    assert from_minor_units(1000, "GBP") == Decimal("10.00")
    assert from_minor_units(1000, "JPY") == Decimal("1000")


def test_format_amount():
    assert format_amount(1000, "JPY") == "¥1,000"
    assert format_amount(1000, "GBP") == "£10.00"
    assert format_amount(123456, "GBP") == "£1,234.56"

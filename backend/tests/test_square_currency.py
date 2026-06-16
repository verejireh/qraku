from utils.square_client import _amount_money


class _FakeStore:
    def __init__(self, country_code):
        self.country_code = country_code


def test_amount_money_jp_uses_jpy():
    # JPY: 최소단위=엔, 1000 → 1000 JPY
    assert _amount_money(1000, _FakeStore("JP")) == {"amount": 1000, "currency": "JPY"}


def test_amount_money_gb_uses_gbp():
    # GBP: 최소단위=펜스, 1000 펜스(=£10.00) → 1000 GBP (지갑시트 £10.00 와 실제 청구 통화 일치)
    assert _amount_money(1000, _FakeStore("GB")) == {"amount": 1000, "currency": "GBP"}


def test_amount_money_coerces_int_and_defaults_jp():
    assert _amount_money("1500", _FakeStore("GB")) == {"amount": 1500, "currency": "GBP"}
    # country_code 누락(레거시) → JP 폴백 (읽기 경로)
    assert _amount_money(500, _FakeStore(None))["currency"] == "JPY"

"""환불 어댑터 선택 단위테스트 — 주문 원결제수단 기준으로 올바른 환불 어댑터 클래스 선택.

(외부 API/DB 없이 순수 선택 로직만 검증. 실제 Square/PayPay 환불 호출은 sandbox E2E 필요.)
"""
from utils.refunds import _adapter_class_for_method
from services.pos.adapters.square_adapter import SquareAdapter
from services.pos.adapters.paypay_direct_adapter import PayPayDirectAdapter


def test_paypay_method_selects_paypay_adapter():
    assert _adapter_class_for_method("PAYPAY_DIRECT") is PayPayDirectAdapter
    assert _adapter_class_for_method("paypay") is PayPayDirectAdapter


def test_square_and_card_select_square_adapter():
    assert _adapter_class_for_method("square") is SquareAdapter
    assert _adapter_class_for_method("CARD") is SquareAdapter


def test_cash_and_none_fall_back():
    # 폴백(None) — 현금/미상 결제수단은 현재 설정 기준 폴백 의미
    assert _adapter_class_for_method("cash") is None
    assert _adapter_class_for_method(None) is None
    assert _adapter_class_for_method("") is None

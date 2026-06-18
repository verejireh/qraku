"""Task 3 — room_service 주문 결제 결정 로직 (순수 헬퍼).

create_order 전체는 background_tasks/결제 어댑터/시드 의존이 커서 이 코드베이스는
HTTP-client 테스트를 두지 않는다. 새 로직(¥0 스킵 + 유료 선결제)을 순수 헬퍼로
추출해 결정적으로 검증한다. (eat_in/take_out 회귀도 함께 검증)
"""
from routers.orders import _is_prepay, _resolve_payment_state


def test_room_service_zero_total_is_free_request_paid():
    # ¥0 비품/요청 → 결제 스킵, paid + 주방행(pending)
    is_paid, status = _resolve_payment_state("room_service", 0, is_take_out=False, square_payment_id=None)
    assert is_paid is True
    assert status == "pending"


def test_room_service_zero_is_not_prepay():
    assert _is_prepay("room_service", 0, is_take_out=False) is False


def test_room_service_paid_requires_prepayment():
    assert _is_prepay("room_service", 1500, is_take_out=False) is True
    # 선결제 전(payment_id 없음) → 미결제
    is_paid, status = _resolve_payment_state("room_service", 1500, is_take_out=False, square_payment_id=None)
    assert is_paid is False and status == "pending_payment"
    # 선결제 완료
    is_paid2, status2 = _resolve_payment_state("room_service", 1500, is_take_out=False, square_payment_id="pay_x")
    assert is_paid2 is True and status2 == "pending"


def test_eat_in_unchanged():
    assert _is_prepay("eat_in", 1000, is_take_out=False) is False
    is_paid, status = _resolve_payment_state("eat_in", 1000, is_take_out=False, square_payment_id=None)
    assert is_paid is False and status == "pending_payment"


def test_take_out_unchanged():
    assert _is_prepay("take_out", 1000, is_take_out=True) is True
    is_paid, status = _resolve_payment_state("take_out", 1000, is_take_out=True, square_payment_id="pay_y")
    assert is_paid is True and status == "pending"

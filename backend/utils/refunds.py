"""
환불 처리 + 감사 로그 통합 헬퍼.
사용 예 (향후 router 에서):

    from utils.refunds import perform_refund
    result = await perform_refund(
        session=session,
        store=store,
        order=order,
        amount=order.total_amount,
        reason="요청에 의한 환불",
        admin_user_id=admin_store.owner_id,
    )
    if result["status"] != "ok":
        raise HTTPException(status_code=502, detail=result["message"])
"""
import logging
from typing import Optional

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _adapter_class_for_method(method: Optional[str]):
    """주문 결제수단 문자열 → 환불 어댑터 클래스. None 이면 폴백(현재 설정) 의미.

    (순수 함수 — 어댑터 생성 없이 선택 로직만 단위테스트 가능.)
    """
    from services.pos.adapters.square_adapter import SquareAdapter
    from services.pos.adapters.paypay_direct_adapter import PayPayDirectAdapter

    m = (method or "").upper()
    if m in ("PAYPAY_DIRECT", "PAYPAY"):
        return PayPayDirectAdapter
    if m in ("SQUARE", "CARD"):
        return SquareAdapter
    return None


def _adapter_for_order(store, order):
    """주문의 **원 결제수단** 기준으로 환불 어댑터 선택 (현재 매장 설정이 바뀌었어도 원결제망으로 환불).

    한계: 결제 당시 자격증명(merchant/location)을 별도 스냅샷하지 않으므로, 업주가
    결제망을 완전히 교체해 자격증명까지 사라지면 환불 불가 — 그 경우는 수동 처리 필요(후속).
    """
    from services.pos.factory import get_payment_adapter

    ps = getattr(store, "payment_settings", None)
    cls = _adapter_class_for_method(getattr(order, "payment_method", None))
    if cls is not None:
        return cls(store, ps)
    return get_payment_adapter(store, ps)  # 폴백: 현재 설정 기준


async def perform_refund(
    session: AsyncSession,
    store,
    order,
    amount: float,
    reason: str = "",
    admin_user_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> dict:
    """
    Order 의 결제 정보를 바탕으로 환불 + RefundLog 기록.
    idempotency_key: 주문 기준 고정값 → PG 에 전달해 재시도 이중환불 방지.
    Returns: {"status": "ok"|"error", "refund_id": str|None, "message": str|None}
    """
    from models import RefundLog

    # 영속 멱등성: 이미 성공한 환불 RefundLog 가 있으면 외부 API 재호출 금지
    dup = await session.execute(
        select(RefundLog).where(RefundLog.order_id == order.id, RefundLog.status == "ok").limit(1)
    )
    if dup.scalar_one_or_none() is not None:
        return {"status": "ok", "refund_id": None, "message": "already refunded (idempotent)"}

    payment_id = getattr(order, "square_payment_id", None)
    payment_method = getattr(order, "payment_method", None) or "unknown"
    if idempotency_key is None:
        idempotency_key = f"order-refund:{order.id}"

    if not payment_id:
        # 결제 ID 없음 → 환불 API 호출 없이 로그만 기록 (수동 환불 등)
        log = RefundLog(
            store_id=store.id,
            order_id=order.id,
            payment_id=None,
            payment_method=payment_method,
            amount=amount,
            reason=reason,
            admin_user_id=admin_user_id,
            status="ok",
            error_message=None,
        )
        session.add(log)
        await session.commit()
        return {"status": "ok", "refund_id": None, "message": "Manual refund (no payment_id)"}

    # 결제망별 환불 API 호출 — 주문의 원 결제수단 기준 어댑터
    adapter = _adapter_for_order(store, order)
    if not adapter:
        log = RefundLog(
            store_id=store.id, order_id=order.id, payment_id=payment_id,
            payment_method=payment_method, amount=amount, reason=reason,
            admin_user_id=admin_user_id, status="failed",
            error_message="No payment adapter available",
        )
        session.add(log)
        await session.commit()
        return {"status": "error", "message": "결제 어댑터를 찾을 수 없습니다"}

    try:
        api_result = await adapter.refund_payment(payment_id, amount=amount, idempotency_key=idempotency_key)
    except Exception as e:
        logger.exception("Refund API 호출 실패")
        api_result = {"status": "error", "message": str(e)}

    log = RefundLog(
        store_id=store.id,
        order_id=order.id,
        payment_id=payment_id,
        payment_method=payment_method,
        refund_id=api_result.get("refund_id"),
        amount=amount,
        reason=reason,
        admin_user_id=admin_user_id,
        status=api_result.get("status", "failed"),
        error_message=api_result.get("message") if api_result.get("status") != "ok" else None,
    )
    session.add(log)
    await session.commit()

    return {
        "status": api_result.get("status", "failed"),
        "refund_id": api_result.get("refund_id"),
        "message": api_result.get("message"),
    }

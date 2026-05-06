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

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def perform_refund(
    session: AsyncSession,
    store,
    order,
    amount: float,
    reason: str = "",
    admin_user_id: Optional[str] = None,
) -> dict:
    """
    Order 의 결제 정보를 바탕으로 환불 + RefundLog 기록.
    Returns: {"status": "ok"|"error", "refund_id": str|None, "message": str|None}
    """
    from models import RefundLog
    from services.pos.factory import get_payment_adapter

    payment_id = getattr(order, "square_payment_id", None)
    payment_method = getattr(order, "payment_method", None) or "unknown"

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

    # 결제망별 환불 API 호출
    adapter = get_payment_adapter(store, store.payment_settings)
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
        api_result = await adapter.refund_payment(payment_id, amount=amount)
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

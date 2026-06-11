from typing import Dict, Any, List
from models import Store, Order, PaymentSettings
from ..base import BasePaymentAdapter, BasePOSAdapter
from utils.square_client import process_square_payment, create_square_order, refund_square_payment

class SquareAdapter(BasePaymentAdapter, BasePOSAdapter):
    def __init__(self, store: Store, settings: PaymentSettings):
        super().__init__(store, settings)

    async def process_payment(self, amount: float, source_id: str, note: str = "") -> dict:
        """Square 결제 호출"""
        try:
            # TODO: square_client가 payment_settings 기반 동작하도록 리팩토링 필요 (임시로 기존 로직 호출)
            result = await process_square_payment(self.store, source_id, int(amount), note)
            return result
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def refund_payment(self, payment_id: str, amount: float = None, idempotency_key: str = None) -> dict:
        """Square /v2/refunds 환불. amount 필수, idempotency_key 로 재시도 중복환불 방지."""
        if amount is None:
            return {"status": "error", "message": "Square 환불은 금액 지정이 필요합니다"}
        key = idempotency_key or f"sq-refund:{payment_id}"
        return await refund_square_payment(self.store, payment_id, int(amount), key)

    async def send_order_to_pos(self, order: Order, line_items: List[Dict[str, Any]]) -> dict:
        """Square POS로 주문 동기화"""
        try:
            result = await create_square_order(self.store, order, line_items)
            sq_order_id = (result.get("order") or {}).get("id")
            if sq_order_id:
                return {"status": "ok", "order_id": sq_order_id}
            else:
                return {"status": "error", "message": "Order ID not returned from Square"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

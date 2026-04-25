from typing import Dict, Any, List
from models import Store, Order, PaymentSettings
from ..base import BasePOSAdapter

class SmaregiAdapter(BasePOSAdapter):
    """결제 기능은 없고, 홀에서 들어온 주문 데이터를 Smaregi 클라우드 API를 통해 매장 포스기로 주입"""
    def __init__(self, store: Store, settings: PaymentSettings):
        super().__init__(store, settings)

    async def send_order_to_pos(self, order: Order, line_items: List[Dict[str, Any]]) -> dict:
        try:
            # TODO: Smaregi Cloud API Injection 연동 로직
            print(f"[SmaregiPOS] Injecting order {order.id} into Smaregi for store {self.store.id}")
            # Mocking successful injection
            return {"status": "ok", "order_id": f"smaregi_mock_{order.id}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

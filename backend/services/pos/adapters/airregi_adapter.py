from typing import Dict, Any, List
from models import Store, Order, PaymentSettings
from ..base import BasePOSAdapter

class AirRegiAdapter(BasePOSAdapter):
    """AirREGI는 외부 주문 주입이 막혀있으므로, 향후 하루 마감 시 정산용 CSV를 생성하기 위한 더미(Fallback) 구조"""
    def __init__(self, store: Store, settings: PaymentSettings):
        super().__init__(store, settings)

    async def send_order_to_pos(self, order: Order, line_items: List[Dict[str, Any]]) -> dict:
        try:
            print(f"[AirRegiPOS] Falling back to CSV log generation for order {order.id} in store {self.store.id}")
            # 하루 마감을 위한 로컬 DB 기록이나 로그 처리가 들어갑니다.
            return {"status": "ok", "order_id": f"airregi_log_{order.id}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

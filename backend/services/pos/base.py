from typing import Dict, Any, List
from abc import ABC, abstractmethod
from models import Store, Order, OrderItem, PaymentSettings

class BasePaymentAdapter(ABC):
    def __init__(self, store: Store, settings: PaymentSettings):
        self.store = store
        self.settings = settings

    @abstractmethod
    async def process_payment(self, amount: float, source_id: str, note: str = "") -> dict:
        """
        결제를 승인하고 결과를 반환합니다.
        성공 시 {"status": "ok", "payment_id": str} 반환
        실패 시 {"status": "error", "message": str} 반환
        """
        pass

    @abstractmethod
    async def refund_payment(self, payment_id: str, amount: float = None) -> dict:
        """
        환불을 처리합니다.
        """
        pass

class BasePOSAdapter(ABC):
    def __init__(self, store: Store, settings: PaymentSettings):
        self.store = store
        self.settings = settings

    @abstractmethod
    async def send_order_to_pos(self, order: Order, line_items: List[Dict[str, Any]]) -> dict:
        """
        주문 내역을 POS기기로 전송/주입(Injection)합니다.
        성공 시 {"status": "ok", "order_id": str} 반환
        실패 시 {"status": "error", "message": str} 반환
        """
        pass

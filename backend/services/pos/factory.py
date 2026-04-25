from models import Store, PaymentSettings, PaymentMethodType, POSType
from .base import BasePaymentAdapter, BasePOSAdapter
from .adapters.square_adapter import SquareAdapter
from .adapters.paypay_direct_adapter import PayPayDirectAdapter
from .adapters.smaregi_adapter import SmaregiAdapter
from .adapters.airregi_adapter import AirRegiAdapter
from typing import Optional

def get_payment_adapter(store: Store, settings: PaymentSettings) -> Optional[BasePaymentAdapter]:
    """설정에 따라 올바른 결제 어댑터 반환 (동적 라우터)"""
    if not settings:
        return None

    if settings.payment_method_type == PaymentMethodType.PAYPAY_DIRECT:
        return PayPayDirectAdapter(store, settings)
    elif settings.payment_method_type == PaymentMethodType.SQUARE_INTEGRATED:
        return SquareAdapter(store, settings)
    elif settings.payment_method_type == PaymentMethodType.PAY_AT_COUNTER:
        return None  # 현장결제 — 온라인 결제 어댑터 불필요
    else:
        return SquareAdapter(store, settings)

def get_pos_adapter(store: Store, settings: PaymentSettings) -> Optional[BasePOSAdapter]:
    """설정에 따라 올바른 POS 어댑터 반환 (동적 다운스트림 푸셔)"""
    if not settings:
        # Fallback to old basic settings map
        if getattr(store, "kitchen_mode", None) == "square":
            return SquareAdapter(store, settings)
        return None

    if settings.pos_type == POSType.SQUARE:
        return SquareAdapter(store, settings)
    elif settings.pos_type == POSType.SMAREGI:
        return SmaregiAdapter(store, settings)
    elif settings.pos_type == POSType.AIRREGI:
        return AirRegiAdapter(store, settings)
    
    return None

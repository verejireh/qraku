"""
PayPay Direct 決済ルーター
- QR コード決済作成 → PayPay リダイレクト → コールバック → 注文確定
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
import uuid
import os

from database import get_session
from models import Store, PaymentSettings, Order, PaymentMethodType

router = APIRouter(prefix="/paypay", tags=["paypay"])

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://qraku.com")


class PayPayCreateRequest(BaseModel):
    shop_id: int
    amount: int
    order_description: Optional[str] = "QRaku テイクアウト注文"
    # 프론트에서 주문 데이터를 임시 저장할 때 사용하는 키 (localStorage 등)
    temp_order_key: Optional[str] = None


class PayPayCreateResponse(BaseModel):
    payment_url: str
    merchant_payment_id: str


class PayPayStatusResponse(BaseModel):
    payment_status: str  # COMPLETED, CREATED, EXPIRED, CANCELED
    payment_id: Optional[str] = None


@router.post("/create-payment", response_model=PayPayCreateResponse)
async def create_paypay_payment(
    req: PayPayCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    """PayPay QR 決済を作成し、決済 URL を返却"""
    store = await session.get(
        Store, req.shop_id,
        options=[selectinload(Store.payment_settings)],
    )
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    ps = store.payment_settings
    if not ps or ps.payment_method_type != PaymentMethodType.PAYPAY_DIRECT:
        raise HTTPException(status_code=400, detail="PayPay Direct が有効ではありません")
    if not ps.paypay_api_key or not ps.paypay_api_secret:
        raise HTTPException(status_code=400, detail="PayPay API 認証情報が未設定です")

    from services.pos.adapters.paypay_direct_adapter import PayPayDirectAdapter
    adapter = PayPayDirectAdapter(store, ps)

    merchant_payment_id = f"qraku_{store.id}_{uuid.uuid4().hex[:12]}"

    # 콜백 URL: 결제 완료 후 프론트엔드로 리다이렉트
    redirect_url = f"{FRONTEND_BASE_URL}/{store.id}/paypay-complete?mid={merchant_payment_id}"
    if req.temp_order_key:
        redirect_url += f"&tok={req.temp_order_key}"

    result = await adapter.create_qr_payment(
        amount=req.amount,
        order_description=req.order_description,
        merchant_payment_id=merchant_payment_id,
        redirect_url=redirect_url,
    )

    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "PayPay API エラー"))

    return PayPayCreateResponse(
        payment_url=result["payment_url"],
        merchant_payment_id=merchant_payment_id,
    )


@router.get("/payment-status/{merchant_payment_id}", response_model=PayPayStatusResponse)
async def check_paypay_status(
    merchant_payment_id: str,
    session: AsyncSession = Depends(get_session),
):
    """PayPay 決済ステータスを照会 (フロントエンドポーリング用)"""
    # merchant_payment_id から store_id を抽出: qraku_{store_id}_{random}
    parts = merchant_payment_id.split("_")
    if len(parts) < 3 or parts[0] != "qraku":
        raise HTTPException(status_code=400, detail="Invalid merchant_payment_id format")

    try:
        store_id = int(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid store_id in merchant_payment_id")

    store = await session.get(
        Store, store_id,
        options=[selectinload(Store.payment_settings)],
    )
    if not store or not store.payment_settings:
        raise HTTPException(status_code=404, detail="Store or payment settings not found")

    from services.pos.adapters.paypay_direct_adapter import PayPayDirectAdapter
    adapter = PayPayDirectAdapter(store, store.payment_settings)

    result = await adapter.get_payment_details(merchant_payment_id)
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "PayPay status query failed"))

    return PayPayStatusResponse(
        payment_status=result["payment_status"],
        payment_id=result.get("payment_id"),
    )

"""
PayPay Direct 決済ルーター
- QR コード決済作成 → PayPay リダイレクト → コールバック → 注文確定
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
import json
import secrets
import uuid
import os

from database import get_session
from models import Store, PaymentSettings, Order, PaymentMethodType, Menu, PendingPayPayOrder
from utils.time_helpers import now_utc_naive
from datetime import timedelta

router = APIRouter(prefix="/paypay", tags=["paypay"])

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://qraku.com")


class PayPayCartItem(BaseModel):
    menu_id: int
    quantity: int
    option_details: Optional[str] = None  # JSON string of selected options


class PayPayCreateRequest(BaseModel):
    shop_id: int
    items: List[PayPayCartItem]              # 클라이언트 금액 대신 아이템 목록 수신
    order_description: Optional[str] = "QRaku テイクアウト注文"
    # 프론트에서 주문 데이터를 임시 저장할 때 사용하는 키 (localStorage 등)
    temp_order_key: Optional[str] = None
    # 스탬프 보상 사용 시 결제 금액에서 미리 차감 (자격 검증은 서버 측)
    use_stamp_reward: bool = False
    use_coupon_id: Optional[int] = None
    guest_uuid: Optional[str] = None


class PayPayCreateResponse(BaseModel):
    payment_url: str
    merchant_payment_id: str
    amount: int  # 서버가 계산한 최종 금액 (프론트 표시용)


class PayPayStatusResponse(BaseModel):
    payment_status: str  # COMPLETED, CREATED, EXPIRED, CANCELED
    payment_id: Optional[str] = None


async def _calculate_order_amount(
    items: List[PayPayCartItem],
    store_id: int,
    session: AsyncSession,
) -> int:
    """
    서버 측 금액 계산 — 클라이언트 금액을 절대 신뢰하지 않음.
    각 메뉴를 DB에서 조회 → 가격 × 수량 합산 + 옵션 가산금액 계산.

    option_details 형식: JSON string of {"group_name": "choice_name"} (useCart.js 와 동일)
    반환값: 정수 (일본 엔, 세금 포함)
    """
    total = 0
    for item in items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="数量は1以上で入力してください")

        menu = await session.get(Menu, item.menu_id)
        if not menu:
            raise HTTPException(status_code=400, detail=f"メニュー(id={item.menu_id})が見つかりません")
        if menu.store_id != store_id:
            raise HTTPException(status_code=403, detail="メニューの店舗IDが一致しません")
        if not menu.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"「{menu.name_jp or menu.name_en}」は現在売り切れです"
            )

        # 일일 특가 여부에 따라 단가 결정
        unit_price = menu.special_price if (menu.is_daily_special and menu.special_price) else (menu.price or 0)

        # 옵션 추가금액 계산 (option_details: {"group_name": "choice_name"} 형식)
        option_extra = 0
        if item.option_details and menu.options and menu.options != "[]":
            try:
                selected = json.loads(item.option_details)   # {"Size": "Large", ...}
                db_options = json.loads(menu.options)         # [{group_name, choices:[{name, extra_price}]}]
                if isinstance(selected, dict) and isinstance(db_options, list):
                    for group_name, choice_name in selected.items():
                        group = next(
                            (g for g in db_options if g.get("group_name") == group_name), None
                        )
                        if group:
                            choice = next(
                                (c for c in group.get("choices", []) if c.get("name") == choice_name),
                                None,
                            )
                            if choice:
                                option_extra += int(choice.get("extra_price", 0))
            except (json.JSONDecodeError, TypeError, ValueError, AttributeError):
                pass  # 옵션 파싱 실패 시 가산금액 0으로 처리

        total += (unit_price + option_extra) * item.quantity

    return total


@router.post("/create-payment", response_model=PayPayCreateResponse)
async def create_paypay_payment(
    req: PayPayCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    """PayPay QR 決済を作成し、決済 URL を返却 (金額はサーバー側で再計算)"""
    if not req.items:
        raise HTTPException(status_code=400, detail="注文アイテムが空です")

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

    # ── 서버 측 금액 재계산 (클라이언트 금액 무시) ──────────────────────────────
    server_amount = await _calculate_order_amount(req.items, store.id, session)
    if server_amount <= 0:
        raise HTTPException(status_code=400, detail="注文金額が0円以下です")

    # ── 스탬프 보상 할인 사전 적용 (자격 검증은 서버에서 직접) ─────────────────
    # PayPay 청구액과 최종 주문액을 일치시키기 위해 결제 생성 시점에 차감
    if req.use_stamp_reward and req.guest_uuid and store.stamp_active and store.stamp_target > 0:
        is_line_user = req.guest_uuid.startswith("line:")
        if is_line_user:
            from models import StampCard
            sc_res = await session.execute(
                select(StampCard).where(
                    StampCard.store_id == store.id,
                    StampCard.guest_uuid == req.guest_uuid,
                )
            )
            sc = sc_res.scalar_one_or_none()
            if sc and sc.stamp_count >= store.stamp_target:
                discount = min(server_amount, int(store.stamp_reward_discount or 0))
                if discount > 0:
                    server_amount = max(0, server_amount - discount)

    # ── 쿠폰 사전 차감 (만료/소유자 검증) ─────────────────────────────────
    if req.use_coupon_id and req.guest_uuid:
        from models import RewardCoupon
        from datetime import datetime as _dt
        coupon = await session.get(RewardCoupon, req.use_coupon_id)
        if (coupon and coupon.guest_uuid == req.guest_uuid and coupon.store_id == store.id
                and not coupon.is_used
                and (coupon.expires_at is None or coupon.expires_at >= _dt.utcnow())):
            server_amount = max(0, server_amount - int(coupon.discount_amount or 0))

    if server_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="割引適用後の金額が0円です。レジでの直接決済をご利用ください。"
        )

    from services.pos.adapters.paypay_direct_adapter import PayPayDirectAdapter
    adapter = PayPayDirectAdapter(store, ps)

    # crypto-random 32자 — 추측 공격 방지
    merchant_payment_id = f"qraku_{store.id}_{secrets.token_urlsafe(24)}"

    # 콜백 URL: 결제 완료 후 프론트엔드로 리다이렉트
    redirect_url = f"{FRONTEND_BASE_URL}/{store.id}/paypay-complete?mid={merchant_payment_id}"
    if req.temp_order_key:
        redirect_url += f"&tok={req.temp_order_key}"

    result = await adapter.create_qr_payment(
        amount=server_amount,           # 서버 계산값 사용
        order_description=req.order_description,
        merchant_payment_id=merchant_payment_id,
        redirect_url=redirect_url,
    )

    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "PayPay API エラー"))

    # ── cart snapshot 저장 — webhook 자동 Order 생성용 (콜백 미진입 폴백) ──
    # 손님이 PayPay 결제 후 콜백 페이지를 닫으면 frontend 가 Order 생성 못 함.
    # webhook 이 state=COMPLETED 수신 시 이 행을 참조해 Order 를 자동 생성.
    # 멱등성: merchant_payment_id UNIQUE + consumed_at + Order.square_payment_id UNIQUE.
    pending = PendingPayPayOrder(
        merchant_payment_id=merchant_payment_id,
        store_id=store.id,
        amount=server_amount,
        cart_snapshot=json.dumps([
            {
                "menu_id": it.menu_id,
                "quantity": it.quantity,
                "option_details": it.option_details,
            }
            for it in req.items
        ], ensure_ascii=False),
        order_description=req.order_description,
        guest_uuid=req.guest_uuid,
        stamp_reward_used=bool(req.use_stamp_reward and req.guest_uuid),
        coupon_id=req.use_coupon_id,
        expires_at=now_utc_naive() + timedelta(minutes=30),
    )
    session.add(pending)
    await session.commit()

    return PayPayCreateResponse(
        payment_url=result["payment_url"],
        merchant_payment_id=merchant_payment_id,
        amount=server_amount,
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

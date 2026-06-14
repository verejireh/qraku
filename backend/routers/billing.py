import os
import json
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import JSONResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive

from database import get_session
from models import Store, SubscriptionType, SubscriptionStatus
from utils.jwt import require_admin_billing as require_admin, require_super_admin

router = APIRouter(prefix="/billing", tags=["billing"])

# ─── Stripe 초기화 ────────────────────────────────────────────────────────────
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# 표준 플랜 (데이터 비공개)
STRIPE_MONTHLY_PRICE_ID = os.getenv("STRIPE_MONTHLY_PRICE_ID", "")
STRIPE_SIXMONTH_PRICE_ID = os.getenv("STRIPE_SIXMONTH_PRICE_ID", "")
STRIPE_YEARLY_PRICE_ID = os.getenv("STRIPE_YEARLY_PRICE_ID", "")

# 데이터 공개 플랜 (월 ¥1,000 할인)
STRIPE_MONTHLY_OPEN_PRICE_ID = os.getenv("STRIPE_MONTHLY_OPEN_PRICE_ID", "")
STRIPE_SIXMONTH_OPEN_PRICE_ID = os.getenv("STRIPE_SIXMONTH_OPEN_PRICE_ID", "")
STRIPE_YEARLY_OPEN_PRICE_ID = os.getenv("STRIPE_YEARLY_OPEN_PRICE_ID", "")


def _resolve_price_id(plan: str, data_open: bool) -> str:
    """plan + data_open 조합으로 Stripe price_id 반환."""
    if data_open:
        return {
            "monthly": STRIPE_MONTHLY_OPEN_PRICE_ID,
            "sixmonth": STRIPE_SIXMONTH_OPEN_PRICE_ID,
            "yearly": STRIPE_YEARLY_OPEN_PRICE_ID,
        }.get(plan, "")
    return {
        "monthly": STRIPE_MONTHLY_PRICE_ID,
        "sixmonth": STRIPE_SIXMONTH_PRICE_ID,
        "yearly": STRIPE_YEARLY_PRICE_ID,
    }.get(plan, "")


_PLAN_DAYS = {"monthly": 30, "sixmonth": 180, "yearly": 365}

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_store_by_id_or_slug(store_id: str, session: AsyncSession) -> Store:
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


# ─── 구독 현황 조회 ───────────────────────────────────────────────────────────

@router.get("/subscription-status/{store_id}")
async def get_subscription_status(
    store_id: str,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    store = await _get_store_by_id_or_slug(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    expires_at = store.subscription_expires_at
    days_remaining = None
    if expires_at:
        delta = expires_at - now_utc_naive()
        days_remaining = max(0, delta.days)

    # 만료 여부 자동 체크 & 업데이트
    if expires_at and now_utc_naive() > expires_at:
        if store.subscription_status != SubscriptionStatus.EXPIRED:
            store.subscription_status = SubscriptionStatus.EXPIRED
            session.add(store)
            await session.commit()

    return {
        "store_id": store.id,
        "subscription_status": store.subscription_status,
        "subscription_type": store.subscription_type,
        "subscription_expires_at": expires_at.isoformat() if expires_at else None,
        "trial_start_date": store.trial_start_date.isoformat() if store.trial_start_date else None,
        "days_remaining": days_remaining,
        "stripe_customer_id": store.stripe_customer_id,
    }


# ─── Stripe Checkout Session 생성 ────────────────────────────────────────────

@router.post("/checkout-session")
async def create_checkout_session(
    store_id: str,
    plan: str,  # "monthly" | "sixmonth" | "yearly"
    data_open: bool = False,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    if not stripe.api_key:
        raise HTTPException(
            status_code=503,
            detail="Stripe API key not configured. Please set STRIPE_SECRET_KEY in .env"
        )

    if plan not in ("monthly", "sixmonth", "yearly"):
        raise HTTPException(status_code=400, detail="Invalid plan")

    store = await _get_store_by_id_or_slug(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    price_id = _resolve_price_id(plan, data_open)
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Stripe Price ID for '{plan}' (data_open={data_open}) not configured."
        )

    # 기존 Stripe Customer 재사용 or 신규 생성
    customer_id = store.stripe_customer_id
    if not customer_id:
        try:
            customer = stripe.Customer.create(
                name=store.name,
                metadata={"store_id": str(store.id), "store_slug": store.slug or ""}
            )
            customer_id = customer.id
            store.stripe_customer_id = customer_id
            session.add(store)
            await session.commit()
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=500, detail=f"Stripe Customer 생성 실패: {e.user_message}")

    try:
        checkout_session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{FRONTEND_BASE_URL}/{store.slug or store.id}/admin/subscription?success=1",
            cancel_url=f"{FRONTEND_BASE_URL}/{store.slug or store.id}/admin/subscription?cancelled=1",
            metadata={"store_id": str(store.id), "plan": plan, "data_open": str(data_open).lower()},
            subscription_data={
                "metadata": {"store_id": str(store.id), "plan": plan, "data_open": str(data_open).lower()}
            }
        )
        return {"checkout_url": checkout_session.url, "session_id": checkout_session.id}

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe Checkout 생성 실패: {e.user_message}")


# ─── Stripe Webhook ───────────────────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_session)
):
    payload = await request.body()

    # Webhook Signature 검증 (프로덕션 필수)
    if not STRIPE_WEBHOOK_SECRET:
        # 시크릿 미설정 시 위조 웹훅으로 구독 상태 조작 가능 → 거부
        raise HTTPException(
            status_code=503,
            detail="Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in environment."
        )
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")

    event_type = event.get("type") if isinstance(event, dict) else event["type"]
    data_object = event["data"]["object"] if isinstance(event, dict) else event.data.object

    print(f"[Stripe Webhook] Event: {event_type}")

    # ── 결제 성공 시: 구독 기간 연장 ──────────────────────────────────────────
    if event_type in ("invoice.payment_succeeded", "invoice.paid"):
        subscription_id = data_object.get("subscription")
        customer_id = data_object.get("customer")
        store_id_meta = None

        # metadata에서 store_id 추출
        if data_object.get("subscription_details", {}).get("metadata", {}).get("store_id"):
            store_id_meta = data_object["subscription_details"]["metadata"]["store_id"]
        elif data_object.get("metadata", {}).get("store_id"):
            store_id_meta = data_object["metadata"]["store_id"]

        # store_id가 없으면 customer_id로 조회
        if not store_id_meta and customer_id:
            result = await session.execute(
                select(Store).where(Store.stripe_customer_id == customer_id)
            )
            store = result.scalar_one_or_none()
        elif store_id_meta:
            store = await session.get(Store, int(store_id_meta))
        else:
            store = None

        if store:
            # 플랜 / data_open 판별 (subscription metadata 우선)
            plan = "monthly"
            data_open = False
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                sub_meta = sub.get("metadata", {}) or {}
                plan = sub_meta.get("plan", "monthly")
                data_open = (sub_meta.get("data_open", "false").lower() == "true")
            except Exception:
                pass

            now = now_utc_naive()
            days = _PLAN_DAYS.get(plan, 30)
            store.subscription_expires_at = now + timedelta(days=days)
            if plan == "yearly":
                store.subscription_type = SubscriptionType.YEARLY
            elif plan == "sixmonth":
                store.subscription_type = SubscriptionType.SIXMONTH
            else:
                store.subscription_type = SubscriptionType.MONTHLY

            store.subscription_status = SubscriptionStatus.ACTIVE
            store.stripe_subscription_id = subscription_id
            store.data_open_consent = data_open
            session.add(store)
            await session.commit()
            print(f"[Stripe Webhook] Store {store.id} 구독 갱신 완료 : {store.subscription_expires_at} (plan={plan}, data_open={data_open})")

    # ── 구독 취소/만료 시 ──────────────────────────────────────────────────────
    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = data_object.get("customer")
        result = await session.execute(
            select(Store).where(Store.stripe_customer_id == customer_id)
        )
        store = result.scalar_one_or_none()
        if store:
            store.subscription_status = SubscriptionStatus.EXPIRED
            store.stripe_subscription_id = None
            session.add(store)
            await session.commit()
            print(f"[Stripe Webhook] Store {store.id} 구독 만료 처리 완료")

    return JSONResponse(content={"received": True})


# ─── 관리자 수동 구독 연장 (테스트/비상용) ────────────────────────────────────

@router.post("/admin/extend")
async def admin_extend_subscription(
    store_id: int,
    days: int = 30,
    _super: dict = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session)
):
    """슈퍼어드민 전용: 수동으로 구독 기간 연장 (매장 업주는 무료 자가연장 불가)"""
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    now = now_utc_naive()
    base = max(store.subscription_expires_at or now, now)
    store.subscription_expires_at = base + timedelta(days=days)
    store.subscription_status = SubscriptionStatus.ACTIVE
    session.add(store)
    await session.commit()
    return {
        "message": f"Store {store_id} 구독이 {days}일 연장되었습니다.",
        "new_expiry": store.subscription_expires_at.isoformat()
    }

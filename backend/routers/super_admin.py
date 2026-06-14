import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlmodel import select, func, col
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import (
    GlobalReview, Store, Order, OrderItem, Table, Menu, Customer,
    SystemConfig, SubscriptionStatus, SubscriptionType, TableStatus
)
from datetime import datetime, timedelta
import json
from typing import Optional
from utils.auth import verify_password
from utils.jwt import create_super_admin_token, require_super_admin
from utils.db_compat import date_only
from utils.time_helpers import days_ago_jst_as_utc_naive, now_utc_naive
from utils.security import auth_limit_key, clear_auth_failures, ensure_auth_allowed, record_auth_failure

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


# ─── 로그인 (인증 불필요) ──────────────────────────────────────────
class SuperAdminLoginRequest(BaseModel):
    password: str


@router.post("/login")
async def super_admin_login(body: SuperAdminLoginRequest, request: Request):
    limit_key = auth_limit_key("super-admin", "global", request)
    await ensure_auth_allowed(limit_key)
    """Super Admin 로그인. SUPER_ADMIN_PASSWORD_HASH 환경변수와 비교 후 JWT 발급."""
    expected_hash = os.getenv("SUPER_ADMIN_PASSWORD_HASH", "")
    if not expected_hash:
        raise HTTPException(
            status_code=503,
            detail="SUPER_ADMIN_PASSWORD_HASH not configured. Set it in backend/.env"
        )
    if not verify_password(body.password, expected_hash):
        await record_auth_failure(limit_key)
        raise HTTPException(status_code=401, detail="Invalid password")
    await clear_auth_failures(limit_key)
    return {"token": create_super_admin_token()}


# ─── Dashboard Stats ─────────────────────────────────────────────
@router.get("/stats")
async def get_system_stats(
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Global platform statistics."""
    store_count = (await session.execute(select(func.count(Store.id)))).scalar() or 0
    order_count = (await session.execute(select(func.count(Order.id)))).scalar() or 0
    total_rev = (await session.execute(select(func.sum(Order.total_amount)))).scalar() or 0
    active_stores = (await session.execute(
        select(func.count(Store.id)).where(Store.subscription_status == SubscriptionStatus.ACTIVE)
    )).scalar() or 0
    trial_stores = (await session.execute(
        select(func.count(Store.id)).where(Store.subscription_status == SubscriptionStatus.TRIAL)
    )).scalar() or 0
    expired_stores = (await session.execute(
        select(func.count(Store.id)).where(Store.subscription_status == SubscriptionStatus.EXPIRED)
    )).scalar() or 0
    total_customers = (await session.execute(select(func.count(Customer.id)))).scalar() or 0
    total_menus = (await session.execute(select(func.count(Menu.id)))).scalar() or 0
    total_tables = (await session.execute(select(func.count(Table.id)))).scalar() or 0

    # Orders in last 7 days
    week_ago = days_ago_jst_as_utc_naive(7)  # [PG-DT-MIGRATE-02b]
    orders_7d = (await session.execute(
        select(func.count(Order.id)).where(Order.created_at >= week_ago)
    )).scalar() or 0
    revenue_7d = (await session.execute(
        select(func.sum(Order.total_amount)).where(Order.created_at >= week_ago)
    )).scalar() or 0

    # Orders in last 30 days
    month_ago = days_ago_jst_as_utc_naive(30)  # [PG-DT-MIGRATE-02b]
    orders_30d = (await session.execute(
        select(func.count(Order.id)).where(Order.created_at >= month_ago)
    )).scalar() or 0
    revenue_30d = (await session.execute(
        select(func.sum(Order.total_amount)).where(Order.created_at >= month_ago)
    )).scalar() or 0

    return {
        "total_stores": store_count,
        "total_orders": order_count,
        "total_revenue": total_rev,
        "active_stores": active_stores,
        "trial_stores": trial_stores,
        "expired_stores": expired_stores,
        "total_customers": total_customers,
        "total_menus": total_menus,
        "total_tables": total_tables,
        "orders_7d": orders_7d,
        "revenue_7d": revenue_7d or 0,
        "orders_30d": orders_30d,
        "revenue_30d": revenue_30d or 0,
    }


# ─── Store Detail Stats (per-store deep info) ───────────────────
@router.get("/stores/{store_id}/detail")
async def get_store_detail(
    store_id: int,
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Detailed stats for a specific store."""
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Counts
    order_count = (await session.execute(
        select(func.count(Order.id)).where(Order.store_id == store_id)
    )).scalar() or 0
    revenue = (await session.execute(
        select(func.sum(Order.total_amount)).where(Order.store_id == store_id)
    )).scalar() or 0
    menu_count = (await session.execute(
        select(func.count(Menu.id)).where(Menu.store_id == store_id)
    )).scalar() or 0
    table_count = (await session.execute(
        select(func.count(Table.id)).where(Table.store_id == store_id)
    )).scalar() or 0
    occupied_tables = (await session.execute(
        select(func.count(Table.id)).where(Table.store_id == store_id, Table.status == TableStatus.OCCUPIED)
    )).scalar() or 0

    # Last 7 days
    week_ago = days_ago_jst_as_utc_naive(7)  # [PG-DT-MIGRATE-02b]
    orders_7d = (await session.execute(
        select(func.count(Order.id)).where(Order.store_id == store_id, Order.created_at >= week_ago)
    )).scalar() or 0
    revenue_7d = (await session.execute(
        select(func.sum(Order.total_amount)).where(Order.store_id == store_id, Order.created_at >= week_ago)
    )).scalar() or 0

    # Last order
    last_order_res = await session.execute(
        select(Order.created_at).where(Order.store_id == store_id).order_by(Order.created_at.desc()).limit(1)
    )
    last_order_at = last_order_res.scalar()

    # Daily revenue for last 14 days (for sparkline)
    two_weeks_ago = days_ago_jst_as_utc_naive(14)  # [PG-DT-MIGRATE-02b]
    daily_rev_q = await session.execute(
        select(
            date_only(Order.created_at).label("day"),
            func.sum(Order.total_amount).label("rev"),
            func.count(Order.id).label("cnt")
        ).where(
            Order.store_id == store_id,
            Order.created_at >= two_weeks_ago
        ).group_by(date_only(Order.created_at)).order_by(date_only(Order.created_at))
    )
    daily_data = [{"date": str(row.day), "revenue": float(row.rev or 0), "orders": row.cnt} for row in daily_rev_q.all()]

    return {
        "store": {
            "id": store.id,
            "name": store.name,
            "slug": store.slug,
            "owner_id": store.owner_id,
            "owner_name": store.owner_name,
            "category": store.category,
            "theme": store.theme,
            "phone": store.phone,
            "address": store.address,
            "is_open": store.is_open,
            "created_at": store.created_at.isoformat() if store.created_at else None,
            "subscription_type": store.subscription_type,
            "subscription_status": store.subscription_status,
            "subscription_expires_at": store.subscription_expires_at.isoformat() if store.subscription_expires_at else None,
            "trial_start_date": store.trial_start_date.isoformat() if store.trial_start_date else None,
            "stripe_customer_id": store.stripe_customer_id,
            "stripe_subscription_id": store.stripe_subscription_id,
            "kitchen_mode": store.kitchen_mode,
            "takeout_enabled": store.takeout_enabled,
            "points_enabled": store.points_enabled,
            "square_connected": store.square_connected,
            "tax_rate": store.tax_rate,
            "tax_included": store.tax_included,
        },
        "stats": {
            "total_orders": order_count,
            "total_revenue": float(revenue or 0),
            "total_menus": menu_count,
            "total_tables": table_count,
            "occupied_tables": occupied_tables,
            "orders_7d": orders_7d,
            "revenue_7d": float(revenue_7d or 0),
            "last_order_at": last_order_at.isoformat() if last_order_at else None,
        },
        "daily_data": daily_data,
    }


# ─── Stores List (Enhanced) ──────────────────────────────────────
@router.get("/stores")
async def list_all_stores(
    status: Optional[str] = None,
    search: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """List all stores with subscription details and basic stats."""
    statement = select(Store).order_by(Store.created_at.desc())
    if status:
        statement = statement.where(Store.subscription_status == status)
    if search:
        statement = statement.where(
            (col(Store.name).contains(search)) | (col(Store.slug).contains(search))
        )
    results = await session.execute(statement)
    stores = results.scalars().all()

    # Get per-store order count and revenue in bulk (정규 store_id)
    store_ids = [s.id for s in stores]
    store_stats = {}
    if store_ids:
        stats_q = await session.execute(
            select(
                Order.store_id,
                func.count(Order.id).label("order_count"),
                func.sum(Order.total_amount).label("revenue")
            ).where(Order.store_id.in_(store_ids)).group_by(Order.store_id)
        )
        for row in stats_q.all():
            store_stats[row.store_id] = {"order_count": row.order_count, "revenue": float(row.revenue or 0)}

    # Get per-store table/menu counts
    table_counts = {}
    tc_q = await session.execute(
        select(Table.store_id, func.count(Table.id)).group_by(Table.store_id)
    )
    for sid, cnt in tc_q.all():
        table_counts[sid] = cnt

    menu_counts = {}
    mc_q = await session.execute(
        select(Menu.store_id, func.count(Menu.id)).group_by(Menu.store_id)
    )
    for sid, cnt in mc_q.all():
        menu_counts[sid] = cnt

    # Last order dates (정규 store_id)
    last_orders = {}
    lo_q = await session.execute(
        select(Order.store_id, func.max(Order.created_at)).group_by(Order.store_id)
    )
    for sid, last_at in lo_q.all():
        last_orders[sid] = last_at.isoformat() if last_at else None

    result = []
    for s in stores:
        ss = store_stats.get(s.id, {"order_count": 0, "revenue": 0})
        result.append({
            "id": s.id,
            "name": s.name,
            "slug": s.slug,
            "owner_id": s.owner_id,
            "owner_name": s.owner_name,
            "category": s.category,
            "is_open": s.is_open,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "subscription_type": s.subscription_type,
            "subscription_status": s.subscription_status,
            "subscription_expires_at": s.subscription_expires_at.isoformat() if s.subscription_expires_at else None,
            "trial_start_date": s.trial_start_date.isoformat() if s.trial_start_date else None,
            "stripe_customer_id": s.stripe_customer_id,
            "total_orders": ss["order_count"],
            "total_revenue": ss["revenue"],
            "table_count": table_counts.get(s.id, 0),
            "menu_count": menu_counts.get(s.id, 0),
            "last_order_at": last_orders.get(s.id),
            "square_connected": s.square_connected,
            "kitchen_mode": s.kitchen_mode,
            "takeout_enabled": s.takeout_enabled,
        })

    return result


# ─── Store Update (Enhanced) ─────────────────────────────────────
@router.patch("/stores/{store_id}")
async def update_store_status(
    store_id: int,
    status: Optional[str] = None,
    sub_type: Optional[str] = None,
    expires_at: Optional[str] = None,
    extend_days: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Admin override for store subscription/status."""
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if status is not None:
        store.subscription_status = status
    if sub_type is not None:
        store.subscription_type = sub_type
    if expires_at is not None:
        store.subscription_expires_at = datetime.fromisoformat(expires_at)
    if extend_days is not None:
        base = store.subscription_expires_at or now_utc_naive()
        if base < now_utc_naive():
            base = now_utc_naive()
        store.subscription_expires_at = base + timedelta(days=extend_days)
        if store.subscription_status == SubscriptionStatus.EXPIRED:
            store.subscription_status = SubscriptionStatus.ACTIVE

    session.add(store)
    await session.commit()
    await session.refresh(store)
    return store


# ─── Subscription Summary ────────────────────────────────────────
@router.get("/subscription-summary")
async def subscription_summary(
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Overview of all subscriptions for billing management."""
    stores_q = await session.execute(select(Store).order_by(Store.created_at.desc()))
    stores = stores_q.scalars().all()

    now = now_utc_naive()
    summary = {
        "total": len(stores),
        "active": 0,
        "trial": 0,
        "expired": 0,
        "expiring_soon": 0,  # expires within 7 days
        "free": 0,
        "monthly": 0,
        "yearly": 0,
    }
    store_list = []
    for s in stores:
        is_expiring_soon = False
        days_left = None
        if s.subscription_expires_at:
            delta = s.subscription_expires_at - now
            days_left = delta.days
            if 0 < delta.days <= 7 and s.subscription_status != SubscriptionStatus.EXPIRED:
                is_expiring_soon = True
                summary["expiring_soon"] += 1

        if s.subscription_status == SubscriptionStatus.ACTIVE:
            summary["active"] += 1
        elif s.subscription_status == SubscriptionStatus.TRIAL:
            summary["trial"] += 1
        else:
            summary["expired"] += 1

        if s.subscription_type == SubscriptionType.FREE:
            summary["free"] += 1
        elif s.subscription_type == SubscriptionType.MONTHLY:
            summary["monthly"] += 1
        elif s.subscription_type == SubscriptionType.YEARLY:
            summary["yearly"] += 1

        store_list.append({
            "id": s.id,
            "name": s.name,
            "slug": s.slug,
            "owner_name": s.owner_name,
            "subscription_type": s.subscription_type,
            "subscription_status": s.subscription_status,
            "subscription_expires_at": s.subscription_expires_at.isoformat() if s.subscription_expires_at else None,
            "trial_start_date": s.trial_start_date.isoformat() if s.trial_start_date else None,
            "days_left": days_left,
            "is_expiring_soon": is_expiring_soon,
            "stripe_customer_id": s.stripe_customer_id,
            "stripe_subscription_id": s.stripe_subscription_id,
        })

    return {"summary": summary, "stores": store_list}


# ─── Revenue Analytics ───────────────────────────────────────────
@router.get("/analytics/revenue")
async def revenue_analytics(
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Platform-wide daily revenue for charts."""
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b]
    q = await session.execute(
        select(
            date_only(Order.created_at).label("day"),
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders")
        ).where(Order.created_at >= since)
        .group_by(date_only(Order.created_at))
        .order_by(date_only(Order.created_at))
    )
    return [{"date": str(r.day), "revenue": float(r.revenue or 0), "orders": r.orders} for r in q.all()]


# ─── Store Ranking ───────────────────────────────────────────────
@router.get("/analytics/store-ranking")
async def store_ranking(
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    """Top stores by revenue."""
    since = days_ago_jst_as_utc_naive(days)  # [PG-DT-MIGRATE-02b]
    q = await session.execute(
        select(
            Order.store_id,
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders")
        ).where(Order.created_at >= since)
        .group_by(Order.store_id)
        .order_by(func.sum(Order.total_amount).desc())
    )
    rows = q.all()

    # Map store_id to store name
    store_q = await session.execute(select(Store))
    stores_map = {s.id: s.name for s in store_q.scalars().all()}

    return [{
        "store_id": r.store_id,
        "store_name": stores_map.get(r.store_id, str(r.store_id)),
        "revenue": float(r.revenue or 0),
        "orders": r.orders,
    } for r in rows]


# ─── Config ──────────────────────────────────────────────────────
@router.get("/config")
async def get_configs(
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    results = await session.execute(select(SystemConfig))
    configs = results.scalars().all()
    return {cfg.key: cfg.value for cfg in configs}


@router.post("/config")
async def save_config(
    key: str,
    value: str,
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    config = await session.get(SystemConfig, key)
    if config:
        config.value = value
        config.updated_at = now_utc_naive()
    else:
        config = SystemConfig(key=key, value=value)
    session.add(config)
    await session.commit()
    return {"status": "success", "key": key}


# ─── Global Reviews ──────────────────────────────────────────────
@router.get("/global-reviews")
async def get_all_reviews(
    session: AsyncSession = Depends(get_session),
    _: dict = Depends(require_super_admin),
):
    statement = select(GlobalReview, Store.name, Store.category).join(Store, GlobalReview.store_id == Store.id)
    results = await session.execute(statement)
    records = results.all()
    data = []
    for review, store_name, store_cat in records:
        data.append({
            "id": review.id,
            "store_name": store_name,
            "category": store_cat,
            "rating": review.rating,
            "tags": json.loads(review.tags),
            "comment": review.comment,
            "created_at": review.created_at.isoformat(),
            "customer_id": review.customer_id
        })
    return {"count": len(data), "reviews": data}

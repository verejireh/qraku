from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import PointHistory, PointTransactionType, Order, Store
from datetime import datetime, timedelta
from utils.jwt import require_admin
from utils.time_helpers import now_utc_naive, months_ago_jst_month_start_as_utc_naive

router = APIRouter(prefix="/loyalty-analytics", tags=["loyalty-analytics"])

@router.get("/roi/{store_id}")
async def get_loyalty_roi(
    store_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Returns Investment (Discounts) vs Revenue (Orders with points).
    """
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    # [2026-05-22] PG-DT-MIGRATE-02b — month_start 가 UTC 기준이라 사장님 "이번 달 ROI"
    # 가 매월 1일 09:00 JST 에 reset 되는 9시간 어긋남 버그.
    # months_ago_jst_month_start_as_utc_naive(0) = 현재 JST 월의 1일 00:00 의 UTC.
    # expiry_threshold 는 rolling N-day 의도라 naive UTC 그대로 OK.
    now = now_utc_naive()
    month_start = months_ago_jst_month_start_as_utc_naive(0)
    
    # 1. Total Investment (Used Points this month)
    stmt_invest = select(func.sum(PointHistory.amount)).where(
        PointHistory.store_id == store_id,
        PointHistory.tx_type == PointTransactionType.USED,
        PointHistory.created_at >= month_start
    )
    res_invest = await session.execute(stmt_invest)
    discount_total = abs(res_invest.scalar() or 0)
    
    # 2. Induced Revenue (Sum of final_price for orders where points were used)
    # We can join Order with PointHistory
    stmt_revenue = select(func.sum(Order.final_price)).where(
        Order.store_id == store_id,
        Order.discount_amount > 0,
        Order.created_at >= month_start
    )
    res_revenue = await session.execute(stmt_revenue)
    induced_revenue = res_revenue.scalar() or 0
    
    # 3. Expiry Warning (Simulated/Simplified)
    # Total points that haven't been touched since [Config months] ago
    store = await session.get(Store, store_id)
    expiry_months = store.point_expiry_months if store else 12
    expiry_threshold = now - timedelta(days=expiry_months * 30)
    
    # This is a bit complex for a simple query if we don't have per-transaction expiry.
    # Let's return total balance of clients who haven't visited in [threshold] as "at risk"
    from models import CustomerPoint
    stmt_at_risk = select(func.sum(CustomerPoint.balance)).where(
        CustomerPoint.store_id == store_id,
        CustomerPoint.updated_at < expiry_threshold
    )
    res_at_risk = await session.execute(stmt_at_risk)
    points_at_risk = res_at_risk.scalar() or 0

    return {
        "month": now.strftime("%Y-%m"),
        "investment_points": discount_total,
        "induced_revenue": induced_revenue,
        "points_at_risk": points_at_risk,
        "roi_ratio": round(induced_revenue / discount_total, 1) if discount_total > 0 else 0
    }

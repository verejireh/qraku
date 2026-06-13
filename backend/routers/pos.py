from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_session
from models import Table, Order, TableStatus, OrderItem, Menu, Store
from utils.jwt import require_staff_or_admin
import uuid
from datetime import datetime
from utils.time_helpers import now_utc_naive

router = APIRouter(prefix="/pos", tags=["pos"])

@router.get("/summary/{table_id}")
async def get_payment_summary(
    table_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all unpaid orders for this table's current session
    # We identify the current session by orders that are NOT 'served' OR by those linked to the current table.
    # More specifically, if we use the table.qr_token as a session marker, we can filter better.
    # For now, let's get all 'unpaid' orders for this table.
    statement = select(Order).where(Order.table_id == table_id, Order.payment_status == "unpaid")
    results = await session.execute(statement)
    orders = results.scalars().all()
    
    total_amount = sum(o.total_price for o in orders)
    
    items_summary = []
    from sqlalchemy.orm import selectinload
    
    # Fetch items for summary
    for order in orders:
        order_statement = select(Order).where(Order.id == order.id).options(selectinload(Order.items).selectinload(OrderItem.menu))
        res = await session.execute(order_statement)
        o_with_items = res.scalar_one()
        for item in o_with_items.items:
            items_summary.append({
                "name": item.menu.name_jp,
                "quantity": item.quantity,
                "price": item.menu.price * item.quantity
            })

    return {
        "table_number": table.table_number,
        "status": table.status,
        "total_amount": total_amount,
        "items": items_summary,
        "qr_token": table.qr_token
    }

@router.post("/checkout/{table_id}")
async def request_checkout(
    table_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    table.status = TableStatus.CHECKOUT_REQUESTED
    table.checkout_requested_at = now_utc_naive()
    session.add(table)
    await session.commit()
    return {"message": "Checkout requested", "status": table.status}

@router.post("/pay/{table_id}", deprecated=True)
async def complete_payment(table_id: int):
    """[DEPRECATED 2026-06-13] 레거시 EatIn 정산 경로. 食べ放題 코스요금을
    청구하지 않고 TabehoudaiSession 을 settle 하지 않아 매출 누락을 일으킨다.
    SPA 는 이미 register.py 공통 정산(`/api/register/table/{id}/pay`)을 사용하므로
    외부 오호출 시 매출 사고를 막기 위해 410 Gone 으로 폐기한다."""
    raise HTTPException(
        status_code=410,
        detail="This endpoint is deprecated. Use POST /api/register/table/{table_id}/pay",
    )

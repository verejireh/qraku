from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_session
from models import Table, Order, TableStatus, OrderItem, Menu, Store
from utils.jwt import require_staff_or_admin
import uuid
from datetime import datetime

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
    table.checkout_requested_at = datetime.utcnow()
    session.add(table)
    await session.commit()
    return {"message": "Checkout requested", "status": table.status}

@router.post("/pay/{table_id}")
async def complete_payment(
    table_id: int,
    session: AsyncSession = Depends(get_session),
    auth_store: Store = Depends(require_staff_or_admin),
):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # 1. Mark all unpaid orders as PAID
    statement = select(Order).where(Order.table_id == table_id, Order.payment_status == "unpaid")
    results = await session.execute(statement)
    orders = results.scalars().all()
    
    total_amount = sum(o.total_price for o in orders)
    customer_id = orders[0].customer_id if orders else None
    
    for order in orders:
        order.payment_status = "paid"
        order.status = "served" 
        session.add(order)
    
    # 2. Automated Point Accrual (based on amount & policy)
    from models import Store, CustomerPoint, PointHistory, PointTransactionType, PointAccrualType
    from datetime import datetime
    
    store = await session.get(Store, table.store_id)
    if store.points_enabled and customer_id and orders:
        points_to_award = 0
        order_sum = sum(o.final_price for o in orders)
        
        if store.point_accrual_type == PointAccrualType.PERCENT:
            points_to_award = int((order_sum / 100) * store.point_rate)
        elif store.point_accrual_type == PointAccrualType.FIXED:
            points_to_award = store.point_fixed_amount
            
        if points_to_award > 0:
            # Update/Create Balance
            pt_stmt = select(CustomerPoint).where(CustomerPoint.customer_id == customer_id, CustomerPoint.store_id == table.store_id)
            res = await session.execute(pt_stmt)
            pt_record = res.scalar_one_or_none()
            if not pt_record:
                pt_record = CustomerPoint(customer_id=customer_id, store_id=table.store_id, balance=0)
            
            pt_record.balance += points_to_award
            pt_record.updated_at = datetime.utcnow()
            session.add(pt_record)
            
            # Log History
            history = PointHistory(
                customer_id=customer_id,
                store_id=table.store_id,
                amount=points_to_award,
                tx_type=PointTransactionType.EARNED,
                description=f"Purchase for Table {table.table_number}. Total: ¥{order_sum}",
                related_order_id=orders[0].id
            )
            session.add(history)

    # 3. Reset Table: close after payment
    if orders:
        table.last_order_id = orders[0].id

    table.qr_token = str(uuid.uuid4())
    table.status = TableStatus.READY
    table.session_token = None
    table.guest_count = None

    session.add(table)
    await session.commit()

    from utils.events import emit_payment_completed, emit_table_update
    order = orders[0] if orders else None
    if order:
        await emit_payment_completed(session, table.store_id, order)
    await emit_table_update(session, table.store_id, table, extra={"status": "ready", "guest_count": None})

    return {"message": "Payment completed and table closed", "new_token": table.qr_token}

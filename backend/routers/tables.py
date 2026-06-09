from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Table, TableStatus, Store
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
import uuid
import os
import io
import qrcode
from qrcode.image.pure import PyPNGImage
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from pydantic import BaseModel
from typing import Optional
import pytz
from utils.events import emit_table_update, emit_staff_call

router = APIRouter(tags=["tables"])

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

# Models
class TokenRequest(BaseModel):
    session_token: str

class OpenTableRequest(BaseModel):
    guest_count: int = 1

class GuestCountRequest(BaseModel):
    guest_count: int

class TableTransferRequest(BaseModel):
    target_table_id: int

# -----------------
# Staff APIs
# -----------------

@router.post("/staff/tables/{table_id}/open")
async def open_table(table_id: int, body: Optional[OpenTableRequest] = None, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.status = TableStatus.OCCUPIED
    table.session_token = str(uuid.uuid4())
    table.guest_count = body.guest_count if body else 1
    table.join_window_end = now_utc_naive() + timedelta(minutes=5)
    session.add(table)
    await session.commit()
    await session.refresh(table)
    
    await emit_table_update(session, table.store_id, table)

    return table

@router.post("/staff/tables/{table_id}/close")
async def close_table(table_id: int, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    table.status = TableStatus.READY
    table.session_token = None
    table.guest_count = None
    session.add(table)
    await session.commit()
    await session.refresh(table)

    await emit_table_update(session, table.store_id, table)

    return table

@router.post("/staff/tables/{table_id}/extend")
async def extend_table(table_id: int, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if table.status != TableStatus.OCCUPIED:
        raise HTTPException(status_code=400, detail="Only occupied tables can be extended")

    table.join_window_end = now_utc_naive() + timedelta(minutes=5)

    session.add(table)
    await session.commit()
    await session.refresh(table)
    return table


@router.post("/staff/tables/{table_id}/renew-qr")
async def renew_qr_timer(table_id: int, session: AsyncSession = Depends(get_session)):
    """QR 유효 시간을 현재 시간 기준 5분으로 갱신 (extend와 동일하지만 테이블 상태 무관)"""
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # 테이블이 READY 상태면 자동으로 열어줌
    if table.status == TableStatus.READY:
        table.status = TableStatus.OCCUPIED
        table.session_token = str(uuid.uuid4())

    table.join_window_end = now_utc_naive() + timedelta(minutes=5)
    session.add(table)
    await session.commit()
    await session.refresh(table)

    jwe = table.join_window_end.isoformat() if table.join_window_end else None
    await emit_table_update(session, table.store_id, table, extra={"join_window_end": jwe})

    return table

@router.post("/staff/tables/{table_id}/transfer")
async def transfer_table(table_id: int, body: TableTransferRequest, session: AsyncSession = Depends(get_session)):
    """Move all unpaid orders from source table to target table."""
    from models import Order

    source = await session.get(Table, table_id)
    target = await session.get(Table, body.target_table_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="Table not found")
    if source.store_id != target.store_id:
        raise HTTPException(status_code=400, detail="Tables must belong to the same store")

    # Open target table if empty
    if target.status == TableStatus.READY:
        target.status = TableStatus.OCCUPIED
        target.session_token = source.session_token or str(uuid.uuid4())
        target.guest_count = source.guest_count

    # Move unpaid orders — 정규 store_id 로 단일 조회
    orders_result = await session.execute(
        select(Order).where(
            Order.table_number == source.table_number,
            Order.store_id == source.store_id,
            Order.session_token == source.session_token,
            Order.payment_status == "unpaid"
        )
    )
    orders = list(orders_result.scalars().all())

    moved_count = 0
    for order in orders:
        order.table_number = target.table_number
        order.session_token = target.session_token
        session.add(order)
        moved_count += 1

    # Close source table
    source.status = TableStatus.READY
    source.session_token = None
    source.guest_count = None
    session.add(source)
    session.add(target)
    await session.commit()

    for t in [source, target]:
        await emit_table_update(session, t.store_id, t)

    return {"message": f"Transferred {moved_count} orders from table {source.table_number} to {target.table_number}"}

@router.post("/staff/tables/{table_id}/guest-count")
async def update_guest_count(table_id: int, body: GuestCountRequest, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.guest_count = body.guest_count
    session.add(table)
    await session.commit()
    await session.refresh(table)

    await emit_table_update(session, table.store_id, table)

    return table

@router.post("/staff/tables/{table_id}/mark-served")
async def mark_served(table_id: int, session: AsyncSession = Depends(get_session)):
    """Mark all unserved orders for this table as served."""
    from models import Order
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    store = await session.get(Store, table.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Find unserved orders for this table's current session
    orders_result = await session.execute(
        select(Order).where(
            Order.table_number == table.table_number,
            Order.session_token == table.session_token,
            Order.needs_serving == True
        )
    )
    orders = orders_result.scalars().all()
    count = 0
    for order in orders:
        order.needs_serving = False
        session.add(order)
        count += 1
    await session.commit()

    await emit_table_update(session, table.store_id, table)

    return {"message": f"Marked {count} orders as served"}


@router.post("/staff/tables/{table_id}/acknowledge-call")
async def acknowledge_call(table_id: int, session: AsyncSession = Depends(get_session)):
    """Staff acknowledges customer call — clear the call_staff flag."""
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.call_staff = False
    session.add(table)
    await session.commit()
    await session.refresh(table)

    await emit_table_update(session, table.store_id, table, extra={"call_staff": False})

    return {"status": "acknowledged"}


@router.post("/customer/tables/{table_id}/call-staff")
async def call_staff(table_id: int, session: AsyncSession = Depends(get_session)):
    """Customer calls staff — sets call_staff flag and broadcasts."""
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.call_staff = True
    session.add(table)
    await session.commit()
    await session.refresh(table)

    status_val = table.status.value if hasattr(table.status, "value") else table.status
    await emit_staff_call(session, table.store_id, table.table_number, table_id=table.id, status=status_val)

    return {"status": "called"}


@router.get("/staff/shops/{shop_id}/qr-pdf")
async def generate_table_qr_pdf(shop_id: str, session: AsyncSession = Depends(get_session)):
    # 1. Verify Store
    store_result = await session.execute(select(Store).where(Store.slug == shop_id))
    store = store_result.scalar_one_or_none()
    
    if not store and shop_id.isdigit():
        store = await session.get(Store, int(shop_id))
        
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # 2. Get Tables
    table_result = await session.execute(select(Table).where(Table.store_id == store.id).order_by(Table.table_number))
    tables = table_result.scalars().all()

    if not tables:
        raise HTTPException(status_code=404, detail="No tables found for this store to generate QR codes.")

    # 3. Setup PDF Buffer and Canvas
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # Grid Settings (2 cols x 3 rows per page)
    cols = 2
    rows = 3
    qrs_per_page = cols * rows
    margin_x = 20 * mm
    margin_y = 20 * mm
    cell_width = (width - 2 * margin_x) / cols
    cell_height = (height - 2 * margin_y) / rows
    qr_size = 60 * mm
    
    for idx, table in enumerate(tables):
        if idx > 0 and idx % qrs_per_page == 0:
            c.showPage() # Create new page

        # Calculate position
        page_idx = idx % qrs_per_page
        col = page_idx % cols
        row = page_idx // cols
        
        # Coordinates (bottom-left origin in ReportLab)
        x_center = margin_x + (col * cell_width) + (cell_width / 2)
        y_center = height - margin_y - (row * cell_height) - (cell_height / 2)
        
        # Generate URL based on verified router path: /{shop_id}/table/{tableNumber}
        table_url = f"{FRONTEND_BASE_URL}/{store.slug}/table/{table.table_number}"
        
        # Create QR Image
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(table_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save QR to temporary in-memory file for ReportLab
        img_buffer = io.BytesIO()
        img.save(img_buffer, format="PNG")
        img_buffer.seek(0)
        
        # Draw QR Code centered in its cell
        x_image = x_center - (qr_size / 2)
        y_image = y_center - (qr_size / 2) + (10 * mm) # Shift up slightly for text room
        c.drawImage(ImageReader(img_buffer), x_image, y_image, width=qr_size, height=qr_size)
        
        # Draw Text Layout
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(x_center, y_image - (10 * mm), f"Table {table.table_number}")
        
    c.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=Tables_QR_{store.slug}.pdf"}
    )

@router.get("/staff/shops/{shop_id}/register-tables")
async def get_register_tables(shop_id: str, session: AsyncSession = Depends(get_session)):
    store_result = await session.execute(select(Store).where(Store.slug == shop_id))
    store = store_result.scalar_one_or_none()
    if not store and shop_id.isdigit():
        store = await session.get(Store, int(shop_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    table_result = await session.execute(select(Table).where(Table.store_id == store.id).order_by(Table.table_number))
    tables = table_result.scalars().all()
    
    from models import Order
    
    orders_result = await session.execute(
        select(Order).where(
            Order.store_id == store.id,
            Order.payment_status != "paid",
            Order.status != "cancelled"
        )
    )
    unpaid_orders = orders_result.scalars().all()
    
    response_tables = []

    for table in tables:
        total_unpaid = 0
        has_new_order = False
        table_orders = []
        if table.status in [TableStatus.OCCUPIED, TableStatus.CHECKOUT_REQUESTED] and table.session_token:
            for o in unpaid_orders:
                if str(o.table_number) == str(table.table_number) and o.session_token == table.session_token:
                    total_unpaid += o.total_amount
                    table_orders.append(o)
                    if getattr(o, 'needs_serving', False):
                        has_new_order = True

        color = "gray"
        if table.status == TableStatus.READY:
            color = "gray"
        elif table.status == TableStatus.OCCUPIED:
            if total_unpaid > 0:
                color = "blue"
            else:
                color = "yellow"
        elif table.status == TableStatus.CHECKOUT_REQUESTED:
            color = "red"

        response_tables.append({
            "id": table.id,
            "table_number": table.table_number,
            "status": table.status.value,
            "session_token": table.session_token,
            "total_unpaid": total_unpaid,
            "color_state": color,
            "join_window_end": table.join_window_end.isoformat() if table.join_window_end else None,
            "guest_count": table.guest_count,
            "call_staff": getattr(table, 'call_staff', False),
            "has_new_order": has_new_order,
        })

    return response_tables

# -----------------
# Customer APIs
# -----------------

@router.post("/customer/tables/{table_id}/checkout-request")
async def request_checkout(table_id: int, req: TokenRequest, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    # Verify token
    if table.session_token != req.session_token:
        raise HTTPException(status_code=403, detail="Invalid session token.")
        
    table.status = TableStatus.CHECKOUT_REQUESTED
    session.add(table)
    await session.commit()
    await session.refresh(table)
    
    await emit_table_update(session, table.store_id, table)

    return {"status": "success", "table_status": table.status.value}

@router.post("/customer/tables/{table_id}/join")
async def join_table(table_id: int, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    if table.status != TableStatus.OCCUPIED:
        raise HTTPException(status_code=403, detail="Table is not open. Please ask staff to open the table.")
        
    if not table.join_window_end or now_utc_naive() > table.join_window_end:
        raise HTTPException(status_code=403, detail="Join window has expired. Please ask staff to extend the time.")
        
    return {"session_token": table.session_token}

@router.post("/customer/tables/{table_id}/verify-session")
async def verify_table_session(table_id: int, req: TokenRequest, session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        return {"valid": False}
        
    if table.status in (TableStatus.OCCUPIED, TableStatus.CHECKOUT_REQUESTED) and table.session_token == req.session_token:
        return {"valid": True}

    return {"valid": False}

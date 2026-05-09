from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import qrcode
from io import BytesIO
from database import get_session
from models import Table, Store, DeviceSession, SystemConfig
from PIL import Image, ImageDraw, ImageFont
import os
from utils.jwt import require_admin

router = APIRouter(prefix="/qr", tags=["qr"])

# Theme Color Mapping (from main.css)
THEME_COLORS = {
    "sakura": "#ffc0cb",
    "sunflower": "#ffd700",
    "lavender": "#e6e6fa",
    "hydrangea": "#add8e6",
    "camellia": "#c21807",
    "cosmos": "#da70d6",
    "magnolia": "#f5f5dc",
    "chicory": "#0047ab",
    "marigold": "#ff8c00",
    "bamboo": "#556b2f",
    "modern": "#1a1a1a"
}

@router.get("/generate/{table_id}")
async def generate_themed_qr(table_id: int, session: AsyncSession = Depends(get_session)):
    # Fetch Table and Store info
    table_res = await session.get(Table, table_id)
    if not table_res:
        raise HTTPException(status_code=404, detail="Table not found")
    
    store = await session.get(Store, table_res.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    theme_color = THEME_COLORS.get(store.theme, "#1a1a1a")
    
    # Dynamic Base URL from DB
    config = await session.get(SystemConfig, "QR_BASE_URL")
    base_url = config.value if config else "http://localhost:5173"
    
    qr_url = f"{base_url.rstrip('/')}/shop/{store.id}/table/{table_res.table_number}/menu?token={table_res.qr_token}"
    
    # 1. Generate QR Code
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=theme_color, back_color="white").convert('RGB')
    
    # 2. Create Card Background (Pillow)
    card_width = 400
    card_height = 550
    card = Image.new('RGB', (card_width, card_height), color='white')
    draw = ImageDraw.Draw(card)
    
    # Draw Border (Themed)
    draw.rectangle([10, 10, card_width-10, card_height-10], outline=theme_color, width=5)
    
    # Paste QR Code
    qr_img_resized = qr_img.resize((300, 300))
    card.paste(qr_img_resized, (50, 100))
    
    try:
        font_main = ImageFont.truetype("fonts/NotoSansKR-Regular.ttf", 26)
        font_sub = ImageFont.truetype("fonts/NotoSansKR-Regular.ttf", 16)
        font_jp = ImageFont.truetype("fonts/NotoSansJP-Regular.ttf", 16)
    except Exception:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_jp = ImageFont.load_default()

    # Labels (Restaurant Name & Table No)
    draw.text((card_width//2, 50), store.name, fill=theme_color, font=font_main, anchor="mm")
    draw.text((card_width//2, 420), "Table No. " + str(table_res.table_number), fill="#333", font=font_main, anchor="mm")

    # Multilingual Scan Instruction
    y_pos = 460
    draw.text((card_width//2, y_pos), "携帯でス캔하여 주문하세요", fill="#666", font=font_jp, anchor="mm")
    y_pos += 24
    draw.text((card_width//2, y_pos), "휴대폰으로 스캔하여 주문하세요", fill="#666", font=font_sub, anchor="mm")
    y_pos += 24
    draw.text((card_width//2, y_pos), "Scan with phone to order", fill="#666", font=font_sub, anchor="mm")

    # Save to Buffer
    buf = BytesIO()
    card.save(buf, format="PNG")
    buf.seek(0)
    
    return Response(content=buf.getvalue(), media_type="image/png")

import uuid
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm

@router.post("/batch-generate")
async def batch_generate_tables(
    store_id: int, 
    start: int, 
    end: int, 
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    new_tables = []
    for i in range(start, end + 1):
        table = Table(
            store_id=store_id,
            table_number=str(i),
            qr_token=str(uuid.uuid4())
        )
        session.add(table)
        new_tables.append(table)
    
    await session.commit()
    return {"message": f"Successfully generated {len(new_tables)} tables."}

@router.get("/export-pdf/{store_id}")
async def export_pdf(store_id: str, session: AsyncSession = Depends(get_session)):
    # 1. Fetch Store and its Tables
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
        
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
        
    tables_res = await session.execute(select(Table).where(Table.store_id == store_id).order_by(Table.table_number))
    tables = tables_res.scalars().all()
    
    if not tables:
        raise HTTPException(status_code=400, detail="No tables found for this store")

    # 2. Create PDF buffer
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    
    # 3. Layout params (4 cards per page: 2x2)
    card_w, card_h = 90*mm, 130*mm
    margin_x, margin_y = 10*mm, 15*mm
    gap = 5*mm
    
    idx = 0
    for table in tables:
        # Calculate Position
        col = idx % 2
        row = (idx // 2) % 2
        
        x = margin_x + col * (card_w + gap)
        y = height - margin_y - (row + 1) * card_h - row * gap
        
        # --- Draw Card (Themed) ---
        theme_color = THEME_COLORS.get(store.theme, "#1a1a1a")
        c.setStrokeColor(theme_color)
        c.setLineWidth(2)
        c.roundRect(x, y, card_w, card_h, 4, stroke=1, fill=0) # Outer border
        
        # QR Code Image (Mocking for reportlab - easier to generate the themed PNG and paste it)
        # Note: c.drawInlineImage is slow for many images, but okay for 4-20.
        # However, we already have generate_themed_qr logic. Let's reuse it.
        png_res = await generate_themed_qr(table.id, session)
        png_buf = BytesIO(png_res.body)
        
        from reportlab.lib.utils import ImageReader
        img_reader = ImageReader(png_buf)
        c.drawImage(img_reader, x + 5*mm, y + 5*mm, width=card_w - 10*mm, height=card_h - 10*mm, preserveAspectRatio=True)
        
        idx += 1
        if idx % 4 == 0 and idx < len(tables):
            c.showPage()
            
    c.save()
    buf.seek(0)
    
    filename = f"QR_Cards_{store.name}.pdf"
    return Response(
        content=buf.getvalue(), 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/refresh/{table_id}")
async def refresh_table_token(table_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    table.qr_token = str(uuid.uuid4())
    session.add(table)
    await session.commit()
    await session.refresh(table)
    return {"message": "Token refreshed", "new_token": table.qr_token}

@router.post("/checkout/{table_id}")
async def checkout_table(table_id: int, session: AsyncSession = Depends(get_session)):
    from models import TableStatus
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # 1. Invalidate Token (Prevent further orders from old QR)
    table.qr_token = str(uuid.uuid4())
    # 2. Update Status
    table.status = TableStatus.CHECKOUT_REQUESTED
    
    session.add(table)
    
    # 3. Invalidate all device sessions for this table
    stmt = select(DeviceSession).where(DeviceSession.table_id == table_id, DeviceSession.is_active == True)
    res_sessions = await session.execute(stmt)
    active_sessions = res_sessions.scalars().all()
    for ds in active_sessions:
        ds.is_active = False
        session.add(ds)

    await session.commit()
    await session.refresh(table)
    
    from utils.events import emit_checkout_request
    await emit_checkout_request(session, table.store_id, table)
    
    return {"message": "Checkout requested and token invalidated", "new_token": table.qr_token}

@router.post("/reset/{table_id}")
async def reset_table(table_id: int, refresh_token: bool = False, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    from models import TableStatus
    import uuid
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    table.status = TableStatus.READY
    if refresh_token:
        table.qr_token = str(uuid.uuid4())
    
    session.add(table)
    
    # Optional: Invalidate old sessions if resetting to a clean state
    if refresh_token:
        stmt = select(DeviceSession).where(DeviceSession.table_id == table_id, DeviceSession.is_active == True)
        res_sessions = await session.execute(stmt)
        active_sessions = res_sessions.scalars().all()
        for ds in active_sessions:
            ds.is_active = False
            session.add(ds)

    await session.commit()
    await session.refresh(table)
    
    return {"message": "Table reset to READY", "new_token": table.qr_token}

from pydantic import BaseModel
from typing import List, Optional
import zipfile

class BatchGenerateRequest(BaseModel):
    range_start: Optional[int] = None
    range_end: Optional[int] = None
    specific_tables: Optional[List[int]] = None
    format: str = 'pdf' # 'pdf' or 'jpg'

@router.post("/generate-batch/{store_id}")
async def generate_batch_qr_signs(store_id: str, payload: BatchGenerateRequest, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 1. Resolve store
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        store = await session.execute(select(Store).where(Store.slug == store_id)).scalar_one_or_none()
        
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # 2. Determine target table numbers
    table_numbers = []
    if payload.specific_tables and len(payload.specific_tables) > 0:
        table_numbers = payload.specific_tables
    elif payload.range_start is not None and payload.range_end is not None:
        table_numbers = list(range(payload.range_start, payload.range_end + 1))
    else:
        raise HTTPException(status_code=400, detail="Must provide either specific_tables or range_start and range_end")

    # 3. Auto-Register Missing Tables
    tables_res = await session.execute(select(Table).where(Table.store_id == store.id))
    existing_tables = {t.table_number: t for t in tables_res.scalars().all()}
    
    generated_tables = []
    
    for tn in table_numbers:
        if tn in existing_tables:
            generated_tables.append(existing_tables[tn])
        else:
            new_table = Table(
                store_id=store.id,
                table_number=str(tn),
                qr_token=str(uuid.uuid4())
            )
            session.add(new_table)
            generated_tables.append(new_table)
            
    await session.commit()
    for t in generated_tables:
        await session.refresh(t)

    # 4. Generate High-Res Images
    # theme_color = THEME_COLORS.get(store.theme, "#1a1a1a") # User wants black
    qr_color = "#000000"
    text_color = "#000000" # High visibility
    sub_text_color = "#333333"
    
    # Dynamic Base URL from DB
    config = await session.get(SystemConfig, "QR_BASE_URL")
    base_url = config.value if config else "http://localhost:5173"
    
    images = []
    
    # Adjust card size for better scaling in reportlab
    card_width = 800
    card_height = 1100
    
    # Fonts - Robust Path Detection
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    font_path_kr = os.path.join(BASE_DIR, "fonts", "NotoSansKR-Regular.ttf")
    font_path_jp = os.path.join(BASE_DIR, "fonts", "NotoSansJP-Regular.ttf")

    try:
        # Slightly adjusted sizes for better balance
        font_large = ImageFont.truetype(font_path_kr, 100) # Table No.
        font_title = ImageFont.truetype(font_path_kr, 68)  # Store Name
        font_banner = ImageFont.truetype(font_path_kr, 32) # Banner text
        font_main = ImageFont.truetype(font_path_jp, 46)   # JP instruction
        font_sub = ImageFont.truetype(font_path_kr, 30)    # EN, ZH, KO instructions
        font_zh = ImageFont.truetype(font_path_jp, 30)
    except Exception as e:
        print(f"Font loading failed: {e}. Falling back to default.")
        font_large = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_banner = ImageFont.load_default()
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_zh = ImageFont.load_default()

    for table in generated_tables:
        qr_url = f"{base_url.rstrip('/')}/shop/{store.id}/table/{table.table_number}/menu?token={table.qr_token}"
        
        qr = qrcode.QRCode(version=1, box_size=20, border=2)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img_qr = qr.make_image(fill_color=qr_color, back_color="white").convert('RGB')
        
        # Background
        card = Image.new('RGB', (card_width, card_height), color='white')
        draw = ImageDraw.Draw(card)
        
        # Border (Premium rounded corner style border)
        draw.rectangle([20, 20, card_width-20, card_height-20], outline=text_color, width=15)
        
        # Header text (Store Name)
        draw.text((card_width//2, 110), store.name, fill=text_color, font=font_title, anchor="mm")
        
        # Elegant separator line below store name
        draw.line([300, 160, 500, 160], fill="#000000", width=3)

        # NO APP DOWNLOAD (Badge-style banner)
        banner_w = 400
        draw.rounded_rectangle([card_width//2 - banner_w//2, 200, card_width//2 + banner_w//2, 255], radius=28, fill=text_color)
        draw.text((card_width//2, 228), "ORDER WITHOUT DOWNLOAD", fill="white", font=font_banner, anchor="mm")
        
        # QR Code with Rounded Box Background (Refined Shadow Effect)
        qr_box_margin = 35
        qr_size = 380
        # Draw light rounded box behind QR with a subtle border
        qr_box_rect = [card_width//2 - qr_size//2 - qr_box_margin, 300, card_width//2 + qr_size//2 + qr_box_margin, 300 + qr_size + 2*qr_box_margin]
        draw.rounded_rectangle(qr_box_rect, radius=50, fill="#f8fafc") 
        draw.rounded_rectangle(qr_box_rect, radius=50, outline="#e2e8f0", width=2)
        
        img_qr = img_qr.resize((qr_size, qr_size))
        card.paste(img_qr, (card_width//2 - qr_size//2, 300 + qr_box_margin))
        
        # Instructions (Better Spacing & Subtle Typography)
        y_pos = 800
        draw.text((card_width//2, y_pos), "携帯で스캔하여 주문하세요", fill=text_color, font=font_main, anchor="mm")
        y_pos += 55
        draw.text((card_width//2, y_pos), "Scan with phone to order", fill="#475569", font=font_sub, anchor="mm")
        y_pos += 45
        draw.text((card_width//2, y_pos), "请扫码下单", fill="#64748b", font=font_zh, anchor="mm")
        y_pos += 45
        draw.text((card_width//2, y_pos), "휴대폰으로 스캔하여 주문하세요", fill="#64748b", font=font_sub, anchor="mm")
        
        # Table Number Section (Bold & Premium)
        draw.line([120, 1010, card_width-120, 1010], fill="#000000", width=2)
        draw.text((card_width//2, 1050), "TABLE " + str(table.table_number), fill=text_color, font=font_large, anchor="mm")
        
        images.append((f"table_{table.table_number}.jpg", card))

    # 5. Output Packaging (Always PDF for batch signs now)
    out_buf = BytesIO()
    
    # Using reportlab for precise 4x2 layout on Landscape A4
    c = canvas.Canvas(out_buf, pagesize=landscape(A4))
    width, height = landscape(A4) # 297mm x 210mm
    
    # 4 columns, 2 rows
    cols = 4
    rows = 2
    items_per_page = cols * rows
    
    # Cell dimensions (approx 74mm x 105mm)
    margin_x = 5 * mm
    margin_y = 5 * mm
    cell_w = (width - 2 * margin_x) / cols
    cell_h = (height - 2 * margin_y) / rows
    
    for idx, (filename, img) in enumerate(images):
        page_idx = idx % items_per_page
        if idx > 0 and page_idx == 0:
            c.showPage()
            
        col = page_idx % cols
        row = (items_per_page - 1 - page_idx) // cols # Row 0 is at bottom in reportlab
        
        x = margin_x + col * cell_w
        y = margin_y + row * cell_h
        
        # Draw the card image into the cell
        img_buf = BytesIO()
        img.save(img_buf, format="PNG")
        img_buf.seek(0)
        
        from reportlab.lib.utils import ImageReader
        img_reader = ImageReader(img_buf)
        
        # Add some inner padding
        padding = 2 * mm
        c.drawImage(img_reader, x + padding, y + padding, width=cell_w - 2*padding, height=cell_h - 2*padding, preserveAspectRatio=True)
        
        # Optional: Subtle border for cutting
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.setLineWidth(0.1)
        c.rect(x, y, cell_w, cell_h, stroke=1, fill=0)

    c.save()
    from urllib.parse import quote
    encoded_filename = quote(f"QR_Signs_{store.name}.pdf")
    
    return Response(
        content=out_buf.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"{encoded_filename}\"; filename*=UTF-8''{encoded_filename}"
        }
    )

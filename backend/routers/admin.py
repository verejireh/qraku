from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
from database import get_session
from models import Store, Table, Order, Menu, StaffMember, PaymentSettings, PaymentMethodType
from datetime import datetime
import uuid
from utils.jwt import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


def _verify_admin_access(admin_store: Store, store_id: str):
    """JWT 토큰의 store_id와 요청 URL의 store_id가 일치하는지 검증 (교차 매장 접근 방지)"""
    if store_id.isdigit():
        if int(store_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    else:
        if store_id != admin_store.slug:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")

@router.post("/stores/{store_id}/tables", response_model=List[Table])
async def generate_tables(store_id: int, count: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, str(store_id))
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Check existing tables? Or just add? 
    # For MVP, let's clear existing and recreate or just append. 
    # Let's simple check: if exists, maybe delete all? 
    # Or just create new ones with higher numbers?
    # Requirement: "Set table count (1~10)". Implies resetting or defining the set.
    
    # Delete existing tables for this store (Simple Reset)
    # Note: This might cascade delete orders if not careful, but for setting up...
    # Let's just create if not exists or return existing. 
    # Better: "Set to N tables". 
    
    # 1. Fetch existing
    result = await session.execute(select(Table).where(Table.store_id == store_id))
    existing_tables = result.scalars().all()
    
    # 2. Logic: Ensure tables 1..count exist.
    created_tables = []
    
    # Map by number
    existing_map = {t.table_number: t for t in existing_tables}
    
    for i in range(1, count + 1):
        t_num = str(i)
        if t_num in existing_map:
            created_tables.append(existing_map[t_num])
        else:
            new_table = Table(store_id=store_id, table_number=t_num)
            session.add(new_table)
            created_tables.append(new_table)
    
    await session.commit()
    # Refresh all
    # For simplicity, just return the list (some might be detached, need refresh if used)
    return created_tables

@router.get("/stores/{store_id}/dashboard", response_model=Dict[str, Any])
async def get_dashboard_stats(store_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, str(store_id))
    # Simple stats: Today's orders, revenue, active tables
    
    # Total Revenue (All time or today? Let's do all time for now or simple)
    # revenue_query = select(func.sum(Order.total_price)).where(Order.table.has(store_id=store_id))
    # Note: Has logic in sqlmodel/sqlalchemy async might be tricky with joins.
    
    # Let's just count orders for now.
    # We need to join Order -> Table -> Store
    
    # Query: Orders for this store (Optimized with store_id)
    # Orders for this store
    stmt = select(Order).where(Order.store_id == store_id)
    result = await session.execute(stmt)
    orders = result.scalars().all()
    
    paid_orders = [o for o in orders if o.payment_status == 'paid']
    total_sales = sum(o.total_price for o in paid_orders)
    total_order_count = len(orders)
    paid_order_count = len(paid_orders)
    
    # AOV based on paid orders to be more accurate, or total? Usually total sales / total orders.
    # Let's use paid_order_count for denominator to avoid skewing by abandoned orders.
    aov = total_sales / paid_order_count if paid_order_count > 0 else 0
    
    # Active menus
    menu_res = await session.execute(select(Menu).where(Menu.store_id == store_id))
    menus = menu_res.scalars().all()
    
    # Active Tables (Tables with pending/cooking orders)
    active_table_ids = {o.table_id for o in orders if o.status in ['pending', 'cooking', 'served'] and o.payment_status == 'unpaid'}
    active_tables_count = len(active_table_ids)
    
    # Customer Insights
    from models import Customer
    # We want ALL customers for this store, not just those who ordered. 
    # But Customer model doesn't have store_id (it's global?). 
    # If global, we can only analyze customers who have associated orders with this store.
    # Using existing orders list to get relevant customers.
    customer_ids = {o.customer_id for o in orders}
    customers = []
    if customer_ids:
        c_res = await session.execute(select(Customer).where(Customer.id.in_(customer_ids)))
        customers = c_res.scalars().all()
        
    total_customers = len(customers)
    repeat_customers = len([c for c in customers if c.visit_count > 1])
    repeat_rate = (repeat_customers / total_customers * 100) if total_customers > 0 else 0
    
    # VIPs (Top 5)
    sorted_customers = sorted(customers, key=lambda c: c.visit_count, reverse=True)
    vips = [{"id": c.id, "visits": c.visit_count, "last_visit": c.last_visit} for c in sorted_customers[:5]]
    
    return {
        "total_sales": total_sales,
        "total_orders": total_order_count,
        "aov": int(aov),
        "menu_count": len(menus),
        "active_tables_count": active_tables_count,
        "repeat_rate": round(repeat_rate, 1),
        "vip_list": vips
    }

@router.get("/super/stats")
async def read_super_stats(admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    from models import Store, SubscriptionStatus
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    stores_count = await session.execute(select(func.count(Store.id)))
    total_stores = stores_count.scalar()
    
    active_monthly = await session.execute(select(func.count(Store.id)).where(Store.subscription_type == "MONTHLY", Store.subscription_status == "ACTIVE"))
    active_yearly = await session.execute(select(func.count(Store.id)).where(Store.subscription_type == "YEARLY", Store.subscription_status == "ACTIVE"))
    
    revenue = (active_monthly.scalar() * 3000) + (active_yearly.scalar() * 30000)
    
    threshold = datetime.utcnow() + timedelta(days=7)
    expiring_soon_query = select(Store).where(Store.subscription_expires_at <= threshold, Store.subscription_status != "EXPIRED")
    expiring_soon_res = await session.execute(expiring_soon_query)
    expiring_list = expiring_soon_res.scalars().all()
    
    return {
        "total_stores": total_stores,
        "monthly_revenue": revenue,
        "expiring_soon": expiring_list
    }

from pydantic import BaseModel

class DisplaySettingsUpdate(BaseModel):
    use_kitchen_page: Optional[bool] = None
    use_register_page: Optional[bool] = None
    use_staff_page: Optional[bool] = None

@router.patch("/stores/{store_id}/display-settings", response_model=Dict[str, Any])
async def update_display_settings(store_id: int, settings: DisplaySettingsUpdate, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, str(store_id))
    from models import StoreDisplaySettings
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
        
    result = await session.execute(select(StoreDisplaySettings).where(StoreDisplaySettings.store_id == store_id))
    display_settings = result.scalar_one_or_none()
    
    if not display_settings:
        display_settings = StoreDisplaySettings(store_id=store_id)
        session.add(display_settings)
        await session.commit()
        await session.refresh(display_settings)
        
    update_data = settings.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(display_settings, key, value)
        
    session.add(display_settings)
    await session.commit()
    await session.refresh(display_settings)
    
    # 설정 변경 브로드캐스팅 시도
    try:
        from utils.websocket import manager
        import json
        msg = json.dumps({"type": "CONFIG_UPDATE", "store_id": store.id})
        await manager.broadcast(msg, store.id)
    except Exception as e:
        print(f"WS Broadcast failed: {e}")
    
    return {"status": "success", "display_settings": display_settings}


# ── Store 조회 헬퍼 (slug / numeric ID 모두 지원) ─────────────────────────

async def _resolve_store(store_id: str, session: AsyncSession) -> Store:
    """slug 또는 numeric ID로 Store를 조회. 없으면 404."""
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


# ── Staff Management (マスターPIN + 직원 CRUD) ──────────────────────────────

class MasterPinUpdate(BaseModel):
    master_pin: str          # 새 PIN (6자리+ 숫자)
    current_pin: Optional[str] = None  # 기존 PIN (변경 시 현재 PIN 확인용)

@router.patch("/stores/{store_id}/master-pin")
async def update_master_pin(store_id: str, body: MasterPinUpdate, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    if len(body.master_pin) < 6 or not body.master_pin.isdigit():
        raise HTTPException(status_code=400, detail="マスターPINは6桁以上の数字で入力してください。")
    # 기존 PIN이 설정되어 있으면 현재 PIN 검증 필수
    if store.master_pin:
        if not body.current_pin:
            raise HTTPException(status_code=400, detail="現在のPINを入力してください。")
        if body.current_pin != store.master_pin:
            raise HTTPException(status_code=403, detail="現在のPINが正しくありません。")
    store.master_pin = body.master_pin
    session.add(store)
    await session.commit()
    return {"status": "ok"}

@router.get("/stores/{store_id}/master-pin")
async def get_master_pin(store_id: str, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    has_pin = bool(store.master_pin)
    masked = "*" * len(store.master_pin) if store.master_pin else None
    return {"has_pin": has_pin, "masked_pin": masked, "pin_length": len(store.master_pin) if store.master_pin else 0}


class StaffMemberCreate(BaseModel):
    name: str
    pin: str  # 4자리 숫자

class StaffMemberUpdate(BaseModel):
    name: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/stores/{store_id}/staff-members")
async def list_staff_members(store_id: str, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    result = await session.execute(
        select(StaffMember)
        .where(StaffMember.store_id == store.id, StaffMember.is_active == True)
        .order_by(StaffMember.created_at)
    )
    members = result.scalars().all()
    return [
        {"id": m.id, "name": m.name, "pin": m.pin, "is_on_duty": m.is_on_duty, "clock_in_at": str(m.clock_in_at) if m.clock_in_at else None}
        for m in members
    ]

@router.post("/stores/{store_id}/staff-members")
async def create_staff_member(store_id: str, body: StaffMemberCreate, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    if len(body.pin) != 4 or not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="スタッフPINは4桁の数字で入力してください。")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="名前を入力してください。")
    member = StaffMember(store_id=store.id, name=body.name.strip(), pin=body.pin)
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return {"id": member.id, "name": member.name, "pin": member.pin, "is_on_duty": member.is_on_duty}

@router.patch("/stores/{store_id}/staff-members/{member_id}")
async def update_staff_member(store_id: str, member_id: int, body: StaffMemberUpdate, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    member = await session.get(StaffMember, member_id)
    if not member or member.store_id != store.id:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if body.name is not None:
        member.name = body.name.strip()
    if body.pin is not None:
        if len(body.pin) != 4 or not body.pin.isdigit():
            raise HTTPException(status_code=400, detail="スタッフPINは4桁の数字で入力してください。")
        member.pin = body.pin
    if body.is_active is not None:
        member.is_active = body.is_active
        if not body.is_active:
            member.is_on_duty = False  # 비활성화 시 자동 퇴근
    session.add(member)
    await session.commit()
    return {"status": "ok"}

@router.delete("/stores/{store_id}/staff-members/{member_id}")
async def delete_staff_member(store_id: str, member_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    member = await session.get(StaffMember, member_id)
    if not member or member.store_id != store.id:
        raise HTTPException(status_code=404, detail="Staff member not found")
    member.is_active = False
    member.is_on_duty = False
    session.add(member)
    await session.commit()
    return {"status": "ok"}


# ── Staff 출퇴근 토글 (Setting 페이지에서 호출) ──────────────────────────────

class DutyToggle(BaseModel):
    is_on_duty: bool

@router.patch("/stores/{store_id}/staff-members/{member_id}/duty")
async def toggle_staff_duty(store_id: str, member_id: int, body: DutyToggle, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, store_id)
    store = await _resolve_store(store_id, session)
    member = await session.get(StaffMember, member_id)
    if not member or member.store_id != store.id:
        raise HTTPException(status_code=404, detail="Staff member not found")
    member.is_on_duty = body.is_on_duty
    if body.is_on_duty:
        member.clock_in_at = datetime.utcnow()
    else:
        member.clock_in_at = None
    session.add(member)
    await session.commit()
    return {"status": "ok", "is_on_duty": member.is_on_duty}


# ── PaymentSettings 管理 ────────────────────────────────────────────

from pydantic import BaseModel as PydanticBaseModel

class PaymentSettingsUpdate(PydanticBaseModel):
    payment_method_type: Optional[str] = None
    paypay_api_key: Optional[str] = None
    paypay_api_secret: Optional[str] = None
    paypay_merchant_id: Optional[str] = None


@router.get("/store/{store_id}/payment-settings")
async def get_payment_settings(store_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    _verify_admin_access(admin_store, str(store_id))
    result = await session.execute(
        select(PaymentSettings).where(PaymentSettings.store_id == store_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        return {
            "payment_method_type": "pay_at_counter",
            "has_paypay_credentials": False,
            "paypay_merchant_id": None,
        }
    return {
        "payment_method_type": str(ps.payment_method_type),
        "has_paypay_credentials": bool(ps.paypay_api_key and ps.paypay_api_secret),
        "paypay_merchant_id": ps.paypay_merchant_id,
    }


@router.patch("/store/{store_id}/payment-settings")
async def update_payment_settings(
    store_id: int,
    body: PaymentSettingsUpdate,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    _verify_admin_access(admin_store, str(store_id))
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    result = await session.execute(
        select(PaymentSettings).where(PaymentSettings.store_id == store_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        ps = PaymentSettings(store_id=store_id)
        session.add(ps)
        await session.commit()
        await session.refresh(ps)

    if body.payment_method_type:
        ps.payment_method_type = PaymentMethodType(body.payment_method_type)
    if body.paypay_api_key is not None:
        ps.paypay_api_key = body.paypay_api_key
    if body.paypay_api_secret is not None:
        ps.paypay_api_secret = body.paypay_api_secret
    if body.paypay_merchant_id is not None:
        ps.paypay_merchant_id = body.paypay_merchant_id

    session.add(ps)
    await session.commit()
    return {"status": "ok"}

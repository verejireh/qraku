import os
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel
from datetime import datetime, timedelta
from database import get_session
from models import Store, Table
from sqlalchemy.orm import selectinload
from utils.auth import get_password_hash
from utils.jwt import create_admin_token, require_admin

router = APIRouter(prefix="/stores", tags=["stores"])


def _validate_password(password: str):
    """관리자 로그인 패스워드 정책: 8자 이상, 대문자 1개, 특수문자 1개."""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="パスワードは8文字以上で入力してください")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="パスワードに大文字を1文字以上含めてください")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?~`]", password):
        raise HTTPException(status_code=400, detail="パスワードに特殊文字を1文字以上含めてください（例: !@#$%）")

@router.post("/", response_model=Store)
async def create_store(store: Store, session: AsyncSession = Depends(get_session)):
    # Auto-grant 60-day Free Trial
    now = datetime.utcnow()
    store.subscription_status = "TRIAL"
    store.subscription_type = "FREE"
    store.trial_start_date = now
    store.subscription_expires_at = now + timedelta(days=60)

    session.add(store)
    await session.commit()
    await session.refresh(store)
    return store


class SignupRequest(BaseModel):
    owner_name: str
    email: str
    password: str
    store_name: str
    category: str = "restaurant"
    address: str = ""
    phone: str = ""
    slug: str

@router.post("/signup")
async def signup_with_password(body: SignupRequest, session: AsyncSession = Depends(get_session)):
    """이메일+비밀번호로 회원가입 → Store 생성 + JWT 반환"""
    # 패스워드 정책 검증 (8자+, 대문자+, 특수문자+)
    _validate_password(body.password)

    # 중복 체크
    existing = await session.execute(select(Store).where(Store.owner_id == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています。")

    now = datetime.utcnow()
    store = Store(
        name=body.store_name,
        owner_id=body.email,
        owner_name=body.owner_name,
        password_hash=get_password_hash(body.password),
        category=body.category,
        slug=body.slug,
        address=body.address or None,
        phone=body.phone or None,
        subscription_status="TRIAL",
        subscription_type="FREE",
        trial_start_date=now,
        subscription_expires_at=now + timedelta(days=60),
    )
    session.add(store)
    await session.commit()
    await session.refresh(store)

    token = create_admin_token(store.id, store.owner_id, store.slug)
    return {
        "store": store,
        "token": token,
        "slug": store.slug,
    }

@router.get("/{store_id}")
async def read_store(store_id: str, session: AsyncSession = Depends(get_session)):
    if store_id.isdigit():
        result = await session.execute(
            select(Store).options(
                selectinload(Store.display_settings),
                selectinload(Store.payment_settings)
            ).where(Store.id == int(store_id))
        )
        store = result.scalar_one_or_none()
    else:
        result = await session.execute(
            select(Store).options(
                selectinload(Store.display_settings),
                selectinload(Store.payment_settings)
            ).where(Store.slug == store_id)
        )
        store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Inject global Square Application ID (non-sensitive — public client credential)
    data = jsonable_encoder(store)
    data["square_application_id"] = os.getenv("SQUARE_APPLICATION_ID") or ""

    # StoreDisplaySettings가 아직 없는 기존 매장인 경우 방어 코드로 기본 Default True 세팅 내려주기
    if not data.get("display_settings"):
        data["display_settings"] = {
            "use_kitchen_page": True,
            "use_register_page": True,
            "use_staff_page": True
        }

    # ── Credential 은 제거, 안전한 정보만 프론트엔드에 전달 ──
    # Store 레벨 credential 제거
    for secret_key in ["square_access_token", "square_refresh_token", "master_pin"]:
        data.pop(secret_key, None)
    # PaymentSettings 레벨 credential 제거
    ps = data.get("payment_settings")
    if ps:
        for secret_key in [
            "square_access_token", "square_refresh_token",
            "paypay_api_key", "paypay_api_secret",
        ]:
            ps.pop(secret_key, None)

    # ── can_accept_takeout: 프론트에서 테이크아웃 가능 여부 판단용 ──
    # 조건: (1) Admin이 takeout_enabled=true로 켜두었고, (2) 온라인 결제수단이 설정되어 있어야 함
    has_square = bool(store.square_access_token and store.square_location_id)
    ps_obj = store.payment_settings
    has_payment_ps = ps_obj and str(ps_obj.payment_method_type) != "pay_at_counter" and (
        (ps_obj.square_access_token and ps_obj.square_location_id) or
        ps_obj.paypay_api_key
    )
    has_online_payment = bool(has_square or has_payment_ps)
    data["has_online_payment"] = has_online_payment
    data["can_accept_takeout"] = bool(store.takeout_enabled and has_online_payment)

    return JSONResponse(content=data)

@router.get("/", response_model=List[Store])
async def read_stores(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Store))
    return result.scalars().all()

@router.post("/{store_id}/tables", response_model=Table)
async def create_table(store_id: int, table: Table, session: AsyncSession = Depends(get_session)):
    table.store_id = store_id
    session.add(table)
    await session.commit()
    await session.refresh(table)
    return table

@router.get("/{store_id}/tables", response_model=List[Table])
async def read_tables(store_id: str, session: AsyncSession = Depends(get_session)):
    if store_id.isdigit():
        target_id = int(store_id)
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
        if not store: return []
        target_id = store.id
        
    result = await session.execute(select(Table).where(Table.store_id == target_id))
    return result.scalars().all()

@router.delete("/{store_id}/tables/{table_id}")
async def delete_table(store_id: str, table_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 교차 매장 접근 방지
    if store_id.isdigit():
        if int(store_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    elif store_id != admin_store.slug:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    await session.delete(table)
    await session.commit()
    return {"status": "ok"}

@router.patch("/{store_id}", response_model=Store)
async def update_store(store_id: str, store_update: dict, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 교차 매장 접근 방지
    if store_id.isdigit():
        if int(store_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    elif store_id != admin_store.slug:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
        
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    for key, value in store_update.items():
        if hasattr(store, key):
            setattr(store, key, value)
            
    session.add(store)
    await session.commit()
    await session.refresh(store)
    
    # Broadcast config update to Kitchen
    try:
        from utils.websocket import manager
        import json
        msg = json.dumps({"type": "CONFIG_UPDATE", "store_id": store.id})
        await manager.broadcast(msg, store.id)
    except Exception as e:
        print(f"WS Broadcast failed: {e}")
        
    return store

@router.patch("/{store_id}/theme", response_model=Store)
async def update_store_theme(store_id: int, theme: str, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.theme = theme
    session.add(store)
    await session.commit()
    await session.refresh(store)
    return store

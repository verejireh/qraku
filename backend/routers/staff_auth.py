"""
Staff Authentication Router
- 마스터 PIN: register/staff/kitchen/setting 4페이지 전체 접근
- 개인 Staff 로그인: staff 페이지만 접근
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from database import get_session
from models import Store, StaffMember

router = APIRouter(prefix="/staff-auth", tags=["staff-auth"])


class MasterPinLogin(BaseModel):
    pin: str

class StaffLogin(BaseModel):
    staff_id: int
    pin: str


def _resolve_store_query(shop_id: str):
    """slug 또는 numeric ID로 Store를 조회하는 쿼리 반환"""
    if shop_id.isdigit():
        return select(Store).options(selectinload(Store.staff_members)).where(Store.id == int(shop_id))
    return select(Store).options(selectinload(Store.staff_members)).where(Store.slug == shop_id)


@router.post("/master/{shop_id}")
async def login_master_pin(shop_id: str, body: MasterPinLogin, session: AsyncSession = Depends(get_session)):
    """마스터 PIN으로 로그인 → register/staff/kitchen/setting 전체 접근"""
    result = await session.execute(_resolve_store_query(shop_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if not store.master_pin:
        raise HTTPException(status_code=403, detail="マスターPINが設定されていません。Admin画面で設定してください。")

    if body.pin != store.master_pin:
        raise HTTPException(status_code=401, detail="PINが正しくありません。")

    return {"role": "master", "shop_id": shop_id}


@router.post("/staff/{shop_id}")
async def login_staff(shop_id: str, body: StaffLogin, session: AsyncSession = Depends(get_session)):
    """개인 Staff 로그인 → staff 페이지만 접근"""
    staff = await session.get(StaffMember, body.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="スタッフが見つかりません。")

    # store 소속 확인
    result = await session.execute(_resolve_store_query(shop_id))
    store = result.scalar_one_or_none()
    if not store or staff.store_id != store.id:
        raise HTTPException(status_code=403, detail="このお店のスタッフではありません。")

    if not staff.is_active:
        raise HTTPException(status_code=403, detail="このアカウントは無効です。")

    if not staff.is_on_duty:
        raise HTTPException(status_code=403, detail="勤務中ではありません。Setting画面で出勤処理をしてください。")

    if body.pin != staff.pin:
        raise HTTPException(status_code=401, detail="PINが正しくありません。")

    return {"role": "staff", "staff_id": staff.id, "staff_name": staff.name, "shop_id": shop_id}


@router.get("/staff-list/{shop_id}")
async def get_staff_list_for_login(shop_id: str, session: AsyncSession = Depends(get_session)):
    """로그인 화면용 — 勤務中 직원 목록 (PIN 미포함)"""
    result = await session.execute(_resolve_store_query(shop_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    has_master_pin = bool(store.master_pin)
    on_duty = [
        {"id": s.id, "name": s.name}
        for s in (store.staff_members or [])
        if s.is_active and s.is_on_duty
    ]
    return {"has_master_pin": has_master_pin, "on_duty_staff": on_duty}

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import GuestProfile, Store, StampCard
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List, Optional

router = APIRouter(prefix="/guests", tags=["guests"])


class GuestInfo(BaseModel):
    guest_uuid: str
    visit_count: int
    last_visit: Optional[datetime] = None
    prev_last_visit: Optional[datetime] = None
    days_since_last_visit: Optional[int] = None  # prev_last_visit 기준


class BatchRequest(BaseModel):
    guest_uuids: List[str]


@router.post("/batch", response_model=List[GuestInfo])
async def get_guest_batch(body: BatchRequest, session: AsyncSession = Depends(get_session)):
    """여러 guest_uuid를 한 번에 조회. 프론트엔드 키친/레지스터 화면용."""
    if not body.guest_uuids:
        return []
    # POS_MANUAL 등 특수값 제외
    uuids = [u for u in body.guest_uuids if u and u != "POS_MANUAL"]
    if not uuids:
        return []

    result = await session.execute(select(GuestProfile).where(GuestProfile.guest_uuid.in_(uuids)))
    guests = result.scalars().all()

    now = datetime.utcnow()
    out = []
    for g in guests:
        days = None
        if g.prev_last_visit:
            days = (now.replace(tzinfo=None) - g.prev_last_visit.replace(tzinfo=None)).days
        out.append(GuestInfo(
            guest_uuid=g.guest_uuid,
            visit_count=g.visit_count,
            last_visit=g.last_visit,
            prev_last_visit=g.prev_last_visit,
            days_since_last_visit=days,
        ))
    return out

class LanguageUpdate(BaseModel):
    language: str

@router.get("/{guest_uuid}", response_model=GuestProfile)
async def get_guest_profile(guest_uuid: str, session: AsyncSession = Depends(get_session)):
    guest = await session.get(GuestProfile, guest_uuid)
    if not guest:
        # Create ad-hoc if doesn't exist to allow immediate language setting
        guest = GuestProfile(guest_uuid=guest_uuid)
        session.add(guest)
        await session.commit()
        await session.refresh(guest)
    return guest

@router.put("/{guest_uuid}/language", response_model=GuestProfile)
async def update_guest_language(guest_uuid: str, update_data: LanguageUpdate, session: AsyncSession = Depends(get_session)):
    guest = await session.get(GuestProfile, guest_uuid)
    if not guest:
        guest = GuestProfile(guest_uuid=guest_uuid, preferred_language=update_data.language)
        session.add(guest)
    else:
        guest.preferred_language = update_data.language
    await session.commit()
    await session.refresh(guest)
    return guest

@router.get("/{guest_uuid}/stamps/{store_id}")
async def get_guest_stamp_card(guest_uuid: str, store_id: int, session: AsyncSession = Depends(get_session)):
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
        
    result = await session.execute(
        select(StampCard).where(
            StampCard.guest_uuid == guest_uuid,
            StampCard.store_id == store_id
        )
    )
    card = result.scalar_one_or_none()
    stamp_count = card.stamp_count if card else 0
    
    can_use_reward = store.stamp_active and stamp_count >= store.stamp_target
    
    return {
        "stamp_active": store.stamp_active,
        "stamp_target": store.stamp_target,
        "stamp_count": stamp_count,
        "stamp_reward_msg": store.stamp_reward_msg,
        "stamp_reward_discount": store.stamp_reward_discount,
        "can_use_reward": can_use_reward
    }

@router.get("/{guest_uuid}/coupons/{store_id}")
async def get_guest_coupons(guest_uuid: str, store_id: int, session: AsyncSession = Depends(get_session)):
    from sqlmodel import select, or_
    from models import RewardCoupon
    now = datetime.utcnow()
    result = await session.execute(
        select(RewardCoupon).where(
            RewardCoupon.guest_uuid == guest_uuid,
            RewardCoupon.store_id == store_id,
            RewardCoupon.is_used == False,  # noqa: E712
            or_(RewardCoupon.expires_at == None, RewardCoupon.expires_at >= now),  # noqa: E711
        )
    )
    return result.scalars().all()

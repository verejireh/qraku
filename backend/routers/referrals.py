import random
import string
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
from database import get_session
from models import Store, ReferralCode, ReferralClaim
from utils.jwt import require_admin

router = APIRouter(prefix="/referrals", tags=["referrals"])


def _gen_code(length: int = 8) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


# ── 사장님: 소개 코드 생성 ──────────────────────────────────────────────────

@router.post("/generate")
async def generate_code(
    reward_message: Optional[str] = Body(default="次回のご利用で割引があります！"),
    max_uses: Optional[int] = Body(default=None),
    expires_days: Optional[int] = Body(default=30),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """소개 코드 신규 생성 (사장님 전용)."""
    expires_at = now_utc_naive() + timedelta(days=expires_days) if expires_days else None

    # 충돌 방지: 최대 5회 재시도
    for _ in range(5):
        code = _gen_code()
        existing = await session.execute(select(ReferralCode).where(ReferralCode.code == code))
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="コード生成に失敗しました。再試行してください。")

    ref = ReferralCode(
        owner_store_id=admin_store.id,
        code=code,
        reward_message=reward_message,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    session.add(ref)
    await session.commit()
    await session.refresh(ref)
    return {
        "id": ref.id,
        "code": ref.code,
        "reward_message": ref.reward_message,
        "max_uses": ref.max_uses,
        "expires_at": ref.expires_at.isoformat() if ref.expires_at else None,
    }


@router.get("/my-codes")
async def list_my_codes(
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """내 매장 소개 코드 목록 + 사용 현황."""
    rows = (await session.execute(
        select(ReferralCode)
        .where(ReferralCode.owner_store_id == admin_store.id)
        .order_by(ReferralCode.created_at.desc())
    )).scalars().all()

    result = []
    for r in rows:
        claims_count = (await session.execute(
            select(ReferralClaim).where(ReferralClaim.code == r.code)
        )).scalars().all()
        result.append({
            "id": r.id,
            "code": r.code,
            "reward_message": r.reward_message,
            "uses": r.uses,
            "max_uses": r.max_uses,
            "is_active": r.is_active,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "claims": len(claims_count),
            "created_at": r.created_at.isoformat(),
        })
    return {"codes": result}


@router.patch("/{code_id}/deactivate")
async def deactivate_code(
    code_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """소개 코드 비활성화."""
    ref = await session.get(ReferralCode, code_id)
    if not ref or ref.owner_store_id != admin_store.id:
        raise HTTPException(status_code=404, detail="Code not found")
    ref.is_active = False
    session.add(ref)
    await session.commit()
    return {"ok": True}


# ── 손님: 소개 코드 클레임 (인증 없음) ─────────────────────────────────────

@router.post("/claim")
async def claim_code(
    code: str = Body(...),
    guest_uuid: Optional[str] = Body(default=None),
    session: AsyncSession = Depends(get_session),
):
    """소개 코드 사용 — 손님이 공개 페이지에서 입력."""
    ref = (await session.execute(
        select(ReferralCode).where(ReferralCode.code == code.upper(), ReferralCode.is_active == True)  # noqa: E712
    )).scalar_one_or_none()

    if not ref:
        raise HTTPException(status_code=404, detail="コードが見つからないか、無効です。")

    now = now_utc_naive()
    if ref.expires_at and ref.expires_at < now:
        raise HTTPException(status_code=410, detail="このコードは期限切れです。")

    if ref.max_uses is not None and ref.uses >= ref.max_uses:
        raise HTTPException(status_code=410, detail="このコードは使用上限に達しました。")

    # 重複クレーム防止
    claimer_id = guest_uuid or "anonymous"
    existing_claim = (await session.execute(
        select(ReferralClaim).where(
            ReferralClaim.code == code.upper(),
            ReferralClaim.claimer_id == claimer_id,
        )
    )).scalar_one_or_none()

    if existing_claim:
        raise HTTPException(status_code=409, detail="このコードはすでに使用済みです。")

    ref.uses += 1
    claim = ReferralClaim(code=code.upper(), claimer_id=claimer_id)
    session.add(ref)
    session.add(claim)
    await session.commit()
    await session.refresh(claim)

    return {
        "success": True,
        "claim_id": claim.id,
        "reward_message": ref.reward_message,
    }

import os
import secrets
import json
import logging
from datetime import datetime, timedelta, timezone
from utils.time_helpers import now_utc_naive
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import Store, Table
from utils.redis import get_redis
from utils.jwt import require_admin, require_staff_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["ws-token"])

WS_AUTH_TOKEN_TTL_SECONDS = int(os.getenv("WS_AUTH_TOKEN_TTL_SECONDS", "300"))
_STAFF_AUDIENCES = {"admin", "kitchen", "register", "staff"}


class WsTokenRequest(BaseModel):
    store_id: int
    audience: str  # "kitchen" | "register" | "admin" | "customer"
    table_number: Optional[str] = None


async def validate_ws_token(
    token: str,
    *,
    expected_audience: str,
    expected_store_id: int,
) -> Optional[dict]:
    """Redis에서 토큰을 검증하고 info dict를 반환. 실패 시 None."""
    try:
        redis = get_redis()
        raw = await redis.get(f"ws:token:{token}")
        if not raw:
            return None
        info = json.loads(raw)
        if info.get("store_id") != expected_store_id:
            return None
        if info.get("audience") != expected_audience:
            return None
        return info
    except Exception:
        logger.exception(
            "validate_ws_token failed for audience=%s store=%d",
            expected_audience,
            expected_store_id,
        )
        return None


async def _issue_token(
    store_id: int, audience: str, table_number: Optional[str]
) -> dict:
    token = secrets.token_urlsafe(32)
    exp = now_utc_naive() + timedelta(seconds=WS_AUTH_TOKEN_TTL_SECONDS)
    # [2026-05-24] PG-DT-MIGRATE-02 Cat-3 consistency — exp.isoformat() + "Z" 를
    # aware UTC ISO (+00:00) 로 통일. events.py / translate_tasks.py 의 ts 형식과
    # 일관. GPT 세션 H §C 권고.
    exp_iso = exp.replace(tzinfo=timezone.utc).isoformat()
    info = {
        "store_id": store_id,
        "audience": audience,
        "table_number": table_number,
        "exp": exp_iso,
    }
    try:
        redis = get_redis()
        await redis.set(
            f"ws:token:{token}", json.dumps(info), ex=WS_AUTH_TOKEN_TTL_SECONDS
        )
    except Exception:
        logger.exception("Failed to store WS token in Redis")
        raise HTTPException(status_code=503, detail="토큰 발급에 실패했습니다")
    return {"token": token, "expires_at": exp_iso}


@router.post("/token/staff")
async def create_ws_token_staff(
    body: WsTokenRequest,
    admin_store: Store = Depends(require_staff_or_admin),
    session: AsyncSession = Depends(get_session),
):
    """스태프용 WS 토큰 발급 — Admin JWT 또는 Staff JWT(마스터PIN) 모두 허용."""
    if body.audience not in _STAFF_AUDIENCES:
        raise HTTPException(status_code=400, detail=f"Unknown staff audience: {body.audience}")
    if body.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Store mismatch")
    return await _issue_token(body.store_id, body.audience, body.table_number)


@router.post("/token/customer")
async def create_ws_token_customer(
    body: WsTokenRequest,
    session: AsyncSession = Depends(get_session),
):
    """손님용 WS 토큰 발급 — 인증 불필요. store_id + table_number 존재 확인."""
    if body.audience != "customer":
        raise HTTPException(status_code=400, detail="This endpoint is for customer audience only")
    store = await session.get(Store, body.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if body.table_number:
        tbl_result = await session.execute(
            select(Table).where(
                Table.store_id == body.store_id,
                Table.table_number == body.table_number,
            )
        )
        if not tbl_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Table not found")
    return await _issue_token(body.store_id, "customer", body.table_number)


@router.post("/token")
async def create_ws_token(
    body: WsTokenRequest,
    session: AsyncSession = Depends(get_session),
):
    """통합 토큰 발급 엔드포인트 (카드 스펙 호환).
    - customer: 인증 불필요
    - staff audiences: /token/staff 사용 권고 (이 엔드포인트에서 admin JWT 없이 호출 시 401)
    """
    if body.audience == "customer":
        return await create_ws_token_customer(body, session=session)
    raise HTTPException(
        status_code=401,
        detail="Staff audiences require admin JWT. Use POST /api/ws/token/staff",
    )

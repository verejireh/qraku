"""
Admin JWT 인증 유틸리티

- create_admin_token: 관리자 JWT 토큰 생성 (24시간 유효)
- decode_admin_token: JWT 디코딩 및 검증
- require_admin: FastAPI Depends — Bearer 토큰에서 Store 추출 + 구독 만료 체크
- require_admin_billing: 구독 만료 체크 없는 버전 (결제/구독 엔드포인트 전용)
"""

import os
import sys
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Store, SubscriptionStatus

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    print("CRITICAL: SECRET_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.", file=sys.stderr)
    sys.exit(1)
ALGORITHM = "HS256"
ADMIN_TOKEN_EXPIRE_HOURS = 24


def create_admin_token(store_id: int, owner_id: str, slug: str = "") -> str:
    payload = {
        "store_id": store_id,
        "owner_id": owner_id,
        "slug": slug,
        "type": "admin",
        "exp": now_utc_naive() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_admin_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "admin":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


security = HTTPBearer(auto_error=False)


async def _load_store(credentials, session: AsyncSession) -> Store:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_admin_token(credentials.credentials)
    store = await session.get(Store, payload["store_id"])
    if not store:
        raise HTTPException(status_code=401, detail="Store not found")
    return store


async def _check_subscription(store: Store, session: AsyncSession):
    """구독 만료 여부 확인. 만료 시 DB 상태 자동 갱신 후 402 반환."""
    if not store.subscription_expires_at:
        return  # expires_at 없는 구버전 스토어는 허용
    if now_utc_naive() <= store.subscription_expires_at:
        return  # 유효

    # 만료됨 — DB 상태 동기화
    status_val = store.subscription_status.value if hasattr(store.subscription_status, "value") else store.subscription_status
    if status_val != "EXPIRED":
        store.subscription_status = SubscriptionStatus.EXPIRED
        session.add(store)
        await session.commit()

    raise HTTPException(
        status_code=402,
        detail={
            "code": "SUBSCRIPTION_EXPIRED",
            "message": "ご利用期限が切れています。サブスクリプションを更新してください。",
        },
    )


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> Store:
    """인증만 수행. 구독 만료여도 admin 페이지는 항상 접근 가능."""
    return await _load_store(credentials, session)


async def require_admin_billing(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> Store:
    """결제/구독 엔드포인트 전용 — 구독 만료 체크 없이 인증만 수행.
    만료된 업주도 결제 페이지에 접근해 갱신할 수 있어야 하므로 체크를 생략한다."""
    return await _load_store(credentials, session)


# ─── Super Admin 인증 ─────────────────────────────────────────────
SUPER_ADMIN_TOKEN_EXPIRE_HOURS = 12


def create_super_admin_token() -> str:
    payload = {
        "type": "super_admin",
        "exp": now_utc_naive() + timedelta(hours=SUPER_ADMIN_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def require_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Super Admin 전용 엔드포인트 보호. JWT type='super_admin' 검증."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Super admin authentication required")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "super_admin":
            raise HTTPException(status_code=401, detail="Invalid super admin token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired super admin token")


# ─── Staff (마스터PIN) 인증 ────────────────────────────────────────────
STAFF_TOKEN_EXPIRE_HOURS = 12


def create_staff_token(store_id: int, shop_id: str) -> str:
    """마스터PIN 로그인 성공 시 발급하는 스태프 JWT"""
    payload = {
        "store_id": store_id,
        "shop_id": shop_id,
        "type": "staff",
        "exp": now_utc_naive() + timedelta(hours=STAFF_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def require_staff_or_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> Store:
    """
    스태프 JWT (type=staff) 또는 어드민 JWT (type=admin) 둘 다 허용.
    register, pos, tables staff API에 사용.
    반환값: Store 객체
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="認証が必要です")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_type = payload.get("type")
    if token_type not in ("admin", "staff"):
        raise HTTPException(status_code=401, detail="Invalid token type")

    store = await session.get(Store, payload["store_id"])
    if not store:
        raise HTTPException(status_code=401, detail="Store not found")
    return store

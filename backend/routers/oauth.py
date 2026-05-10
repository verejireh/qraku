"""
Google / LINE OAuth 소셜 로그인 라우터

흐름:
  1. 프론트엔드에서 /api/auth/google 또는 /api/auth/line 로 리다이렉트
  2. 백엔드가 각 공급자 인증 화면으로 리다이렉트
  3. 인증 완료 후 공급자가 /api/auth/{provider}/callback 으로 리다이렉트
  4. 백엔드가 사용자 정보 취득
     - 기존 회원: 관리자 페이지로 바로 이동
     - 신규: 서명된 oauth_token 을 URL 파라미터에 담아 프론트엔드 콜백 페이지로 이동
  5. 프론트엔드 /owner/signup/oauth-callback 에서 가게 정보 입력
  6. POST /api/auth/complete-oauth-signup 으로 가게 생성
"""

import os
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import Store
from utils.jwt import create_admin_token

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["oauth"])

# ── 환경변수 ─────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "yoursecretkeyhere")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

LINE_CHANNEL_ID = os.getenv("LINE_CHANNEL_ID", "")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")

# 환경변수 로드 확인 로그
logger.info(f"[OAuth] FRONTEND_BASE_URL = {FRONTEND_BASE_URL}")
logger.info(f"[OAuth] GOOGLE_CLIENT_ID = {GOOGLE_CLIENT_ID[:12]}..." if GOOGLE_CLIENT_ID else "[OAuth] GOOGLE_CLIENT_ID = (empty!)")
logger.info(f"[OAuth] LINE_CHANNEL_ID = {LINE_CHANNEL_ID}" if LINE_CHANNEL_ID else "[OAuth] LINE_CHANNEL_ID = (empty!)")

ALGORITHM = "HS256"
OAUTH_TOKEN_EXPIRE_MINUTES = 30

# OAuth 콜백 URL은 FastAPI 서버 경로 (프론트엔드와 동일 도메인 사용)
def callback_url(provider: str) -> str:
    url = f"{FRONTEND_BASE_URL}/api/auth/{provider}/callback"
    logger.info(f"[OAuth] {provider} callback URL: {url}")
    return url


# ── JWT 유틸 ──────────────────────────────────────────────────────────────────
def create_oauth_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow() + timedelta(minutes=OAUTH_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_oauth_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=400, detail=f"無効なOAuthトークンです: {e}")


# ── Google OAuth ──────────────────────────────────────────────────────────────
@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth が設定されていません")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url("google"),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str, session: AsyncSession = Depends(get_session)):
    # 1. code → access_token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": callback_url("google"),
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            logger.error(f"[Google OAuth] トークン取得失敗: {token_res.status_code} — {token_res.text}")
            raise HTTPException(status_code=400, detail=f"Googleトークン取得に失敗しました: {token_res.text[:200]}")
        token_data = token_res.json()

        # 2. access_token → ユーザー情報
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        user_info = user_res.json()

    google_id = user_info.get("id")
    email = user_info.get("email", "")
    name = user_info.get("name", "")

    # 3. 既存ユーザー確認
    result = await session.execute(select(Store).where(Store.google_id == google_id))
    existing = result.scalar_one_or_none()
    if existing:
        admin_token = create_admin_token(existing.id, existing.owner_id, existing.slug or "")
        return RedirectResponse(
            f"{FRONTEND_BASE_URL}/{existing.slug or existing.id}/admin?token={admin_token}"
        )

    # 4. 新規: 署名付きトークンを生成してフロントエンドへ
    oauth_token = create_oauth_token(
        {"provider": "google", "provider_id": google_id, "email": email, "name": name}
    )
    return RedirectResponse(
        f"{FRONTEND_BASE_URL}/owner/signup/oauth-callback?token={oauth_token}"
    )


# ── LINE OAuth ────────────────────────────────────────────────────────────────
@router.get("/line")
async def line_login():
    if not LINE_CHANNEL_ID:
        raise HTTPException(status_code=503, detail="LINE OAuth が設定されていません")
    params = {
        "response_type": "code",
        "client_id": LINE_CHANNEL_ID,
        "redirect_uri": callback_url("line"),
        "scope": "profile openid email",
        "state": "qraku_login",
    }
    return RedirectResponse(
        f"https://access.line.me/oauth2/v2.1/authorize?{urlencode(params)}"
    )


@router.get("/line/callback")
async def line_callback(code: str, session: AsyncSession = Depends(get_session)):
    # 1. code → access_token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://api.line.me/oauth2/v2.1/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url("line"),
                "client_id": LINE_CHANNEL_ID,
                "client_secret": LINE_CHANNEL_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_res.status_code != 200:
            logger.error(f"[LINE OAuth] トークン取得失敗: {token_res.status_code} — {token_res.text}")
            raise HTTPException(status_code=400, detail=f"LINEトークン取得に失敗しました: {token_res.text[:200]}")
        token_data = token_res.json()

        # 2. access_token → プロフィール
        profile_res = await client.get(
            "https://api.line.me/v2/profile",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        profile = profile_res.json()

    line_id = profile.get("userId")
    name = profile.get("displayName", "")
    # LINE は email を別途 id_token から取得
    email = ""
    id_token = token_data.get("id_token")
    if id_token:
        try:
            claims = jwt.decode(id_token, LINE_CHANNEL_SECRET, algorithms=["HS256"],
                                audience=LINE_CHANNEL_ID)
            email = claims.get("email", "")
        except Exception:
            pass

    # 3. 既存ユーザー確認
    result = await session.execute(select(Store).where(Store.line_id == line_id))
    existing = result.scalar_one_or_none()
    if existing:
        admin_token = create_admin_token(existing.id, existing.owner_id, existing.slug or "")
        return RedirectResponse(
            f"{FRONTEND_BASE_URL}/{existing.slug or existing.id}/admin?token={admin_token}"
        )

    # 4. 新規: 署名付きトークンを生成
    oauth_token = create_oauth_token(
        {"provider": "line", "provider_id": line_id, "email": email, "name": name}
    )
    return RedirectResponse(
        f"{FRONTEND_BASE_URL}/owner/signup/oauth-callback?token={oauth_token}"
    )


# ── 가게 정보 등록 완료 ───────────────────────────────────────────────────────
class OAuthSignupComplete(BaseModel):
    oauth_token: str
    store_name: str
    category: str = "other"
    address: str = ""
    phone: str = ""
    owner_name: str = ""
    slug: str


@router.post("/complete-oauth-signup")
async def complete_oauth_signup(
    body: OAuthSignupComplete, session: AsyncSession = Depends(get_session)
):
    from utils.slug import validate_and_check_slug

    payload = decode_oauth_token(body.oauth_token)

    provider = payload.get("provider")
    provider_id = payload.get("provider_id")
    email = payload.get("email", "")
    name = payload.get("name", "")

    # ── shop_id (slug) 형식·중복 검증 ───────────────────────────────────────
    slug_input = (body.slug or "").strip().lower()
    ok, err = await validate_and_check_slug(slug_input, session)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    now = datetime.utcnow()
    store = Store(
        name=body.store_name,
        owner_id=email or provider_id,
        owner_name=body.owner_name or name,
        category=body.category,
        slug=slug_input,
        address=body.address or None,
        phone=body.phone or None,
        subscription_status="TRIAL",
        subscription_type="FREE",
        trial_start_date=now,
        subscription_expires_at=now + timedelta(days=14),
    )
    if provider == "google":
        store.google_id = provider_id
    elif provider == "line":
        store.line_id = provider_id

    session.add(store)
    await session.commit()
    await session.refresh(store)

    admin_token = create_admin_token(store.id, store.owner_id, store.slug or "")
    return {"store": store, "token": admin_token, "slug": store.slug}

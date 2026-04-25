"""
인증 라우터: Admin 로그인 (이메일+비밀번호), 토큰 검증, PIN 찾기
"""

import random
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Store
from pydantic import BaseModel
from utils.auth import verify_password, get_password_hash
from utils.jwt import create_admin_token, decode_admin_token, security
from utils.email import send_email

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Admin Login (이메일 + 비밀번호) ──────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: str
    password: str

class AdminLoginResponse(BaseModel):
    token: str
    store_id: int
    slug: str
    store_name: str


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Store).where(Store.owner_id == body.email)
    )
    store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    if not store.password_hash:
        raise HTTPException(
            status_code=401,
            detail="パスワードが設定されていません。Google/LINEログインをお試しください。"
        )

    if not verify_password(body.password, store.password_hash):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    token = create_admin_token(store.id, store.owner_id, store.slug or "")
    return AdminLoginResponse(
        token=token,
        store_id=store.id,
        slug=store.slug or str(store.id),
        store_name=store.name,
    )


# ── Admin Token Verify ──────────────────────────────────────────────────────

@router.get("/admin/verify")
async def verify_admin_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token required")
    payload = decode_admin_token(credentials.credentials)
    store = await session.get(Store, payload["store_id"])
    if not store:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {
        "valid": True,
        "store_id": store.id,
        "slug": store.slug,
        "store_name": store.name,
        "owner_id": store.owner_id,
    }


# ── Forgot Master PIN ───────────────────────────────────────────────────────

class ForgotPinRequest(BaseModel):
    shop_id: str

@router.post("/forgot-pin")
async def forgot_master_pin(body: ForgotPinRequest, session: AsyncSession = Depends(get_session)):
    if body.shop_id.isdigit():
        store = await session.get(Store, int(body.shop_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == body.shop_id))
        store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="店舗が見つかりません。")

    email = store.owner_id
    if not email or "@" not in email:
        raise HTTPException(
            status_code=400,
            detail="登録メールアドレスがありません。管理者に連絡してください。"
        )

    temp_pin = str(random.randint(100000, 999999))
    store.master_pin = temp_pin
    session.add(store)
    await session.commit()

    html = f"""
    <div style="font-family: sans-serif; max-width: 400px; margin: auto; padding: 20px;">
        <h2 style="color: #c21e2f;">🔑 QRaku マスターPIN リセット</h2>
        <p>{store.name} の仮マスターPINです：</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">{temp_pin}</span>
        </div>
        <p style="color: #666; font-size: 14px;">このPINでログイン後、すぐに新しいPINに変更してください。</p>
        <p style="color: #999; font-size: 12px;">※ このメールに心当たりがない場合は無視してください。</p>
    </div>
    """
    await send_email(email, "【QRaku】マスターPIN リセット", html)

    parts = email.split("@")
    masked = parts[0][:2] + "***@" + parts[1] if len(parts) == 2 else "***"
    return {"success": True, "message": f"仮PINを {masked} に送信しました。"}

"""
베타 식당 모집 신청 라우터
"""
import logging
import re
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator
from typing import Optional

from database import get_session
from models import BetaApplication
from utils.email import send_email

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/beta", tags=["beta"])

# IP 별 분당 1회 제한 (스팸 방지)
_rate_limit_window = 60
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate(ip: str):
    now = time.time()
    cutoff = now - _rate_limit_window
    _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
    if len(_rate_store[ip]) >= 1:
        raise HTTPException(status_code=429, detail="連続申請はお控えください。1分後に再度お試しください。")
    _rate_store[ip].append(now)


class BetaApplicationRequest(BaseModel):
    owner_name: str
    store_name: str
    prefecture: Optional[str] = None
    city: Optional[str] = None
    email: str
    phone: Optional[str] = None
    seats: Optional[int] = None
    current_pos: Optional[str] = None
    why_join: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = (v or "").strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("有効なメールアドレスを入力してください")
        return v


@router.post("/apply")
async def apply_for_beta(
    body: BetaApplicationRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """베타 모집 신청 — 공개 엔드포인트 (Rate Limit 적용)"""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate(client_ip)

    # 입력 검증
    if not body.owner_name.strip() or not body.store_name.strip():
        raise HTTPException(status_code=400, detail="お名前と店舗名は必須です")
    if body.why_join and len(body.why_join) > 2000:
        raise HTTPException(status_code=400, detail="ご応募理由は2000文字以内でお願いします")

    # 중복 신청 차단 (같은 이메일 7일 내)
    from datetime import datetime, timedelta
    recent_cut = now_utc_naive() - timedelta(days=7)
    dup_res = await session.execute(
        select(BetaApplication).where(
            BetaApplication.email == body.email,
            BetaApplication.created_at >= recent_cut,
        )
    )
    if dup_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="同じメールアドレスで既にご応募いただいております。")

    application = BetaApplication(
        owner_name=body.owner_name.strip(),
        store_name=body.store_name.strip(),
        prefecture=(body.prefecture or "").strip() or None,
        city=(body.city or "").strip() or None,
        email=body.email.strip(),
        phone=(body.phone or "").strip() or None,
        seats=body.seats,
        current_pos=(body.current_pos or "").strip() or None,
        why_join=(body.why_join or "").strip() or None,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)

    # 운영자 이메일 통보 (실패해도 계속)
    try:
        admin_email = "verejireh@gmail.com"
        html = f"""
        <h2>🎉 ベータ店舗 新規応募</h2>
        <p><b>応募ID:</b> #{application.id}</p>
        <table style="border-collapse:collapse;border:1px solid #ccc;">
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>店舗名</b></td><td style="padding:6px;border:1px solid #ccc;">{application.store_name}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>オーナー</b></td><td style="padding:6px;border:1px solid #ccc;">{application.owner_name}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>地域</b></td><td style="padding:6px;border:1px solid #ccc;">{application.prefecture or '-'} {application.city or ''}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>Email</b></td><td style="padding:6px;border:1px solid #ccc;">{application.email}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>電話</b></td><td style="padding:6px;border:1px solid #ccc;">{application.phone or '-'}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>席数</b></td><td style="padding:6px;border:1px solid #ccc;">{application.seats or '-'}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>現POS</b></td><td style="padding:6px;border:1px solid #ccc;">{application.current_pos or '-'}</td></tr>
        </table>
        <h3>応募理由</h3>
        <p style="white-space:pre-wrap;background:#f5f5f5;padding:10px;border-radius:6px;">{application.why_join or '(未記入)'}</p>
        """
        await send_email(admin_email, f"[QRaku Beta] 新規応募 #{application.id}: {application.store_name}", html)
    except Exception as e:
        logger.warning("Beta 신청 알림 메일 실패: %s", e)

    # 신청자에게 자동 회신
    try:
        confirm_html = f"""
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:20px;color:#333;">
            <h2 style="color:#c41e3a;">QRaku ベータ店舗 ご応募ありがとうございます</h2>
            <p>{application.owner_name} 様</p>
            <p>このたびは <b>{application.store_name}</b> 様より QRaku ベータ店舗にご応募いただき、誠にありがとうございます。</p>
            <p>応募内容を確認のうえ、<b>3営業日以内</b>に担当者よりご連絡させていただきます。</p>
            <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
            <p style="font-size:13px;color:#666;">
                応募ID: #{application.id}<br>
                応募日時: {application.created_at.strftime('%Y-%m-%d %H:%M')} (UTC)
            </p>
            <p style="font-size:12px;color:#999;margin-top:30px;">
                ご質問は本メールに直接ご返信ください。<br>
                QRaku 運営チーム
            </p>
        </div>
        """
        await send_email(application.email, "【QRaku】ベータ店舗 ご応募ありがとうございます", confirm_html)
    except Exception as e:
        logger.warning("Beta 자동회신 메일 실패: %s", e)

    return {
        "status": "ok",
        "application_id": application.id,
        "message": "ご応募ありがとうございます。3営業日以内にご連絡いたします。",
    }

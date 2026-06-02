"""
사장님 전환 LP(/owner) 무료 상담 신청 리드 수집 라우터 (MKT-23)
"""
import logging
import time
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import OwnerLead
from utils.email import send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])

# IP 별 분당 3회 제한 (스팸 방지)
_rate_limit_window = 60
_rate_limit_max = 3
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate(ip: str):
    now = time.time()
    cutoff = now - _rate_limit_window
    _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
    if len(_rate_store[ip]) >= _rate_limit_max:
        raise HTTPException(status_code=429, detail="送信が続いています。しばらくしてからお試しください。")
    _rate_store[ip].append(now)


class OwnerLeadRequest(BaseModel):
    store_name: str
    contact_name: str
    contact: str
    business_type: Optional[str] = None
    message: Optional[str] = None
    preferred_contact: Optional[str] = None
    # UTM / 출처
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    referrer: Optional[str] = None
    landing_path: Optional[str] = None
    # 허니팟 (봇이 채우면 조용히 무시)
    website: Optional[str] = None


@router.post("/owner")
async def create_owner_lead(
    body: OwnerLeadRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """/owner LP 무료 상담 신청 — 공개 엔드포인트 (Rate Limit + 허니팟)"""
    # 허니팟: 봇이 hidden 필드를 채운 경우 성공처럼 응답하되 저장하지 않음
    if body.website:
        logger.info("owner_lead honeypot triggered, ignoring submission")
        return {"status": "ok"}

    client_ip = request.client.host if request.client else "unknown"
    _check_rate(client_ip)

    if not body.store_name.strip() or not body.contact_name.strip() or not body.contact.strip():
        raise HTTPException(status_code=400, detail="店舗名・お名前・ご連絡先は必須です。")
    if body.message and len(body.message) > 2000:
        raise HTTPException(status_code=400, detail="ご相談内容は2000文字以内でお願いします。")

    lead = OwnerLead(
        store_name=body.store_name.strip()[:200],
        contact_name=body.contact_name.strip()[:100],
        contact=body.contact.strip()[:255],
        business_type=(body.business_type or "").strip()[:50] or None,
        message=(body.message or "").strip() or None,
        preferred_contact=(body.preferred_contact or "").strip()[:20] or None,
        utm_source=(body.utm_source or "").strip()[:100] or None,
        utm_medium=(body.utm_medium or "").strip()[:100] or None,
        utm_campaign=(body.utm_campaign or "").strip()[:100] or None,
        referrer=(body.referrer or "").strip()[:500] or None,
        landing_path=(body.landing_path or "").strip()[:200] or None,
    )
    session.add(lead)
    await session.commit()
    await session.refresh(lead)

    # 운영자 이메일 통보 (실패해도 계속)
    try:
        admin_email = "verejireh@gmail.com"
        html = f"""
        <h2>📩 /owner 無料相談 新規リード</h2>
        <p><b>リードID:</b> #{lead.id}</p>
        <table style="border-collapse:collapse;border:1px solid #ccc;">
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>店舗名</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.store_name}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>お名前</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.contact_name}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>ご連絡先</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.contact}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>業態</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.business_type or '-'}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>希望連絡方法</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.preferred_contact or '-'}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>UTM</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.utm_source or '-'} / {lead.utm_medium or '-'} / {lead.utm_campaign or '-'}</td></tr>
            <tr><td style="padding:6px;border:1px solid #ccc;"><b>着地</b></td><td style="padding:6px;border:1px solid #ccc;">{lead.landing_path or '-'}</td></tr>
        </table>
        <h3>ご相談内容</h3>
        <p style="white-space:pre-wrap;background:#f5f5f5;padding:10px;border-radius:6px;">{lead.message or '(未記入)'}</p>
        """
        await send_email(admin_email, f"[QRaku] /owner 新規リード #{lead.id}: {lead.store_name}", html)
    except Exception as e:
        logger.warning("owner_lead 알림 메일 실패: %s", e)

    return {"status": "ok", "lead_id": lead.id}

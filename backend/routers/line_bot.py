"""LINE Messaging API 웹훅 — 위치 전송 → 근처 TOP3 Flex 회신.
플랫폼 무관 핵심(find_nearby_stores/to_store_cards) + LINE 어댑터(line_client) 조합.
"""
import os
import json
import logging
from fastapi import APIRouter, Request, Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from database import get_session
from models import WebhookEvent
from utils.line_client import (
    verify_line_signature, build_flex_carousel, build_location_request, reply_message,
)
from utils.nearby import find_nearby_stores
from utils.nearby_cards import to_store_cards
from utils.time_helpers import now_utc_naive

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["line"])

NEARBY_RADIUS_M = 800
NEARBY_LIMIT = 3


@router.post("/line")
async def line_webhook(
    request: Request,
    x_line_signature: str = Header(None),
    session: AsyncSession = Depends(get_session),
):
    if not os.getenv("LINE_CHANNEL_SECRET") or not os.getenv("LINE_CHANNEL_ACCESS_TOKEN"):
        raise HTTPException(status_code=503, detail="LINE 미구성")

    raw = await request.body()
    if not verify_line_signature(raw, x_line_signature):
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid JSON")

    for ev in payload.get("events", []):
        try:
            await _handle_event(ev, session)
        except Exception:
            logger.exception("[line] event 처리 실패")  # LINE에는 200 유지
    return {"status": "ok"}


async def _dedupe(ev: dict, session: AsyncSession) -> bool:
    """webhookEventId 멱등성. 중복이면 True. (PII 미저장: payload_raw 생략)"""
    event_id = ev.get("webhookEventId")
    if not event_id:
        return False
    stmt = (
        pg_insert(WebhookEvent.__table__)
        .values(provider="line", event_id=f"line:{event_id}",
                signature_valid=True, processed=False, received_at=now_utc_naive())
        .on_conflict_do_nothing(index_elements=["event_id"])
        .returning(WebhookEvent.__table__.c.id)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.scalar_one_or_none() is None


async def _handle_event(ev: dict, session: AsyncSession):
    reply_token = ev.get("replyToken")
    etype = ev.get("type")

    if await _dedupe(ev, session):
        return

    if etype == "message" and ev.get("message", {}).get("type") == "location":
        lat = ev["message"].get("latitude")
        lng = ev["message"].get("longitude")
        if lat is None or lng is None or not reply_token:
            return
        stores = await find_nearby_stores(session, lat, lng, NEARBY_RADIUS_M, limit=NEARBY_LIMIT)
        cards = to_store_cards(stores)
        await reply_message(reply_token, [build_flex_carousel(cards)])
        return

    if etype in ("follow",) or (etype == "message" and ev.get("message", {}).get("type") == "text"):
        if reply_token:
            await reply_message(reply_token, [build_location_request()])
        return

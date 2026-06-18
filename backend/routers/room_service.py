"""호텔 모드 — 객실(손님)↔스태프 채팅 API.

스레드는 (store_id, room_number) 로 식별한다(Order.table_number 와 동일 규약).
손님 엔드포인트는 객실 QR 기반 공개, 스태프 엔드포인트는 require_staff_or_admin + 매장 스코프.
실시간은 기존 utils.events.emit(WebSocket) 재사용 — 매장 전체(스태프) + 해당 객실(손님) 양쪽 broadcast.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import RoomMessage, RoomMessageSenderType
from utils.jwt import require_staff_or_admin
from utils import events

router = APIRouter(prefix="/room-chat", tags=["room-chat"])


class ChatIn(BaseModel):
    content: str


def _serialize(m: RoomMessage) -> dict:
    return {
        "id": m.id,
        "room_number": m.room_number,
        "sender_type": m.sender_type,
        "content": m.content,
        "is_read": m.is_read,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


async def _thread(session: AsyncSession, store_id: int, room_number: str):
    res = await session.execute(
        select(RoomMessage)
        .where(RoomMessage.store_id == store_id, RoomMessage.room_number == room_number)
        .order_by(RoomMessage.created_at)
    )
    return res.scalars().all()


async def _emit_room_chat(session: AsyncSession, store_id: int, room_number: str, m: RoomMessage):
    payload = {"room_number": room_number, "message": _serialize(m)}
    # 매장 전체(스태프) + 해당 객실(손님 customer 채널) 양쪽으로 통지
    await events.emit(session, store_id, "ROOM_CHAT", payload)
    await events.emit(session, store_id, "ROOM_CHAT", payload, table_number=room_number)


def _clean(content: str) -> str:
    content = (content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="empty content")
    return content[:2000]


@router.get("/{store_id}/{room_number}")
async def list_room_chat(store_id: int, room_number: str,
                         session: AsyncSession = Depends(get_session)):
    return [_serialize(m) for m in await _thread(session, store_id, room_number)]


@router.post("/{store_id}/{room_number}")
async def guest_post(store_id: int, room_number: str, body: ChatIn,
                     session: AsyncSession = Depends(get_session)):
    m = RoomMessage(store_id=store_id, room_number=room_number,
                    sender_type=RoomMessageSenderType.GUEST, content=_clean(body.content))
    session.add(m)
    await session.commit()
    await session.refresh(m)
    await _emit_room_chat(session, store_id, room_number, m)
    return _serialize(m)


@router.post("/{store_id}/{room_number}/reply")
async def staff_reply(store_id: int, room_number: str, body: ChatIn,
                      session: AsyncSession = Depends(get_session),
                      auth_store=Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    m = RoomMessage(store_id=store_id, room_number=room_number,
                    sender_type=RoomMessageSenderType.STAFF, content=_clean(body.content))
    session.add(m)
    await session.commit()
    await session.refresh(m)
    await _emit_room_chat(session, store_id, room_number, m)
    return _serialize(m)


@router.post("/{store_id}/{room_number}/read")
async def mark_read(store_id: int, room_number: str,
                    session: AsyncSession = Depends(get_session),
                    auth_store=Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    for m in await _thread(session, store_id, room_number):
        if not m.is_read and m.sender_type == RoomMessageSenderType.GUEST:
            m.is_read = True
            session.add(m)
    await session.commit()
    return {"status": "ok"}


# 경로 주의: /{store_id}/{room_number} (2세그먼트 공개 조회)와 충돌하지 않도록
# literal "staff" 를 앞세운 distinct 경로 사용. (FastAPI 는 선언 순서로 매칭하므로
# /{store_id}/active 로 두면 공개 조회가 가려 인증/스코프가 우회됨.)
@router.get("/staff/{store_id}/active")
async def active_threads(store_id: int,
                         session: AsyncSession = Depends(get_session),
                         auth_store=Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    res = await session.execute(
        select(RoomMessage).where(RoomMessage.store_id == store_id)
        .order_by(RoomMessage.created_at)
    )
    by_room: dict[str, dict] = {}
    for m in res.scalars().all():
        d = by_room.setdefault(m.room_number, {"room_number": m.room_number, "unread": 0, "last": None})
        if not m.is_read and m.sender_type == RoomMessageSenderType.GUEST:
            d["unread"] += 1
        d["last"] = _serialize(m)
    return list(by_room.values())

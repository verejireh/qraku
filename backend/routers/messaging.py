from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func, col
from typing import Optional, List
from database import get_session
from models import Message, Announcement, Store, MessageSenderType
from utils.jwt import require_admin
from datetime import datetime

router = APIRouter(prefix="/messaging", tags=["messaging"])


# ── Pydantic schemas ──────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    content: str

class CreateAnnouncementRequest(BaseModel):
    title: str
    content: str
    is_important: bool = False


# ═══════════════════════════════════════════════════════════════════
# Admin (Store Owner) Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/messages/{store_id}")
async def get_messages(
    store_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """Get all messages for a store's conversation."""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    stmt = select(Message).where(Message.store_id == store_id).order_by(Message.created_at.asc())
    result = await session.execute(stmt)
    messages = result.scalars().all()

    # Mark super_admin messages as read
    for msg in messages:
        if msg.sender_type == MessageSenderType.SUPER_ADMIN and not msg.is_read:
            msg.is_read = True
            session.add(msg)
    await session.commit()

    return [
        {
            "id": m.id,
            "sender_type": m.sender_type,
            "content": m.content,
            "is_read": m.is_read,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.post("/messages/{store_id}")
async def send_message_from_admin(
    store_id: int,
    req: SendMessageRequest,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """Admin sends a message to super admin."""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    msg = Message(
        store_id=store_id,
        sender_type=MessageSenderType.ADMIN,
        content=req.content,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return {"id": msg.id, "status": "sent"}


@router.get("/announcements")
async def get_announcements(session: AsyncSession = Depends(get_session)):
    """Get all announcements (public, no auth required for admin side)."""
    stmt = select(Announcement).order_by(Announcement.created_at.desc())
    result = await session.execute(stmt)
    return [
        {
            "id": a.id,
            "title": a.title,
            "content": a.content,
            "is_important": a.is_important,
            "created_at": a.created_at.isoformat(),
        }
        for a in result.scalars().all()
    ]


@router.get("/unread-count/{store_id}")
async def get_unread_count(
    store_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """Get unread message count for a store."""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    unread = (await session.execute(
        select(func.count(Message.id)).where(
            Message.store_id == store_id,
            Message.sender_type == MessageSenderType.SUPER_ADMIN,
            Message.is_read == False
        )
    )).scalar() or 0

    return {"unread_messages": unread}


# ═══════════════════════════════════════════════════════════════════
# Super Admin Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/admin/conversations")
async def get_all_conversations(session: AsyncSession = Depends(get_session)):
    """Get conversation list with latest message for each store."""
    # Get all stores that have messages
    stmt = (
        select(
            Message.store_id,
            func.max(Message.created_at).label("last_at"),
            func.count(Message.id).label("total"),
        )
        .group_by(Message.store_id)
        .order_by(func.max(Message.created_at).desc())
    )
    result = await session.execute(stmt)
    rows = result.all()

    conversations = []
    for row in rows:
        store = await session.get(Store, row.store_id)
        store_name = store.name if store else f"Store #{row.store_id}"

        # Get latest message
        latest_stmt = (
            select(Message)
            .where(Message.store_id == row.store_id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        latest_res = await session.execute(latest_stmt)
        latest_msg = latest_res.scalar_one_or_none()

        # Unread count (admin messages that super_admin hasn't read)
        unread = (await session.execute(
            select(func.count(Message.id)).where(
                Message.store_id == row.store_id,
                Message.sender_type == MessageSenderType.ADMIN,
                Message.is_read == False
            )
        )).scalar() or 0

        conversations.append({
            "store_id": row.store_id,
            "store_name": store_name,
            "last_message": latest_msg.content[:80] if latest_msg else "",
            "last_sender": latest_msg.sender_type if latest_msg else None,
            "last_at": latest_msg.created_at.isoformat() if latest_msg else None,
            "unread_count": unread,
            "total_messages": row.total,
        })

    return conversations


@router.get("/admin/messages/{store_id}")
async def get_messages_super(store_id: int, session: AsyncSession = Depends(get_session)):
    """Super admin: get all messages for a store."""
    stmt = select(Message).where(Message.store_id == store_id).order_by(Message.created_at.asc())
    result = await session.execute(stmt)
    messages = result.scalars().all()

    # Mark admin messages as read by super admin
    for msg in messages:
        if msg.sender_type == MessageSenderType.ADMIN and not msg.is_read:
            msg.is_read = True
            session.add(msg)
    await session.commit()

    store = await session.get(Store, store_id)

    return {
        "store_name": store.name if store else f"Store #{store_id}",
        "messages": [
            {
                "id": m.id,
                "sender_type": m.sender_type,
                "content": m.content,
                "is_read": m.is_read,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


@router.post("/admin/messages/{store_id}")
async def send_message_from_super(
    store_id: int,
    req: SendMessageRequest,
    session: AsyncSession = Depends(get_session)
):
    """Super admin sends a reply to a store."""
    msg = Message(
        store_id=store_id,
        sender_type=MessageSenderType.SUPER_ADMIN,
        content=req.content,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return {"id": msg.id, "status": "sent"}


@router.post("/admin/announcements")
async def create_announcement(
    req: CreateAnnouncementRequest,
    session: AsyncSession = Depends(get_session)
):
    """Super admin creates a global announcement."""
    ann = Announcement(
        title=req.title,
        content=req.content,
        is_important=req.is_important,
    )
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"id": ann.id, "status": "created"}


@router.delete("/admin/announcements/{ann_id}")
async def delete_announcement(ann_id: int, session: AsyncSession = Depends(get_session)):
    """Super admin deletes an announcement."""
    ann = await session.get(Announcement, ann_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await session.delete(ann)
    await session.commit()
    return {"status": "deleted"}

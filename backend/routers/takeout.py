"""
Takeout Time Query API
손님이 조리 시간을 문의하고, 스태프가 응답 → 합의 → 결제 진행
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel
from database import get_session
from models import TakeoutTimeQuery, Store
from datetime import datetime
import json

router = APIRouter(prefix="/takeout", tags=["takeout"])


class TimeQueryCreate(BaseModel):
    shop_id: str
    guest_uuid: str
    items_snapshot: str       # JSON string of cart items
    total_amount: float
    query_type: str           # 'ask_available' | 'ask_specific'
    requested_time: Optional[str] = None  # HH:MM — ask_specific 시에만


class StaffResponse(BaseModel):
    response_type: str        # 'minutes' | 'set_time' | 'decline'
    minutes: Optional[int] = None      # response_type='minutes': N분 후 가능
    set_time: Optional[str] = None     # response_type='set_time': HH:MM 가능
    message: Optional[str] = None


class GuestConfirm(BaseModel):
    accept: bool
    counter_time: Optional[str] = None  # 손님이 반문할 때 (거절 시 대안 시간)


# ── 손님: 조리 시간 문의 생성 ──────────────────────────────────────────────
@router.post("/time-query")
async def create_time_query(body: TimeQueryCreate, session: AsyncSession = Depends(get_session)):
    # 같은 guest_uuid의 pending 문의가 있으면 재활용 (중복 방지)
    existing = await session.execute(
        select(TakeoutTimeQuery)
        .where(TakeoutTimeQuery.guest_uuid == body.guest_uuid)
        .where(TakeoutTimeQuery.shop_id == body.shop_id)
        .where(TakeoutTimeQuery.status == "pending")
    )
    old = existing.scalar_one_or_none()
    if old:
        old.items_snapshot = body.items_snapshot
        old.total_amount = body.total_amount
        old.query_type = body.query_type
        old.requested_time = body.requested_time
        old.created_at = datetime.utcnow()
        session.add(old)
        await session.commit()
        await session.refresh(old)
        await _broadcast(old, session)
        return {"id": old.id, "status": old.status}

    query = TakeoutTimeQuery(
        shop_id=body.shop_id,
        guest_uuid=body.guest_uuid,
        items_snapshot=body.items_snapshot,
        total_amount=body.total_amount,
        query_type=body.query_type,
        requested_time=body.requested_time,
    )
    session.add(query)
    await session.commit()
    await session.refresh(query)
    await _broadcast(query, session)
    return {"id": query.id, "status": query.status}


# ── 손님: 문의 상태 폴링 ──────────────────────────────────────────────────
@router.get("/time-query/status")
async def get_query_status(
    guest_uuid: str,
    shop_id: str,
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(TakeoutTimeQuery)
        .where(TakeoutTimeQuery.guest_uuid == guest_uuid)
        .where(TakeoutTimeQuery.shop_id == shop_id)
        .order_by(TakeoutTimeQuery.created_at.desc())
    )
    q = result.scalars().first()
    if not q:
        return {"status": "none"}
    return {
        "id": q.id,
        "status": q.status,
        "query_type": q.query_type,
        "requested_time": q.requested_time,
        "staff_response": q.staff_response,
        "agreed_time": q.agreed_time,
        "total_amount": q.total_amount,
        "items_snapshot": q.items_snapshot,
    }


# ── 스태프: 미응답 문의 목록 ──────────────────────────────────────────────
@router.get("/time-query/pending/{shop_id}")
async def list_pending_queries(shop_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(TakeoutTimeQuery)
        .where(TakeoutTimeQuery.shop_id == shop_id)
        .where(TakeoutTimeQuery.status.in_(["pending", "responded"]))
        .order_by(TakeoutTimeQuery.created_at.asc())
    )
    items = result.scalars().all()
    out = []
    for q in items:
        try:
            snapshot = json.loads(q.items_snapshot)
        except Exception:
            snapshot = []
        out.append({
            "id": q.id,
            "guest_uuid": q.guest_uuid,
            "query_type": q.query_type,
            "requested_time": q.requested_time,
            "status": q.status,
            "staff_response": q.staff_response,
            "total_amount": q.total_amount,
            "items": snapshot,
            "created_at": q.created_at.isoformat(),
        })
    return out


# ── 스태프: 응답 보내기 ───────────────────────────────────────────────────
@router.post("/time-query/{query_id}/respond")
async def staff_respond(query_id: int, body: StaffResponse, session: AsyncSession = Depends(get_session)):
    q = await session.get(TakeoutTimeQuery, query_id)
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")

    if body.response_type == "decline":
        q.status = "declined"
        q.staff_response = body.message or "申し訳ございません。現在テイクアウトは承れません。"
    elif body.response_type == "minutes":
        now = datetime.utcnow()
        mins = body.minutes or 15
        ready_dt = now.replace(second=0, microsecond=0)
        ready_dt = ready_dt.replace(minute=ready_dt.minute + mins)
        # 분 overflow 처리
        from datetime import timedelta
        ready_dt = datetime.utcnow() + timedelta(minutes=mins)
        t_str = ready_dt.strftime("%H:%M")
        q.status = "responded"
        q.staff_response = f"{mins}分後（{t_str}頃）にご用意できます。"
        q.agreed_time = t_str
    elif body.response_type == "set_time":
        q.status = "responded"
        q.staff_response = f"{body.set_time}にご用意できます。"
        q.agreed_time = body.set_time

    session.add(q)
    await session.commit()
    await session.refresh(q)
    await _broadcast(q, session)
    return {"id": q.id, "status": q.status, "agreed_time": q.agreed_time}


# ── 손님: 합의 확인 / 재협의 ─────────────────────────────────────────────
@router.post("/time-query/{query_id}/confirm")
async def guest_confirm(query_id: int, body: GuestConfirm, session: AsyncSession = Depends(get_session)):
    q = await session.get(TakeoutTimeQuery, query_id)
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")

    if body.accept:
        q.status = "agreed"
    else:
        # 손님이 거절하고 대안 시간 제시
        if body.counter_time:
            q.requested_time = body.counter_time
            q.query_type = "ask_specific"
            q.status = "pending"
            q.staff_response = None
            q.agreed_time = None
        else:
            q.status = "declined"

    session.add(q)
    await session.commit()
    await session.refresh(q)
    await _broadcast(q, session)
    return {"id": q.id, "status": q.status, "agreed_time": q.agreed_time}


# ── 내부: WebSocket 브로드캐스트 헬퍼 ────────────────────────────────────
async def _broadcast(q: TakeoutTimeQuery, session: AsyncSession):
    try:
        from utils.websocket import manager
        import json as _json
        # store_id 조회
        store_result = await session.execute(select(Store).where(Store.slug == q.shop_id))
        store = store_result.scalar_one_or_none()
        if not store:
            try:
                store_result = await session.execute(select(Store).where(Store.id == int(q.shop_id)))
                store = store_result.scalar_one_or_none()
            except Exception:
                pass
        if store:
            msg = _json.dumps({
                "type": "TAKEOUT_QUERY_UPDATE",
                "query_id": q.id,
                "guest_uuid": q.guest_uuid,
                "status": q.status,
                "agreed_time": q.agreed_time,
                "staff_response": q.staff_response,
            })
            await manager.broadcast(msg, store.id)
    except Exception as e:
        print(f"[Takeout WS] broadcast failed: {e}")

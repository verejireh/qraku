"""
食べ放題 / 飲み放題 세션 관리 라우터.
- 스태프: 테이블에 코스(MenuGroup type=COURSE) 적용 시작/종료
- 손님: 자기 테이블의 활성 세션 조회 (대상 메뉴 + 잔여 시간)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta

from database import get_session
from models import (
    TabehoudaiSession, MenuGroup, MenuGroupItem, MenuGroupType,
    Store, Table,
)
from utils.jwt import require_admin

router = APIRouter(prefix="/tabehoudai", tags=["tabehoudai"])


# ── Schemas ──────────────────────────────────────────────────────────
class CourseGroupRead(BaseModel):
    id: int
    name: str
    price_per_person: int
    duration_minutes: int
    last_order_minutes: int
    course_type: Optional[str]
    menu_ids: List[int]


class SessionStartRequest(BaseModel):
    table_id: int
    group_id: int
    num_people: int


class SessionRead(BaseModel):
    id: int
    table_id: int
    group_id: int
    group_name: str
    num_people: int
    started_at: datetime
    expires_at: datetime
    status: str
    seconds_remaining: int           # 잔여 초 (만료 후엔 음수)
    is_last_order: bool              # ラストオーダー 시점 도달 여부
    course_type: Optional[str]
    price_per_person: int
    duration_minutes: int
    last_order_minutes: int
    menu_ids: List[int]              # 코스 대상 메뉴 ID 목록


# ── Helpers ──────────────────────────────────────────────────────────
async def _resolve_store(store_id: str, session: AsyncSession) -> Store:
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


async def _build_session_read(s: TabehoudaiSession, session: AsyncSession) -> SessionRead:
    group = await session.get(MenuGroup, s.group_id)
    if not group:
        raise HTTPException(status_code=500, detail="Course group missing")
    items_res = await session.execute(
        select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == s.group_id)
    )
    menu_ids = [r[0] for r in items_res.all()]
    now = datetime.utcnow()
    seconds_remaining = int((s.expires_at - now).total_seconds())
    is_last_order = seconds_remaining <= group.last_order_minutes * 60 and seconds_remaining > 0
    return SessionRead(
        id=s.id,
        table_id=s.table_id,
        group_id=s.group_id,
        group_name=group.name,
        num_people=s.num_people,
        started_at=s.started_at,
        expires_at=s.expires_at,
        status=s.status,
        seconds_remaining=seconds_remaining,
        is_last_order=is_last_order,
        course_type=group.course_type,
        price_per_person=group.price_per_person,
        duration_minutes=group.duration_minutes,
        last_order_minutes=group.last_order_minutes,
        menu_ids=menu_ids,
    )


# ── 스태프용: 코스 그룹 목록 ────────────────────────────────────────
@router.get("/courses/{store_id}", response_model=List[CourseGroupRead])
async def list_courses(
    store_id: str,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """매장의 모든 COURSE 그룹 (食べ放題/飲み放題)"""
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await session.execute(
        select(MenuGroup).where(
            MenuGroup.store_id == store.id,
            MenuGroup.group_type == MenuGroupType.COURSE,
        ).order_by(MenuGroup.sort_order, MenuGroup.id)
    )
    groups = result.scalars().all()
    out = []
    for g in groups:
        items_res = await session.execute(
            select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == g.id)
        )
        out.append(CourseGroupRead(
            id=g.id, name=g.name,
            price_per_person=g.price_per_person,
            duration_minutes=g.duration_minutes,
            last_order_minutes=g.last_order_minutes,
            course_type=g.course_type,
            menu_ids=[r[0] for r in items_res.all()],
        ))
    return out


# ── 세션 시작 (스태프) ──────────────────────────────────────────────
@router.post("/sessions/{store_id}", response_model=SessionRead)
async def start_session(
    store_id: str,
    body: SessionStartRequest,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # 검증
    table = await session.get(Table, body.table_id)
    if not table or table.store_id != store.id:
        raise HTTPException(status_code=404, detail="Table not found")
    group = await session.get(MenuGroup, body.group_id)
    if not group or group.store_id != store.id or group.group_type != MenuGroupType.COURSE:
        raise HTTPException(status_code=404, detail="Course group not found")
    if body.num_people < 1:
        raise HTTPException(status_code=400, detail="num_people must be >= 1")
    if body.num_people > 50:
        raise HTTPException(status_code=400, detail="num_people must be <= 50")

    # 같은 테이블에 활성 세션이 있으면 거부
    existing = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == body.table_id,
            TabehoudaiSession.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="既にアクティブなコースがあります")

    now = datetime.utcnow()
    new_session = TabehoudaiSession(
        table_id=body.table_id,
        group_id=body.group_id,
        num_people=body.num_people,
        started_at=now,
        expires_at=now + timedelta(minutes=group.duration_minutes),
        status="active",
    )
    session.add(new_session)
    await session.commit()
    await session.refresh(new_session)
    return await _build_session_read(new_session, session)


# ── 세션 종료/정산 (스태프) ──────────────────────────────────────────
@router.post("/sessions/{store_id}/{session_id}/end", response_model=SessionRead)
async def end_session(
    store_id: str,
    session_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    s = await session.get(TabehoudaiSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    table = await session.get(Table, s.table_id)
    if not table or table.store_id != store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    s.status = "settled"
    s.settled_at = datetime.utcnow()
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return await _build_session_read(s, session)


# ── 활성 세션 조회: 테이블별 (스태프 + 손님 공용) ────────────────────
@router.get("/sessions/active/by-table/{table_id}", response_model=Optional[SessionRead])
async def get_active_by_table(
    table_id: int,
    session: AsyncSession = Depends(get_session),
):
    """
    해당 테이블의 현재 활성 세션 반환. 없으면 null.
    손님 페이지에서도 호출되므로 인증 없음.
    """
    result = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == table_id,
            TabehoudaiSession.status == "active",
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        return None

    # 만료 시각 지났으면 자동 expire 처리
    now = datetime.utcnow()
    if s.expires_at < now:
        s.status = "expired"
        session.add(s)
        await session.commit()
        # 만료된 세션도 한 번은 반환 (UI에서 종료 안내 후 리로드)
        return await _build_session_read(s, session)

    return await _build_session_read(s, session)


# ── 매장 전체 활성 세션 (스태프 대시보드용) ─────────────────────────
@router.get("/sessions/active/{store_id}", response_model=List[SessionRead])
async def list_active_sessions(
    store_id: str,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # 매장 소속 테이블 ID들
    tables_res = await session.execute(select(Table.id).where(Table.store_id == store.id))
    table_ids = [r[0] for r in tables_res.all()]
    if not table_ids:
        return []

    result = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id.in_(table_ids),
            TabehoudaiSession.status == "active",
        )
    )
    sessions_list = result.scalars().all()
    return [await _build_session_read(s, session) for s in sessions_list]

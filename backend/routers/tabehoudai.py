"""
食べ放題 / 飲み放題 세션 관리 라우터.
- 스태프: 테이블에 코스(MenuGroup type=COURSE) 적용 시작/종료
- 손님: 자기 테이블의 활성 세션 조회 (대상 메뉴 + 잔여 시간)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive

from database import get_session
from models import (
    TabehoudaiSession, MenuGroup, MenuGroupItem, MenuGroupType,
    Store, Table, SquareTerminalCheckout,
)
from utils.jwt import require_staff_or_admin

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
    now = now_utc_naive()
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
    admin_store: Store = Depends(require_staff_or_admin),
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
    admin_store: Store = Depends(require_staff_or_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # 검증 — 테이블 행을 잠가(FOR UPDATE) 동시 정산(READY/token=NULL 리셋)과의
    # 경쟁으로 이미 종료된 착석 토큰에 세션이 귀속되는 것을 막는다.
    table_res = await session.execute(
        select(Table).where(Table.id == body.table_id).with_for_update()
    )
    table = table_res.scalar_one_or_none()
    if not table or table.store_id != store.id:
        raise HTTPException(status_code=404, detail="Table not found")
    group = await session.get(MenuGroup, body.group_id)
    if not group or group.store_id != store.id or group.group_type != MenuGroupType.COURSE:
        raise HTTPException(status_code=404, detail="Course group not found")
    if body.num_people < 1:
        raise HTTPException(status_code=400, detail="num_people must be >= 1")
    if body.num_people > 50:
        raise HTTPException(status_code=400, detail="num_people must be <= 50")

    # 빈 테이블에는 코스 시작 불가 — 착석 회차(session_token)에 귀속해야
    # 회전 후 이전 코스가 새 손님에게 적용/청구되는 사고를 막을 수 있다.
    table_status_val = table.status.value if hasattr(table.status, "value") else table.status
    if table_status_val != "OCCUPIED" or not table.session_token:
        raise HTTPException(
            status_code=409,
            detail="お客様の着席(QRセッション)後にコースを開始してください",
        )

    # 같은 테이블에 활성 세션이 있으면 거부 (DB partial unique index 가 최종 방어)
    existing = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == body.table_id,
            TabehoudaiSession.status == "active",
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="既にアクティブなコースがあります")

    # 진행 중인 Square 단말기 결제가 있으면 코스 시작 거부 — 결제 금액 스냅샷
    # 이후 시작된 코스는 청구에서 누락되고 테이블이 종료되지 않는 사고를 막는다.
    terminal_in_progress = await session.execute(
        select(SquareTerminalCheckout.id).where(
            SquareTerminalCheckout.table_id == body.table_id,
            SquareTerminalCheckout.session_token == table.session_token,
            SquareTerminalCheckout.status.in_(
                ["CREATING", "UNKNOWN", "PENDING", "IN_PROGRESS", "CANCEL_REQUESTED"]
            ),
        )
    )
    if terminal_in_progress.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="決済処理中のためコースを開始できません",
        )

    now = now_utc_naive()
    new_session = TabehoudaiSession(
        table_id=body.table_id,
        group_id=body.group_id,
        num_people=body.num_people,
        started_at=now,
        expires_at=now + timedelta(minutes=group.duration_minutes),
        status="active",
        session_token=table.session_token,
    )
    session.add(new_session)
    try:
        await session.commit()
    except IntegrityError:
        # 동시 요청 경쟁 — uq_tabehoudai_active_table 위반
        await session.rollback()
        raise HTTPException(status_code=409, detail="既にアクティブなコースがあります")
    await session.refresh(new_session)
    return await _build_session_read(new_session, session)


# ── 세션 종료 (스태프) ────────────────────────────────────────────────
@router.post("/sessions/{store_id}/{session_id}/end", response_model=SessionRead)
async def end_session(
    store_id: str,
    session_id: int,
    admin_store: Store = Depends(require_staff_or_admin),
    session: AsyncSession = Depends(get_session),
):
    """코스 타이머를 수동 종료. 'expired' 로만 전환하고 'settled'(청구 완료)
    전환은 결제 정산(register/pos)에서만 일어난다 — 종료가 곧 무료 처리가
    되어 코스 요금이 누락되는 사고를 막는다."""
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    s = await session.get(TabehoudaiSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    table = await session.get(Table, s.table_id)
    if not table or table.store_id != store.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if s.status == "active":
        s.status = "expired"
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
    # 현재 착석 회차(table.session_token)에 귀속된 세션만 노출 — 이전 회차의 세션이
    # 새 손님 UI에 보이면서 주문 API(토큰 불일치로 정가 청구)와 어긋나는 것을 막는다.
    table = await session.get(Table, table_id)
    if not table or not table.session_token:
        return None
    result = await session.execute(
        select(TabehoudaiSession).where(
            TabehoudaiSession.table_id == table_id,
            TabehoudaiSession.status == "active",
            TabehoudaiSession.session_token == table.session_token,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        return None

    # 만료 시각 지났으면 자동 expire 처리
    now = now_utc_naive()
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
    admin_store: Store = Depends(require_staff_or_admin),
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

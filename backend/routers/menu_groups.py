"""
Menu Groups Router
- ランチ/ディナー 시간대별 메뉴 (TIME_WINDOW)
- 食べ放題/飲み放題 코스 (COURSE)
- 사장님 수동 토글 그룹 (MANUAL)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime, time

_VALID_COURSE_TYPES = {"food", "drink", "both"}

from database import get_session
from models import MenuGroup, MenuGroupItem, MenuGroupType, Store, Menu
from utils.time_helpers import now_jst
from utils.jwt import require_admin

router = APIRouter(prefix="/menu-groups", tags=["menu-groups"])


# ── Schemas ──────────────────────────────────────────────────────────
def _validate_course_type(v: Optional[str]) -> Optional[str]:
    if v is not None and v not in _VALID_COURSE_TYPES:
        raise ValueError("course_type must be one of food|drink|both")
    return v


class MenuGroupCreate(BaseModel):
    name: str
    group_type: MenuGroupType = MenuGroupType.TIME_WINDOW
    active_from: Optional[str] = None
    active_to: Optional[str] = None
    weekdays: Optional[str] = None
    price_per_person: int = Field(default=0, ge=0, le=1_000_000)
    duration_minutes: int = Field(default=90, ge=1, le=1440)
    last_order_minutes: int = Field(default=10, ge=0, le=1440)
    course_type: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0

    _ck_course = field_validator("course_type")(_validate_course_type)

    @model_validator(mode="after")
    def _ck_last_order(self):
        if self.last_order_minutes >= self.duration_minutes:
            raise ValueError("last_order_minutes must be < duration_minutes")
        return self


class MenuGroupUpdate(BaseModel):
    name: Optional[str] = None
    active_from: Optional[str] = None
    active_to: Optional[str] = None
    weekdays: Optional[str] = None
    price_per_person: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    last_order_minutes: Optional[int] = Field(default=None, ge=0, le=1440)
    course_type: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

    _ck_course = field_validator("course_type")(_validate_course_type)

    @model_validator(mode="after")
    def _ck_last_order(self):
        # 같은 PATCH 에 둘 다 들어온 경우에만 교차 검증 (부분 업데이트 한계)
        if (
            self.last_order_minutes is not None
            and self.duration_minutes is not None
            and self.last_order_minutes >= self.duration_minutes
        ):
            raise ValueError("last_order_minutes must be < duration_minutes")
        return self


class MenuGroupRead(BaseModel):
    id: int
    store_id: int
    name: str
    group_type: MenuGroupType
    active_from: Optional[str] = None
    active_to: Optional[str] = None
    weekdays: Optional[str] = None
    price_per_person: int = 0
    duration_minutes: int = 90
    last_order_minutes: int = 10
    course_type: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0
    menu_ids: List[int] = []


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


async def _to_read(group: MenuGroup, session: AsyncSession) -> MenuGroupRead:
    items_res = await session.execute(
        select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == group.id)
    )
    menu_ids = [row[0] for row in items_res.all()]
    return MenuGroupRead(
        id=group.id,
        store_id=group.store_id,
        name=group.name,
        group_type=group.group_type,
        active_from=group.active_from,
        active_to=group.active_to,
        weekdays=group.weekdays,
        price_per_person=group.price_per_person,
        duration_minutes=group.duration_minutes,
        last_order_minutes=group.last_order_minutes,
        course_type=group.course_type,
        is_active=group.is_active,
        sort_order=group.sort_order,
        menu_ids=menu_ids,
    )


def _is_time_window_active(group: MenuGroup, now: datetime) -> bool:
    """현재 시각이 group의 active_from~active_to 범위 안인지 + weekday 매칭"""
    if group.weekdays:
        wd_map = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        today = wd_map[now.weekday()]
        active_days = [d.strip() for d in group.weekdays.split(",") if d.strip()]
        if today not in active_days:
            return False
    if not group.active_from or not group.active_to:
        return True  # 시간 미설정이면 항상 활성
    try:
        h1, m1 = map(int, group.active_from.split(":"))
        h2, m2 = map(int, group.active_to.split(":"))
        from_t = time(h1, m1)
        to_t = time(h2, m2)
        cur = now.time()
        if from_t <= to_t:
            return from_t <= cur <= to_t
        # 자정 넘는 경우 (22:00~03:00 등)
        return cur >= from_t or cur <= to_t
    except Exception:
        return True


# ── Routes ───────────────────────────────────────────────────────────
@router.get("/{store_id}", response_model=List[MenuGroupRead])
async def list_groups(
    store_id: str,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await session.execute(
        select(MenuGroup).where(MenuGroup.store_id == store.id).order_by(MenuGroup.sort_order, MenuGroup.id)
    )
    groups = result.scalars().all()
    return [await _to_read(g, session) for g in groups]


@router.post("/{store_id}", response_model=MenuGroupRead)
async def create_group(
    store_id: str,
    body: MenuGroupCreate,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    group = MenuGroup(
        store_id=store.id,
        name=body.name,
        group_type=body.group_type,
        active_from=body.active_from,
        active_to=body.active_to,
        weekdays=body.weekdays,
        price_per_person=body.price_per_person,
        duration_minutes=body.duration_minutes,
        last_order_minutes=body.last_order_minutes,
        course_type=body.course_type,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return await _to_read(group, session)


@router.patch("/{store_id}/{group_id}", response_model=MenuGroupRead)
async def update_group(
    store_id: str,
    group_id: int,
    body: MenuGroupUpdate,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    group = await session.get(MenuGroup, group_id)
    if not group or group.store_id != store.id:
        raise HTTPException(status_code=404, detail="Group not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return await _to_read(group, session)


@router.delete("/{store_id}/{group_id}")
async def delete_group(
    store_id: str,
    group_id: int,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    group = await session.get(MenuGroup, group_id)
    if not group or group.store_id != store.id:
        raise HTTPException(status_code=404, detail="Group not found")

    await session.execute(delete(MenuGroupItem).where(MenuGroupItem.group_id == group_id))
    await session.delete(group)
    await session.commit()
    return {"status": "ok"}


# ── 그룹에 속한 메뉴 관리 ────────────────────────────────────────────
class GroupMenusUpdate(BaseModel):
    menu_ids: List[int]


@router.put("/{store_id}/{group_id}/menus", response_model=MenuGroupRead)
async def set_group_menus(
    store_id: str,
    group_id: int,
    body: GroupMenusUpdate,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """그룹에 속할 메뉴 ID 목록을 통째로 교체"""
    store = await _resolve_store(store_id, session)
    if store.id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    group = await session.get(MenuGroup, group_id)
    if not group or group.store_id != store.id:
        raise HTTPException(status_code=404, detail="Group not found")

    # 검증: 모든 menu_ids가 이 매장 소유 메뉴인지
    if body.menu_ids:
        menus_res = await session.execute(
            select(Menu).where(Menu.id.in_(body.menu_ids), Menu.store_id == store.id)
        )
        valid_ids = {m.id for m in menus_res.scalars().all()}
        invalid = set(body.menu_ids) - valid_ids
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid menu_ids: {invalid}")

    # 기존 항목 삭제 후 재삽입
    await session.execute(delete(MenuGroupItem).where(MenuGroupItem.group_id == group_id))
    for mid in body.menu_ids:
        session.add(MenuGroupItem(group_id=group_id, menu_id=mid))
    await session.commit()
    return await _to_read(group, session)


# ── 손님용: 현재 활성 그룹 조회 ─────────────────────────────────────
@router.get("/{store_id}/public/active")
async def list_active_groups_public(
    store_id: str,
    session: AsyncSession = Depends(get_session),
):
    """
    현재 시각 기준으로 활성화된 TIME_WINDOW 그룹 + MANUAL 활성 그룹 ID 반환.
    손님이 메뉴 페이지 진입 시 호출하여, 어떤 메뉴를 보여줄지 결정.
    COURSE 그룹은 별도 (TabehoudaiSession 기반).
    """
    store = await _resolve_store(store_id, session)
    # [2026-05-22] P1 #7 Bug 1 — datetime.now() 는 서버 로컬 (UTC on VM) →
    # active_from/to (JST "11:00" 등) 와 비교 시 9시간 오프셋 버그.
    # now_jst() 로 JST aware 사용 — _is_time_window_active 는 now.time() 만
    # 쓰므로 tz 차이 무시되고 시:분 비교만 수행 (정확).
    now = now_jst()

    result = await session.execute(
        select(MenuGroup).where(
            MenuGroup.store_id == store.id,
            MenuGroup.group_type.in_([MenuGroupType.TIME_WINDOW, MenuGroupType.MANUAL]),
        )
    )
    groups = result.scalars().all()

    active_groups = []
    for g in groups:
        if g.group_type == MenuGroupType.MANUAL:
            if g.is_active:
                active_groups.append(g)
        elif g.group_type == MenuGroupType.TIME_WINDOW:
            if _is_time_window_active(g, now):
                active_groups.append(g)

    # 그룹별 메뉴 ID 모음
    payload = []
    for g in active_groups:
        items = await session.execute(
            select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == g.id)
        )
        payload.append({
            "id": g.id,
            "name": g.name,
            "group_type": g.group_type,
            "menu_ids": [row[0] for row in items.all()],
        })
    return {"active_groups": payload}


# ── 공개 홈페이지용: 모든 그룹 (TIME_WINDOW + MANUAL active + COURSE) ──────
@router.get("/{store_id}/public/homepage")
async def list_groups_for_public_homepage(
    store_id: str,
    session: AsyncSession = Depends(get_session),
):
    """
    qraku.com/{shop_id} 공개 홈페이지 표시용.
    - TIME_WINDOW: 활성 여부 무관 (시간대 광고용)
    - MANUAL: is_active=True 만
    - COURSE: 모두 (식당 코스 메뉴 광고용)
    """
    store = await _resolve_store(store_id, session)

    result = await session.execute(
        select(MenuGroup).where(MenuGroup.store_id == store.id).order_by(MenuGroup.sort_order)
    )
    groups = result.scalars().all()

    payload = []
    for g in groups:
        if g.group_type == MenuGroupType.MANUAL and not g.is_active:
            continue  # 비활성 MANUAL 은 표시 안 함
        items = await session.execute(
            select(MenuGroupItem.menu_id).where(MenuGroupItem.group_id == g.id)
        )
        menu_ids = [row[0] for row in items.all()]
        if not menu_ids:
            continue  # 메뉴가 없으면 스킵
        payload.append({
            "id": g.id,
            "name": g.name,
            "group_type": g.group_type.value if hasattr(g.group_type, "value") else g.group_type,
            "active_from": g.active_from,
            "active_to": g.active_to,
            "weekdays": g.weekdays,
            "price_per_person": g.price_per_person,
            "duration_minutes": g.duration_minutes,
            "course_type": g.course_type,
            "sort_order": g.sort_order,
            "menu_ids": menu_ids,
        })
    return payload

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
from database import get_session
from models import Menu, SystemConfig, Store, MenuGroup, MenuGroupItem, MenuGroupType
import logging

router = APIRouter(prefix="/menus", tags=["menus"])

from utils.translation import translate_text
from utils.jwt import require_admin

logger = logging.getLogger(__name__)

# 기본 이미지 URL (업로드 실패 시 폴백)
DEFAULT_MENU_IMAGE = "https://via.placeholder.com/400x300.webp?text=No+Image"


# ──────────────────────────────────────────────
# 이미지 업로드 전용 엔드포인트
# ──────────────────────────────────────────────

@router.post("/upload-image")
async def upload_menu_image(
    file: UploadFile = File(...),
    store_id: int = Form(...),
    admin_store: Store = Depends(require_admin),
):
    # 교차 매장 접근 방지
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    """
    메뉴 이미지를 받아 자동 리사이즈(max 1024px) + WebP 변환 후
    GCS에 업로드하고 최적화된 공개 URL을 반환합니다.
    """
    # 파일 유효성 검사
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="이미지 파일만 업로드할 수 있습니다. (jpg, png, webp 등)"
        )

    # 파일 크기 제한 (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="파일 크기가 10MB를 초과합니다."
        )

    try:
        from services.gcs_client import upload_image_to_gcs
        public_url = upload_image_to_gcs(
            file_bytes=file_bytes,
            store_id=store_id,
            filename_prefix="menu",
        )
        return {"image_url": public_url}

    except ValueError as e:
        # 이미지 열기/처리 실패 (손상된 파일 등)
        logger.warning(f"이미지 처리 실패 (store_id={store_id}): {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except RuntimeError as e:
        # GCS 업로드 실패
        logger.error(f"GCS 업로드 실패 (store_id={store_id}): {e}")
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        logger.error(f"이미지 업로드 중 예상치 못한 에러 (store_id={store_id}): {e}")
        raise HTTPException(
            status_code=500,
            detail="이미지 업로드 중 오류가 발생했습니다. 다시 시도해주세요."
        )


@router.post("/", response_model=Menu)
async def create_menu(menu: Menu, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 교차 매장 접근 방지
    if menu.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    # image_url이 없으면 기본 이미지 적용
    if not menu.image_url:
        menu.image_url = DEFAULT_MENU_IMAGE

    session.add(menu)
    await session.commit()
    await session.refresh(menu)

    # 번역은 Dramatiq 워커에 위임 (응답 시간 < 200ms 보장).
    # 워커가 완료 시 WS `TRANSLATION_COMPLETED` 이벤트로 클라이언트에 통지.
    from backend.workers.translate_tasks import translate_menu as translate_menu_task
    translate_menu_task.send(menu.id)

    return menu

@router.post("/{store_id}/translate-all")
async def translate_all_menus(store_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    """Bulk translate all menus for a specific store that are missing translations."""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    config = await session.get(SystemConfig, "GEMINI_API_KEY")
    api_key = config.value if config else None
    
    stmt = select(Menu).where(Menu.store_id == store_id)
    result = await session.execute(stmt)
    menus = result.scalars().all()
    
    updated_count = 0
    for menu in menus:
        changed = False
        # Translate Names
        if menu.name_jp:
            if not menu.name_ko:
                menu.name_ko = translate_text(menu.name_jp, 'ko', api_key=api_key)
                changed = True
            if not menu.name_en:
                menu.name_en = translate_text(menu.name_jp, 'en', api_key=api_key)
                changed = True
            if not menu.name_zh:
                menu.name_zh = translate_text(menu.name_jp, 'zh', api_key=api_key)
                changed = True
        
        # Translate Descriptions
        if menu.description_jp:
            if not menu.description_ko:
                menu.description_ko = translate_text(menu.description_jp, 'ko', api_key=api_key)
                changed = True
            if not menu.description_en:
                menu.description_en = translate_text(menu.description_jp, 'en', api_key=api_key)
                changed = True
            if not menu.description_zh:
                menu.description_zh = translate_text(menu.description_jp, 'zh', api_key=api_key)
                changed = True
                
        # Translate Options
        import json
        if menu.options and menu.options != "[]":
            try:
                options_data = json.loads(menu.options)
                options_changed = False
                for opt_group in options_data:
                    orig_group = opt_group.get('group_name', '')
                    if orig_group:
                        if 'translations' not in opt_group:
                            opt_group['translations'] = {}
                        for lang in ['ko', 'en', 'zh']:
                            if lang not in opt_group['translations']:
                                opt_group['translations'][lang] = translate_text(orig_group, lang, api_key=api_key)
                                options_changed = True
                    
                    for choice in opt_group.get('choices', []):
                        orig_choice = choice.get('name', '')
                        if orig_choice:
                            if 'translations' not in choice:
                                choice['translations'] = {}
                            for lang in ['ko', 'en', 'zh']:
                                if lang not in choice['translations']:
                                    choice['translations'][lang] = translate_text(orig_choice, lang, api_key=api_key)
                                    options_changed = True
                if options_changed:
                    menu.options = json.dumps(options_data, ensure_ascii=False)
                    changed = True
            except Exception as e:
                print(f"Error bulk translating options for menu {menu.id}: {e}")
        
        if changed:
            session.add(menu)
            updated_count += 1
            
    if updated_count > 0:
        await session.commit()
        
    return {"status": "success", "updated_count": updated_count}

def _is_time_window_active(group: MenuGroup, now: datetime) -> bool:
    """현재 시각이 group의 active_from~active_to 범위 안인지 + weekday 매칭"""
    if group.weekdays:
        wd_map = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        today = wd_map[now.weekday()]
        active_days = [d.strip() for d in group.weekdays.split(",") if d.strip()]
        if today not in active_days:
            return False
    if not group.active_from or not group.active_to:
        return True
    try:
        from datetime import time as _time
        h1, m1 = map(int, group.active_from.split(":"))
        h2, m2 = map(int, group.active_to.split(":"))
        from_t = _time(h1, m1)
        to_t = _time(h2, m2)
        cur = now.time()
        if from_t <= to_t:
            return from_t <= cur <= to_t
        return cur >= from_t or cur <= to_t
    except Exception:
        return True


@router.get("/{store_id}", response_model=List[Menu])
async def read_menus(
    store_id: str,
    filter_groups: bool = False,
    session: AsyncSession = Depends(get_session),
):
    """
    매장 메뉴 목록 조회.
    - filter_groups=False (기본, admin용): 모든 메뉴 반환
    - filter_groups=True (손님용): TIME_WINDOW/MANUAL 그룹 활성 여부에 따라 필터링
    """
    # Resolve store
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        store_stmt = select(Store).where(Store.slug == store_id)
        store_res = await session.execute(store_stmt)
        store = store_res.scalar_one_or_none()
    if not store:
        return []

    stmt = select(Menu).where(Menu.store_id == store.id)
    result = await session.execute(stmt)
    menus = result.scalars().all()

    if not filter_groups:
        return menus

    # 손님용 필터링: 그룹 멤버십 기반
    groups_res = await session.execute(
        select(MenuGroup).where(
            MenuGroup.store_id == store.id,
            MenuGroup.group_type.in_([MenuGroupType.TIME_WINDOW, MenuGroupType.MANUAL]),
        )
    )
    groups = groups_res.scalars().all()

    items_res = await session.execute(
        select(MenuGroupItem.group_id, MenuGroupItem.menu_id)
        .join(MenuGroup, MenuGroup.id == MenuGroupItem.group_id)
        .where(MenuGroup.store_id == store.id)
    )
    # menu_id -> set of group_ids it belongs to
    menu_to_groups: dict[int, set[int]] = {}
    for gid, mid in items_res.all():
        menu_to_groups.setdefault(mid, set()).add(gid)

    now = datetime.now()
    active_group_ids = set()
    for g in groups:
        if g.group_type == MenuGroupType.MANUAL and g.is_active:
            active_group_ids.add(g.id)
        elif g.group_type == MenuGroupType.TIME_WINDOW and _is_time_window_active(g, now):
            active_group_ids.add(g.id)

    # 모든 TIME_WINDOW + MANUAL 그룹 ID (제약 그룹들)
    restricted_group_ids = {g.id for g in groups}

    filtered = []
    for m in menus:
        membership = menu_to_groups.get(m.id, set())
        # 제약 그룹에 속하지 않으면 항상 노출
        if not membership.intersection(restricted_group_ids):
            filtered.append(m)
            continue
        # 제약 그룹 중 하나라도 현재 활성이면 노출
        if membership.intersection(active_group_ids):
            filtered.append(m)
    return filtered

@router.patch("/{menu_id}/availability", response_model=Menu)
async def toggle_availability(menu_id: int, is_available: bool, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    menu = await session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    # 교차 매장 IDOR 방지
    if menu.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    menu.is_available = is_available
    session.add(menu)
    await session.commit()
    await session.refresh(menu)
    return menu


# ──────────────────────────────────────────────
# 메뉴 수정 API (PUT)
# ──────────────────────────────────────────────

@router.put("/{menu_id}", response_model=Menu)
async def update_menu(menu_id: int, updates: dict, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    """
    메뉴 정보를 수정합니다.
    image_url이 전달되면 업데이트, 없으면 기존 값을 유지합니다.
    """
    menu = await session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    # 교차 매장 IDOR 방지
    if menu.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    # 허용된 필드만 업데이트
    allowed_fields = {
        "name_jp", "name_ko", "name_en", "name_zh",
        "description_jp", "description_ko", "description_en", "description_zh",
        "price", "category", "image_url", "is_active", "is_available",
        "is_takeout_available", "is_daily_special", "special_price",
        "options", "extra_translations", "sort_order", "allergens",
        "stock_today_total", "stock_today_sold",
    }

    for field, value in updates.items():
        if field in allowed_fields:
            setattr(menu, field, value)

    session.add(menu)
    await session.commit()
    await session.refresh(menu)
    return menu


@router.delete("/{menu_id}")
async def delete_menu(menu_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    menu = await session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    # 교차 매장 IDOR 방지
    if menu.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    await session.delete(menu)
    await session.commit()
    return {"message": "Menu deleted successfully"}


from utils.jwt import require_admin  # already imported via other endpoints; safe re-import

@router.patch("/{menu_id}/stock")
async def update_stock(
    menu_id: int,
    stock_today_total: Optional[int] = None,
    reset_sold: bool = False,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """今日の仕込み量設定 + 販売数リセット (SPC-09)."""
    menu = await session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    if menu.store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")

    if stock_today_total is not None:
        menu.stock_today_total = stock_today_total if stock_today_total > 0 else None
    if reset_sold:
        menu.stock_today_sold = 0
        if menu.stock_today_total is not None:
            menu.is_available = True  # 재오픈

    session.add(menu)
    await session.commit()
    await session.refresh(menu)
    remaining = (menu.stock_today_total - menu.stock_today_sold) if menu.stock_today_total else None
    return {
        "menu_id": menu.id,
        "stock_today_total": menu.stock_today_total,
        "stock_today_sold": menu.stock_today_sold,
        "remaining": remaining,
        "is_available": menu.is_available,
    }


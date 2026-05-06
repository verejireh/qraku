"""
Shop ID (slug) validation & availability check.
- 형식: 소문자/숫자/하이픈만, 3~30자, 하이픈 시작/끝 불가
- 예약어 차단
- DB 중복 검사
"""
import re
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Store

# 시스템에서 사용중이거나 예약된 경로 — 매장 ID로 사용 금지
RESERVED_SLUGS = {
    "admin", "api", "login", "logout", "signup", "owner", "super-admin",
    "super_admin", "demo", "discover", "stores", "store", "guide",
    "terms", "privacy", "static", "assets", "uploads", "public",
    "auth", "register", "kitchen", "staff", "setting", "settings",
    "checkout", "menu", "menus", "orders", "order", "table", "tables",
    "receipt", "takeout", "paypay", "paypay-complete", "subscription",
    "billing", "qr", "qr-builder", "home", "scan", "test", "dev",
    "www", "mail", "ftp", "root", "support", "help", "about",
    "contact", "blog", "news", "shop",
}

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$")


def validate_slug_format(slug: str) -> tuple[bool, str]:
    """
    슬러그 형식 검증.
    Returns: (is_valid, error_message)
    """
    if not slug:
        return False, "shop_id を入力してください"
    slug = slug.strip().lower()
    if len(slug) < 3:
        return False, "shop_id は 3 文字以上で入力してください"
    if len(slug) > 30:
        return False, "shop_id は 30 文字以下で入力してください"
    if not SLUG_PATTERN.match(slug):
        return False, "shop_id は英小文字・数字・ハイフン(-)のみ使用可能です（先頭末尾はハイフン不可）"
    if slug in RESERVED_SLUGS:
        return False, "この shop_id は予約されているため使用できません"
    return True, ""


async def is_slug_available(slug: str, session: AsyncSession, exclude_store_id: int | None = None) -> bool:
    """
    DB 중복 검사.
    exclude_store_id: 자기 자신 매장은 제외 (변경 시 사용)
    """
    result = await session.execute(select(Store).where(Store.slug == slug))
    existing = result.scalar_one_or_none()
    if not existing:
        return True
    if exclude_store_id is not None and existing.id == exclude_store_id:
        return True
    return False


async def validate_and_check_slug(
    slug: str,
    session: AsyncSession,
    exclude_store_id: int | None = None,
) -> tuple[bool, str]:
    """
    형식 + 중복 검사 통합. 회원가입/변경 시 사용.
    Returns: (is_valid, error_message)
    """
    ok, msg = validate_slug_format(slug)
    if not ok:
        return False, msg
    available = await is_slug_available(slug.lower(), session, exclude_store_id)
    if not available:
        return False, "この shop_id は既に使用されています"
    return True, ""

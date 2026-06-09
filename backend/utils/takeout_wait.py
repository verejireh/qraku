"""테이크아웃 동적 픽업 대기시간 — 미완료 테이크아웃 적체를 분으로 환산.

dynamic = min(base + backlog × MINUTES_PER_ORDER, WAIT_CAP_MINUTES)
Redis 60초 TTL 로 매장별 backlog 캐싱. Redis 불가 시 직접 계산 폴백 — /nearby 절대 안 깨짐.
"""
import logging
import random
from typing import Iterable, Optional, Tuple

from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Order
from utils.order_store import all_shop_id_candidates, shop_id_to_store_id

logger = logging.getLogger(__name__)

MINUTES_PER_ORDER = 3
# 상한은 **혼잡 가산분에만** 적용한다(업주가 설정한 base 는 줄이지 않는다 — admin 은 최대 120분 허용).
SURCHARGE_CAP_MINUTES = 60
CACHE_TTL_SECONDS = 60
_CACHE_PREFIX = "discover:wait:backlog:"  # +{store_id} -> backlog count (str)

# (store_id, slug, base_wait_minutes)
StoreWaitKey = Tuple[int, Optional[str], Optional[int]]


def dynamic_wait_minutes(base: Optional[int], backlog: int) -> int:
    """순수 산식. base 가 없으면 15 로 간주. 음수 backlog 는 0 으로 정규화.

    dynamic = base + min(backlog × MINUTES_PER_ORDER, SURCHARGE_CAP_MINUTES)
    → base(업주 설정, 최대 120)는 그대로 두고 혼잡 가산분만 상한.
    """
    b = base if base and base > 0 else 15
    backlog = max(int(backlog), 0)
    return b + min(backlog * MINUTES_PER_ORDER, SURCHARGE_CAP_MINUTES)


async def _query_backlog(session: AsyncSession, candidates: list[str], rev: dict[str, int]) -> dict[int, int]:
    """단일 GROUP BY 쿼리로 매장별 미완료 테이크아웃 주문 수 (ORM — 예약어/배열바인딩 회피)."""
    if not candidates:
        return {}
    result = await session.execute(
        select(Order.shop_id, func.count(Order.id).label("cnt"))
        .where(Order.shop_id.in_(candidates))
        .where(Order.order_type == "take_out")
        .where(Order.payment_status == "paid")
        .where(Order.needs_serving == True)  # noqa: E712 (SQLAlchemy 비교)
        .group_by(Order.shop_id)
    )
    backlog: dict[int, int] = {}
    for row in result:
        sid = rev.get(row.shop_id)
        if sid is not None:
            backlog[sid] = backlog.get(sid, 0) + int(row.cnt)
    return backlog


async def compute_dynamic_waits(session: AsyncSession, stores: Iterable[StoreWaitKey]) -> dict[int, int]:
    """{store_id: dynamic_wait_minutes}. Redis 60s 캐시 → 미스만 단일 쿼리 집계."""
    stores = list(stores)
    if not stores:
        return {}
    keys = [(sid, slug) for sid, slug, _ in stores]
    slug_by_id = dict(keys)
    base_by_id = {sid: base for sid, _, base in stores}
    all_ids = [sid for sid, _, _ in stores]

    backlog: dict[int, int] = {}
    miss_ids: list[int] = list(all_ids)

    # 1) Redis 캐시 조회 (실패 시 전체 미스 처리)
    redis = None
    try:
        from utils.redis import get_redis
        redis = get_redis()
        cached = await redis.mget([f"{_CACHE_PREFIX}{sid}" for sid in all_ids])
        miss_ids = []
        for sid, val in zip(all_ids, cached):
            if val is not None:
                backlog[sid] = int(val)
            else:
                miss_ids.append(sid)
    except Exception:
        logger.debug("takeout_wait: Redis 캐시 미사용 (폴백)", exc_info=True)
        redis = None
        miss_ids = list(all_ids)

    # 2) 캐시 미스 매장만 단일 쿼리 집계
    if miss_ids:
        miss_keys = [(sid, slug_by_id.get(sid)) for sid in miss_ids]
        candidates = all_shop_id_candidates(miss_keys)
        rev = shop_id_to_store_id(miss_keys)
        fresh = await _query_backlog(session, candidates, rev)
        for sid in miss_ids:
            backlog[sid] = fresh.get(sid, 0)
        # 3) 캐시 기록 (실패 무시)
        if redis is not None:
            try:
                pipe = redis.pipeline()
                for sid in miss_ids:
                    # TTL jitter — 동시 만료에 따른 캐시 스탬피드 완화
                    ttl = CACHE_TTL_SECONDS + random.randint(0, 15)
                    pipe.set(f"{_CACHE_PREFIX}{sid}", str(backlog[sid]), ex=ttl)
                await pipe.execute()
            except Exception:
                logger.debug("takeout_wait: Redis 캐시 기록 실패 (무시)", exc_info=True)

    return {sid: dynamic_wait_minutes(base_by_id.get(sid), backlog.get(sid, 0)) for sid in all_ids}

import json
import logging
import os
from typing import Any, Awaitable, Callable, TypeVar

from fastapi import HTTPException

from utils.redis import get_redis

logger = logging.getLogger(__name__)

T = TypeVar("T")

IDEMPOTENCY_TTL_SECONDS = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400"))
_LOCK_TTL_SECONDS = 60


async def with_idempotency(
    key: str,
    fn: Callable[[], Awaitable[T]],
    ttl: int = IDEMPOTENCY_TTL_SECONDS,
) -> T:
    """
    SETNX 잠금 → 실행 → 결과 캐시 → 반환.

    중복 키 동작:
    - 처리 중(lock 보유): HTTPException 409
    - 완료됨(result 캐시 존재): 첫 결과 그대로 반환 (200)

    key:  호출자가 구성한 고유 키 (예: "refund:{store_id}:{idempotency_header}")
    fn:   실제 작업 코루틴 팩토리
    ttl:  결과 캐시 보존 기간 (초, 기본 86400 = 24h)
    """
    redis = get_redis()
    lock_key = f"idem:{key}:lock"
    result_key = f"idem:{key}:result"

    # 이미 완료된 요청이면 캐시 반환
    cached = await redis.get(result_key)
    if cached:
        logger.debug("idempotency cache hit: key=%s", key)
        return json.loads(cached)

    # 잠금 획득 시도 (SETNX)
    acquired = await redis.set(lock_key, "1", ex=_LOCK_TTL_SECONDS, nx=True)
    if not acquired:
        logger.warning("idempotency lock conflict: key=%s", key)
        raise HTTPException(status_code=409, detail="요청 처리 중입니다. 잠시 후 다시 시도해 주세요.")

    try:
        result = await fn()
        serialized = json.dumps(result, ensure_ascii=False, default=str)
        await redis.set(result_key, serialized, ex=ttl)
        logger.debug("idempotency result cached: key=%s ttl=%ds", key, ttl)
        return result
    finally:
        # 성공/실패 무관하게 lock 해제 (실패 시 재시도 허용)
        await redis.delete(lock_key)

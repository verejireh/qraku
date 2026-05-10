import os
import sys
import logging
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    if _redis_client is None:
        raise RuntimeError("Redis가 초기화되지 않았습니다. init_redis()를 먼저 호출하세요.")
    return _redis_client


async def init_redis() -> None:
    global _redis_client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        print(
            "CRITICAL ERROR: REDIS_URL 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        client = aioredis.from_url(redis_url, decode_responses=True)
        await client.ping()
        _redis_client = client
        # 자격증명 노출 방지: URL에서 호스트/포트 부분만 로깅
        safe_url = redis_url.split("@")[-1] if "@" in redis_url else redis_url
        logger.info("Redis connected: %s", safe_url)
    except Exception as exc:
        print(f"CRITICAL ERROR: Redis 연결 실패 — {exc}", file=sys.stderr)
        sys.exit(1)


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("Redis connection closed.")

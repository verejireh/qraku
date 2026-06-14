import hashlib
import os

from fastapi import HTTPException, Request

from utils.redis import get_redis


AUTH_WINDOW_SECONDS = 15 * 60
AUTH_MAX_FAILURES = 10


def client_ip(request: Request) -> str:
    if os.getenv("TRUST_PROXY_HEADERS", "").lower() in {"1", "true", "yes"}:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def auth_limit_key(scope: str, identifier: str, request: Request) -> str:
    raw = f"{scope}:{identifier.lower()}:{client_ip(request)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"security:auth-fail:{digest}"


async def ensure_auth_allowed(key: str) -> None:
    count = await get_redis().get(key)
    if count is not None and int(count) >= AUTH_MAX_FAILURES:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
        )


async def record_auth_failure(key: str) -> None:
    redis = get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, AUTH_WINDOW_SECONDS)


async def clear_auth_failures(key: str) -> None:
    await get_redis().delete(key)

"""DB URL 추상화 헬퍼.

async DATABASE_URL(postgresql+asyncpg://) 을 sync 드라이버 URL(postgresql+psycopg2://) 로 변환한다.
Alembic / Worker (dramatiq) 처럼 sync 엔진이 필요한 곳에서 사용.
"""
from __future__ import annotations


def to_sync_url(url: str) -> str:
    """asyncpg URL 을 psycopg2 URL 로 치환한다. Alembic + dramatiq worker 전용."""
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg2://" + url[len("postgresql+asyncpg://"):]
    return url

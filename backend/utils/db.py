"""DB URL 추상화 헬퍼.

async DATABASE_URL 을 sync 드라이버 URL 로 변환한다.
Alembic / Worker (dramatiq) 처럼 sync 엔진이 필요한 곳에서 사용.

본 모듈은 어떤 DB 도 import 하지 않는다 (드라이버 의존 없음).
DBM-04 (postgres-specialist, sonnet) 산출물.
"""
from __future__ import annotations


def to_sync_url(url: str) -> str:
    """async DATABASE_URL 을 sync 드라이버 URL 로 치환한다.

    Alembic migration 과 dramatiq worker 는 sync SQLAlchemy 엔진을 필요로 하므로
    async 전용 드라이버(aiomysql, asyncpg)를 동등한 sync 드라이버로 교체한다.
    드라이버 추정·하드코딩 금지 — 항상 URL prefix 로만 분기한다.

    변환 규칙:
        - ``mysql+aiomysql://``    → ``mysql+pymysql://``
        - ``postgresql+asyncpg://``→ ``postgresql+psycopg2://``
        - 그 외 (sqlite, 이미 sync) → 변경 없이 그대로 반환

    Args:
        url: ``DATABASE_URL`` 형식의 연결 문자열.

    Returns:
        sync 드라이버로 치환된 연결 문자열.

    Examples:
        >>> to_sync_url("mysql+aiomysql://u:p@h:3306/d")
        'mysql+pymysql://u:p@h:3306/d'
        >>> to_sync_url("postgresql+asyncpg://u:p@h:5432/d")
        'postgresql+psycopg2://u:p@h:5432/d'
        >>> to_sync_url("sqlite:///./local.db")
        'sqlite:///./local.db'
        >>> to_sync_url("mysql+pymysql://u:p@h/d")
        'mysql+pymysql://u:p@h/d'
    """
    if url.startswith("mysql+aiomysql://"):
        return "mysql+pymysql://" + url[len("mysql+aiomysql://"):]
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg2://" + url[len("postgresql+asyncpg://"):]
    return url

"""Sync DB session for Dramatiq workers.

[DBM-06] async DATABASE_URL → sync 드라이버 치환을 `to_sync_url()` 헬퍼로 위임.
PostgreSQL 전용 (asyncpg → psycopg2). DBM-13 완료로 MySQL 지원 종료.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.utils.db import to_sync_url

_url = to_sync_url(os.environ["DATABASE_URL"])
# [2026-05-22] PG-CAP-01b: pool_recycle=300 — async engine 정책과 정합.
# GPT capacity review (gpt-p1-capacity-review.md §B) 권고 — Dramatiq worker 가
# idle 상태에서 stale connection 잡지 않도록 5분마다 갱신.
engine = create_engine(
    _url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

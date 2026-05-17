"""Sync DB session for Dramatiq workers.

[DBM-06] async DATABASE_URL → sync 드라이버 치환을 `to_sync_url()` 헬퍼로 위임.
MySQL (aiomysql → pymysql) / PostgreSQL (asyncpg → psycopg2) 양 DB 지원.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.utils.db import to_sync_url

_url = to_sync_url(os.environ["DATABASE_URL"])
engine = create_engine(_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

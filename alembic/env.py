"""Alembic 환경 — QRaku 전용.

전략:
  - 기존 backend/database.py:migration_sqls 는 운영 안정성을 위해 그대로 유지.
  - Alembic 은 신규 스키마 변경부터만 사용.
  - 운영 DB에는 운영자가 1회 `alembic stamp head` 실행하여 baseline 마킹 (OPR-07).

Autogenerate 한계 (수기 검토 필수):
  - SQLModel Enum 컬럼은 String 매핑 → Enum 변경 추적 불가.
  - JSON-as-TEXT 필드(`options`, `extra_translations` 등)는 매번 차이로 검출됨 → 노이즈 제거 필요.
"""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 프로젝트 루트 + backend 디렉토리를 sys.path 에 추가하여 models.py 임포트 가능하게.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))

# .env 로드 (선택적 — dotenv 미설치여도 환경변수만 있으면 동작).
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(ROOT, "backend", ".env"))
except ImportError:
    pass

# DATABASE_URL → sync 드라이버 치환 (Alembic 은 sync 엔진 사용).
# [DBM-06] to_sync_url() 헬퍼로 MySQL+aiomysql / PostgreSQL+asyncpg 양 DB 지원.
from backend.utils.db import to_sync_url

raw_url = os.environ.get("DATABASE_URL")
if not raw_url:
    raise RuntimeError(
        "DATABASE_URL 환경변수가 필요합니다. backend/.env 또는 셸 환경에서 설정하세요."
    )
url = to_sync_url(raw_url)

config = context.config
config.set_main_option("sqlalchemy.url", url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# SQLModel metadata 로딩 — 모든 테이블 모델이 등록된 단일 진실 공급원.
import models  # noqa: F401 — registers tables on SQLModel.metadata
from sqlmodel import SQLModel

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """`--sql` 모드 — 실제 DB 연결 없이 SQL 출력."""
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """일반 모드 — DB에 직접 연결."""
    cfg_section = config.get_section(config.config_ini_section) or {}
    cfg_section["sqlalchemy.url"] = url
    connectable = engine_from_config(
        cfg_section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

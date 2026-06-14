import asyncio
import os
import sys

# Windows 기본 ProactorEventLoop 에서는 psycopg3 async 가 동작하지 않는다
# (asyncpg/aiosqlite 는 무관). PG 통합테스트를 Windows 로컬에서도 돌릴 수 있도록
# SelectorEventLoop 로 전환 — Linux/CI 는 기본이 Selector 라 영향 없음.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# 앱 코드가 'from utils...', 'from models...' 형태로 import하므로
# backend/ 디렉토리를 import 경로 맨 앞에 추가한다.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# database.py 등 앱 모듈이 import 시점에 요구하는 환경변수 — 더미값.
# DATABASE_URL 은 lazy 엔진 생성용일 뿐(실제 연결하지 않음). 통합테스트는
# 아래 `db` 픽스처가 만드는 별도 in-memory SQLite 엔진을 사용한다.
# (실 운영은 PostgreSQL — FOR UPDATE/advisory lock 기반 "진정한 동시성"은
#  PG 테스트 DB 가 있어야 검증 가능. 여기서는 정산/토큰 스코프 "로직"을 검증한다.)
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

# TEST_DATABASE_URL 이 있으면(예: postgresql+asyncpg://...) 실 PostgreSQL 에서 실행 —
# FOR UPDATE/advisory lock 기반 "진짜 동시성" 검증 가능. 없으면 in-memory SQLite(로직만).
PG_URL = os.getenv("TEST_DATABASE_URL")

# PostgreSQL 이 있어야만 의미 있는 동시성 테스트용 skip 마커.
requires_pg = pytest.mark.skipif(
    not PG_URL,
    reason="PostgreSQL 필요 — TEST_DATABASE_URL 미설정 (진짜 동시성/락은 SQLite 로 검증 불가)",
)


def _make_engine():
    if PG_URL:
        return create_async_engine(PG_URL)
    return create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


async def _setup_schema(engine):
    import models  # noqa: F401 — 모든 테이블 메타데이터 등록
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.execute(text(
            "CREATE UNIQUE INDEX uq_tabehoudai_active_table "
            "ON tabehoudaisession(table_id) WHERE status = 'active'"
        ))


async def _teardown_schema(engine):
    # PG 는 테스트 간 데이터가 남으므로 정리 (SQLite :memory: 는 dispose 로 소멸).
    if PG_URL:
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db():
    """테스트별 격리된 AsyncSession (PG 또는 in-memory SQLite).

    운영 마이그레이션의 partial unique index(active 세션 테이블당 1개)를 재현한다.
    """
    engine = _make_engine()
    await _setup_schema(engine)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await _teardown_schema(engine)


@pytest_asyncio.fixture
async def pg_engine():
    """진짜 동시성 테스트용 PostgreSQL 엔진. PG 없으면 skip."""
    if not PG_URL:
        pytest.skip("PostgreSQL (TEST_DATABASE_URL) required")
    engine = _make_engine()
    await _setup_schema(engine)
    yield engine
    await _teardown_schema(engine)


@pytest.fixture(autouse=True)
def _silence_events(monkeypatch):
    """정산 경로의 WebSocket/EventLog emit 를 no-op 으로 — 테스트 격리."""
    import utils.events as ev

    async def _noop(*args, **kwargs):
        return None

    for name in ("emit", "emit_table_update", "emit_payment_completed"):
        monkeypatch.setattr(ev, name, _noop, raising=False)

import os
import sys

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


@pytest_asyncio.fixture
async def db():
    """테스트별 격리된 in-memory SQLite AsyncSession.

    StaticPool 로 단일 커넥션을 공유해 :memory: 데이터가 유지되며, 운영
    마이그레이션의 partial unique index(active 세션 테이블당 1개)를 재현한다.
    """
    import models  # noqa: F401 — 모든 테이블 메타데이터 등록

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.execute(text(
            "CREATE UNIQUE INDEX uq_tabehoudai_active_table "
            "ON tabehoudaisession(table_id) WHERE status = 'active'"
        ))
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def _silence_events(monkeypatch):
    """정산 경로의 WebSocket/EventLog emit 를 no-op 으로 — 테스트 격리."""
    import utils.events as ev

    async def _noop(*args, **kwargs):
        return None

    for name in ("emit", "emit_table_update", "emit_payment_completed"):
        monkeypatch.setattr(ev, name, _noop, raising=False)

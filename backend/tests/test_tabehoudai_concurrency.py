"""진짜 동시성 테스트 — PostgreSQL 필요 (TEST_DATABASE_URL).

SQLite 로는 검증 불가한 항목:
- 같은 테이블에 동시 코스 시작 → 정확히 1개만 성공 (partial unique index + FOR UPDATE; #4/#5)
- Square 결제 잠금 순서: 역전(Table→op vs op→Table)은 데드락, 통일 순서(op→Table)는 안전
  → register.start_square_terminal_checkout 의 apply 전 commit(락 해제) 수정의 근거.

실행: 로컬/CI 에서
  $env:TEST_DATABASE_URL="postgresql+asyncpg://user:pass@127.0.0.1:5432/qraku_test"
  uv run pytest backend/tests/test_tabehoudai_concurrency.py -v
"""
import asyncio
import os

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Store, Table, TableStatus, MenuGroup, MenuGroupType,
    TabehoudaiSession, SquareTerminalCheckout,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="PostgreSQL 필요 — TEST_DATABASE_URL 미설정",
)


async def _seed_base(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        store = Store(name="S", owner_id=1, points_enabled=False)
        s.add(store)
        await s.commit()
        await s.refresh(store)
        table = Table(store_id=store.id, table_number="A1",
                      status=TableStatus.OCCUPIED, session_token="tok1")
        s.add(table)
        await s.commit()
        await s.refresh(table)
        group = MenuGroup(store_id=store.id, name="C", group_type=MenuGroupType.COURSE,
                          price_per_person=1500, course_type="drink")
        s.add(group)
        await s.commit()
        await s.refresh(group)
        return store.id, table.id, group.id


async def test_concurrent_start_session_only_one_wins(pg_engine):
    """같은 테이블에 동시 코스 시작 → 정확히 1개만 active (#4/#5)."""
    from routers.tabehoudai import start_session, SessionStartRequest

    store_id, table_id, group_id = await _seed_base(pg_engine)

    async def attempt():
        async with AsyncSession(pg_engine, expire_on_commit=False) as s:
            store = await s.get(Store, store_id)
            body = SessionStartRequest(table_id=table_id, group_id=group_id, num_people=2)
            return await start_session(str(store_id), body, store, s)

    results = await asyncio.gather(attempt(), attempt(), return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    conflict = [r for r in results if isinstance(r, HTTPException) and r.status_code == 409]
    assert len(ok) == 1, results
    assert len(conflict) == 1, results

    async with AsyncSession(pg_engine) as s:
        rows = (await s.execute(
            select(TabehoudaiSession.id).where(
                TabehoudaiSession.table_id == table_id,
                TabehoudaiSession.status == "active",
            )
        )).all()
        assert len(rows) == 1


async def _seed_op(engine):
    store_id, table_id, _ = await _seed_base(engine)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        op = SquareTerminalCheckout(
            store_id=store_id, table_id=table_id, session_token="tok1",
            idempotency_key="idem-dl", device_id="d", amount=1000,
            order_ids_json="[]", course_session_ids_json="[]", status="CREATING",
        )
        s.add(op)
        await s.commit()
        await s.refresh(op)
        return table_id, op.id


async def test_inverted_lock_order_deadlocks(pg_engine):
    """역전 순서(Table→op vs op→Table)는 PostgreSQL 데드락 — 수정 전 위험 재현."""
    table_id, op_id = await _seed_op(pg_engine)
    e1, e2 = asyncio.Event(), asyncio.Event()

    async def table_then_op():
        async with AsyncSession(pg_engine, expire_on_commit=False) as s:
            await s.execute(select(Table).where(Table.id == table_id).with_for_update())
            e1.set()
            await e2.wait()
            await s.execute(select(SquareTerminalCheckout).where(
                SquareTerminalCheckout.id == op_id).with_for_update())
            await s.commit()

    async def op_then_table():
        async with AsyncSession(pg_engine, expire_on_commit=False) as s:
            await s.execute(select(SquareTerminalCheckout).where(
                SquareTerminalCheckout.id == op_id).with_for_update())
            e2.set()
            await e1.wait()
            await s.execute(select(Table).where(Table.id == table_id).with_for_update())
            await s.commit()

    results = await asyncio.gather(table_then_op(), op_then_table(), return_exceptions=True)
    errs = [r for r in results if isinstance(r, Exception)]
    assert len(errs) == 1, f"정확히 한 트랜잭션이 데드락 victim 이어야 함: {results}"
    assert "deadlock" in str(errs[0]).lower(), errs[0]


async def test_consistent_lock_order_no_deadlock(pg_engine):
    """통일 순서(op→Table)면 데드락 없음 — 같은 행을 같은 순서로 잡으면 한쪽이
    대기 후 진행할 뿐이다(수정 방향의 정당성). 이벤트 배리어 없이 자연 직렬화."""
    table_id, op_id = await _seed_op(pg_engine)

    async def op_then_table():
        async with AsyncSession(pg_engine, expire_on_commit=False) as s:
            await s.execute(select(SquareTerminalCheckout).where(
                SquareTerminalCheckout.id == op_id).with_for_update())
            # 살짝 지연을 둬 두 트랜잭션이 실제로 겹치도록(역전이면 데드락 날 타이밍)
            await asyncio.sleep(0.2)
            await s.execute(select(Table).where(Table.id == table_id).with_for_update())
            await s.commit()

    results = await asyncio.gather(
        op_then_table(), op_then_table(), return_exceptions=True
    )
    assert not any(isinstance(r, Exception) for r in results), results

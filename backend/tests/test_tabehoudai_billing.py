"""食べ放題/飲み放題 정산·세션 로직 통합테스트 (in-memory SQLite).

라우터 함수를 직접 호출해 검증 (HTTP/auth 우회). 커버:
- 세션만 있고 주문 0건인 현금 정산: 500 없이 코스요금 청구 + 세션 settle (#3, #1)
- 수동 종료는 expired 로만 → 정산에서 여전히 청구 (#1)
- 이전 착석 회차 세션은 현재 정산에서 제외 (#5)
- by-table 은 현재 토큰 세션만 노출 (#4)
- 한 테이블 active 세션 1개 보장 (#4 partial unique index)

진정한 동시성(FOR UPDATE/race)은 PostgreSQL 필요 — 여기선 로직만.
"""
from datetime import timedelta

import pytest
import sqlalchemy.exc
from fastapi import HTTPException

from models import Store, Table, TableStatus, MenuGroup, MenuGroupType, TabehoudaiSession, Order
from utils.time_helpers import now_utc_naive


async def _seed_store_table(db, *, table_token="tok1"):
    store = Store(name="S", owner_id=1, points_enabled=False)
    db.add(store)
    await db.commit()
    await db.refresh(store)
    table = Table(
        store_id=store.id, table_number="A1",
        status=TableStatus.OCCUPIED, session_token=table_token,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return store, table


async def _seed_course(db, store, *, price=1500, ctype="drink"):
    group = MenuGroup(
        store_id=store.id, name="90分飲み放題",
        group_type=MenuGroupType.COURSE, price_per_person=price, course_type=ctype,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


async def _seed_session(db, table, group, *, token, status="active", num_people=2, minutes=90):
    s = TabehoudaiSession(
        table_id=table.id, group_id=group.id, num_people=num_people,
        expires_at=now_utc_naive() + timedelta(minutes=minutes),
        status=status, session_token=token,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def _seed_order(db, store, table, *, total, token):
    o = Order(
        shop_id=str(store.id), store_id=store.id, table_number=table.table_number,
        session_token=token, payment_status="unpaid", order_type="eat_in",
        total_amount=total,
    )
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return o


async def test_cash_settle_session_only_no_orders(db):
    """주문 0건 + 코스 세션만 — IndexError 없이 코스요금 청구 + settle (#3/#1)."""
    from routers.register import complete_payment, PayRequest

    store, table = await _seed_store_table(db)
    group = await _seed_course(db, store, price=1500)
    sess = await _seed_session(db, table, group, token="tok1", num_people=2)

    result = await complete_payment(table.id, PayRequest(payment_method="cash"), db, store)

    assert result["total_amount"] == 3000           # 1500 × 2명
    await db.refresh(sess)
    assert sess.status == "settled"
    await db.refresh(table)
    assert table.status == TableStatus.READY
    assert table.session_token is None


async def test_manual_end_sets_expired_and_is_still_billed(db):
    """수동 종료는 settled 가 아니라 expired — 정산에서 여전히 청구 (#1)."""
    from routers.tabehoudai import end_session
    from routers.register import complete_payment, PayRequest

    store, table = await _seed_store_table(db)
    group = await _seed_course(db, store, price=2000)
    sess = await _seed_session(db, table, group, token="tok1", num_people=1)

    await end_session(str(store.id), sess.id, store, db)
    await db.refresh(sess)
    assert sess.status == "expired"          # settled 가 아님

    result = await complete_payment(table.id, PayRequest(payment_method="cash"), db, store)
    assert result["total_amount"] == 2000    # 종료됐어도 청구됨
    await db.refresh(sess)
    assert sess.status == "settled"


async def test_settle_excludes_other_seating_session(db):
    """현재 테이블 토큰과 다른(이전 회차) 세션은 정산 합산에서 제외 (#5)."""
    from routers.register import complete_payment, PayRequest

    store, table = await _seed_store_table(db, table_token="tok2")   # 현재 회차
    group = await _seed_course(db, store, price=1500)
    stale = await _seed_session(db, table, group, token="tok1")      # 이전 회차
    await _seed_order(db, store, table, total=1000, token="tok2")    # 현재 주문

    result = await complete_payment(table.id, PayRequest(payment_method="cash"), db, store)

    assert result["total_amount"] == 1000           # 주문만, 이전 코스요금 미포함
    await db.refresh(stale)
    assert stale.status == "active"                 # 이전 세션은 건드리지 않음


async def test_by_table_hides_other_seating_session(db):
    """by-table 은 현재 착석 토큰 세션만 노출 (#4)."""
    from routers.tabehoudai import get_active_by_table

    store, table = await _seed_store_table(db, table_token="tok2")
    group = await _seed_course(db, store)
    stale = await _seed_session(db, table, group, token="tok1")   # 이전 회차 active

    assert await get_active_by_table(table.id, db) is None        # 토큰 불일치 → 숨김

    # 이전 세션 종료 후(한 테이블 active 1개 제약) 현재 토큰 세션이면 노출
    stale.status = "expired"
    db.add(stale)
    await db.commit()
    await _seed_session(db, table, group, token="tok2")
    res = await get_active_by_table(table.id, db)
    assert res is not None
    assert res.num_people == 2


async def test_partial_unique_index_blocks_second_active(db):
    """한 테이블에 active 세션 2개 insert → unique index 위반 (#4)."""
    store, table = await _seed_store_table(db)
    group = await _seed_course(db, store)
    await _seed_session(db, table, group, token="tok1")

    db.add(TabehoudaiSession(
        table_id=table.id, group_id=group.id, num_people=1,
        expires_at=now_utc_naive() + timedelta(minutes=90),
        status="active", session_token="tok1",
    ))
    with pytest.raises(sqlalchemy.exc.IntegrityError):
        await db.commit()

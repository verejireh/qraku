"""staff/tables 변경 엔드포인트 인증·소유권(IDOR) 검증 테스트.

backend/routers/tables.py 의 staff/tables mutation 엔드포인트는
require_staff_or_admin 인증 + table.store_id == auth_store.id 소유권 검증을 가진다.

- 인증 없이 호출 → 401
- 타 매장 table_id 로 호출 → 403
- 정상(staff/admin 토큰 + 자기 매장) → 200

라우터를 최소 FastAPI 앱에 마운트하고 get_session 을 in-memory 테스트 세션으로
오버라이드해 HTTP 레벨에서 검증한다(실 JWT 사용).
"""
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from database import get_session
from models import Store, Table, TableStatus
from routers import tables as tables_router
from utils.jwt import create_staff_token, create_admin_token


async def _seed_store(db, name="S", owner_id="owner-1"):
    store = Store(name=name, owner_id=owner_id, points_enabled=False)
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return store


async def _seed_table(db, store, *, number="A1", status=TableStatus.OCCUPIED, token="tok1"):
    table = Table(
        store_id=store.id, table_number=number,
        status=status, session_token=token, guest_count=2,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return table


@pytest_asyncio.fixture
async def client(db):
    """tables 라우터만 마운트한 최소 앱 + get_session → 테스트 db 오버라이드."""
    app = FastAPI()
    app.include_router(tables_router.router, prefix="/api")

    async def _override_get_session():
        yield db

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# staff/tables 변경 엔드포인트 — (METHOD, path suffix, json body)
MUTATION_ENDPOINTS = [
    ("POST", "/open", {"guest_count": 3}),
    ("POST", "/close", None),
    ("POST", "/extend", None),
    ("POST", "/renew-qr", None),
    ("POST", "/guest-count", {"guest_count": 4}),
    ("POST", "/mark-served", None),
    ("POST", "/acknowledge-call", None),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,suffix,body", MUTATION_ENDPOINTS)
async def test_no_auth_returns_401(client, db, method, suffix, body):
    store = await _seed_store(db)
    table = await _seed_table(db, store)
    url = f"/api/staff/tables/{table.id}{suffix}"
    resp = await client.request(method, url, json=body)
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize("method,suffix,body", MUTATION_ENDPOINTS)
async def test_other_store_returns_403(client, db, method, suffix, body):
    """타 매장 토큰으로 호출 시 IDOR 차단 — 403."""
    owner = await _seed_store(db, name="Owner", owner_id="owner")
    attacker = await _seed_store(db, name="Attacker", owner_id="attacker")
    table = await _seed_table(db, owner)  # owner 매장 테이블
    token = create_staff_token(attacker.id, "attacker")  # 공격자 매장 토큰
    url = f"/api/staff/tables/{table.id}{suffix}"
    resp = await client.request(method, url, json=body, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_staff_token_own_store_ok(client, db):
    store = await _seed_store(db)
    table = await _seed_table(db, store, status=TableStatus.READY, token=None)
    token = create_staff_token(store.id, "shop")
    resp = await client.post(
        f"/api/staff/tables/{table.id}/open",
        json={"guest_count": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"].lower() == "occupied"


@pytest.mark.asyncio
async def test_admin_token_own_store_ok(client, db):
    """admin JWT 도 require_staff_or_admin 에 수용된다."""
    store = await _seed_store(db)
    table = await _seed_table(db, store)
    token = create_admin_token(store.id, store.owner_id, "shop")
    resp = await client.post(
        f"/api/staff/tables/{table.id}/acknowledge-call",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_transfer_no_auth_401(client, db):
    store = await _seed_store(db)
    src = await _seed_table(db, store, number="A1")
    tgt = await _seed_table(db, store, number="A2", status=TableStatus.READY, token=None)
    resp = await client.post(
        f"/api/staff/tables/{src.id}/transfer",
        json={"target_table_id": tgt.id},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_transfer_other_store_403(client, db):
    """transfer 는 source/target 둘 다 auth_store 소유여야 한다."""
    owner = await _seed_store(db, name="Owner", owner_id="owner")
    attacker = await _seed_store(db, name="Attacker", owner_id="attacker")
    src = await _seed_table(db, owner, number="A1")
    tgt = await _seed_table(db, owner, number="A2", status=TableStatus.READY, token=None)
    token = create_staff_token(attacker.id, "attacker")
    resp = await client.post(
        f"/api/staff/tables/{src.id}/transfer",
        json={"target_table_id": tgt.id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_transfer_own_store_ok(client, db):
    store = await _seed_store(db)
    src = await _seed_table(db, store, number="A1", status=TableStatus.OCCUPIED, token="srctok")
    tgt = await _seed_table(db, store, number="A2", status=TableStatus.READY, token=None)
    token = create_staff_token(store.id, "shop")
    resp = await client.post(
        f"/api/staff/tables/{src.id}/transfer",
        json={"target_table_id": tgt.id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

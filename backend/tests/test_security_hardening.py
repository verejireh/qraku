import asyncio
import inspect

import pytest
from fastapi import HTTPException

from models import Order, ReviewCreate, Store
from routers import stores, tables
from routers.reviews import create_review
from utils import crypto
from utils.auth import get_password_hash, verify_pin


def _route(path: str, method: str):
    for router in (tables.router, stores.router):
        for route in router.routes:
            if route.path == path and method in route.methods:
                return route
    raise AssertionError(f"route not found: {method} {path}")


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/staff/tables/{table_id}/open", "POST"),
        ("/staff/tables/{table_id}/close", "POST"),
        ("/staff/tables/{table_id}/transfer", "POST"),
        ("/staff/tables/{table_id}/mark-served", "POST"),
        ("/staff/shops/{shop_id}/qr-pdf", "GET"),
        ("/staff/shops/{shop_id}/register-tables", "GET"),
    ],
)
def test_staff_routes_require_staff_or_admin(path, method):
    route = _route(path, method)
    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call
    }
    assert "require_staff_or_admin" in dependency_names


def test_public_table_schema_does_not_expose_tokens():
    fields = set(stores.TablePublic.model_fields)
    assert "qr_token" not in fields
    assert "session_token" not in fields
    assert fields == {"id", "store_id", "table_number", "status"}


def test_pin_hashing_supports_legacy_and_bcrypt_values():
    assert verify_pin("1234", "1234")
    assert not verify_pin("9999", "1234")

    hashed = get_password_hash("1234")
    assert hashed != "1234"
    assert verify_pin("1234", hashed)
    assert not verify_pin("9999", hashed)


def test_secret_encryption_fails_closed_without_key(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    monkeypatch.setattr(crypto, "_fernet", None)

    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
        crypto.encrypt_secret("payment-secret")


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _ReviewSession:
    def __init__(self, store, order):
        self.store = store
        self.results = iter([_ScalarResult(order)])

    async def get(self, model, object_id):
        return self.store

    async def execute(self, statement):
        return next(self.results)


def test_review_rejects_order_not_owned_by_customer():
    store = Store(id=1, name="Store", owner_id="owner@example.com")
    order = Order(
        id=10,
        store_id=1,
        shop_id="store",
        table_number="1",
        session_token="session",
        guest_uuid="customer-a",
        payment_status="paid",
    )
    review = ReviewCreate(
        store_id=1,
        order_id=10,
        customer_id="customer-b",
        rating=5,
        tags={},
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_review(review, _ReviewSession(store, order)))

    assert exc.value.status_code == 403


def test_legacy_store_creation_requires_super_admin():
    route = _route("/stores/", "POST")
    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call
    }
    assert "require_super_admin" in dependency_names


def test_qr_checkout_requires_session_token_parameter():
    from routers.qr import checkout_table

    assert "req" in inspect.signature(checkout_table).parameters


def test_admin_extend_requires_super_admin():
    from routers import billing

    route = None
    for candidate in billing.router.routes:
        if getattr(candidate, "path", None) == "/billing/admin/extend" and "POST" in getattr(candidate, "methods", set()):
            route = candidate
            break
    assert route is not None, "route not found: POST /admin/extend"

    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call
    }
    assert "require_super_admin" in dependency_names
    assert "require_admin_billing" not in dependency_names


class _TableSession:
    def __init__(self, table):
        self.table = table

    async def get(self, model, object_id):
        return self.table


def test_join_requires_matching_qr_token():
    from datetime import timedelta

    from models import Table, TableStatus
    from routers.tables import JoinRequest, join_table
    from utils.time_helpers import now_utc_naive

    table = Table(
        id=5,
        store_id=1,
        table_number="1",
        qr_token="correct-token",
        session_token="secret-session",
        status=TableStatus.OCCUPIED,
        join_window_end=now_utc_naive() + timedelta(minutes=5),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(join_table(5, JoinRequest(qr_token="wrong-token"), _TableSession(table)))
    assert exc.value.status_code == 403

    result = asyncio.run(join_table(5, JoinRequest(qr_token="correct-token"), _TableSession(table)))
    assert result["session_token"] == "secret-session"

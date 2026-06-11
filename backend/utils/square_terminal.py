import base64
import hashlib
import hmac
import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models import (
    CustomerPoint,
    Order,
    PointAccrualType,
    PointHistory,
    PointTransactionType,
    SquareTerminalCheckout,
    Store,
    TabehoudaiSession,
    Table,
    TableStatus,
)
from utils.time_helpers import now_utc_naive


TERMINAL_ACTIVE_STATUSES = {
    "CREATING",
    "UNKNOWN",
    "PENDING",
    "IN_PROGRESS",
    "CANCEL_REQUESTED",
}
TERMINAL_FINAL_STATUSES = {"COMPLETED", "CANCELED", "FAILED"}


def verify_square_webhook_signature(
    raw_body: bytes,
    signature: str | None,
    signature_key: str,
    notification_url: str,
) -> bool:
    if not signature or not signature_key or not notification_url:
        return False
    message = notification_url.encode("utf-8") + raw_body
    digest = hmac.new(
        signature_key.encode("utf-8"),
        message,
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, signature)


def terminal_checkout_payload(
    *,
    amount: int,
    device_id: str,
    reference_id: str,
    note: str,
) -> dict[str, Any]:
    if amount <= 0:
        raise ValueError("amount must be a positive JPY integer")
    return {
        "amount_money": {"amount": amount, "currency": "JPY"},
        "reference_id": reference_id,
        "device_options": {
            "device_id": device_id,
            "skip_receipt_screen": False,
            "tip_settings": {"allow_tipping": False},
        },
        "note": note[:500],
    }


def _json_ids(raw: str) -> list[int]:
    try:
        values = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        try:
            result.append(int(value))
        except (TypeError, ValueError):
            continue
    return result


async def apply_terminal_checkout_update(
    session: AsyncSession,
    operation: SquareTerminalCheckout,
    square_checkout: dict[str, Any],
) -> bool:
    """Persist provider state and settle the table exactly once on COMPLETED."""
    status = str(square_checkout.get("status") or operation.status).upper()
    locked = await session.execute(
        select(SquareTerminalCheckout)
        .where(SquareTerminalCheckout.id == operation.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    operation = locked.scalar_one()
    if operation.completed_at is not None:
        return False
    operation.square_checkout_id = square_checkout.get("id") or operation.square_checkout_id
    operation.status = status
    operation.payment_ids_json = json.dumps(square_checkout.get("payment_ids") or [])
    operation.updated_at = now_utc_naive()

    if status != "COMPLETED":
        session.add(operation)
        return False

    order_ids = _json_ids(operation.order_ids_json)
    course_ids = _json_ids(operation.course_session_ids_json)
    order_result = await session.execute(
        select(Order)
        .where(
            Order.id.in_(order_ids),
            Order.store_id == operation.store_id,
            Order.payment_status == "unpaid",
        )
        .with_for_update()
    )
    orders = order_result.scalars().all()
    for order in orders:
        order.payment_status = "paid"
        order.payment_method = "SQUARE_TERMINAL"
        order.status = "served"
        session.add(order)

    if course_ids:
        course_result = await session.execute(
            select(TabehoudaiSession)
            .where(TabehoudaiSession.id.in_(course_ids))
            .with_for_update()
        )
        for course in course_result.scalars().all():
            if course.status in ("active", "expired"):
                course.status = "settled"
                course.settled_at = now_utc_naive()
                session.add(course)

    store = await session.get(Store, operation.store_id)
    customer_id = orders[0].guest_uuid if orders else None
    if store and store.points_enabled and customer_id and orders:
        points = 0
        if store.point_accrual_type == PointAccrualType.PERCENT:
            points = int((operation.amount / 100) * store.point_rate)
        elif store.point_accrual_type == PointAccrualType.FIXED:
            points = store.point_fixed_amount
        if points > 0:
            point_result = await session.execute(
                select(CustomerPoint)
                .where(
                    CustomerPoint.customer_id == customer_id,
                    CustomerPoint.store_id == store.id,
                )
                .with_for_update()
            )
            point_record = point_result.scalar_one_or_none()
            if not point_record:
                point_record = CustomerPoint(
                    customer_id=customer_id,
                    store_id=store.id,
                    balance=0,
                )
            point_record.balance += points
            point_record.updated_at = now_utc_naive()
            session.add(point_record)
            session.add(PointHistory(
                customer_id=customer_id,
                store_id=store.id,
                amount=points,
                tx_type=PointTransactionType.EARNED,
                description=f"Square Terminal payment JPY {operation.amount}",
                related_order_id=orders[0].id,
            ))

    table_result = await session.execute(
        select(Table)
        .where(
            Table.id == operation.table_id,
            Table.store_id == operation.store_id,
        )
        .with_for_update()
    )
    table = table_result.scalar_one_or_none()
    if table:
        remaining = await session.execute(
            select(Order.id).where(
                Order.store_id == operation.store_id,
                Order.table_number == table.table_number,
                Order.session_token == operation.session_token,
                Order.order_type == "eat_in",
                Order.payment_status == "unpaid",
            )
        )
        remaining_courses = await session.execute(
            select(TabehoudaiSession.id).where(
                TabehoudaiSession.table_id == table.id,
                TabehoudaiSession.status.in_(["active", "expired"]),
            )
        )
        if remaining.first() is None and remaining_courses.first() is None:
            table.last_order_id = orders[-1].id if orders else table.last_order_id
            table.qr_token = str(uuid.uuid4())
            table.status = TableStatus.READY
            table.session_token = None
            table.guest_count = None
            table.checkout_requested_at = None
            table.call_staff = False
            session.add(table)

    operation.status = "COMPLETED"
    operation.completed_at = now_utc_naive()
    operation.updated_at = operation.completed_at
    session.add(operation)
    return True

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from utils.websocket import manager
from utils.event_log import log_event

logger = logging.getLogger(__name__)


def _event_id() -> str:
    return uuid.uuid4().hex


async def _emit(
    session: AsyncSession,
    *,
    store_id: int,
    type: str,
    priority: str = "normal",
    data: dict,
    table_number: Optional[str] = None,
) -> None:
    envelope = {
        **data,  # legacy flat fields — WS-04 will remove after client migration
        "type": type,
        "event_id": _event_id(),
        "store_id": store_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "priority": priority,
        "data": data,
    }
    if priority == "critical":
        try:
            await log_event(
                session,
                store_id=store_id,
                actor_type="system",
                action=type,
                payload=data,
            )
        except Exception:
            logger.exception("EventLog write failed for %s store=%d", type, store_id)
    msg = json.dumps(envelope, ensure_ascii=False, default=str)
    try:
        if table_number is not None:
            await manager.broadcast_to_customer(msg, store_id, str(table_number))
        else:
            await manager.broadcast(msg, store_id)
    except Exception:
        logger.exception("WS broadcast failed for %s store=%d", type, store_id)


# ── Named helpers (card spec) ────────────────────────────────────────────────

async def emit_order_created(session: AsyncSession, store_id: int, order) -> None:
    await _emit(session, store_id=store_id, type="NEW_ORDER", data={
        "order_id": order.id,
        "table_number": order.table_number,
        "order_type": getattr(order, "order_type", None),
    })


async def emit_order_updated(session: AsyncSession, store_id: int, order) -> None:
    await _emit(session, store_id=store_id, type="ORDER_UPDATED", data={
        "order_id": order.id,
        "table_number": order.table_number,
        "status": order.status,
    })


async def emit_order_cancelled(session: AsyncSession, store_id: int, order, reason: str = "") -> None:
    await _emit(session, store_id=store_id, type="ORDER_CANCELLED", data={
        "order_id": order.id,
        "table_number": order.table_number,
        "reason": reason,
    })


async def emit_payment_completed(session: AsyncSession, store_id: int, order) -> None:
    await _emit(session, store_id=store_id, type="PAYMENT_COMPLETE", data={
        "order_id": order.id,
        "table_number": getattr(order, "table_number", None),
    })


async def emit_payment_failed(session: AsyncSession, store_id: int, order=None, code: str = "") -> None:
    await _emit(session, store_id=store_id, type="PAYMENT_FAILED", data={
        "order_id": order.id if order else None,
        "code": code,
    })


async def emit_refund_issued(session: AsyncSession, store_id: int, order, refund_log=None) -> None:
    await _emit(session, store_id=store_id, type="REFUND_ISSUED", data={
        "order_id": order.id,
        "refund_id": refund_log.id if refund_log else None,
        "amount": refund_log.amount if refund_log else None,
    })


async def emit_tabehoudai_session_started(
    session: AsyncSession, store_id: int, table_number: str, session_obj
) -> None:
    await _emit(session, store_id=store_id, type="TABEHOUDAI_STARTED", data={
        "session_id": session_obj.id,
        "table_number": table_number,
        "expires_at": session_obj.expires_at.isoformat() if session_obj.expires_at else None,
    }, table_number=table_number)


async def emit_tabehoudai_session_ended(
    session: AsyncSession, store_id: int, table_number: str, session_obj
) -> None:
    await _emit(session, store_id=store_id, type="TABEHOUDAI_ENDED", data={
        "session_id": session_obj.id,
        "table_number": table_number,
    }, table_number=table_number)


async def emit_staff_call(
    session: AsyncSession, store_id: int, table_number: str, table_id: int = None, status: str = None
) -> None:
    await _emit(session, store_id=store_id, type="CALL_STAFF", data={
        "table_id": table_id,
        "table_number": table_number,
        "status": status,
    })


# ── Generic helpers for remaining event types ────────────────────────────────

async def emit_table_update(
    session: AsyncSession, store_id: int, table, extra: Optional[dict] = None
) -> None:
    status = table.status.value if hasattr(table.status, "value") else table.status
    data: dict = {
        "table_id": table.id,
        "table_number": table.table_number,
        "status": status,
        "guest_count": getattr(table, "guest_count", None),
    }
    if extra:
        data.update(extra)
    await _emit(session, store_id=store_id, type="TABLE_UPDATE", data=data)


async def emit_item_status_update(
    session: AsyncSession, store_id: int, item, order
) -> None:
    await _emit(session, store_id=store_id, type="ITEM_STATUS_UPDATE", data={
        "item_id": item.id,
        "order_id": item.order_id,
        "table_number": order.table_number,
        "item_status": item.status,
        "order_status": order.status,
    })


async def emit_config_update(session: AsyncSession, store_id: int) -> None:
    await _emit(session, store_id=store_id, type="CONFIG_UPDATE", data={
        "store_id": store_id,
    })


async def emit_items_served(session: AsyncSession, store_id: int, item_ids: list) -> None:
    await _emit(session, store_id=store_id, type="ITEMS_SERVED", data={
        "item_ids": item_ids,
    })


async def emit_order_completed_customer(
    session: AsyncSession, store_id: int, table_number: str, order, items: list
) -> None:
    await _emit(session, store_id=store_id, type="order_completed", data={
        "order_id": order.id,
        "table_number": order.table_number,
        "items": items,
    }, table_number=table_number)


async def emit_item_ready_customer(
    session: AsyncSession, store_id: int, table_number: str, item, menu=None
) -> None:
    await _emit(session, store_id=store_id, type="item_ready", data={
        "item_id": item.id,
        "name_jp": menu.name_jp if menu else None,
        "name_ko": menu.name_ko if menu else None,
        "name_en": menu.name_en if menu else None,
        "quantity": item.quantity,
    }, table_number=table_number)


async def emit_pickup_ready_customer(
    session: AsyncSession, store_id: int, table_number: str, order
) -> None:
    await _emit(session, store_id=store_id, type="pickup_ready", data={
        "order_id": order.id,
        "pickup_code": order.pickup_code,
    }, table_number=table_number)


async def emit_checkout_request(session: AsyncSession, store_id: int, table) -> None:
    await _emit(session, store_id=store_id, type="CHECKOUT_REQUEST", data={
        "table_id": table.id,
        "table_number": table.table_number,
        "store_id": store_id,
    })


async def emit(
    session: AsyncSession,
    store_id: int,
    event_type: str,
    data: dict,
    *,
    table_number: Optional[str] = None,
) -> None:
    """Generic helper for event types not covered by named helpers."""
    await _emit(session, store_id=store_id, type=event_type, data=data, table_number=table_number)


async def emit_takeout_query_update(session: AsyncSession, store_id: int, query) -> None:
    await _emit(session, store_id=store_id, type="TAKEOUT_QUERY_UPDATE", data={
        "query_id": query.id,
        "guest_uuid": query.guest_uuid,
        "status": query.status,
        "agreed_time": query.agreed_time,
        "staff_response": query.staff_response,
    })


async def emit_translation_completed(
    session: AsyncSession, store_id: int, menu_id: int, translations: dict
) -> None:
    """라우터에서 사용 가능한 번역 완료 통지 헬퍼.

    워커(Dramatiq)는 FastAPI lifecycle 외부이므로 이 함수 대신 직접 redis publish를
    사용한다 (`backend/workers/translate_tasks.py:_publish_translation_completed`).
    이 헬퍼는 라우터 동기 흐름(예: 즉시 번역 완료 후 emit)을 위한 것이다.
    """
    await _emit(
        session,
        store_id=store_id,
        type="TRANSLATION_COMPLETED",
        data={"menu_id": menu_id, "translations": translations},
    )

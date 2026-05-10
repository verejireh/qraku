import json
import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import EventLog

logger = logging.getLogger(__name__)


async def log_event(
    session: AsyncSession,
    *,
    store_id: int,
    actor_type: str,
    action: str,
    actor_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    payload: Optional[dict[str, Any]] = None,
    external_payload_raw: Optional[str] = None,
) -> EventLog:
    """
    현재 트랜잭션에 EventLog 행을 추가한다.
    commit은 호출자의 책임 — 이 함수는 session.add만 수행한다.

    actor_type: customer | staff | admin | system | webhook
    action:     order.created | refund.issued | payment.completed | ...
    """
    log = EventLog(
        store_id=store_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload_json=json.dumps(payload, ensure_ascii=False) if payload else None,
        external_payload_raw=external_payload_raw,
    )
    session.add(log)
    logger.debug(
        "event_log queued: store=%s actor=%s/%s action=%s target=%s/%s",
        store_id, actor_type, actor_id, action, target_type, target_id,
    )
    return log

"""Dramatiq actor: cleanup_pending_paypay_orders — PendingPayPayOrder TTL 정리.

PayPay webhook 자동 Order 생성 폴백용 cart snapshot 행은
`expires_at = created_at + 30분` 으로 저장된다 (paypay.py).

본 액터는 다음을 주기적으로 삭제하여 테이블 누적을 방지한다:
  - consumed_at 이 1일 이상 지난 행 (정상 처리 완료)
  - expires_at 이 1시간 이상 지난 행 (만료 — 1시간 buffer 는 늦은 webhook 대비)

cron 등록 방법 (운영 VM, 매시 정각):
  0 * * * * cd ~/qr-order-system && .venv/bin/python -m dramatiq backend.workers \\
            --processes 1 --threads 1 --path . -- cleanup_pending_paypay_orders.send()

또는 APScheduler / 외부 cron 으로 `cleanup_pending_paypay_orders.send()` 호출.
"""
import logging
import os
from datetime import timedelta

import dramatiq

from backend.workers.broker import broker  # noqa: F401 — 브로커 등록
from backend.workers.db import SessionLocal
from utils.time_helpers import now_utc_naive

log = logging.getLogger(__name__)


@dramatiq.actor(
    max_retries=0,        # cron — 다음 실행에서 재시도되므로 재큐 불필요
    time_limit=30_000,
)
def cleanup_pending_paypay_orders() -> None:
    """expires_at + 1h 또는 consumed_at + 1d 지난 PendingPayPayOrder 삭제."""
    from sqlalchemy import delete, or_, and_
    from models import PendingPayPayOrder

    now = now_utc_naive()
    expired_cutoff = now - timedelta(hours=1)
    consumed_cutoff = now - timedelta(days=1)

    with SessionLocal() as session:
        stmt = delete(PendingPayPayOrder).where(
            or_(
                PendingPayPayOrder.expires_at < expired_cutoff,
                and_(
                    PendingPayPayOrder.consumed_at.is_not(None),
                    PendingPayPayOrder.consumed_at < consumed_cutoff,
                ),
            )
        )
        result = session.execute(stmt)
        deleted = result.rowcount or 0
        session.commit()

    if deleted:
        log.info("cleanup_pending_paypay_orders: deleted %d rows", deleted)

"""Dramatiq actor: food_rescue_check — 매 5분 cron으로 마감 할인 자동 발동/해제.

cron 등록 방법 (운영 VM):
  */5 * * * * cd ~/qr-order-system && .venv/bin/python -m dramatiq backend.workers --processes 1 --threads 1 --path . -- food_rescue_check.send()

또는 APScheduler / 외부 cron 으로 `food_rescue_check.send()` 호출.

is_open 은 절대 건드리지 않는다 (사장님 수동 토글 전용).
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

import dramatiq
import redis as sync_redis

from backend.workers.broker import broker  # noqa: F401 — 브로커 등록
from backend.workers.db import SessionLocal
from utils.business_hours import get_close_time_today

log = logging.getLogger(__name__)

_redis_url = os.environ["REDIS_URL"]
_r = sync_redis.from_url(_redis_url, decode_responses=True)

JST = timezone(timedelta(hours=9))
INSTANCE_ID = "worker-food-rescue"


def _publish_food_rescue_event(store_id: int, active: bool) -> None:
    """워커는 manager.broadcast 사용 불가 → WS-02 envelope 직접 PUBLISH."""
    payload = json.dumps({
        "type": "FOOD_RESCUE_CHANGED",
        "event_id": uuid.uuid4().hex,
        "store_id": store_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "priority": "normal",
        "data": {"food_rescue_manual_active": active},
    }, ensure_ascii=False)
    envelope = json.dumps({
        "instance_id": INSTANCE_ID,
        "target": "staff",
        "store_id": store_id,
        "table_number": None,
        "payload": payload,
    })
    try:
        _r.publish(f"ws:store:{store_id}", envelope)
    except Exception:
        log.exception("Redis publish failed store=%d", store_id)


@dramatiq.actor(
    max_retries=0,      # cron — 다음 5분에 재시도되므로 재큐 불필요
    time_limit=120_000,
)
def food_rescue_check() -> None:
    """auto 모드 매장의 food_rescue_manual_active 를 close_at 기준으로 갱신."""
    now_jst = datetime.now(JST)

    from sqlalchemy import select, and_
    from models import Store

    with SessionLocal() as session:
        rows = session.execute(
            select(Store).where(
                and_(
                    Store.allow_public_listing == True,   # noqa: E712
                    Store.is_open == True,                # noqa: E712
                    Store.food_rescue_active == True,     # noqa: E712
                    Store.food_rescue_mode == "auto",
                )
            )
        ).scalars().all()

    updates: list[tuple[int, bool]] = []

    for store in rows:
        close_dt = get_close_time_today(store, now_jst)
        if close_dt is None:
            # business_hours 없거나 오늘 휴무 — auto 발동 불가, 현재 상태 유지
            continue

        # close_dt 가 naive 면 JST 붙임
        if close_dt.tzinfo is None:
            close_dt = close_dt.replace(tzinfo=JST)

        minutes_until_close = (close_dt - now_jst).total_seconds() / 60
        should_be_active = 0 < minutes_until_close <= store.food_rescue_auto_minutes

        if store.food_rescue_manual_active != should_be_active:
            updates.append((store.id, should_be_active))

    if not updates:
        return

    from sqlalchemy import update as sa_update

    with SessionLocal() as session:
        for store_id, active in updates:
            session.execute(
                sa_update(Store)
                .where(Store.id == store_id)
                .values(food_rescue_manual_active=active)
            )
        session.commit()

    for store_id, active in updates:
        log.info("food_rescue store=%d active=%s", store_id, active)
        _publish_food_rescue_event(store_id, active)

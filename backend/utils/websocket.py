import asyncio
import json
import logging
import os
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import WebSocket

logger = logging.getLogger(__name__)
INSTANCE_ID = os.getenv("INSTANCE_ID") or uuid.uuid4().hex[:12]
PUBSUB_PATTERN = "ws:store:*"
RECONNECT_BACKOFF = (1, 2, 5, 10, 30)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.active_customer_connections: Dict[Tuple[int, str], List[WebSocket]] = {}
        self._pubsub_task: Optional[asyncio.Task] = None
        self._pubsub_started = False
        # Lock created lazily to avoid "no running event loop" at import time
        self._start_lock: Optional[asyncio.Lock] = None

    async def _ensure_pubsub_started(self):
        if self._pubsub_started:
            return
        if self._start_lock is None:
            self._start_lock = asyncio.Lock()
        async with self._start_lock:
            if self._pubsub_started:
                return
            self._pubsub_task = asyncio.create_task(self._pubsub_listener())
            self._pubsub_started = True

    async def connect(self, websocket: WebSocket, store_id: int):
        await self._ensure_pubsub_started()
        await websocket.accept()
        self.active_connections.setdefault(store_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, store_id: int):
        conns = self.active_connections.get(store_id)
        if conns and websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, message: str, store_id: int):
        await self._local_broadcast_staff(message, store_id)
        await self._publish(store_id, "staff", None, message)

    async def connect_customer(self, websocket: WebSocket, store_id: int, table_number: str):
        await self._ensure_pubsub_started()
        await websocket.accept()
        key = (store_id, str(table_number))
        self.active_customer_connections.setdefault(key, []).append(websocket)

    def disconnect_customer(self, websocket: WebSocket, store_id: int, table_number: str):
        key = (store_id, str(table_number))
        conns = self.active_customer_connections.get(key)
        if conns and websocket in conns:
            conns.remove(websocket)

    async def broadcast_to_customer(self, message: str, store_id: int, table_number: str):
        await self._local_broadcast_customer(message, store_id, str(table_number))
        await self._publish(store_id, "customer", str(table_number), message)

    async def _local_broadcast_staff(self, message: str, store_id: int):
        # [2026-05-22] GPT capacity review §C — send 실패 시 dead connection 누적
        # 방지 위해 list 에서 제거. 원본 list 를 순회 중 제거하면 안 되므로 dead 추적.
        conns = self.active_connections.get(store_id, [])
        dead: List[WebSocket] = []
        for connection in list(conns):
            try:
                await connection.send_text(message)
            except Exception:
                logger.exception("send_text failed (staff) store=%d — removing dead connection", store_id)
                dead.append(connection)
        for c in dead:
            try:
                conns.remove(c)
            except ValueError:
                pass

    async def _local_broadcast_customer(self, message: str, store_id: int, table_number: str):
        key = (store_id, str(table_number))
        conns = self.active_customer_connections.get(key, [])
        dead: List[WebSocket] = []
        for connection in list(conns):
            try:
                await connection.send_text(message)
            except Exception:
                logger.exception(
                    "send_text failed (customer) store=%d table=%s — removing dead connection",
                    store_id, table_number
                )
                dead.append(connection)
        for c in dead:
            try:
                conns.remove(c)
            except ValueError:
                pass

    async def _publish(
        self, store_id: int, target: str, table_number: Optional[str], payload: str
    ):
        try:
            from utils.redis import get_redis

            redis = get_redis()
            envelope = json.dumps(
                {
                    "instance_id": INSTANCE_ID,
                    "target": target,
                    "store_id": store_id,
                    "table_number": table_number,
                    "payload": payload,
                }
            )
            await redis.publish(f"ws:store:{store_id}", envelope)
        except Exception:
            logger.exception("Redis publish failed store=%d target=%s", store_id, target)

    async def _pubsub_listener(self):
        backoff_idx = 0
        while True:
            try:
                from utils.redis import get_redis

                pubsub = get_redis().pubsub()
                await pubsub.psubscribe(PUBSUB_PATTERN)
                logger.info("WS pubsub listener started instance=%s", INSTANCE_ID)
                backoff_idx = 0
                async for message in pubsub.listen():
                    if message.get("type") != "pmessage":
                        continue
                    try:
                        data = message.get("data")
                        if isinstance(data, bytes):
                            data = data.decode("utf-8")
                        envelope = json.loads(data)
                    except Exception:
                        logger.exception("Bad pubsub envelope")
                        continue
                    if envelope.get("instance_id") == INSTANCE_ID:
                        continue
                    target = envelope.get("target")
                    store_id = envelope.get("store_id")
                    payload = envelope.get("payload")
                    if not (target and store_id is not None and payload):
                        continue
                    if target == "staff":
                        await self._local_broadcast_staff(payload, store_id)
                    elif target == "customer":
                        tn = envelope.get("table_number")
                        if tn:
                            await self._local_broadcast_customer(payload, store_id, tn)
            except asyncio.CancelledError:
                logger.info("WS pubsub listener cancelled")
                raise
            except Exception:
                wait = RECONNECT_BACKOFF[min(backoff_idx, len(RECONNECT_BACKOFF) - 1)]
                logger.exception(
                    "WS pubsub listener crashed; reconnecting in %ds", wait
                )
                backoff_idx += 1
                await asyncio.sleep(wait)


manager = ConnectionManager()

"""Dramatiq Redis broker — workers import this module to register the broker."""
import os

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import AsyncIO  # 향후 async actor 지원

broker_url = os.getenv("DRAMATIQ_BROKER_URL") or os.getenv("REDIS_URL")
if not broker_url:
    raise RuntimeError("DRAMATIQ_BROKER_URL or REDIS_URL is required")

broker = RedisBroker(url=broker_url, namespace="qraku-dramatiq")
broker.add_middleware(AsyncIO())
dramatiq.set_broker(broker)

"""Dramatiq actor: translate_menu — 메뉴 다국어 번역을 백그라운드로 처리.

라우터(menus.py:create_menu)는 메뉴를 즉시 저장한 뒤 `translate_menu.send(menu.id)`만
호출하고 응답한다. 워커가 Gemini로 번역해 Menu 필드를 갱신하고, WS-02 envelope으로
`TRANSLATION_COMPLETED` 이벤트를 스태프 채널에 발행한다.
"""
import json
import logging
import os
import uuid
from datetime import datetime

import dramatiq
import redis as sync_redis

from backend.workers.broker import broker  # noqa: F401  - 브로커 등록
from backend.workers.db import SessionLocal
from models import Menu, SystemConfig
from utils.translation import translate_text

log = logging.getLogger(__name__)

_redis_url = os.environ["REDIS_URL"]
_r = sync_redis.from_url(_redis_url, decode_responses=True)

INSTANCE_ID = "worker"
LANGS = ("ko", "en", "zh")


def _publish_translation_completed(store_id: int, menu_id: int, translations: dict) -> None:
    """워커는 manager.broadcast 사용 불가 → WS-02 envelope을 직접 PUBLISH."""
    payload_dict = {
        "type": "TRANSLATION_COMPLETED",
        "event_id": uuid.uuid4().hex,
        "store_id": store_id,
        "ts": datetime.utcnow().isoformat() + "Z",
        "priority": "normal",
        "data": {"menu_id": menu_id, "translations": translations},
    }
    payload = json.dumps(payload_dict, ensure_ascii=False)
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
        log.exception("Redis publish failed for menu=%d store=%d", menu_id, store_id)


@dramatiq.actor(
    max_retries=3,
    min_backoff=1000,
    max_backoff=30_000,
    time_limit=60_000,
)
def translate_menu(menu_id: int) -> None:
    """Menu의 name_jp / description_jp / options 를 LANGS로 번역. 멱등성 보장."""
    with SessionLocal() as s:
        m = s.get(Menu, menu_id)
        if not m or not m.name_jp:
            return

        # idempotency: 모든 필드가 채워져 있으면 skip
        names_done = all(getattr(m, f"name_{l}") for l in LANGS)
        descs_done = (not m.description_jp) or all(
            getattr(m, f"description_{l}") for l in LANGS
        )
        if names_done and descs_done:
            return

        cfg = s.get(SystemConfig, "GEMINI_API_KEY")
        api_key = cfg.value if cfg else None

        for lang in LANGS:
            if not getattr(m, f"name_{lang}"):
                setattr(m, f"name_{lang}", translate_text(m.name_jp, lang, api_key=api_key))

        if m.description_jp:
            for lang in LANGS:
                if not getattr(m, f"description_{lang}"):
                    setattr(
                        m,
                        f"description_{lang}",
                        translate_text(m.description_jp, lang, api_key=api_key),
                    )

        # options 번역 — menus.py의 기존 동기 로직 동등 이식
        if m.options and m.options != "[]":
            try:
                data = json.loads(m.options)
                for grp in data:
                    grp.setdefault("translations", {})
                    g = grp.get("group_name", "")
                    if g:
                        for lang in LANGS:
                            grp["translations"].setdefault(
                                lang, translate_text(g, lang, api_key=api_key)
                            )
                    for ch in grp.get("choices", []):
                        ch.setdefault("translations", {})
                        n = ch.get("name", "")
                        if n:
                            for lang in LANGS:
                                ch["translations"].setdefault(
                                    lang, translate_text(n, lang, api_key=api_key)
                                )
                m.options = json.dumps(data, ensure_ascii=False)
            except Exception:
                log.exception("options translate failed menu=%d", menu_id)

        s.add(m)
        s.commit()
        s.refresh(m)

        store_id = m.store_id
        translations = {
            lang: {
                "name": getattr(m, f"name_{lang}"),
                "description": getattr(m, f"description_{lang}"),
            }
            for lang in LANGS
        }

    _publish_translation_completed(store_id, menu_id, translations)

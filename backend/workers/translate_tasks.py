"""Dramatiq actor: translate_menu — 메뉴 다국어 번역을 백그라운드로 처리.

라우터(menus.py:create_menu / update_menu)는 메뉴를 즉시 저장한 뒤
`translate_menu.send(menu.id)`만 호출하고 응답한다. 워커가 Gemini로 번역해 Menu
필드를 갱신하고, WS-02 envelope으로 `TRANSLATION_COMPLETED` 이벤트를 스태프
채널에 발행한다.

[2026-05-22] PG-CAP-05 — 3-Phase 분리 (Load → External API → Write):
  Phase 1 (Load, ~50ms): Menu/SystemConfig 조회 → primitive snapshot 추출
                        → DB session close. ORM 객체 Phase 2 로 가져가지 않음.
  Phase 2 (External API, no session): translate_text 호출. 외부 Gemini API
                        latency 동안 DB connection 점유 안 함.
  Phase 3 (Write, ~50ms): re-fetch + stale source 가드 (name_jp/description_jp
                        변경 시 drop) + missing-field-only write + commit.
                        options 는 raw JSON 동등 가드.

GPT cross-review (gpt-pg-cap05-review.md) 반영:
  - Phase 2 primitive snapshot only (ORM lazy load 회피)
  - update_menu 가 source 변경 시 actor 재enqueue 필수 (menus.py 변경)
  - max_retries=3 유지, time_limit=60_000 은 옵션 풍부 메뉴에선 빠듯 — 후속 모니터링
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone

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
        # [2026-05-22] PG-DT-MIGRATE-02 Cat-3 — utcnow + "Z" → aware UTC ISO
        "ts": datetime.now(timezone.utc).isoformat(),
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


def _translate_options(options_raw: str, api_key: str) -> str | None:
    """options JSON 의 group/choice translations 채워서 새 raw 반환. 실패 시 None.

    Phase 2 안에서 호출 — DB session 없음.
    """
    if not options_raw or options_raw == "[]":
        return None
    try:
        data = json.loads(options_raw)
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
        return json.dumps(data, ensure_ascii=False)
    except Exception:
        log.exception("options translate failed")
        return None


@dramatiq.actor(
    max_retries=3,
    min_backoff=1000,
    max_backoff=30_000,
    time_limit=60_000,
)
def translate_menu(menu_id: int) -> None:
    """Menu의 name_jp / description_jp / options 를 LANGS로 번역. 멱등성 보장.

    3-Phase 패턴 (gpt-pg-cap05-review.md §A 권고).
    """
    # ── Phase 1: Load (DB session) ───────────────────────────────────────────
    # Menu + SystemConfig 조회, idempotency 체크, primitive snapshot 추출 후 session close.
    with SessionLocal() as s:
        m = s.get(Menu, menu_id)
        if not m or not m.name_jp:
            return

        # idempotency: 모든 필드가 채워져 있으면 skip (외부 API 호출 자체 회피)
        names_done = all(getattr(m, f"name_{l}") for l in LANGS)
        descs_done = (not m.description_jp) or all(
            getattr(m, f"description_{l}") for l in LANGS
        )
        if names_done and descs_done:
            return

        cfg = s.get(SystemConfig, "GEMINI_API_KEY")
        api_key = cfg.value if cfg else None

        # Phase 2 로 가져갈 primitive snapshot — ORM 객체는 session 닫히면 expired.
        snapshot = {
            "store_id": m.store_id,
            "name_jp": m.name_jp,
            "description_jp": m.description_jp,
            "options_raw": m.options,
            "names_existing": {l: getattr(m, f"name_{l}") for l in LANGS},
            "descs_existing": {l: getattr(m, f"description_{l}") for l in LANGS},
        }
    # ── DB session 닫힘 — connection 반환됨. Phase 2 외부 API 동안 점유 X ────

    # ── Phase 2: External API (no DB session) ────────────────────────────────
    # snapshot 기반으로 translate_text 호출. 결과를 local dict 에 누적.
    new_names: dict[str, str] = {}
    for lang in LANGS:
        if not snapshot["names_existing"][lang]:
            new_names[lang] = translate_text(
                snapshot["name_jp"], lang, api_key=api_key
            )

    new_descs: dict[str, str] = {}
    if snapshot["description_jp"]:
        for lang in LANGS:
            if not snapshot["descs_existing"][lang]:
                new_descs[lang] = translate_text(
                    snapshot["description_jp"], lang, api_key=api_key
                )

    new_options_raw = _translate_options(snapshot["options_raw"], api_key)

    # ── Phase 3: Write (DB session) — stale guard + missing-field-only ──────
    with SessionLocal() as s:
        m = s.get(Menu, menu_id)
        if not m:
            log.warning("Menu %d disappeared during translation, skipping write", menu_id)
            return

        # 원본 일본어 텍스트가 in-flight 중 변경됐는지 체크.
        # 변경됐으면 stale write 방지 — update_menu 가 새 actor 를 재enqueue 함 (menus.py).
        if (m.name_jp != snapshot["name_jp"]
                or m.description_jp != snapshot["description_jp"]):
            log.info(
                "Menu %d source text changed during translation, "
                "skipping stale write (re-trigger via update path expected)",
                menu_id,
            )
            return

        # missing-field-only write — admin 수동 입력한 값 보존
        for lang, name in new_names.items():
            if not getattr(m, f"name_{lang}"):
                setattr(m, f"name_{lang}", name)

        for lang, desc in new_descs.items():
            if not getattr(m, f"description_{lang}"):
                setattr(m, f"description_{lang}", desc)

        # options stale 가드 — raw JSON 동등 비교 (변경됐으면 drop)
        if new_options_raw is not None and m.options == snapshot["options_raw"]:
            m.options = new_options_raw

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
    # ── DB session 닫힘. WS publish 는 외부 ────────────────────────────────────

    _publish_translation_completed(store_id, menu_id, translations)

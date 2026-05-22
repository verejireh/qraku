# PG-CAP-05 — `translate_menu` DB session hold 분리 분석

**작성일**: 2026-05-22
**상위 카드**: P1 #9 capacity ([`p1-capacity-model-analysis.md`](./p1-capacity-model-analysis.md))
**선행 GPT review**: [`gpt-p1-capacity-review.md`](./gpt-p1-capacity-review.md) §D — Dramatiq 확장 차단 요소로 명시
**병렬 handoff**: [`claude-parallel-handoff-pg-cap05-dt-migrate02.md`](./claude-parallel-handoff-pg-cap05-dt-migrate02.md)

---

## 문제 정의

`backend/workers/translate_tasks.py:translate_menu` 가 DB session 을 **외부 Gemini API 호출 전체 구간** 동안 유지. Dramatiq worker process / thread 확장 시 DB connection pool 압박의 직접 원인.

### 현재 구조 (라인별 인용)

```python
# backend/workers/translate_tasks.py:60-128 (전체 함수)
@dramatiq.actor(max_retries=3, min_backoff=1000, max_backoff=30_000, time_limit=60_000)
def translate_menu(menu_id: int) -> None:
    with SessionLocal() as s:                          # ── DB session OPEN
        m = s.get(Menu, menu_id)
        if not m or not m.name_jp:
            return

        # idempotency check
        names_done = all(getattr(m, f"name_{l}") for l in LANGS)
        descs_done = (not m.description_jp) or all(...)
        if names_done and descs_done:
            return

        cfg = s.get(SystemConfig, "GEMINI_API_KEY")
        api_key = cfg.value if cfg else None

        for lang in LANGS:                              # ── 외부 API 호출 시작 (session 유지)
            if not getattr(m, f"name_{lang}"):
                setattr(m, f"name_{lang}",
                        translate_text(m.name_jp, lang, api_key=api_key))

        if m.description_jp:
            for lang in LANGS:                          # ── 외부 API
                if not getattr(m, f"description_{lang}"):
                    setattr(m, f"description_{lang}",
                            translate_text(m.description_jp, lang, api_key=api_key))

        if m.options and m.options != "[]":             # ── 외부 API (가변 N)
            data = json.loads(m.options)
            for grp in data:
                ... # group/choice 마다 translate_text × LANGS
            m.options = json.dumps(data, ensure_ascii=False)

        s.add(m)
        s.commit()                                       # ── 커밋
        s.refresh(m)
        ...                                              # ── DB session CLOSE

    _publish_translation_completed(store_id, menu_id, translations)
```

### 정량 위험 분석

`translate_text(text, lang)` 1회 = **Gemini API 호출 1~3초** (네트워크 + LLM 추론).

호출 횟수 (idempotency 적용 후):
- 이름 번역: 3 langs × 1 field = **최대 3 calls**
- 설명 번역: 3 langs × 1 field = **최대 3 calls**
- options 안: group_name × 3 + (choice_name × N × 3) — 평균 10~30개 옵션이면 **30~90 calls**

총 평균 API 시간:
- 메뉴 단순 (name + desc만, options 없음): 6 calls × 2s = **12 초** DB session 점유
- 메뉴 풍부 (options 포함): 36 calls × 2s = **72 초** DB session 점유 (Dramatiq `time_limit=60_000` 직전)

worker pool 영향 (`pool_size=5, max_overflow=10` = 프로세스당 15 conn):
- Dramatiq 기본 thread = 8
- 8 동시 translate_menu × 평균 30s hold = 30s 동안 8 connections occupied
- worker process 2개 = 16 conns + sync engine 다른 작업 = pool exhaustion 가능

**현재 단일 worker process / single trigger 상황은 OK** (매뉴 1개 추가 시 1 translate_menu). 그러나:
- 사장님이 100개 메뉴 일괄 import → 100 actor enqueue → 동시 실행 시 pool 폭주
- Dramatiq processes 증설 → 선형 증가

→ **Dramatiq scaling 전제 조건** (PG-CAP-04 의 선행).

---

## 권장 구현 — 3-Phase 분리 패턴

### Phase 1 (Load, 짧은 session ~50ms)

```python
@dramatiq.actor(max_retries=3, ...)
def translate_menu(menu_id: int) -> None:
    # ── Phase 1: load (DB session) ──────────────────────────────────────────
    with SessionLocal() as s:
        m = s.get(Menu, menu_id)
        if not m or not m.name_jp:
            return

        names_done = all(getattr(m, f"name_{l}") for l in LANGS)
        descs_done = (not m.description_jp) or all(
            getattr(m, f"description_{l}") for l in LANGS
        )
        if names_done and descs_done:
            return

        cfg = s.get(SystemConfig, "GEMINI_API_KEY")
        api_key = cfg.value if cfg else None

        # 외부 API 호출에 필요한 모든 값을 primitive 로 추출 (ORM 객체 보유 X)
        snapshot = {
            "menu_id": menu_id,
            "store_id": m.store_id,
            "name_jp": m.name_jp,
            "description_jp": m.description_jp,
            "options_raw": m.options,
            "names_existing": {l: getattr(m, f"name_{l}") for l in LANGS},
            "descs_existing": {l: getattr(m, f"description_{l}") for l in LANGS},
        }
    # ── DB session 닫힘 — connection 반환 ────────────────────────────────────
```

### Phase 2 (External API, **no DB session**)

```python
    # ── Phase 2: 외부 Gemini API (DB session 없음) ──────────────────────────
    new_names = {}
    new_descs = {}
    for lang in LANGS:
        if not snapshot["names_existing"][lang]:
            new_names[lang] = translate_text(
                snapshot["name_jp"], lang, api_key=api_key
            )

    if snapshot["description_jp"]:
        for lang in LANGS:
            if not snapshot["descs_existing"][lang]:
                new_descs[lang] = translate_text(
                    snapshot["description_jp"], lang, api_key=api_key
                )

    # options 번역
    new_options_raw = None
    if snapshot["options_raw"] and snapshot["options_raw"] != "[]":
        try:
            data = json.loads(snapshot["options_raw"])
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
            new_options_raw = json.dumps(data, ensure_ascii=False)
        except Exception:
            log.exception("options translate failed menu=%d", menu_id)
```

### Phase 3 (Write, 짧은 session ~50ms)

```python
    # ── Phase 3: write (DB session) — idempotent missing-field-only write ──
    with SessionLocal() as s:
        m = s.get(Menu, menu_id)
        if not m:
            log.warning("Menu %d disappeared during translation, skipping", menu_id)
            return

        # 원본 일본어 텍스트가 in-flight 중 변경됐는지 체크 — 변경됐으면 stale
        if (m.name_jp != snapshot["name_jp"]
            or m.description_jp != snapshot["description_jp"]):
            log.info(
                "Menu %d source text changed during translation, "
                "skipping stale write (will be re-triggered)",
                menu_id,
            )
            return

        # 비어있는 필드에만 쓰기 (admin 이 수동 입력한 값 보존)
        for lang, name in new_names.items():
            if not getattr(m, f"name_{lang}"):
                setattr(m, f"name_{lang}", name)

        for lang, desc in new_descs.items():
            if not getattr(m, f"description_{lang}"):
                setattr(m, f"description_{lang}", desc)

        if new_options_raw is not None:
            # options 가 in-flight 중 변경됐으면 stale — 새 raw 사용 안 함
            if m.options == snapshot["options_raw"]:
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

    # ── DB session 닫힘. WS publish 는 DB 외부 ────────────────────────────────
    _publish_translation_completed(store_id, menu_id, translations)
```

---

## 핵심 설계 결정

### 1. Source-text staleness check (Phase 3 의 가드)

**문제**: in-flight 중 사장님이 메뉴 `name_jp` 를 수정하면 옛 일본어로 번역된 결과가 새 일본어 메뉴에 쓰여짐 → 불일치.

**해결**: Phase 3 에서 `m.name_jp != snapshot["name_jp"]` 비교 후 stale 이면 **drop**. 새 번역 actor 가 재발화되어야 함 (라우터 `menus.py:create/update_menu` 가 `translate_menu.send(menu_id)` 호출).

**대안 검토** (GPT review 요청 사항):
- (a) drop + re-trigger 보장 — 위 안
- (b) 부분 적용 (변경 안 된 필드만 쓰기) — 더 복잡, race 더 자라남
- (c) DB-level optimistic locking (version 컬럼) — 모델 변경 필요, 출시 후 검토

→ **(a) 권장**. 메뉴 수정 시 menus.py 가 항상 새 actor 를 enqueue 하면 idempotent.

### 2. Missing-field-only write 의미

기존 코드: `if not getattr(m, f"name_{lang}")` — 비어있는 필드에만 쓰기. 이미 채워진 값 (관리자 수동 입력 또는 이전 번역) 은 덮어쓰지 않음.

**새 코드도 동일 의미 보존**. Phase 3 의 `if not getattr(...)` 가드 유지.

### 3. options stale 처리

options 는 JSON blob 이라 부분 비교 어려움. 대안:
- (a) 전체 raw 비교 (`m.options == snapshot["options_raw"]`) — 위 안. options 변경 시 drop.
- (b) translations dict 만 merge — 복잡

→ **(a) 권장**. options 자주 변경 안 됨 가정.

### 4. SystemConfig GEMINI_API_KEY 캐싱

현재: 매 actor 실행마다 DB 에서 조회.

**검토**:
- 캐싱 시 API 키 회전 시 stale 위험
- per-task 조회는 DB 1회 추가 + Phase 1 안에 포함되므로 비용 작음 (~5ms)

→ **기존 per-task 조회 유지** (단순성). API 키 회전 빈도가 매우 낮으면 향후 module-level cache 도입 검토.

### 5. Dramatiq retry semantics 호환성

`max_retries=3, min_backoff=1000` — 실패 시 3회 재시도.

**Phase 분리 후 재시도 안전성**:
- Phase 1 실패 (DB connection error) — 재시도 OK (idempotent)
- Phase 2 실패 (API error) — 재시도 OK (snapshot 다시 만들어짐)
- Phase 3 실패 (DB commit error) — **재시도 시 stale 비교 통과해야** 새 데이터 적용. Phase 1 이 재실행되면서 새 snapshot 으로 redo.

→ 안전. 재시도 시 효과적으로 전체 actor 재실행.

### 6. WS publish 시점

**현재**: Phase 3 commit 직후, session 닫힌 후.

**위치**: `_publish_translation_completed(store_id, menu_id, translations)` 가 sync redis `_r.publish(...)` 호출. DB session 무관.

→ 변경 없음. 단, `translations` payload 가 Phase 3 의 `m.refresh()` 후 만들어진 최종 값이라 정확.

---

## 변경 범위 + 위험도

| 파일 | 변경 | 위험 |
|---|---|---|
| `backend/workers/translate_tasks.py:60-128` | 함수 전체 재구성 (3-phase) | 중간 — actor 시그니처 동일 |
| 호출자 (`backend/routers/menus.py` 등) | 변경 없음 | 0 |
| `backend/workers/db.py` | 변경 없음 (pool_recycle 적용은 이전 커밋) | 0 |
| `backend/utils/translation.py` | 변경 없음 | 0 |
| 테스트 | 신규 권장 — fake `translate_text` + DB session 미보유 검증 | - |

**롤백 절차**: git revert. actor 시그니처/동작 의미 동일.

---

## 검증 계획

### 단위 (수동 점검)

1. **DB session 미보유 검증**:
   - `translate_text` 를 `time.sleep(10)` 으로 모킹
   - actor 호출 + 10초 동안 `pg_stat_activity` 에서 worker connection 없는지 확인

2. **Stale source 가드**:
   - Phase 1 후 menu.name_jp 를 SQL 로 직접 변경
   - Phase 3 에서 stale 감지 + drop 로그 확인

3. **Idempotency**:
   - 모든 lang 채워진 메뉴에서 actor 실행 → Phase 1 early return 확인

### 통합 (운영 VM)

1. 100개 메뉴 일괄 import 시뮬레이션 → `pg_stat_activity` 의 worker connection 수 < 5 유지 (기존: 100 동시 = 100 connections)
2. WS `TRANSLATION_COMPLETED` 이벤트가 정확히 1회 publish 되는지 확인

---

## GPT cross-review 요청 항목

본 doc 작성 후 자이라가 GPT 에 보낼 프롬프트는 [`claude-parallel-handoff-pg-cap05-dt-migrate02.md`](./claude-parallel-handoff-pg-cap05-dt-migrate02.md) §"GPT Review Prompt: PG-CAP-05" 그대로 사용.

핵심 검토 요청 5 항목 (GPT 가 작성한 프롬프트):
- A. 3-phase 분리가 DB connection hold 차단에 충분한가
- B. Menu row 가 in-flight 중 변경 시 race condition — stale source 가드 vs idempotent missing-field-only write 어느 게 적절
- C. Dramatiq retry settings 가 분리 후 안전한가 (부분 성공, API timeout, DB commit 실패, 중복 actor)
- D. SystemConfig/GEMINI_API_KEY 캐싱 vs per-task 로딩
- E. 누락된 capacity 위험 (worker threads, sync pool, Redis publish, WS fanout)

응답 저장: `tasks/gpt-pg-cap05-review.md`

---

## 액션 아이템

- [x] **PG-CAP-05-ANALYSIS** (이번 doc): 분석 + 3-phase 구현 안 + 위험 분석
- [ ] **GPT-PG-CAP-05-REVIEW**: 자이라가 GPT 에 핸드오프 프롬프트 전송 + 응답 저장
- [ ] **PG-CAP-05-IMPL**: GPT 응답 반영 + 코드 패치 (translate_tasks.py 재구성)
- [ ] **PG-CAP-05-VERIFY**: 운영 VM 에서 100개 메뉴 일괄 import 시 worker connection 수 측정

---

## 부록 — 향후 최적화 (별도 카드)

본 PG-CAP-05 와 분리해서 검토:

1. **`translate_batch_with_gemini` 활용**: 이미 `backend/utils/translation.py` 에 name + description + 모든 lang 한꺼번에 처리하는 batch 함수 존재. 현재 `translate_menu` 는 단일 `translate_text` 만 사용 → 6 calls 가 1 call 로 감소 가능 (~6배 성능 향상).
   - 단, options 안의 group/choice 도 batch 화 필요 → API 디자인 변경.
2. **Description "mouth-watering" rewrite 일관화**: `translate_batch_with_gemini` 는 description 을 매력적으로 재작성. `translate_text` 는 단순 번역. 현재 두 패턴 혼재 → 정책 결정 필요.

# Claude Parallel Handoff: PG-CAP-05 + PG-DT-MIGRATE-02

Date: 2026-05-22
Branch: `stabilize/post-pg-cutover`
Author: GPT cross-review coordinator

This document is for the next Claude pass after the two parallel analysis docs are prepared.

## Current Context

Production deploy has completed and the PG cutover stabilization work is now in follow-up P1 hardening.

Already completed cross-reviews:
- `tasks/gpt-p1-capacity-review.md`
- `tasks/gpt-p1-datetime-review.md`
- `tasks/gpt-p1-date-grouping-review.md`

Current dirty files observed before this handoff:
- `deploy.py`
- `tasks/current-tasks.md`
- `tasks/work-log.md`

Those appear to be Claude/operator deploy-log changes. GPT did not modify them.

## Parallel Work Items

### 1. PG-CAP-05

Goal: analyze and prepare implementation for splitting `translate_menu` DB session ownership from external translation API calls.

Current code path:
- `backend/workers/translate_tasks.py`
- `translate_menu(menu_id)`
- Opens `SessionLocal()` once.
- Loads `Menu` and `SystemConfig`.
- Calls `translate_text(...)` repeatedly while the DB session is still open.
- Commits translated fields and publishes WS event after closing the session.

Risk:
- Dramatiq worker DB connection is held across slow external API calls.
- With more worker processes/threads, DB occupancy can grow even if actual DB work is small.
- This blocks PG-CAP-04 worker scaling readiness.

Suggested implementation shape:

1. Load phase, short DB session:
   - Fetch `Menu` by id.
   - Check idempotency from existing translated fields.
   - Fetch `SystemConfig("GEMINI_API_KEY")`.
   - Copy only primitive values needed for translation:
     - `menu_id`
     - `store_id`
     - `name_jp`
     - `description_jp`
     - `options`
     - current `name_ko/en/zh`
     - current `description_ko/en/zh`
   - Close session before external calls.

2. External API phase, no DB session:
   - Perform all `translate_text(...)` calls.
   - Build updated translated fields/options in local variables.
   - Keep retry behavior compatible with current Dramatiq actor retries.

3. Write phase, short DB session:
   - Re-fetch `Menu` by id.
   - If missing, return.
   - Apply only missing translation fields to preserve idempotency and avoid overwriting newer admin edits.
   - Re-check `name_jp`, `description_jp`, and `options` before write if stale source risk matters.
   - Commit.
   - Build the WS payload after successful commit.

Important design questions:
- If the source Japanese text changed while translation was in flight, should the actor drop the result or write only still-matching fields?
- If partial translations exist, should the actor translate only missing fields as today?
- Should `api_key` be loaded once per task or per language retry?
- Should options translation preserve current `setdefault` semantics?

Suggested verification:
- Unit or focused test with a fake `translate_text` that asserts no DB session is open during fake external delay, if easy.
- Existing worker tests or a direct actor function smoke test.
- Manual review that `SessionLocal()` scopes do not surround `translate_text`.

### 2. PG-DT-MIGRATE-02

Goal: prepare Strategy 2 for replacing remaining `datetime.utcnow()` usage without a blind sed.

Current scan result:
- Many remaining `datetime.utcnow()` occurrences exist across routers, utils, workers, models, and seed/migration scripts.
- `datetime.now()` user-facing bugs in `menu_groups.py` and `menus.py` appear already fixed to use `now_jst()`.
- `date.today()` in `register.py` appears already fixed to use `today_jst()`.
- Fixed-offset JST remains in:
  - `backend/workers/food_rescue_scheduler.py`
  - `backend/test_business_hours.py`

Primary helper:
- `backend/utils/time_helpers.py`
- `now_utc_naive()`
- `now_jst()`
- `today_jst()`
- `today_start_jst_as_utc_naive(now=None)`

Classification for migration:

1. DB naive UTC writes and comparisons
   - Replace `datetime.utcnow()` with `now_utc_naive()`.
   - This is the safest equivalent while columns remain `TIMESTAMP WITHOUT TIME ZONE`.
   - Examples:
     - `created_at`, `updated_at`, `settled_at`, `used_at`, `last_visit`
     - subscription expiry comparisons
     - join window expiry
     - coupon expiry

2. Rolling UTC windows
   - Replace with `now_utc_naive() - timedelta(...)` only if the product meaning is "last N x 24 hours."
   - If the product meaning is "last N JST calendar days," defer or convert to JST calendar-boundary helpers.
   - Risk files include:
     - `backend/routers/stats.py`
     - `backend/routers/insights.py`
     - `backend/routers/discover.py`
     - `backend/routers/super_admin.py`

3. Event timestamps serialized with `"Z"`
   - Current pattern:
     - `datetime.utcnow().isoformat() + "Z"`
   - Prefer aware UTC ISO:
     - `datetime.now(timezone.utc).isoformat()`
   - Candidate files:
     - `backend/utils/events.py`
     - `backend/workers/translate_tasks.py`
   - Do not blindly use `now_utc_naive().isoformat() + "Z"` if the intent is external JSON instant time.

4. JWT expiration
   - For Strategy 2, `now_utc_naive()` preserves current PyJWT semantics.
   - For Strategy 3 TIMESTAMPTZ/aware migration, JWT can move to aware UTC after a smoke test.
   - Candidate:
     - `backend/utils/jwt.py`
     - `backend/routers/oauth.py`

5. Seed/migration scripts
   - Lower priority.
   - Keep semantic equivalence or update only after import path is safe.
   - Candidates:
     - `backend/migrate_subscriptions.py`
     - `backend/seed_table_1234567.py`
     - `backend/seed_samples.py`

6. Fixed-offset JST
   - Prefer `ZoneInfo("Asia/Tokyo")` for runtime code.
   - Test constants may remain fixed offset if assertions do not depend on named zone behavior.

Suggested verification:
- `rg -n "datetime\.utcnow\(" backend -S`
- `rg -n "datetime\.now\(" backend -S`
- `rg -n "date\.today\(" backend -S`
- Focused tests around:
  - JWT token creation/validation
  - order coupon/stamp expiry comparisons
  - stats rolling window semantics if touched
  - event timestamp format

## GPT Review Prompt: PG-CAP-05

Send this after Claude writes the PG-CAP-05 analysis doc.

```text
Claude prepared the PG-CAP-05 analysis for `translate_menu` DB session separation after the PostgreSQL cutover.

Please cross-review the plan and implementation strategy.

Files/context to inspect:
- tasks/<CLAUDE_CAP05_ANALYSIS_DOC>.md
- tasks/p1-capacity-model-analysis.md
- tasks/gpt-p1-capacity-review.md
- backend/workers/translate_tasks.py
- backend/workers/db.py
- backend/utils/translation.py

Review questions:

A. Is the proposed load -> external API -> write split sufficient to prevent DB connection hold during slow translation API calls?

B. What race conditions are introduced if the Menu row changes while translation is in flight? Should the write phase compare original source fields before applying translations, or is idempotent missing-field-only write enough?

C. Are the current Dramatiq retry settings safe after this split? Consider partial translation success, API timeout, DB commit failure, and duplicate actor execution.

D. Should SystemConfig/GEMINI_API_KEY be loaded per task, cached, or loaded per retry? What is the lowest-risk choice for production?

E. Are there missing capacity risks in workers after PG-CAP-05, especially worker threads/processes, sync pool sizing, Redis publish, or WS fanout?

Please answer with concrete recommendations and any must-fix items before Claude implements.
```

Expected GPT output file:
- `tasks/gpt-pg-cap05-review.md`

## GPT Review Prompt: PG-DT-MIGRATE-02

Send this after Claude writes the PG-DT-MIGRATE-02 analysis doc.

```text
Claude prepared the PG-DT-MIGRATE-02 analysis for replacing remaining `datetime.utcnow()` usage after the PostgreSQL cutover.

Please cross-review the migration classification and implementation plan.

Files/context to inspect:
- tasks/<CLAUDE_DT_MIGRATE_02_ANALYSIS_DOC>.md
- tasks/p1-datetime-utc-migration-analysis.md
- tasks/gpt-p1-datetime-review.md
- tasks/gpt-p1-date-grouping-review.md
- backend/utils/time_helpers.py
- representative files containing remaining `datetime.utcnow()`

Review questions:

A. Is the classification correct: DB naive UTC writes/comparisons -> `now_utc_naive()`, external JSON instant timestamps -> aware UTC ISO, JWT -> preserve current naive UTC semantics for Strategy 2?

B. Which remaining `datetime.utcnow() - timedelta(...)` rolling windows are safe 24-hour lookbacks, and which should be treated as JST calendar-day business queries instead?

C. Are there import-cycle or path risks when adding `from utils.time_helpers import now_utc_naive` across routers, workers, models, and scripts?

D. Should model default factories such as `Field(default_factory=lambda: datetime.utcnow() + ...)` be changed in Strategy 2, or deferred until TIMESTAMPTZ Strategy 3?

E. What tests or smoke checks are mandatory before deploy? Include JWT, event timestamp format, expiry comparisons, and stats/date grouping risks.

Please answer with concrete recommendations and any must-fix items before Claude implements.
```

Expected GPT output file:
- `tasks/gpt-pg-dt-migrate-02-review.md`

## Message To Claude

```text
Claude, GPT prepared a parallel handoff for the next two items:

- `tasks/claude-parallel-handoff-pg-cap05-dt-migrate02.md`

Please use it after you finish the two analysis docs:

1. PG-CAP-05: `translate_menu` DB session hold separation
   - Focus on load -> API -> write phases.
   - Main risk is preserving idempotency and avoiding stale writes if Menu changes during translation.
   - After your analysis doc is ready, Zaira can send the included PG-CAP-05 GPT prompt.

2. PG-DT-MIGRATE-02: remaining `datetime.utcnow()` migration
   - Do not do blind sed.
   - Classify each occurrence as DB naive UTC, rolling window, external JSON instant, JWT, seed/migration, or JST wall-clock.
   - After your analysis doc is ready, Zaira can send the included PG-DT-MIGRATE-02 GPT prompt.

Current dirty files before GPT handoff were `deploy.py`, `tasks/current-tasks.md`, and `tasks/work-log.md`; GPT did not modify them.

GPT recommends creating the two analysis docs first, then waiting for GPT review before code implementation. PG-CAP-05 and PG-DT-MIGRATE-02 are independent and can proceed in parallel.
```


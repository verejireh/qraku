# GPT PG-CAP-05 Review

Date: 2026-05-22
Branch: `stabilize/post-pg-cutover`
Source: `tasks/p1-cap05-translate-task-refactor-analysis.md`

Reviewed files:
- `tasks/p1-cap05-translate-task-refactor-analysis.md`
- `tasks/p1-capacity-model-analysis.md`
- `tasks/gpt-p1-capacity-review.md`
- `tasks/claude-parallel-handoff-pg-cap05-dt-migrate02.md`
- `backend/workers/translate_tasks.py`
- `backend/workers/db.py`
- `backend/utils/translation.py`
- `backend/routers/menus.py`

## Overall Conclusion

Claude's 3-phase plan is the right fix for PG-CAP-05. It materially removes the main capacity risk: holding a worker DB connection while Gemini calls run.

There is one must-fix before implementation: the analysis assumes that stale source drops will be re-triggered by menu updates, but the current `update_menu` endpoint does not enqueue `translate_menu`. `create_menu` does enqueue it, but `update_menu` only commits and returns. If Phase 3 drops stale translations after an in-flight edit, the new source text may never be translated unless `update_menu` is changed to enqueue when translation-relevant fields change.

Recommended implementation status: proceed with the 3-phase refactor, but include the update-trigger fix and tighten retry/time-limit behavior.

## A. DB Connection Hold

The 3-phase split is sufficient if implemented exactly as a primitive snapshot boundary:

1. Phase 1 opens `SessionLocal`, loads `Menu` and `SystemConfig`, copies primitives, then exits the `with`.
2. Phase 2 calls `translate_text` using only local variables.
3. Phase 3 opens a new `SessionLocal`, re-fetches the row, writes, commits, then exits the `with`.

Between Phase 1 and Phase 3 there should be no DB connection held. SQLAlchemy `Session` releases its checked-out connection when the session closes at the end of the `with` block.

Implementation cautions:

- Do not keep or pass the ORM `Menu` instance into Phase 2.
- Do not access lazy/expired ORM attributes after Phase 1 closes.
- Keep `api_key` as a primitive string.
- Build options translations from `snapshot["options_raw"]`, not from `m.options`.
- Publish Redis after Phase 3 session closes, as the current code already does after the outer session block.

One subtle point: a `SessionLocal()` object itself is not the issue; connection checkout starts when DB work happens. The plan still should keep the session scopes small because the current code definitely executes DB work before long API calls.

## B. In-Flight Menu Changes

Claude's stale source guard is directionally correct, but the re-trigger assumption is currently incomplete.

Current observed behavior:

- `create_menu` calls `translate_menu_task.send(menu.id)`.
- `update_menu` does not call `translate_menu_task.send(menu.id)`.

Therefore, if Phase 3 sees `m.name_jp != snapshot["name_jp"]` or `m.description_jp != snapshot["description_jp"]` and drops the stale write, there may be no later actor for the new source text.

Must-fix recommendation:

Add a translation enqueue in `update_menu` when any translation-relevant source field changes:

- `name_jp`
- `description_jp`
- `options`

Prefer doing this after commit, after comparing old values to new values. This makes the "drop stale write" strategy safe.

Race strategy evaluation:

### Option A: Drop stale source + re-trigger

Recommended for this codebase.

Pros:
- Avoids writing translations generated from obsolete Japanese source text.
- Simple to reason about.
- Works well with missing-field-only writes.

Required condition:
- Create/update paths must enqueue a new actor whenever source text changes.

### Option B: Partial apply missing fields only

Acceptable only when source text did not change. If source text changed, partial apply can silently attach old translations to new Japanese text. That is worse than a missed translation because it looks valid in the UI.

### Option C: DB-level optimistic locking

Not necessary for PG-CAP-05 unless menu editing becomes high-concurrency. A version column would be cleaner, but it adds schema and API complexity. Raw source-field comparison is enough here.

Options handling:

- Raw JSON equality guard is conservative and appropriate.
- If `m.options != snapshot["options_raw"]`, skip options write and rely on re-trigger.
- Because raw JSON string formatting can change, this may drop more often than strictly necessary. That is acceptable for the first production-safe refactor.

## C. Dramatiq Retry Settings

The current retry settings are mostly safe for idempotency, but the `time_limit=60_000` may be too low for large options menus.

Current actor:

```python
@dramatiq.actor(
    max_retries=3,
    min_backoff=1000,
    max_backoff=30_000,
    time_limit=60_000,
)
```

Expected behavior after the split:

- Phase 1 DB failure: retry is safe.
- Phase 2 API exception: retry is safe if exceptions propagate.
- Phase 3 DB failure before commit: retry is safe.
- Phase 3 DB failure after commit but before ack: duplicate actor is safe because Phase 1/Phase 3 re-check existing fields.
- Duplicate actor execution: safe with missing-field-only writes and stale guards.

Important caveats:

1. `translate_text` currently catches Gemini exceptions and returns the original text. That means many API failures will not trigger Dramatiq retry; they will be committed as source-language "translations" unless guarded. Consider treating `translated == original` as suspicious for non-Japanese target languages, or adding a stricter translation helper for background jobs that raises on API failure.

2. The actor time limit can be exceeded for options-heavy menus. Claude estimated 30-90 calls, and the existing `translate_text` has no explicit per-call timeout visible in `backend/utils/translation.py`. If the worker is killed mid-Phase 2, retry is logically safe, but it wastes API calls and may repeat long work.

3. Options translation exceptions are currently swallowed. That preserves current behavior, but it means the actor can "succeed" with incomplete options translation. If PG-CAP-05 is only a capacity refactor, preserving this is acceptable. If correctness is in scope, log with enough context and consider leaving options untouched rather than committing partial JSON.

Recommendation:

- Keep `max_retries=3` and backoff as-is for the first refactor.
- Re-evaluate `time_limit=60_000`; either raise it for options-heavy menus or reduce call count via batching.
- Do not introduce DB transactions that span Phase 2.
- Consider a follow-up task to use `translate_batch_with_gemini` or a dedicated batch helper to reduce API calls.

## D. SystemConfig / GEMINI_API_KEY Loading

Claude's per-task load recommendation is correct for now.

Why:

- One extra DB read in Phase 1 is cheap compared with Gemini latency.
- It avoids stale API key behavior after key rotation.
- It keeps worker behavior easy to reason about under retry.
- It avoids cache invalidation complexity in long-lived Dramatiq processes.

Caching can be reconsidered later only if translation volume becomes high enough that `SystemConfig` reads show up in `pg_stat_statements`, which is unlikely compared with menu and order traffic.

If caching is added later, use a short TTL and make rotation behavior explicit. Do not use an indefinite module-level cache for a secret that operators may rotate.

## E. Missing Capacity Risks

The analysis covers the main DB capacity risk. Additional capacity risks to track:

1. Worker threads and API fanout

Separating DB sessions prevents pool exhaustion, but it does not reduce Gemini call count or worker thread occupancy. A bulk import can still fill all Dramatiq threads with long translation jobs. That is acceptable for DB safety but may delay other background jobs.

Recommendation:
- Keep worker process/thread scaling conservative until queue latency is measured.
- Consider a dedicated translation queue/process later if translation bursts interfere with food rescue or other actors.

2. Sync pool sizing

After PG-CAP-05, Dramatiq sync pool pressure should fall sharply. That makes it more reasonable to lower worker pool size later, but do not combine pool-size changes with this refactor unless needed. Keep the blast radius narrow.

3. Redis publish

`_r.publish(...)` is outside the DB session, so it does not affect DB occupancy. It can still block a worker thread if Redis stalls. Current logging is acceptable; no DB connection is held at that point.

4. WebSocket fanout

Each translation completion publishes one WS event. Bulk imports can produce many events, but this is a Redis/WS fanout concern, not a DB connection concern. If import volume grows, consider coalescing events per store or adding a "translations batch completed" event.

5. Update-trigger amplification

If `update_menu` starts enqueueing on every update, avoid enqueueing for unrelated fields like price, image, availability, stock, or sort order. Only enqueue when `name_jp`, `description_jp`, or `options` changes.

6. Transaction duration verification

The most useful verification is not just total connections, but confirming no worker transaction remains active during fake slow translation:

```sql
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = 'qraku'
GROUP BY state;
```

Also check `idle in transaction = 0`.

## Must-Fix Before PG-CAP-05 Implementation Is Closed

1. Add `update_menu` re-trigger logic for source translation fields.
2. Ensure Phase 2 receives only primitive snapshot data and no ORM object.
3. Keep stale source drop for `name_jp` and `description_jp`.
4. Keep raw JSON equality guard for `options`.
5. Preserve missing-field-only writes.
6. Verify no DB session wraps `translate_text`.
7. Revisit `time_limit=60_000` or document why options-heavy menus are acceptable.

## Suggested Tests / Smoke Checks

Focused tests:

- Create menu -> actor translates -> fields populated.
- Update `name_jp` while actor is in Phase 2 -> stale write skipped -> update path enqueues a new actor.
- Manual `name_en` set while actor is in Phase 2 -> Phase 3 does not overwrite it.
- Options changed while actor is in Phase 2 -> options write skipped.
- Phase 3 DB failure before commit -> retry succeeds without duplicates.

Operational smoke:

- Patch `translate_text` to sleep for 10 seconds.
- Run actor.
- During sleep, verify worker DB connections are not held and `idle in transaction = 0`.
- Bulk enqueue many menu translations and confirm worker DB connections stay bounded.

## Final Recommendation

Approve the 3-phase refactor with one required correction: make menu source updates enqueue a new translation job. Without that, the stale-drop design can permanently skip translations after an in-flight edit.

After that correction, Claude's plan is production-safe and is the right prerequisite before increasing Dramatiq worker concurrency.


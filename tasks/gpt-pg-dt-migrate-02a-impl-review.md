# GPT PG-DT-MIGRATE-02a Implementation Review

Date: 2026-05-23
Branch: `stabilize/post-pg-cutover`
Source prompt: `tasks/zaira-gpt-send-prompt-pg-dt-migrate-02a-impl.md`
Target implementation: `eeab9e9 fix(pg-audit): PG-DT-MIGRATE-02a`

Reviewed areas:
- `backend/models.py`
- `backend/utils/jwt.py`
- `backend/utils/events.py`
- `backend/utils/time_helpers.py`
- `backend/routers/ws_token.py`
- representative converted routers
- `pyproject.toml`
- frontend timestamp parsing grep

## Overall Conclusion

PG-DT-MIGRATE-02a is safe to proceed to deploy after the planned smoke checks. The implementation preserves the current DB contract: all DB datetime writes/comparisons remain naive UTC. It does not start the TIMESTAMPTZ/aware-datetime migration.

Two clarifications:

1. The project uses `python-jose`, not PyJWT, for JWT encode/decode. The naive UTC `exp` behavior still works in local smoke.
2. Frontend grep is not literally zero for `endsWith('Z')`: `KitchenView.jsx` has one defensive parser. It is compatible with `+00:00` because it also checks `!since.includes('+')` before appending `Z`.

## A. JWT Compatibility

The JWT change is compatible:

```python
"exp": now_utc_naive() + timedelta(...)
```

`now_utc_naive()` returns `datetime.now(timezone.utc).replace(tzinfo=None)`, which is the same representation contract as `datetime.utcnow()`: naive datetime whose value is UTC.

Local smoke result:

```text
admin
True
True
```

Command shape used:

```powershell
$env:SECRET_KEY='test-secret'
$env:DATABASE_URL='postgresql+asyncpg://u:p@localhost:5432/db'
uv run python -c "from utils.jwt import create_admin_token, decode_admin_token, create_super_admin_token, create_staff_token; ..."
```

The dummy `DATABASE_URL` is needed because `utils.jwt` imports `database.py` through FastAPI dependencies. For CI, make a tiny script or test that sets `SECRET_KEY` and a non-empty `DATABASE_URL`, then exercises:

- `create_admin_token` -> `decode_admin_token`
- `create_super_admin_token`
- `create_staff_token`
- one deliberately expired token if easy

## B. SQLModel `default_factory`

`Field(default_factory=now_utc_naive)` is safe for SQLModel/Pydantic. It is a zero-argument callable and returns a naive UTC `datetime`, matching the previous `datetime.utcnow` semantics.

Local smoke passed in the app-dir context:

```text
models-ok None None 2026-05-23
```

Important context: importing as `from backend.models import Store` from repo root can fail because the codebase commonly uses `from utils...` imports with `backend` as app dir. The deploy/runtime pattern uses `--app-dir backend`, so the relevant smoke should run from `backend` or with `PYTHONPATH=backend`.

The optional/lambda cases are also safe:

- `Optional[datetime] = Field(default_factory=now_utc_naive)` produces a datetime by default, as before.
- `lambda: now_utc_naive() + timedelta(days=60)` is the right replacement for the subscription default.
- Relationship fields are not affected by this change.

`tzdata>=2024.1` plus the `ZoneInfoNotFoundError` fallback in `time_helpers.py` addresses the earlier Windows import risk.

## C. Event Timestamp Wire Format

Changing event payload timestamps from:

```text
2026-05-22T03:00:00Z
```

to:

```text
2026-05-22T03:00:00+00:00
```

is acceptable. Both parse correctly with browser `Date`.

Frontend grep found one relevant defensive parser:

```javascript
const utcSince = typeof since === 'string' && !since.endsWith('Z') && !since.includes('+') ? since + 'Z' : since;
```

This is compatible with `+00:00`, because strings containing `+` are left unchanged. No regression risk from this line.

EventLog clarification: `backend/utils/events.py` uses `"ts"` in the WS envelope. `log_event()` writes `EventLog.created_at` through the model default, not a separate `ts` column. So the DB audit timestamp remains naive UTC via `now_utc_naive`; the `+00:00` change is a WS/event payload wire-format change.

One consistency note: `ws_token.py` still returns `exp.isoformat() + "Z"` where `exp` is naive UTC. That is separate from this event payload change and remains semantically valid, but timestamp formats are still mixed across APIs.

## D. Smoke Priority

Deploy-before automated checks:

1. Compile/import:
   - `uv run python -m compileall backend`
   - app-dir model import smoke
   - `time_helpers` smoke for `today_jst`, `now_utc_naive`, month/day helpers

2. Grep:
   - `rg -n "datetime\.utcnow" backend -S`
   - Expected remaining: documented legacy/seed files only, plus comments.

3. JWT:
   - admin/super/staff token generation and decode.

4. Event timestamp:
   - create one WS envelope from `utils.events._emit` path if practical, or unit-test timestamp parse with `new Date(ts)`.

Manual or post-deploy smoke:

1. Admin login -> access an admin endpoint -> no unexpected 401.
2. Staff/register/KDS page load -> WS token issuance and KDS elapsed timer render normally.
3. One order/coupon/tabehoudai expiry boundary flow if feasible.
4. Stats pages around current day/month load without SQL or serialization errors.

Top 3 regression risks:

1. Import/runtime context: tests run from repo root may fail unless `PYTHONPATH=backend` or app-dir context is used.
2. Event timestamp format assumptions in un-grepped code or external consumers.
3. Expiry comparisons where a future partial Strategy 3 aware datetime leaks into still-naive code. Current 02a does not do that, but this remains the main future risk.

## E. Deploy Schedule

Prefer one deploy if both PG-CAP-05 and PG-DT-MIGRATE-02a have passed smoke, because the changes are independent and both are low schema-risk:

- PG-CAP-05 changes worker DB session scope and menu update enqueue behavior.
- PG-DT-MIGRATE-02a preserves datetime semantics while replacing deprecated construction.
- Neither changes DB column types.

Split deploy only if operational confidence is low or smoke cannot cover both before the deploy window.

Suggested order if splitting:

1. Deploy PG-CAP-05 first if translation worker capacity is the operational priority.
2. Deploy PG-DT-MIGRATE-02a second after JWT/import/stat smoke.

Suggested order if single deploy:

1. Run automated smoke locally/VM.
2. Deploy.
3. Immediately check:
   - backend import/boot logs
   - admin login
   - KDS/register page
   - one stats endpoint
   - one translation enqueue or update-menu path if practical

## Final Recommendation

Approve PG-DT-MIGRATE-02a for deploy after smoke. The implementation preserves naive UTC semantics, `SQLModel` defaults are safe, and the event timestamp format change is browser-compatible.

Do not mark the broader PG-DT-MIGRATE-02 fully closed until:

- legacy/seed `datetime.utcnow` remains are explicitly accepted or cleaned up,
- deployment smoke passes,
- Cat-2 reporting behavior remains verified after real data checks.


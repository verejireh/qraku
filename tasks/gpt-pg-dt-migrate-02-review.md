# GPT PG-DT-MIGRATE-02 Review

Date: 2026-05-22
Branch: `stabilize/post-pg-cutover`
Source: `tasks/p1-dt-migrate-02-utcnow-classification-analysis.md`

Reviewed files:
- `tasks/p1-dt-migrate-02-utcnow-classification-analysis.md`
- `tasks/p1-datetime-utc-migration-analysis.md`
- `tasks/gpt-p1-datetime-review.md`
- `tasks/gpt-p1-date-grouping-review.md`
- `tasks/claude-parallel-handoff-pg-cap05-dt-migrate02.md`
- `backend/utils/time_helpers.py`
- `backend/models.py`
- `backend/utils/jwt.py`
- `backend/utils/events.py`
- `backend/routers/stats.py`
- `backend/routers/insights.py`
- `backend/routers/super_admin.py`
- `backend/routers/discover.py`
- `backend/routers/beta.py`
- selected related routers from `rg`

## Overall Conclusion

Claude's classification is mostly correct and the "no blind sed" approach is necessary. Strategy 2 should proceed, but with three required corrections:

1. Add or account for `tzdata` before importing `utils.time_helpers` from `models.py` on Windows/Python 3.12. In this workspace, `from backend.utils.time_helpers import now_utc_naive` fails because `ZoneInfo("Asia/Tokyo")` cannot find timezone data.
2. Verify all `datetime.utcnow` references, not only `datetime.utcnow()`. `models.py` uses `Field(default_factory=datetime.utcnow)`, which is a callable reference and will not be found by a `datetime.utcnow()` grep.
3. Split rolling windows more carefully. `stats/insights/super_admin` are mostly JST business-calendar queries, but `monthly` needs a month-boundary helper rather than `days * 31`, and platform KPI labels should decide whether "last 7 days" means calendar days or last 168 hours.

Recommendation: approve Phase 2a after the `tzdata`/import issue is handled; do Phase 2b with explicit endpoint-by-endpoint semantics.

## A. Classification And Conversion Patterns

The six categories are sound:

- Cat-1 DB naive UTC writes/comparisons -> `now_utc_naive()`
- Cat-2 rolling windows -> semantic review
- Cat-3 event timestamps -> aware UTC ISO
- Cat-4 JWT exp -> preserve naive UTC in Strategy 2
- Cat-5 seed/migration scripts -> lower priority
- Cat-6 fixed-offset JST -> `ZoneInfo("Asia/Tokyo")` / shared `JST`

### `models.py` Default Factories

`Field(default_factory=now_utc_naive)` is valid for SQLModel/Pydantic. A default factory is just a zero-argument callable, and `now_utc_naive()` returns the same value class as `datetime.utcnow()`: a naive `datetime` whose value is UTC.

Recommended patterns:

```python
from utils.time_helpers import now_utc_naive

created_at: datetime = Field(default_factory=now_utc_naive)

subscription_expires_at: Optional[datetime] = Field(
    default_factory=lambda: now_utc_naive() + timedelta(days=60)
)
```

This is safe while DB columns remain `TIMESTAMP WITHOUT TIME ZONE`.

Important grep correction:

```bash
rg -n "datetime\.utcnow" backend -S
```

Use this, not only:

```bash
rg -n "datetime\.utcnow\(\)" backend -S
```

The second form misses `default_factory=datetime.utcnow`.

### Cat-3 Event Timestamp Format

Changing:

```python
datetime.utcnow().isoformat() + "Z"
```

to:

```python
datetime.now(timezone.utc).isoformat()
```

is semantically correct, but it changes wire format from `...Z` to `...+00:00`. Browsers parse both, but frontend code must not string-match the trailing `Z`.

If protocol stability matters more than style, use:

```python
datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
```

Either format is valid ISO-8601; choose one intentionally and keep WS/event payloads consistent.

## B. Rolling Window Semantics

Claude's broad split is right, but a few cases need refinement.

### `stats.py`

Most admin stats endpoints are business reporting surfaces, so JST calendar boundaries are appropriate:

- `/summary`
- `/daily`
- `/top-menus`
- `/sales-by-category`
- `/sales-by-menu`
- `/weekly`

For these, `days_ago_jst_as_utc_naive(days)` is better than raw `now_utc_naive() - timedelta(days=days)` if the UI label means "last N business days including today."

However, `/monthly` should not use `days_ago_jst_as_utc_naive(months * 31)`. It groups by JST year/month, so use a month-aware helper:

```python
months_ago_jst_month_start_as_utc_naive(months: int, now: datetime | None = None)
```

or compute the first day of the earliest included JST month and convert that to naive UTC. The existing `months * 31` was already approximate; Strategy 2 is a good time to stop carrying that approximation.

### `insights.py`

The four `days` filters are admin insight/reporting endpoints. Treat them as JST calendar-day windows unless product copy explicitly says "last N x 24 hours."

### `super_admin.py`

There are two kinds of windows:

- Daily revenue chart and top stores by revenue: use JST calendar-day boundaries because they group/report by business dates.
- Platform counters labelled "last 7 days" or "last 30 days": either approach can be defended. If these are dashboard business metrics, JST calendar days are consistent with the rest of the admin reporting. If they are operational freshness counters, rolling 24h is acceptable. Pick one and make the label match.

### `discover.py`

Claude's rolling 24h classification is reasonable. Public discovery "popular in recent 30 days" can be rolling and does not need store-business-day exactness.

### `beta.py`

Rolling 24h x 7 is correct. This is an abuse/deduplication window, not a business-day report.

### Additional Items To Classify

The current `rg` shows additional or easy-to-miss cases:

- `backend/routers/stores.py:578` recent photo contest coupon check: likely rolling 30 x 24h is fine.
- `backend/routers/loyalty_analytics.py:22` computes current month start using UTC `now.year/month`; this should be JST month start if it is "this month's loyalty analytics."
- `backend/routers/demo.py:42,94` demo cleanup windows are rolling/expiry logic, so `now_utc_naive()` is fine.
- `backend/legacy/migrate_subscriptions.py:30` has moved under `backend/legacy`; treat as Cat-5.

## C. Import-Cycle And Environment Risk

No direct import cycle is apparent:

- `models.py` can import `utils.time_helpers`.
- `utils.time_helpers` does not import `models`.
- `database.py` imports models, but `time_helpers.py` does not import database.

So the dependency direction is acceptable.

The actual issue found in this workspace is timezone data availability:

```text
ZoneInfoNotFoundError: 'No time zone found with key Asia/Tokyo'
```

This happened when running:

```bash
uv run python -c "from backend.models import Store; from backend.utils.time_helpers import now_utc_naive; print(Store.__name__, now_utc_naive().tzinfo)"
```

Root cause: Windows Python often needs the `tzdata` package for `zoneinfo`. `pyproject.toml` currently has `pytz` but not `tzdata`.

Must-fix before making `models.py` import `time_helpers`:

- Add `tzdata` to project dependencies, or
- Make `time_helpers.py` robust to missing `ZoneInfo("Asia/Tokyo")` with a controlled fallback, though adding `tzdata` is cleaner.

Without this, moving `models.py` default factories to `now_utc_naive` can make basic model imports fail in local/CI Windows environments.

## D. `models.py` Default Factory Timing

Do the `models.py` default factory change in Strategy 2, not Strategy 3.

Reason:

- `now_utc_naive()` preserves the existing DB contract: naive UTC.
- It removes Python 3.12 deprecation risk.
- It does not introduce aware datetimes into naive DB columns.
- It makes defaults consistent with router writes.

This is not a partial aware migration. It remains a naive UTC migration. Strategy 3 is when defaults should change again to aware UTC and DB columns to `TIMESTAMPTZ`.

One caution: changing `models.py` imports can have wider blast radius than changing routers. Run import smoke tests after this specific change.

Recommended smoke:

```bash
uv run python -c "from backend.models import Store, Order, EventLog; print(Store().model_fields.keys() if False else 'ok')"
uv run python -c "from backend.utils.time_helpers import now_utc_naive, today_jst; print(now_utc_naive(), today_jst())"
```

The exact model instantiation may require required fields, so import-only checks are enough for this risk.

## E. Required Smoke / Tests

Claude's proposed tests are good. Add these:

1. Dependency/import smoke

Verify `backend.models` imports on the target dev/CI OS after adding `tzdata` or fallback handling.

2. Grep smoke

Use both patterns:

```bash
rg -n "datetime\.utcnow" backend -S
rg -n "datetime\.now\(\)" backend -S
rg -n "date\.today\(\)" backend -S
```

The first catches callable references in `models.py`.

3. JWT smoke

- Create admin token.
- Decode it.
- Access one admin endpoint.
- Create super admin/staff tokens if those helpers are touched.
- Confirm expired-token behavior still returns 401.

4. Event timestamp smoke

- Emit one WS/event payload.
- Confirm frontend or tests accept the chosen timestamp format.
- Search frontend for strict `Z` assumptions and `toISOString().slice(0, 10)` business-date risks.

5. Expiry comparison smoke

Cover:

- subscription expiry
- coupon expiry
- tabehoudai session expiry
- table join window expiry
- WS token expiry

6. Reporting regression smoke

For a fixed dataset around JST midnight, compare:

- `/stats/daily`
- `/stats/summary`
- `/stats/monthly`
- `/admin/insights/visitors`
- `/super-admin/platform/daily-revenue` or equivalent route

The test data should include orders between UTC 15:00 and UTC 00:00 because that is where UTC day and JST day differ.

7. Current-month loyalty smoke

Check `loyalty_analytics.py` if it is included in this migration. Its month start should be JST if the UI says "this month" for store/admin reporting.

## Final Recommendation

Proceed with Strategy 2 in phases:

1. First add `tzdata` or otherwise make `ZoneInfo("Asia/Tokyo")` reliable in local/CI environments.
2. Convert Cat-1, Cat-4, and simple Cat-6. Include `models.py` default factories in this phase.
3. Convert Cat-3 with an explicit wire-format decision: keep `Z` or move all event timestamps to `+00:00`.
4. Convert Cat-2 after endpoint semantics are written down. Use a month-start helper for monthly reports, not `days * 31`.
5. Leave Cat-5 legacy/seed scripts for a cleanup commit unless they block grep-zero goals.

The plan is good, but do not close PG-DT-MIGRATE-02 until `rg "datetime\.utcnow"` is clean except documented legacy files and the Windows `ZoneInfo` dependency problem is resolved.


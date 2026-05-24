# GPT P1 Date Grouping Review

Date: 2026-05-22
Branch: `stabilize/post-pg-cutover`
Source: `tasks/p1-date-grouping-utc-day-analysis.md`

Reviewed files:
- `backend/utils/db_compat.py`
- `backend/utils/time_helpers.py`
- `backend/routers/register.py`
- `backend/routers/stats.py`
- `backend/routers/insights.py`
- `backend/routers/super_admin.py`

## Overall Conclusion

Option A is directionally correct for preserving the former JST business-day semantics after the PostgreSQL cutover. Applying the store timezone conversion inside `date_only()`, `hour()`, `year()`, `month()`, and `day_of_week()` is the right compatibility layer if the database continues to store naive UTC timestamps.

The main caveat is performance, not correctness. Expressions such as:

```sql
CAST(timezone('Asia/Tokyo', timezone('UTC', created_at)) AS date)
```

will not normally use a plain B-tree index on `created_at` for equality filtering. For high-volume paths, especially "today" filters, prefer raw UTC range predicates or add a matching expression index after verifying the exact compiled SQL with `EXPLAIN`.

## A. Index Matching

The helper pattern in `db_compat.py` is semantically correct:

```python
def _to_store_tz(col):
    return func.timezone(STORE_TZ, func.timezone("UTC", col))

def date_only(col):
    return cast(_to_store_tz(col), Date)
```

For a `timestamp without time zone` column that is treated as naive UTC:

- `created_at AT TIME ZONE 'UTC'` interprets the value as a UTC instant.
- `... AT TIME ZONE 'Asia/Tokyo'` converts that instant to JST wall-clock time.
- `CAST(... AS DATE)` returns the JST business date.

This is correct for grouping and reporting.

Index behavior:

- `WHERE CAST(timezone(... created_at ...) AS date) = :d` generally cannot use a normal B-tree index on `created_at`.
- PostgreSQL can use an expression index only if the indexed expression matches the query expression closely enough.
- Existing predicates like `created_at >= :since` can still use the raw `created_at` index when they remain present.

Recommendation:

Use raw UTC ranges for equality-style day filters on hot paths:

```python
start = today_start_jst_as_utc_naive()
end = start + timedelta(days=1)
Order.created_at >= start
Order.created_at < end
```

For grouping-heavy reports, consider an expression index only after checking the exact SQL emitted by SQLAlchemy:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_created_jst_date
ON "order" (((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date);
```

Then verify with:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM "order"
WHERE CAST(timezone('Asia/Tokyo', timezone('UTC', created_at)) AS date) = DATE '2026-05-22';
```

If multi-store timezones become a requirement later, expression indexes per timezone will not scale well. In that case, application-side UTC range construction is safer.

## B. asyncpg Date Bind

`date_only(Order.created_at) == today_jst()` is safe from a DB driver perspective. `today_jst()` returns a Python `datetime.date`, and SQLAlchemy/asyncpg should bind that as a PostgreSQL `date`.

Expected shape:

```sql
CAST(...) AS DATE = $1::date
```

Additional checks:

- Keep `target_date` APIs explicit: the value is a JST business date in `YYYY-MM-DD` format.
- Avoid frontend code that derives the date through `Date.toISOString().slice(0, 10)`, because that converts through UTC and can shift the business date near midnight.
- Prefer HTML date input string values or explicit local/JST date formatting.

An integration test that exercises `today_jst()` through asyncpg is enough to catch bind regressions.

## C. Hour Statistics

`func.extract("hour", _to_store_tz(col))` is correct for JST hourly statistics.

Example:

- Stored naive UTC: `2026-05-22 02:00:00`
- UTC instant: `2026-05-22 02:00Z`
- JST wall-clock: `2026-05-22 11:00`
- Extracted hour: `11`

This matches the intended restaurant/business-hour analytics.

One practical issue: PostgreSQL `extract()` may return a numeric-like value. If response code formats or indexes by hour, normalize explicitly:

```python
hour = int(row.hour)
```

This avoids surprises if a row value arrives as `Decimal` or another numeric type.

## D. Missing Callers And Remaining Risks

The main backend callers appear covered:

- `register.py`: today takeout count checks
- `stats.py`: daily, hourly, target-day, monthly, weekly stats
- `insights.py`: daily trend
- `super_admin.py`: daily trend
- `db_compat.py`: central helper layer

Remaining risks to check:

1. Raw SQL date functions

Search for direct SQL usage that bypasses `db_compat.py`:

```bash
rg -n "DATE\\(|EXTRACT\\(|date_trunc|created_at::date|CAST\\(.* AS DATE" backend -S
```

2. Legacy UTC-midnight construction

Look for patterns such as:

```python
datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
```

These should usually become JST-day-start helpers when used for business-day semantics.

3. Frontend `target_date`

Backend fixes are not enough if the browser submits a UTC-derived date string. Check the caller that constructs `target_date` and ensure it sends a plain local/JST `YYYY-MM-DD` date.

4. Rolling windows versus calendar days

Queries using `datetime.utcnow() - timedelta(days=days)` may still be valid if they mean "last N x 24 hours." If the product meaning is "last N JST calendar days," they need a JST-aware calendar boundary helper.

5. Monthly cutoff approximation

Patterns such as `datetime.utcnow() - timedelta(days=months * 31)` are approximate. They may be acceptable for broad trend windows, but they do not represent exact JST month boundaries.

## Recommended Follow-Up

1. Keep Option A for correctness.
2. Convert hot equality filters from `date_only(created_at) = date` to UTC range predicates.
3. Add `int(row.hour)` normalization in hourly response mapping if not already present.
4. Run the raw SQL/date-function grep above before closing PG-DT-DG.
5. Verify frontend `target_date` generation does not use UTC ISO slicing.


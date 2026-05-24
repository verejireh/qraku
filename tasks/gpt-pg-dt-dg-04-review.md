# GPT PG-DT-DG-04 Review

Date: 2026-05-24
Branch: `stabilize/post-pg-cutover`
Source: `tasks/p1-dt-dg-04-hotpath-utc-range-analysis.md`

Reviewed areas:
- `backend/utils/time_helpers.py`
- `backend/utils/db_compat.py`
- `backend/routers/register.py`
- `backend/routers/stats.py`
- representative remaining `date_only()`/`group_by()` callers

## Overall Conclusion

PG-DT-DG-04 is safe and worth deploying. Replacing hot-path `date_only(Order.created_at) == day` predicates with `[start, end)` UTC ranges preserves JST-day semantics and gives PostgreSQL a predicate shape that can use the existing `created_at` B-tree index.

The remaining `group_by(date_only(...))` cases should not get an expression index yet. Measure at realistic scale first. For 1.8M rows, a once-per-report sequential scan/group aggregate may still be acceptable, while an expression index adds write amplification, storage, and migration complexity.

## A. Helper Boundary Semantics

`jst_day_range_as_utc_naive()` is correct for this application:

```python
start_jst = datetime.combine(day, datetime.min.time()).replace(tzinfo=JST)
end_jst = start_jst + timedelta(days=1)
start_utc = start_jst.astimezone(timezone.utc).replace(tzinfo=None)
end_utc = end_jst.astimezone(timezone.utc).replace(tzinfo=None)
```

For `Asia/Tokyo`, this is safe across leap years, month ends, and year ends:

- `date + timedelta(days=1)` handles leap day/month/year rollover.
- JST has no DST transition, so local midnight is not a nonexistent or ambiguous wall time.
- The fallback fixed-offset `timezone(+09:00)` is semantically equivalent for modern JST business dates.

Small refinement if you want this helper to be future-proof for arbitrary store timezones:

```python
end_day = day + timedelta(days=1)
end_jst = datetime.combine(end_day, datetime.min.time()).replace(tzinfo=JST)
```

For JST there is no practical difference. For DST-observing zones, computing the next local midnight from the next date is clearer than adding 24 hours to an aware datetime.

## B. Equality To Range Semantics

The 4 hot-path rewrites are semantically equivalent:

```python
date_only(Order.created_at) == d
```

becomes:

```python
Order.created_at >= start
Order.created_at < end
```

where `start/end` are the UTC-naive instants for JST day `[00:00, next 00:00)`.

Boundary behavior is correct:

- `start` is included.
- `end` is excluded.
- This exactly matches `date_only(created_at) == d`.

`payment_status == "paid"` and `shop_id` predicates remain valid. Index usage may still be limited by index shape:

- Existing `created_at` index can support the range.
- Existing `shop_id` index can also help.
- PostgreSQL may choose bitmap index combinations or one index plus residual filters.

If these endpoints become hot at large scale, the strongest index is likely a composite index such as:

```sql
CREATE INDEX CONCURRENTLY idx_order_shop_created_at
ON "order" (shop_id, created_at);
```

For paid-only daily counters, a partial composite index could be even better:

```sql
CREATE INDEX CONCURRENTLY idx_order_shop_paid_created_at
ON "order" (shop_id, created_at)
WHERE payment_status = 'paid';
```

Do not add these preemptively unless production `EXPLAIN` shows the current plan is not enough.

## C. 1.8M Row Plan Simulation

The expectation is sound: range predicates should scale much better than expression equality because they preserve ordinary B-tree index eligibility.

Recommended non-prod simulation:

1. Create a scratch database or scratch table with the same relevant columns/indexes.
2. Insert synthetic rows using `generate_series`.
3. Run `ANALYZE`.
4. Compare expression equality vs range predicates with `EXPLAIN (ANALYZE, BUFFERS)`.

Example shape:

```sql
CREATE TABLE order_synth (
  id bigserial PRIMARY KEY,
  shop_id text NOT NULL,
  payment_status text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  total_amount numeric NOT NULL DEFAULT 1000
);

INSERT INTO order_synth (shop_id, payment_status, created_at)
SELECT
  'shop_' || (g % 50),
  CASE WHEN g % 5 = 0 THEN 'pending' ELSE 'paid' END,
  timestamp '2025-05-01 00:00:00' + (g || ' minutes')::interval
FROM generate_series(1, 1800000) AS g;

CREATE INDEX idx_order_synth_created_at ON order_synth (created_at);
CREATE INDEX idx_order_synth_shop_id ON order_synth (shop_id);
ANALYZE order_synth;
```

Compare:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM order_synth
WHERE shop_id = 'shop_1'
  AND payment_status = 'paid'
  AND CAST(timezone('Asia/Tokyo', timezone('UTC', created_at)) AS date) = DATE '2026-05-22';
```

with:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM order_synth
WHERE shop_id = 'shop_1'
  AND payment_status = 'paid'
  AND created_at >= TIMESTAMP '2026-05-21 15:00:00'
  AND created_at <  TIMESTAMP '2026-05-22 15:00:00';
```

If using `pgbench`, use it mainly to repeat query latency under concurrency. For plan shape, plain SQL with `generate_series` is enough.

Measure:

- planning time
- execution time
- shared hit/read buffers
- rows removed by filter
- index scan vs bitmap scan vs sequential scan
- cold-ish run after restart only if you need disk-read behavior; otherwise compare warm-cache plans consistently

## D. Expression Index For `group_by(date_only(...))`

Do not add the expression index yet.

Potential index:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_created_jst_date
ON "order" (((timezone('Asia/Tokyo', timezone('UTC', created_at)))::date));
```

Operational costs:

- `CREATE INDEX CONCURRENTLY` cannot run inside a normal transaction block.
- It performs multiple scans and takes longer than a normal index build.
- It uses extra disk roughly proportional to row count and indexed expression size.
- It adds write amplification to every future insert/update touching `created_at`.
- It increases vacuum/index maintenance work.
- It must match the query expression closely; SQLAlchemy's emitted expression should be verified before relying on it.

For 1.8M rows, the index may be useful only if daily/monthly grouped reports are frequent and slow. If reports are occasional admin views, a sequential scan plus hash aggregate may be acceptable.

Better decision rule:

- If grouped report p95 is under the product SLO, no expression index.
- If grouped report p95 is high and buffers show full-table pressure, test the expression index on staging.
- If adding an index, prefer Alembic/manual migration, not inline `init_db`, because `CONCURRENTLY` and transactional init flows do not mix well.

## E. Deploy Timing

PG-DT-DG-04 is safe to deploy with the current stabilization batch. It is a query predicate rewrite plus helper addition; it does not change schema or stored data.

Recommended deploy checks:

1. Helper smoke:
   - `jst_day_range_as_utc_naive(date(2026, 2, 29))`
   - month/year boundary dates
   - current `today_jst()` range

2. Endpoint smoke:
   - register today's paid orders
   - register today's takeout/order count path
   - `/stats/hourly`
   - `/stats/hourly-guests?target_date=YYYY-MM-DD`

3. SQL plan smoke:
   - run `EXPLAIN (ANALYZE, BUFFERS)` for one rewritten query on production-size-ish data or staging synthetic data.

No need to split deploy solely for PG-DT-DG-04. If something goes wrong, rollback is straightforward: revert the helper/caller change to `date_only(...) == day`.

## Final Recommendation

Approve PG-DT-DG-04. The helper boundary semantics are correct for JST, the 4 hot-path rewrites preserve behavior, and the change improves index eligibility without schema risk.

Defer group-by expression indexes until measured evidence justifies them. If needed later, add via Alembic/manual concurrent index workflow, not inline boot-time migration.


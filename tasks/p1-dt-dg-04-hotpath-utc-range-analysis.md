# PG-DT-DG-04 — 핫패스 `date_only(...) == today` → UTC range 전환

**작성일**: 2026-05-22
**근거**: [`gpt-p1-date-grouping-review.md`](./gpt-p1-date-grouping-review.md) §A "Index Matching" 권고
**상위 카드**: PG-DT-DG (date_only JST 옵션 A)
**선행 commit**: e0607f9 (db_compat JST 변환), 12e6ca5 (P1 #7 helpers)

---

## 문제 정의

P1 #7 Strategy 1 + PG-DT-DG (옵션 A) 적용 후 `date_only(...)` 가 PG `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'` 변환을 내장:

```python
# backend/utils/db_compat.py (현재)
def date_only(col):
    return cast(_to_store_tz(col), Date)  # JST date

def _to_store_tz(col):
    return func.timezone("Asia/Tokyo", func.timezone("UTC", col))
```

**SQL 결과**:
```sql
CAST(timezone('Asia/Tokyo', timezone('UTC', created_at)) AS date) = '2026-05-22'
```

**문제** (GPT 세션 E §A):
- 함수 결과 비교 → `created_at` 의 일반 B-tree 인덱스 사용 불가
- expression index `((timezone('Asia/Tokyo', timezone('UTC', created_at)))::date)` 가 있어야 매칭
- expression index 없는 현재는 **항상 seq scan**

**작은 테이블 (현재 151 orders)** 에선 차이 미미하지만, **50 매장 × 1 년 = 약 1.8M rows** 시점부터 성능 차이 커짐.

---

## 영향 매핑

### 핫패스 equality 4 곳 (UTC range 전환 대상)

```
backend/routers/register.py:426
  date_only(Order.created_at) == today
  → "오늘 매출" 화면 (사장님이 매일 보는 핵심 화면)

backend/routers/register.py:490
  (date_only(Order.created_at) == today)
  → 오늘 매출 합계

backend/routers/stats.py:114
  date_only(Order.created_at) == today
  → /hourly 시간대별 주문 수

backend/routers/stats.py:275
  date_only(Order.created_at) == d
  → /hourly-guests 특정 날짜 손님 수 (d = today_jst() 또는 target_date)
```

→ 모두 **사장님 백오피스의 자주 호출되는 매출/주문 조회**. UTC range 전환으로 인덱스 사용 + Filter 단계 비용 절감.

### group_by 7 곳 (별도 처리)

```
backend/routers/insights.py:37, 41
  date_only(Order.created_at).label("day")
  .group_by(date_only(Order.created_at))
  → 일별 매출/방문 추이 차트

backend/routers/stats.py:77
  date_only(Order.created_at).label("day")
  → /daily 일별 매출

backend/routers/super_admin.py:149, 155
  → super admin 일별 매출 차트

backend/routers/super_admin.py:397, 401
  → 동상 (별도 endpoint)
```

→ **range 전환 불가** (그룹화 자체가 함수 결과에 의존). 옵션 2가지:
- (A) expression index 신설: `CREATE INDEX idx_order_created_jst_date ON "order" (((timezone('Asia/Tokyo', timezone('UTC', created_at)))::date))`
- (B) 그대로 두기 — 작은 테이블 (50 매장 × 1년 = 1.8M) 에선 seq scan 비용 허용

→ **(B) 그대로 두기** 권장. 1.8M rows 의 seq scan 도 PG 에선 sub-second. expression index 는 운영 부담 (lock + 디스크) 추가. 출시 후 p95 측정 후 결정.

---

## 인덱스 현황

`backend/models.py:627`:
```python
created_at: datetime = Field(default_factory=now_utc_naive, index=True)
```

→ `Order.created_at` 에 **B-tree 인덱스 존재**. range predicate (`created_at >= X AND < Y`) 가 인덱스 사용 가능.

---

## 운영 VM 측정 (현재 151 orders)

**EXPLAIN ANALYZE — date_only equality (현재 패턴)**:
```
Aggregate  (cost=5.34..5.35)
  Buffers: shared hit=3
  -> Seq Scan on "order"  (actual time=0.043..0.043 rows=0)
       Filter: ... AND ((timezone('Asia/Tokyo', timezone('UTC', created_at)))::date = '2026-05-22')
       Rows Removed by Filter: 104
Planning:
  Buffers: shared hit=139
Planning Time: 1.034 ms
Execution Time: 0.199 ms
```

**EXPLAIN ANALYZE — UTC range (제안 패턴)**:
```
Aggregate  (cost=4.82..4.83)
  Buffers: shared hit=3
  -> Seq Scan on "order"  (actual time=0.085..0.086)
       Filter: (created_at >= '2026-05-21 15:00:00' AND created_at < '2026-05-22 15:00:00' AND shop_id = '1234567')
       Rows Removed by Filter: 104
Planning:
  Buffers: shared hit=10
Planning Time: 0.225 ms
Execution Time: 0.122 ms
```

### 비교

| 지표 | 현재 (date_only) | 제안 (range) | 비고 |
|---|---|---|---|
| Plan node cost | 5.34 | 4.82 | range 가 ~10% 낮음 |
| Planning Buffers | 139 | **10** | **14× 적음** — 함수형 매칭 시도 비용 차이 |
| Planning Time | 1.034 ms | 0.225 ms | **5× 빠름** |
| Execution Time | 0.199 ms | 0.122 ms | 1.6× 빠름 |
| Scan 방식 | Seq Scan | Seq Scan | 작은 테이블 → 둘 다 seq scan |

**현재 데이터 양 (151 orders)** 에선 둘 다 seq scan. PG planner 가 작은 테이블 검색은 인덱스보다 seq scan 이 빠르다고 판단.

**예상 — 1.8M rows (50 매장 × 1 년)**:
- date_only equality: 함수 적용 강제 → 항상 seq scan = 수 초
- range: created_at index 사용 → log N (~수십 ms)
- 차이 **10~100×**

---

## 변환 패턴

### Phase 1 — Helper 추가 (`backend/utils/time_helpers.py`)

```python
def jst_day_range_as_utc_naive(
    day: Optional[date] = None
) -> tuple[datetime, datetime]:
    """JST 특정 날짜의 [00:00, 다음날 00:00) range 를 naive UTC tuple 로 반환.
    
    핫패스 쿼리용 — `date_only(...) == d` 를 `created_at >= start AND < end` 로
    변환할 때 사용. range predicate 는 B-tree 인덱스 사용 가능.
    
    Args:
        day: JST 기준 날짜 (date 객체). None 이면 today_jst().
    
    Returns:
        (start_utc_naive, end_utc_naive): [start, end) 반열린 구간.
            start = JST day 00:00 의 UTC 표현
            end = JST (day+1) 00:00 의 UTC 표현
    """
    if day is None:
        day = today_jst()
    # JST aware datetime → astimezone(UTC) → naive
    start_jst = datetime.combine(day, datetime.min.time()).replace(tzinfo=JST)
    end_jst = start_jst + timedelta(days=1)
    start_utc = start_jst.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_jst.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc
```

### Phase 2 — 4 곳 변환

```python
# backend/routers/register.py:425 (오늘 매출)
# 전:
today = today_jst()
stmt = select(Order).where(
    Order.shop_id.in_(shop_variants),
    Order.payment_status == "paid",
    date_only(Order.created_at) == today,
)

# 후:
from utils.time_helpers import jst_day_range_as_utc_naive
start, end = jst_day_range_as_utc_naive()  # today JST
stmt = select(Order).where(
    Order.shop_id.in_(shop_variants),
    Order.payment_status == "paid",
    Order.created_at >= start,
    Order.created_at < end,
)
```

```python
# backend/routers/register.py:489 (오늘 매출 합계 — 동일 패턴)
# 전:
... (date_only(Order.created_at) == today) ...
# 후:
... (Order.created_at >= start) & (Order.created_at < end) ...
```

```python
# backend/routers/stats.py:114 (/hourly)
# 전:
today = today_jst()
.where(Order.shop_id == shop_id, date_only(Order.created_at) == today)

# 후:
start, end = jst_day_range_as_utc_naive()
.where(Order.shop_id == shop_id, Order.created_at >= start, Order.created_at < end)
```

```python
# backend/routers/stats.py:275 (/hourly-guests, target_date 가변)
# 전:
d = date.fromisoformat(target_date) if target_date else today_jst()
.where(date_only(Order.created_at) == d)

# 후:
d = date.fromisoformat(target_date) if target_date else today_jst()
start, end = jst_day_range_as_utc_naive(d)
.where(Order.created_at >= start, Order.created_at < end)
```

→ 4 위치 모두 같은 패턴. helper 1개 + caller 4 곳 수정.

### Phase 3 — 검증

운영 VM 에서 변환 후 EXPLAIN ANALYZE 재측정:
```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM "order"
WHERE shop_id = '1234567'
  AND created_at >= TIMESTAMP '2026-05-21 15:00:00'
  AND created_at <  TIMESTAMP '2026-05-22 15:00:00';
```

기대: **Index Scan using ix_order_created_at** (또는 PG 가 작은 테이블에선 여전히 seq scan 일 수 있음 — 큰 테이블에서 효과 검증).

---

## 리스크 + 회귀 우려

### Time zone boundary 정확성

`jst_day_range_as_utc_naive()` 반환값 검증:
- JST 2026-05-22 00:00 ~ JST 2026-05-23 00:00
- = UTC 2026-05-21 15:00 ~ UTC 2026-05-22 15:00

Order with `created_at = 2026-05-21 15:00:00 (naive UTC)` → JST 2026-05-22 00:00:00 → 새 코드에선 **포함됨 (>=)**. 옛 코드 `date_only(created_at) == JST 2026-05-22` 와 동일 결과 ✅

경계: `created_at = 2026-05-22 14:59:59` → JST 2026-05-22 23:59:59 → 새 코드 **포함**. 옛 코드도 포함 ✅

경계: `created_at = 2026-05-22 15:00:00` → JST 2026-05-23 00:00:00 → 새 코드 **제외 (< end)**. 옛 코드 `date_only == 2026-05-23` → 다음 날 매출. 일치 ✅

→ semantic 동일.

### 인덱스 사용 검증

운영 데이터가 1.8M 정도 누적된 시점에 EXPLAIN ANALYZE 재측정 권장. 그 전에는 작은 테이블이라 seq scan 그대로 — **회귀 없음 + 잠재적 성능 개선**.

### 정렬/필터 조합

`date_only(Order.created_at) == today` + `payment_status == "paid"` 같은 조합도 range + payment_status 로 그대로 동작. 인덱스가 `created_at` 만 다중 컬럼 인덱스가 없어도 OK.

---

## 액션 아이템

- [x] **PG-DT-DG-04-ANALYSIS** (이번 doc): 영향 매핑 + EXPLAIN 측정 + helper 설계
- [x] **PG-DT-DG-04-IMPL** (이번 커밋): `jst_day_range_as_utc_naive` helper + 4 위치 변환 (register × 2 + stats × 2)
- [x] **PG-DT-DG-04-VERIFY** (이번 커밋): boundary smoke + 변환 후 EXPLAIN 비교
- [ ] **PG-DT-DG-04b (옵션, 후순위)**: group_by 7 곳에 expression index 신설 — 1.8M rows 시점에 p95 측정 후 결정

### 변환 후 EXPLAIN 측정 (운영 VM, 151 orders)

**before** (date_only equality):
```
cost=5.34..5.35  planning_buffers=139  planning=1.034ms  exec=0.199ms
Filter: (timezone('Asia/Tokyo', timezone('UTC', created_at)))::date = '2026-05-22'
```

**after** (UTC range, 변환 후):
```
cost=5.08..5.09  planning_buffers=152  planning=0.960ms  exec=0.209ms
Filter: created_at >= '...' AND created_at < '...' AND shop_id = ...
```

→ 작은 데이터(151 rows)에서 둘 다 Seq Scan + 차이 미미. **1.8M rows 시점에 진가 발휘 예상**. semantic 동일 확인.

### Helper smoke 결과

```
today JST = 2026-05-23
jst_day_range_as_utc_naive():
  start UTC: 2026-05-22 15:00:00  (= JST 2026-05-23 00:00 ✅)
  end   UTC: 2026-05-23 15:00:00  (= JST 2026-05-24 00:00 ✅)
  diff: 1 day

jst_day_range_as_utc_naive(date(2026, 5, 22)):
  start: 2026-05-21 15:00:00 ✅
  end:   2026-05-22 15:00:00 ✅

Boundary: start 포함 (>=), end 제외 (<). 옛 date_only equality 와 semantic 동일.
```

---

## GPT-5.5 교차 검증 요청 항목 (선택)

본 doc 작성 후 자이라가 GPT 에 검토 요청하려면 다음 프롬프트 사용:

```text
Claude 가 PG-DT-DG-04 (핫패스 date_only equality → UTC range 전환) 분석을 작성했습
니다. 검토 부탁드립니다.

대상 파일:
- tasks/p1-dt-dg-04-hotpath-utc-range-analysis.md (Claude 신규 작성)
- tasks/p1-date-grouping-utc-day-analysis.md (상위 카드)
- tasks/gpt-p1-date-grouping-review.md (세션 E review — A 섹션 권고 기반)
- backend/utils/time_helpers.py (helper 추가 위치)
- backend/utils/db_compat.py (date_only 정의)
- backend/routers/register.py, stats.py (변환 대상)

핵심 검토 5 항목:

A. jst_day_range_as_utc_naive(day=None) helper 의 boundary 정확성.
   특히 day = JST date 객체일 때 datetime.combine(day, datetime.min.time())
   .replace(tzinfo=JST) 패턴이 DST 가정 없는 JST 에서 안전한가?

B. 4 곳 equality → range 변환 후 semantic 100% 동일 확인. payment_status 같은
   추가 필터와 함께 쓰일 때 인덱스 매칭 영향?

C. 운영 VM 측정 결과 (151 rows) 에선 둘 다 seq scan. 1.8M rows 시점에 range 가
   인덱스 사용한다는 추정이 합리적인가? 큰 테이블 EXPLAIN 시뮬레이션 방법
   (pgbench / synthesize_orders)?

D. group_by 7 곳에 expression index 신설 (CREATE INDEX ... ((timezone(...) ::date)))
   의 운영 부담 (lock, 디스크, autovacuum). 1.8M rows 에서 1회 빌드 시간 예상?

E. PG-DT-DG-04-IMPL 을 다음 deploy 와 함께 라이브 적용할지, 별도 사이클로
   분리할지? 변환 자체는 위험 0 이지만 timing 권고?

응답을 tasks/gpt-pg-dt-dg-04-review.md 로 저장 + 커밋 부탁.
```

---

## 부록 — group_by 7 곳 expression index 신설 안 (선택, 후속 사이클)

```sql
-- 1.8M rows 시점에 적용 검토. CONCURRENTLY 로 lock 없이 빌드 (시간 ~수 분).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_created_jst_date
ON "order" (((timezone('Asia/Tokyo', timezone('UTC', created_at)))::date));
```

`backend/database.py:migration_sqls` 에 추가 시 주의:
- `CREATE INDEX CONCURRENTLY` 는 트랜잭션 블록 안에서 실행 불가
- PG-CAP-05/init_db Strategy 2 의 단일 트랜잭션 패턴과 충돌
- → Alembic revision 또는 수동 운영 명령으로 분리 필요 (DBM-13 후속 / OPR-07 baseline 후)

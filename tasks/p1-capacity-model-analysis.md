# P1 #9 — Capacity 모델 (worker / pool / connection 예산)

**작성일**: 2026-05-22
**근거**:
- [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) §P1 #9 (uvicorn worker 수 미지정)
- [`gpt-pg-verification-review.md`](./gpt-pg-verification-review.md) §CHECK 6 (`pool 30 × workers 4 = 120 > max_connections=100`)
- [`gpt-p1-init-db-race-review.md`](./gpt-p1-init-db-race-review.md) §C (worker 증설 전 pool 축소)
**범위**: 베치헤드 50 매장 출시 → 500 매장 확장 시나리오까지

---

## 현재 자원 인벤토리 (2026-05-22 운영 VM 측정)

### Backend SQLAlchemy 엔진 설정

**Async engine** (`backend/database.py`):
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```
→ 프로세스당 최대 **30 connections**

**Sync engine** (`backend/workers/db.py`, Dramatiq 용):
```python
engine = create_engine(_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
```
→ Dramatiq 프로세스당 최대 **15 connections**

### systemd 워커 구성

**현재 운영 unit** (`qrorder.service`):
```
ExecStart=/home/verejireh/qr-order-system/.venv/bin/python -m uvicorn main:app \
    --app-dir backend --host 0.0.0.0 --port 8003
```
→ **`--workers` 미지정 = 단일 프로세스** (uvicorn 기본값)

Dramatiq worker 는 별도 service. 현재 1 프로세스 추정.

### PostgreSQL 인스턴스 자원 (Cloud SQL `postgre-sql`)

운영 측정 (psql `SHOW`):
- `max_connections` = **100**
- `shared_buffers` = 1222MB
- `effective_cache_size` ≈ 1.46GB
- `work_mem` = 4MB

→ 총 RAM 추정: 5~6GB (Cloud SQL `db-custom-2-7680` = 2 vCPU / 7.5GB 매칭)

### 실제 활성 connection 분포

```sql
SELECT usename, application_name, state, count(*)
FROM pg_stat_activity ...;
```
| usename | app_name | state | count |
|---|---|---|---|
| cloudsqladmin | cloudsqlagent | idle | 2 |
| ilhae (app) | (None) | idle | 1 |
| ilhae (psql) | psql | active | 1 |

→ **현재 app 이 잡은 connection = 0~1** (트래픽 거의 없음 + lazy pool)

`create_async_engine` 의 pool 은 lazy — 첫 query 가 오기 전엔 connection 생성 안 함. 따라서 현재 측정은 "최대 동시 사용량" 이 아닌 "현 시점 점유량".

---

## Connection 예산 계산 모델

### 기본 공식

```
Total = (uvicorn_workers × (pool_size + max_overflow))
      + (dramatiq_workers × (worker_pool_size + worker_max_overflow))
      + reserve (cloudsqladmin, psql, alembic, 운영자 ad-hoc)

Budget Check: Total ≤ max_connections - safety_margin
  (safety_margin = 10~20 권장 — 운영자 ad-hoc + 모니터링용)
```

### 시나리오별 시뮬레이션

| 시나리오 | uvicorn | Dramatiq | app conn | reserve | total | max_conn=100 | max_conn=200 |
|---|---|---|---|---|---|---|---|
| **현재 (1w)** | 1×30 | 1×15 | 45 | 10 | **55** | ✅ 45 여유 | ✅ 145 여유 |
| 2 workers | 2×30 | 1×15 | 75 | 10 | **85** | ⚠️ 15 여유 | ✅ 115 여유 |
| 3 workers | 3×30 | 1×15 | 105 | 10 | **115** | 🔴 **초과 15** | ✅ 85 여유 |
| 4 workers | 4×30 | 1×15 | 135 | 10 | **145** | 🔴 **초과 45** | ✅ 55 여유 |
| 8 workers | 8×30 | 2×15 | 270 | 10 | **280** | 🔴 **초과 180** | 🔴 **초과 80** |

→ **`--workers 3+` 부터 max_connections=100 초과**. GPT 지적 정확.

### 만약 pool 축소한다면 (5+5 per uvicorn)

| 시나리오 | uvicorn pool | total | max_conn=100 | max_conn=200 |
|---|---|---|---|---|
| 2 workers | 2×10 + 15 | 45 | ✅ | ✅ |
| 4 workers | 4×10 + 15 | 65 | ✅ 25 여유 | ✅ 125 여유 |
| 8 workers | 8×10 + 30 | 120 | 🔴 초과 30 | ✅ 70 여유 |

→ pool 축소 + max_conn 100 유지 시 **4 workers 가 안전 한도**. 8 workers 는 max_conn 상향 필수.

---

## 트래픽 기반 capacity 수요 추정

### 베치헤드 50 매장 시나리오

- 평균 일 100 주문/매장 × 50 매장 = **5,000 주문/일**
- 점심 피크 (12:00 JST) 1 시간에 일 매출의 25% 집중 = **1,250 주문/h**
- 분당 = **21 주문/분** ≈ **0.35 주문/초**

각 주문 트랜잭션의 connection 사용 시간 추정:
- order 생성 + Square 결제 검증 + KDS WebSocket broadcast = **0.5~2 초** (Square API 지연 포함)
- 동시 in-flight 트랜잭션 = 0.35 × 2 = **약 0.7 connections 평균**
- 99 percentile 동시 = 약 5~10 connections (네트워크 지연 + 재시도 가정)

여기에 다음 부하 추가:
- KitchenView WebSocket 연결 50 매장 × 평균 2 KDS = **100 WS 동시 연결** (long-lived connection — 단, 별도 pool 안 씀)
- /api/discover/nearby 등 손님 메뉴 brows ing = 점심 시간 약 100 동시 손님 × 0.1 req/s = 10 req/s
- 통계/대시보드 (사장님 admin) = 매장당 1~2 동시 = 50~100 동시 admin session

**결론**: 50 매장 피크 시 동시 활성 DB connection 약 **20~30** 추정. 1 worker × pool 30 으로 충분.

### 500 매장 시나리오 (1년 후 가정)

- 50,000 주문/일 × 25% 피크 / 60분 = **210 주문/분** = **3.5 주문/초**
- in-flight = 3.5 × 2 = 7 평균, p99 = 30~50
- WS 1,000 동시 (별도 처리)
- admin 동시 = 500~1,000

→ 4 workers + pool 5+5 × 4 = 40 + reserve = **약 60 connections 사용**. max_conn=100 한도 안.
→ 또는 1 worker + pool 30 + max_overflow 50 도 가능 (큰 burst 흡수).

### 결론 — 50 매장 출시 시점

**현재 단일 worker 구성으로 충분.** 워커 증설은 capacity 문제가 아니라:
- CPU bound 처리 (Square 결제 검증, JSON 직렬화) 의 동시 처리
- p95 응답 시간 단축

목적이며, 베치헤드 50 매장에선 단일 worker p95 가 SLO 안에 들어올 가능성 높음. `tools/pg_query_audit.py` 로 측정 후 결정.

---

## 권장 단계별 capacity 정책

### Stage 1 — 베치헤드 출시 (현재 ~ D+30)

**유지** — 단일 uvicorn worker + 1 Dramatiq worker. 변경 없음.

이유:
- 50 매장 피크 < 30 connections (현 pool 안)
- worker 증설 = capacity 가 아닌 latency 최적화 — p95 측정 전 의미 없음
- init_db Strategy 2 (advisory lock) 가 라이브 적용된 후 안전한 증설 토양 완성

**모니터링 명령** (운영자):
```bash
# 매주 1회 실행 — peak hour 직후 (JST 13:00 이후 권장)
psql "$DATABASE_URL_SYNC" -c "
SELECT now() AS measured_at,
       (SELECT count(*) FROM pg_stat_activity) AS total_conn,
       (SELECT count(*) FROM pg_stat_activity WHERE state='active') AS active_conn,
       (SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction') AS idle_in_tx;"
```

→ `idle in transaction > 0` 지속되면 transaction leak (코드 버그). `total_conn / max_connections > 0.7` 지속되면 pool 증설 또는 worker 증설 검토.

### Stage 2 — D+30 ~ D+90 (워커 증설 가능 시점)

선행 조건 (모두 충족 후 진행):

- [x] **init_db advisory lock** — Strategy 2 라이브 적용 (`ad19215` deploy 후)
- [ ] **pool 축소 PR** — `pool_size=5, max_overflow=10` per worker (안전 마진)
- [ ] **p95 측정** — `tools/pg_query_audit.py` 로 단일 worker 한계 확인 → p95 > 200ms 지속되면 증설
- [ ] **운영자 max_connections 상향** — 100 → 200 (Cloud SQL flag, instance restart 필요)

**제안 설정**:
```python
# backend/database.py
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,        # 10 → 5 (worker N 증설 대비)
    max_overflow=10,    # 20 → 10
    pool_recycle=300,   # 5분마다 connection 갱신 (idle connection 누수 방지)
)
```

```ini
# qrorder.service ExecStart 수정
ExecStart=.../python -m uvicorn main:app --app-dir backend \
    --host 0.0.0.0 --port 8003 --workers 2
```

→ 2 workers × 15 = 30 + Dramatiq 15 + reserve 10 = **55 conns** (max_conn=100 안에 여유 45)

### Stage 3 — D+90 이후 (대규모 확장 시)

500 매장 또는 트래픽 폭증 시 옵션:

**Option A — Cloud SQL upgrade**
- `db-custom-2-7680` → `db-custom-4-15360` (4 vCPU / 15GB) 또는 `db-custom-8-30720`
- max_connections 200 → 400 자동 조정
- 비용 2 배

**Option B — PgBouncer 도입**
- Cloud SQL 외부 connection pooler (Docker container or GCE VM)
- app 의 connection 수 1/10 로 감소
- 트랜잭션 mode 사용 시 prepared statements 사용 제약 (현재 코드 점검 필요)
- 운영 복잡도 ↑

**Option C — Read replica + 분기**
- discover.py / stats.py / insights.py 같은 분석 쿼리를 replica 로 라우팅
- write 쿼리만 primary 유지
- 코드 변경 큼 (engine 2 개 운영)

**권장 순서**: 측정 → A → B → C. A 가 가장 빠른 해결책.

---

## 즉시 처리 가능 액션 아이템

- [ ] **PG-CAP-01** (다음 deploy 와 함께): `pool_recycle=300` 추가 — idle connection 누수 예방. 1줄 변경, 위험 0.
- [ ] **PG-CAP-02** (출시 직후): 운영자 모니터링 스크립트 작성 + 매주 1회 실행 (현재 connection 사용량 기록)
- [ ] **PG-CAP-03** (D+30 평가): `tools/pg_query_audit.py` 단일 worker p95 측정 → 증설 필요 판정
- [ ] **PG-CAP-04** (필요 시): pool_size=5 / max_overflow=10 축소 + `--workers 2` 적용
- [ ] **OPR-MAX-CONN** (운영자, 필요 시): Cloud SQL `max_connections` 100 → 200 flag 변경

---

## GPT-5.5 교차 검증 요청 항목

```
Claude 가 P1 #9 capacity 모델을 분석했습니다. 핵심 결론:

1. 현재 (1 worker × pool 30 + Dramatiq × 15 = 45 max) 가 베치헤드 50 매장 피크
   (~20~30 동시 conn 추정) 에 충분.
2. workers 3+ 는 max_connections=100 초과. 증설 전 pool 축소 (5+10) + p95 측정 필수.
3. 500 매장 확장 시 Cloud SQL tier upgrade (db-custom-4-15360) 가 PgBouncer 보다
   먼저 검토.
4. pool_recycle=300 추가는 idle connection 누수 예방 (위험 0, 즉시 적용 가능).

검증 요청:

A. **트래픽 추정의 타당성**:
   "50 매장 × 100 주문/일 × 25% 피크 시간 = 21 주문/분 = 약 0.7 in-flight conn"
   추정이 합리적인가? 누락된 부하 (예: 손님이 메뉴 페이지 머무는 동안 polling 같은
   long-lived request) 가 있는가?

B. **pool_recycle 값 선택**:
   pool_recycle=300 (5분) 이 Cloud SQL Proxy + asyncpg 환경에서 적절한가?
   Cloud SQL 의 wait_timeout 기본값과 충돌 없는가?

C. **WebSocket connection 회계**:
   KitchenView 의 long-lived WebSocket 50~100개가 DB connection pool 을 점유하지
   않지만, idle async session 이 별도로 잡혀있을 가능성. ws_token.py / 관련
   라우터 점검 권고가 의미 있는가?

D. **Dramatiq worker 확장**:
   현재 1 Dramatiq worker × 15 pool. food_rescue_scheduler / translate_tasks 가
   증가하면 worker 2~4개로 늘려야 할 수 있음. 그 시점의 pool 설정 권고?

E. **PgBouncer transaction mode vs prepared statements**:
   asyncpg 가 prepared statements 를 자동 사용 (statement_cache_size 기본 100).
   PgBouncer transaction mode 는 이걸 깨뜨림. 도입 전 코드 점검 필요한 부분?

F. **Cloud SQL tier 추정 정확도**:
   shared_buffers=1222MB, effective_cache_size≈1.46GB 로부터 `db-custom-2-7680`
   (2 vCPU / 7.5GB) 추정. gcloud sql instances describe 명령으로 정확히 확인할
   방법이 있는가?
```

응답 저장: `tasks/gpt-p1-capacity-review.md`

---

## 부록 — 측정 명령 모음

운영자가 주기적으로 실행:

```sql
-- A. Connection 사용량 (peak hour 직후)
SELECT now() AS measured_at,
       (SELECT count(*) FROM pg_stat_activity) AS total,
       (SELECT count(*) FROM pg_stat_activity WHERE state='active') AS active,
       (SELECT count(*) FROM pg_stat_activity WHERE state='idle') AS idle,
       (SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction') AS idle_in_tx;

-- B. Connection-by-user
SELECT usename, application_name, state, count(*)
FROM pg_stat_activity
WHERE datname = 'qraku'
GROUP BY usename, application_name, state
ORDER BY count(*) DESC;

-- C. 가장 오래 점유 중인 connection
SELECT pid, usename, application_name, state,
       now() - state_change AS state_duration,
       now() - query_start AS query_duration,
       left(query, 100) AS query_preview
FROM pg_stat_activity
WHERE datname = 'qraku'
ORDER BY state_change ASC
LIMIT 10;

-- D. 잠긴 query (orphan transaction)
SELECT pid, usename, state,
       now() - state_change AS stuck_for,
       left(query, 200)
FROM pg_stat_activity
WHERE datname = 'qraku' AND state = 'idle in transaction'
  AND now() - state_change > interval '30 seconds';
```

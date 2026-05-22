# GPT P1 Capacity Review

**작성일**: 2026-05-22  
**대상**: `stabilize/post-pg-cutover`  
**검토 문서**: `tasks/p1-capacity-model-analysis.md`  
**관련 코드**:
- `backend/database.py`
- `backend/workers/db.py`
- `backend/routers/ws.py`
- `backend/utils/websocket.py`
- `backend/workers/food_rescue_scheduler.py`
- `backend/workers/translate_tasks.py`
- `setup_server.sh`
- `docker-compose.yml`

## 총평

Claude의 capacity 모델은 보수적으로 잘 잡혀 있습니다. 특히 "worker 수를 늘리기 전에 pool 총량을 줄이고 p95를 측정한다"는 결론은 맞습니다. 현재 `max_connections=100`에서 `pool_size=10, max_overflow=20`을 worker 수만큼 곱하면 금방 위험해지므로, `--workers 2` 이상을 적용하기 전 pool 축소는 선행조건입니다.

다만 트래픽 추정은 주문 생성만 중심으로 잡혀 있어, 실제 피크에서는 polling, 메뉴 조회, admin/register 화면 refresh, Redis pub/sub, translation task burst가 더해질 수 있습니다. WebSocket 자체는 DB connection을 오래 잡지 않지만, WS 인증과 Redis listener는 별도 회계가 필요합니다.

권장 판정:
- Stage 1 single worker 유지: **타당**
- `pool_recycle=300`: **무해하지만 필수는 아님**
- workers 2 + pool 5/10: **측정 후 적용 가능**
- workers 3+ at max_connections=100: **비권장**
- 500 stores: **Cloud SQL tier upgrade 또는 PgBouncer 검토 필요**

## A. 트래픽 추정 타당성

50 stores, store당 100 orders/day, 점심 1시간에 25% 집중이라는 추정은 시작점으로 타당합니다.

계산:
- 50 * 100 = 5,000 orders/day
- 25% peak hour = 1,250 orders/hour
- 1,250 / 3,600 = 0.35 orders/sec

주문 생성 request가 0.5~2초 동안 DB connection을 잡는다고 보면 평균 DB in-flight는 0.2~0.7 수준입니다. p99 burst를 5~10으로 보는 것도 크게 이상하지 않습니다.

보완해야 할 점:

1. 주문 생성만으로 피크를 보면 과소평가될 수 있습니다.
   피크에는 `/api/menus/{store_id}`, register/KDS polling 또는 refresh, admin list, customer receipt, websocket token 발급이 같이 옵니다.

2. Square 결제 요청은 외부 API latency가 길 수 있지만, 코드가 DB transaction을 열어둔 채 외부 API를 호출하는지 여부가 중요합니다. 외부 API 대기 중 DB session/transaction을 잡고 있으면 connection occupancy가 커집니다.

3. 메뉴 조회는 read-heavy입니다. DB query 자체는 짧아도 요청 수가 orders/sec보다 훨씬 많을 수 있습니다. 점심 시간 고객 100~300명이 동시에 메뉴를 보면 주문 생성보다 메뉴/read API가 병목이 될 수 있습니다.

4. WebSocket은 DB connection을 오래 점유하지 않지만, 연결 수는 uvicorn event loop, memory, file descriptor, Redis pub/sub fanout에 부담입니다.

권장 보정 모델:

```text
DB active connections ~= sum(endpoint_rps * db_hold_seconds_per_request)

peak_rps:
  order_create: 0.35 rps at 50 stores
  menu/read:    5~15 rps
  register/KDS: 1~5 rps
  admin/stats:  0.5~2 rps
```

따라서 50 stores 피크에서 DB active 20~30은 보수적 upper bound로 괜찮습니다. 평균은 훨씬 낮을 가능성이 큽니다. 실제 판단은 `pg_stat_activity active`, `pg_query_audit.py`, endpoint별 access log로 보정해야 합니다.

## B. `pool_recycle=300`

판정: **안전하지만 Cloud SQL Proxy에서 필수는 아니다.**

SQLAlchemy `pool_recycle=300`은 connection checkout 시 connection age가 300초를 넘으면 재연결합니다. Cloud SQL Proxy는 일반적으로 장시간 idle TCP를 비교적 안정적으로 유지하지만, NAT/Proxy/DB restart/maintenance를 고려하면 recycle은 방어적으로 괜찮습니다.

장점:
- 오래된 idle connection 재사용으로 인한 stale connection 오류를 줄입니다.
- `pool_pre_ping=True`와 함께 쓰면 운영 안정성이 좋아집니다.
- 5분 값은 너무 길지도, 너무 짧지도 않습니다.

단점:
- checkout 시점에 재연결이 발생하므로 작은 latency spike가 생길 수 있습니다.
- 트래픽이 많으면 불필요한 connection churn이 약간 늘 수 있습니다.

권장:
- `pool_recycle=300` 유지 가능.
- async engine과 worker sync engine의 정책을 맞추는 것도 고려. 현재 worker `backend/workers/db.py`에는 `pool_recycle`이 없습니다.
- 더 중요한 것은 `pool_size/max_overflow` 총량입니다. recycle은 capacity 문제를 해결하지 않습니다.

Cloud SQL의 MySQL `wait_timeout` 같은 개념과 직접 비교할 필요는 없습니다. PostgreSQL/Proxy 경로에서는 stale connection 방어 옵션으로 이해하면 됩니다.

## C. WebSocket connection 회계

현재 코드 기준으로 WebSocket 연결은 DB connection을 장시간 잡지 않습니다.

`backend/routers/ws.py`:
- connect 전 `validate_ws_token()`에서 Redis 조회만 수행합니다.
- `manager.connect()` 이후 loop는 `await websocket.receive_text()`만 합니다.
- DB session dependency가 없습니다.

`backend/utils/websocket.py`:
- 연결 유지 상태는 in-memory dict에 WebSocket 객체를 보관합니다.
- cross-worker broadcast는 Redis pub/sub를 사용합니다.
- pubsub listener는 Redis connection을 유지하지만 DB connection은 쓰지 않습니다.

따라서 "100 WS = 100 DB connections"가 아닙니다. DB pool capacity에는 직접 반영하지 않는 것이 맞습니다.

다만 회계에 넣어야 할 자원:
- uvicorn worker별 event loop load
- file descriptor
- memory per connection
- Redis pub/sub connection: worker process마다 listener 1개
- Redis publish fanout
- multi-worker일 때 in-memory connection registry가 worker-local이라는 점

multi-worker 주의:
- Redis pub/sub listener가 각 worker마다 하나씩 생깁니다.
- 같은 store에 대한 staff/customer 연결이 여러 workers에 분산됩니다.
- 현재 envelope에 `instance_id`가 있어 자기 publish 중복은 피합니다. 이 구조는 multi-worker fanout에 적절합니다.

권장 추가 검증:
- 100, 500, 1000 WS idle 연결에서 memory/fd/CPU 확인.
- Redis `CLIENT LIST` 또는 connection count 확인.
- WS disconnect cleanup 확인. 현재 send failure 시 list에서 제거하지 않으므로 장기적으로 dead connection 누적 가능성이 있습니다. `send_text` 실패 시 해당 connection 제거를 고려하세요.

## D. Dramatiq worker 확장

현재 worker DB pool:

```python
create_engine(..., pool_size=5, max_overflow=10)
```

worker process당 최대 15 connections입니다. Dramatiq를 `processes=2~4`로 늘리면 sync DB pool도 선형 증가합니다.

작업별 특성:
- `food_rescue_check`: 5분 주기, DB read 후 필요한 row만 update. 보통 low volume.
- `translate_menu`: Gemini/API 호출이 포함됩니다. 현재 DB session을 연 상태에서 번역 API 호출 루프를 수행하는 구조로 보입니다. 이 경우 외부 API 대기 중 DB connection을 오래 잡을 수 있습니다.

`translate_tasks.py`에서:

```python
with SessionLocal() as s:
    m = s.get(Menu, menu_id)
    ...
    translate_text(...)
    ...
    s.commit()
```

이 구조는 translation API latency가 길면 worker DB connection을 오래 점유합니다. worker 확장 시 DB connection occupancy가 예상보다 커질 수 있습니다.

권장:
1. Dramatiq worker 수를 늘리기 전에 `translate_menu`를 2단계로 나눕니다.
   - 짧은 DB session으로 필요한 menu/config 로드 후 session close
   - 외부 translation API 호출
   - 새 DB session으로 저장

2. worker pool은 더 작게 시작합니다.

```python
pool_size=2
max_overflow=3
pool_recycle=300
```

3. worker process/thread 수와 DB pool을 같이 회계합니다.
   docker-compose에는 `dramatiq ... -p 2 -t 4` 경로가 있어 운영에도 비슷한 설정이 들어오면 DB pool 최대치가 커질 수 있습니다.

4. food_rescue는 DB보다 Redis/event fanout과 cron 중복 실행 방지가 더 중요합니다. 여러 scheduler가 동시에 같은 actor를 enqueue하지 않도록 운영 cron을 단일화하세요.

## E. PgBouncer transaction mode vs prepared statements

PgBouncer를 transaction pooling으로 쓰려면 asyncpg prepared statement cache가 문제될 수 있습니다. asyncpg는 기본적으로 prepared statement cache를 사용하고, transaction pooling에서는 session affinity가 없기 때문에 prepared statement 이름 충돌/존재하지 않음 문제가 발생할 수 있습니다.

SQLAlchemy asyncpg에서 PgBouncer transaction mode를 쓸 때 권장:

```python
create_async_engine(
    DATABASE_URL,
    connect_args={
        "statement_cache_size": 0,
    },
    poolclass=NullPool,  # PgBouncer가 pool 담당
)
```

또는 connection URL query로 asyncpg 옵션을 넣는 방식도 검토할 수 있지만, 코드에서 명시하는 쪽이 리뷰하기 쉽습니다.

PgBouncer 모드:
- session pooling: prepared statement cache와 더 잘 맞지만 connection 절감 효과가 transaction pooling보다 작습니다.
- transaction pooling: connection 절감 효과가 크지만 prepared statements, temp table, session state, advisory session lock과 충돌할 수 있습니다.

이 프로젝트는 `pg_advisory_xact_lock`을 쓰는 방향이라 transaction pooling과도 호환됩니다. session-level advisory lock을 쓰면 안 됩니다.

권장:
- 500 stores 전에는 Cloud SQL tier upgrade가 PgBouncer보다 단순합니다.
- PgBouncer 도입 시 별도 spike를 잡고 asyncpg `statement_cache_size=0`, SQLAlchemy pool 비활성화/축소, prepared statement 오류 테스트를 해야 합니다.

## F. Cloud SQL tier 추정 정확도

`shared_buffers=1222MB`만으로 `db-custom-2-7680`이라고 확정하기는 어렵습니다. Cloud SQL PostgreSQL은 메모리와 설정 비율이 edition/version/flags에 따라 다를 수 있습니다.

확정 방법:

```bash
gcloud sql instances describe postgre-sql \
  --format="value(settings.tier,settings.databaseFlags,settings.availabilityType,settings.dataDiskSizeGb)"
```

또는:

```bash
gcloud sql tiers list | grep -E "db-custom|POSTGRES"
```

DB 내부에서 보조 확인:

```sql
SHOW max_connections;
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW work_mem;
SELECT version();
```

2 vCPU / 7.5GB 추정은 plausible하지만, capacity 결정을 내릴 때는 gcloud describe로 tier를 확정해야 합니다.

Cloud SQL tier 권장:
- 50 stores 안정화: 현재 tier + max_connections=100도 single worker면 충분할 가능성이 큽니다.
- workers 2~4: `max_connections=200` 또는 pool 축소가 필요합니다.
- 500 stores: CPU, memory, connection, storage IOPS 모두 봐야 하므로 `db-custom-4-15360` 이상 검토는 합리적입니다. 단, 실제 p95/CPU/active conn 관측 없이 선제 upgrade만으로 결론 내리면 안 됩니다.

## 추가 지적

### `pool_size + max_overflow`는 "상시 점유"가 아니라 "최대 burst"

문서가 최대치 회계와 실제 관측치를 구분한 점은 좋습니다. 운영 의사결정에는 둘 다 필요합니다.

- 최대치 회계: DB가 터지지 않는 상한.
- 관측치: 실제 병목 여부.

worker 증설은 두 조건을 모두 만족해야 합니다.

### `idle in transaction`이 가장 중요한 조기 경보

connection 수보다 더 위험한 것은 long idle transaction입니다. 문서의 monitoring SQL은 적절합니다. 여기에 wait event도 추가하면 좋습니다.

```sql
SELECT pid, state, wait_event_type, wait_event,
       now() - state_change AS state_duration,
       now() - query_start AS query_duration,
       left(query, 120)
FROM pg_stat_activity
WHERE datname = 'qraku'
ORDER BY query_duration DESC NULLS LAST
LIMIT 20;
```

### access log 없이는 RPS 모델 보정이 어렵다

endpoint별 RPS와 p95가 있어야 capacity 모델이 단단해집니다. `pg_query_audit.py`는 synthetic benchmark이고, 운영 access log/ALB log/Cloud Logging 기반 endpoint histogram이 추가되면 더 좋습니다.

## 권장 실행 순서

1. 지금은 single worker 유지.
2. `pool_recycle=300`은 유지.
3. peak hour에 `pg_stat_activity`를 1분 간격으로 30~60분 수집.
4. `pg_stat_statements` 활성화.
5. `translate_menu`의 DB session hold 시간을 줄임.
6. worker 2 적용 전 async pool을 `pool_size=5, max_overflow=10`으로 축소.
7. worker 2 적용 후 p95, active connections, idle in transaction, CPU를 비교.
8. workers 3+ 또는 500 stores 전에는 Cloud SQL tier/max_connections/PgBouncer 중 하나를 결정.

## 최종 답변

A. 트래픽 추정은 1차 모델로 타당합니다. 다만 read API, register/KDS, websocket token, translation burst를 더해야 합니다. 50 stores에서 active DB 20~30 upper bound는 보수적이고 괜찮습니다.

B. `pool_recycle=300`은 Cloud SQL Proxy + asyncpg 환경에서 안전합니다. 필수는 아니지만 stale connection 방어로 무해합니다. capacity 문제의 해결책은 아니며 worker sync engine에도 적용을 고려하세요.

C. WebSocket은 현재 DB connection을 오래 잡지 않습니다. DB pool 회계에는 직접 넣지 말고, Redis connections, memory, fd, pub/sub fanout으로 별도 회계해야 합니다. send failure 시 connection cleanup은 보강 권장입니다.

D. Dramatiq 확장 시 `translate_menu`가 외부 API 호출 동안 DB session을 잡는 구조가 더 큰 문제입니다. worker pool을 줄이고 session을 짧게 잡도록 리팩터링한 뒤 확장하세요.

E. PgBouncer transaction mode는 asyncpg prepared statement cache와 충돌할 수 있습니다. 도입 시 `statement_cache_size=0`, SQLAlchemy pool 조정/NullPool, transaction-scoped advisory lock 유지가 필요합니다.

F. Cloud SQL tier는 `shared_buffers`만으로 확정하지 말고 `gcloud sql instances describe`로 확인해야 합니다. `db-custom-4-15360` 이상 검토는 500 stores 목표에는 합리적이나, 실제 p95/CPU/active connection 관측 후 결정하는 것이 맞습니다.

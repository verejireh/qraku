# GPT P1 Init DB Race Review

**작성일**: 2026-05-22  
**대상**: `stabilize/post-pg-cutover` @ `faf87aa` / `a6ddf30`  
**검토 문서**: `tasks/p1-init-db-race-analysis.md`  
**관련 코드**:
- `backend/database.py`
- `backend/main.py`
- `backend/utils/redis.py`
- `alembic/env.py`

## 총평

Strategy 1(`::text` enum WHERE)은 타당하고 이미 적용 방향이 맞습니다. Strategy 2(advisory lock)는 `--workers > 1` 또는 restart loop 재발에 대비한 단기 방어로 유효합니다. 다만 분석 문서의 예시처럼 `create_all`과 `migration_sqls`를 **두 개의 별도 advisory transaction lock으로 나누면 중간에 다른 worker가 끼어들 수 있으므로**, 실제 구현은 **하나의 `engine.begin()` 트랜잭션 안에서 advisory xact lock을 잡고 create_all + migration_sqls 전체를 직렬화**하는 편이 안전합니다.

Alembic 전환은 장기 정답입니다. 하지만 현재 운영 VM에서 `alembic current`가 `script_location` 문제로 실패한 기록이 있으므로, 자동 `alembic upgrade head` hook은 아직 넣으면 안 됩니다. 먼저 OPR-07 baseline/config 정합성을 해결해야 합니다.

권장 순서:
1. Strategy 1 유지 + 다음 restart stderr 0건 확인.
2. Strategy 2를 단일 transaction advisory lock으로 구현.
3. worker 증설 전 pool 총량 조정.
4. OPR-07 해결 후 Alembic 이행.

## A. enum `WHERE col::text = 'x'` 패턴

판정: **안전하다. 정규화/backfill용으로 적절하다.**

PostgreSQL enum 컬럼에서 `WHERE kitchen_mode = 'kds'`는 우변 리터럴을 enum type으로 변환하려고 하며, `'kds'`가 enum label에 없으면 비교 단계 전에 `invalid input value for enum`이 납니다. `WHERE kitchen_mode::text = 'kds'`는 좌변을 text로 변환하므로 이 parse 실패를 피합니다.

`CAST(kitchen_mode AS text)`와 `kitchen_mode::text`는 같은 의미입니다. 로컬 스타일상 `::text`가 짧고 괜찮습니다.

B-tree 인덱스:
- enum 컬럼 자체에 일반 B-tree index가 있어도 `col::text = 'x'` 조건에는 보통 그대로 쓰기 어렵습니다.
- expression index `CREATE INDEX ... ON table ((col::text))`가 있으면 쓸 수 있습니다.
- 하지만 이 프로젝트의 enum 정규화 UPDATE는 startup migration/backfill 성격이고 대상 row 수가 매우 작으므로 인덱스 사용성은 중요한 판단 기준이 아닙니다.

권고:
- 정규화 UPDATE에는 `::text` 유지.
- hot path API 쿼리에는 `::text`를 남발하지 말 것. 정상 enum 값만 비교하는 런타임 쿼리는 typed enum/string 값을 일치시켜 비교해야 합니다.

## B. advisory lock key

판정: **hard-coded 64-bit key가 더 낫다. 단, 음수 변환/범위를 명확히 관리해야 한다.**

`pg_advisory_xact_lock(bigint)`는 DB 전체 advisory lock namespace 안에서 동작합니다. 프로젝트 단위 lock key는 deterministic이면 충분합니다.

hard-coded key 장점:
- Python hash seed나 DB 함수 차이에 영향받지 않습니다.
- 코드 리뷰에서 key 변경 여부가 명확합니다.
- 운영에서 `pg_locks` 확인 시 문서화된 값을 바로 찾을 수 있습니다.

hash 기반 key 단점:
- Python 내장 `hash()`는 프로세스별 seed가 있어 절대 쓰면 안 됩니다.
- DB의 `hashtext()`는 32-bit라 충돌 여지가 더 크고, 버전/구현 의존을 문서화해야 합니다.
- `sha256("qraku:init_db")`를 잘라 쓰는 방식은 가능하지만, hard-coded 상수보다 운영상 더 읽기 어렵습니다.

중요: 문서의 `0x71726164755F0001`은 64-bit signed bigint 양수 범위 안입니다.

```text
0x71726164755F0001 = 8174723217201008641
max signed bigint  = 9223372036854775807
```

따라서 `pg_advisory_xact_lock(:key)`에 그대로 넘겨도 됩니다.

권고:

```python
INIT_DB_LOCK_KEY = 0x71726164755F0001  # "qraku_" + version marker, signed bigint-safe
```

그리고 주석에 decimal 값과 용도를 남기면 운영 확인이 쉽습니다.

## C. FastAPI startup + advisory lock + connection pool

판정: **호환 가능. 단일 트랜잭션으로 전체 init_db를 감싸야 한다.**

현재 `backend/main.py` startup 순서:

```python
await init_db()
await init_redis()
```

즉 advisory lock은 Redis 초기화 전에 DB startup 구간만 직렬화합니다. Redis race와 직접 충돌하지 않습니다.

connection pool 관점:
- 현재 async engine은 `pool_size=10`, `max_overflow=20`.
- worker 4개가 동시에 시작하면 각 worker가 `init_db()`용 connection 1개를 잡을 수 있습니다.
- advisory lock 대기 worker는 connection을 잡고 lock wait 상태가 됩니다.
- 4 workers 기준으로 startup lock wait만으로 pool exhaustion이 생기지는 않습니다.

하지만 장기적으로는 worker 수 × pool 설정이 문제입니다. worker 4개면 backend만 최대 `4 * (10 + 20) = 120` connections가 될 수 있어 Cloud SQL `max_connections=100`과 맞지 않습니다. Strategy 2 구현과 별개로 worker 증설 전 pool 축소가 필요합니다.

분석 문서 예시의 문제:

```python
async with engine.begin() as conn:
    await conn.execute("SELECT pg_advisory_xact_lock(...)")
    await conn.run_sync(SQLModel.metadata.create_all)

async with engine.begin() as conn:
    await conn.execute("SELECT pg_advisory_xact_lock(...)")
    for sql in migration_sqls: ...
```

이 구조는 첫 transaction commit과 두 번째 lock 획득 사이에 다른 worker가 끼어들 수 있습니다. 그 사이에 `create_all`만 끝난 worker와 migration loop에 들어간 worker가 섞일 수 있습니다.

권장 구현:

```python
async def init_db():
    from models import Store, Table, StaffAttendance, PhotoReview, RewardCoupon, RefundLog, BetaApplication, EventLog, WebhookEvent

    migration_sqls = [...]
    ignored_migration_errors = (...)

    async with engine.begin() as conn:
        await conn.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": INIT_DB_LOCK_KEY},
        )

        await conn.run_sync(SQLModel.metadata.create_all)

        for sql in migration_sqls:
            try:
                await conn.execute(text(sql))
                print(f"Migration: {sql[:60]}...")
            except Exception as e:
                ...
```

주의:
- `CREATE INDEX CONCURRENTLY`는 transaction block 안에서 실행할 수 없습니다. 현재 migration_sqls에는 `CONCURRENTLY`가 없으므로 문제 없습니다.
- 향후 큰 인덱스를 concurrently 만들려면 inline `init_db()`가 아니라 Alembic/수동 운영 migration으로 빼야 합니다.
- advisory xact lock은 transaction 종료 시 자동 해제되므로 startup cancellation이나 예외에도 connection 정리와 함께 해제됩니다.

선택지:
- `pg_advisory_xact_lock`은 대기합니다. worker startup이 길어질 수 있지만 schema가 안정된 현재는 보통 짧습니다.
- 무한 대기가 싫으면 `SET LOCAL lock_timeout = '30s'` 또는 `pg_try_advisory_xact_lock` + 명시적 fail을 고려할 수 있습니다. 운영에서는 fail-fast가 더 낫지만, 현재 안정화 목적이면 blocking lock이 단순합니다.

## D. Alembic + inline migration 공존 / 자동 hook

판정: **지금 자동 `alembic upgrade head` hook을 넣는 것은 안전하지 않다.**

이유:
1. 운영 VM 검증에서 `alembic current`가 `No 'script_location' key found`로 실패했습니다. package/config 정합성이 먼저입니다.
2. 현재 `init_db()`는 idempotent inline DDL을 수행하고 있습니다. Alembic이 같은 DDL을 다시 실행하면 revision 설계에 따라 duplicate/lock/no-op noise가 생길 수 있습니다.
3. deploy startup path에 자동 migration을 넣으면 application deploy와 schema migration rollback 경계가 흐려집니다.
4. autogenerate는 SQLModel Enum/String, JSON-as-TEXT, 기존 수동 index를 잘못 해석할 수 있어 review 없이 자동 적용하면 위험합니다.

권장 이행 단계:

1. 운영 VM에서 `alembic.ini`, `alembic/` 포함 여부와 `script_location` 정상화.
2. 현재 운영 schema를 기준으로 `alembic stamp head`만 먼저 수행.
3. 신규 schema 변경부터 Alembic revision을 만들고 수동 review.
4. deploy.py에는 초기에 `alembic current` 확인만 넣고, `upgrade head`는 별도 운영 명령으로 실행.
5. 안정화 후에만 deploy hook을 검토. hook을 넣더라도 app start 전에 단일 프로세스에서 실행해야 하며 uvicorn worker startup 안에서는 실행하지 말아야 합니다.

inline migration 공존 정책:
- 단기: `init_db()` 유지, advisory lock 추가.
- 중기: 새 변경은 Alembic으로만 추가하고 `migration_sqls`에는 더 이상 추가하지 않음.
- 장기: `migration_sqls` 제거 또는 legacy bootstrap 용도로만 축소.

## E. 누락된 init_db 관련 위험

### 1. migration error swallowing

현재 `init_db()`는 non-ignored migration error도 stderr 출력 후 부팅을 계속합니다. 안정화 중에는 서비스 가용성을 위해 이해할 수 있지만, schema drift를 숨길 수 있습니다.

권장:
- 안정화 후 `STRICT_INIT_DB=true` 모드 추가.
- 운영 deploy에서는 non-ignored migration error가 있으면 startup fail.
- 최소한 `readyz`에 최근 migration error flag를 반영.

### 2. Redis 초기화 실패는 process exit

`init_redis()`는 실패 시 `sys.exit(1)`을 호출합니다. FastAPI startup 안에서 process exit이 걸리면 systemd restart loop의 원인이 될 수 있습니다. Redis가 일시 장애일 때 DB migration까지 매 restart마다 반복됩니다.

Strategy 2는 DB side-effect 반복을 줄이지만, Redis 장애 loop 자체는 해결하지 않습니다.

권장:
- Redis 연결 실패 시 명확히 startup fail은 유지하되, systemd `StartLimitBurst`로 폭주 제한.
- DB init은 advisory lock과 함께 빠르게 no-op로 끝나게 유지.

### 3. shutdown 미완 트랜잭션

`pg_advisory_xact_lock`은 transaction scoped라 프로세스가 SIGTERM/SIGKILL을 받아 connection이 끊기면 PostgreSQL이 transaction을 rollback하고 lock을 해제합니다. 이 점은 session-level `pg_advisory_lock`보다 안전합니다.

주의:
- `TimeoutStopSec=10`으로 SIGKILL이 들어가도 DB connection 종료 시 lock은 해제됩니다.
- 다만 DDL 자체가 중간에 rollback되므로 다음 worker가 다시 init_db를 수행해야 합니다. idempotent migration이면 괜찮습니다.

### 4. long transaction side effect

전체 `init_db()`를 하나의 transaction으로 묶으면 DDL/UPDATE 전체가 한 transaction에 들어갑니다. 현재 규모에서는 괜찮지만, 큰 table UPDATE나 long-running index가 들어오면 lock 유지 시간이 길어질 수 있습니다.

권장:
- 큰 backfill/index는 inline migration에 넣지 말고 Alembic/운영 migration으로 분리.
- `migration_sqls`에 새 항목 추가 시 "transaction-safe and fast" 기준을 문서화.

### 5. `CREATE INDEX IF NOT EXISTS` race와 lock

advisory lock은 같은 app의 workers 사이 race는 막지만, 외부 Alembic/psql 작업과의 race는 막지 않습니다. 외부 작업도 같은 advisory key를 쓰지 않으면 보호되지 않습니다.

권장:
- Alembic 이행 시 migration runner도 같은 advisory lock을 잡거나, deploy window에서 app을 stop한 뒤 migration 실행.

### 6. healthz vs readyz

`/api/healthz`는 DB/Redis와 무관하게 ok를 반환합니다. startup이 완료된 뒤에만 serving되므로 기본적으로 문제는 작지만, deploy script의 health check는 `readyz`가 더 정확합니다.

권장:
- setup/deploy 성공 판정은 `/api/readyz`를 우선 사용.
- Redis 장애나 DB connection 문제를 healthz 200으로 놓치지 않도록 함.

### 7. import path / module alias risk

`main.py`는 `from database import init_db`, `database.py`는 `from models import ...` 형태입니다. systemd는 `--app-dir backend`라 동작하지만, alembic/env.py는 `backend`와 root를 모두 path에 넣습니다. migration tooling과 app runtime의 import path가 다릅니다.

권장:
- 당장 Strategy 2에는 영향이 낮음.
- Alembic 이행 전에는 import path 정합성을 별도 점검.

## Strategy 2 구현 권고안

최소 변경으로는 다음을 권장합니다.

1. `backend/database.py` 상단에 상수 추가:

```python
INIT_DB_LOCK_KEY = 0x71726164755F0001
```

2. `init_db()`에서 `engine.begin()`을 한 번만 열고, advisory lock 획득 후 `create_all`과 migration loop를 모두 같은 transaction에서 수행.

3. migration loop 안에서 `async with engine.begin()`을 매 SQL마다 열던 구조는 제거.

4. 검증:

```bash
# 단일 worker restart
sudo systemctl restart qrorder
journalctl -u qrorder --since "2 minutes ago" --no-pager \
  | grep -Ei "Migration skipped|invalid input value|address already in use" || true

# 임시 workers=4 환경에서 startup stderr 확인
```

5. worker=4 전 connection pool 조정:

```python
pool_size=5
max_overflow=5
```

또는 Cloud SQL max_connections 상향 후 전체 connection budget을 문서화.

## 최종 답변

A. `WHERE col::text = 'x'`는 enum 정규화용으로 안전합니다. 일반 B-tree index는 보통 못 쓰지만 backfill용이라 문제 아닙니다.

B. hard-coded signed bigint key를 추천합니다. `0x71726164755F0001`은 signed bigint 범위 안이라 사용 가능합니다. Python `hash()`는 금지입니다.

C. FastAPI startup과 advisory xact lock은 호환됩니다. 다만 create_all과 migration_sqls를 하나의 transaction lock 아래에서 직렬화해야 합니다. worker 증설 전 pool 총량 조정이 필요합니다.

D. 자동 `alembic upgrade head` hook은 아직 위험합니다. OPR-07 config/stamp 해결 후 수동 migration 단계로 이행해야 합니다.

E. 주요 누락 위험은 non-ignored migration error swallowing, Redis failure restart loop, long transaction, external migration race, healthz/readyz 구분, import path 정합성입니다.

Strategy 2 코드는 진행해도 됩니다. 단, 분석 문서 예시의 "두 번 lock" 구조는 피하고 **단일 transaction advisory lock**으로 구현해야 합니다.

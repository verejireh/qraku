# P1 #8 — `init_db()` race condition 심층 분석

**작성일**: 2026-05-22
**근거**: [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) §P1 #8 + [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md) restart loop 발견 (NRestarts=413)
**대상**: `backend/database.py:50` `init_db()` 함수 (FastAPI `@app.on_event("startup")`)

---

## 현재 동작

```python
@app.on_event("startup")
async def on_startup():
    await init_db()  # backend/main.py:42-43
```

`init_db()` 의 책임:
1. `SQLModel.metadata.create_all` — 모든 테이블 생성 (CREATE TABLE IF NOT EXISTS)
2. **97 개 마이그레이션 SQL** 순차 실행:
   - 대부분 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (멱등)
   - 일부 `CREATE INDEX IF NOT EXISTS` (멱등)
   - 일부 `UPDATE store SET ... WHERE ...` (멱등 아님 — 데이터 정규화)
   - 일부 `ALTER COLUMN SET DEFAULT` (덮어쓰기)
3. `init_redis()`

각 SQL 은 **항목별 트랜잭션 분리** (`engine.begin()` 별도) — 한 항목 실패해도 다음 항목 진행. `IGNORED_MIGRATION_ERRORS=("already exists", "42701", "42P07")` 패턴 매치시 silent.

---

## 위험 벡터 (확인된 + 추정)

### A. 다중 워커 race ⚠️ (위험)

운영 systemd unit 의 ExecStart 는 `uvicorn main:app --host 0.0.0.0 --port 8003` — **`--workers` 미지정**. 즉 단일 워커 single-process. 현재는 race 없음.

그러나 출시 후 트래픽 증가 시 `--workers 4` 로 변경하면:
- 4개 워커가 동시에 startup → 4번 init_db 호출
- `CREATE TABLE IF NOT EXISTS` 는 PG 가 race-safe (5.0+) 이지만 동시 호출 시 `relation "X" already exists` 에러를 던지는 워커가 있을 수 있음 → `IGNORED_MIGRATION_ERRORS` 패턴이 잡지만 stderr 노이즈
- `CREATE INDEX IF NOT EXISTS` 도 동일 — PG 가 lock 으로 직렬화하나 동시 실행 시 다른 워커가 wait → 부팅 시간 ×N
- `UPDATE store SET ...` 의 정규화 쿼리들은 race 가능 (한 워커가 쓰는 도중 다른 워커가 읽음 — phantom 가능). 단 현재 데이터는 정규화 완료라서 NOOP

### B. Restart loop 증폭 🔴 (이번 사고에서 관찰됨)

orphan uvicorn 으로 인한 restart loop 시 매 7~13초마다 init_db 실행:
- 약 17시간 × 60분 × 6.5회/분 = ~6,000 회 init_db 호출 추정 (NRestarts=413, 시작 누락분 포함)
- DB 부하: 97 ALTER 시도 × 6,000 회 = 582,000 회 시도. 대부분 NOOP (이미 컬럼 존재) 지만:
  - `pg_class` / `pg_attribute` lookup 부담
  - `IGNORED_MIGRATION_ERRORS` 에러 처리 오버헤드
- 더 심각: 마이그레이션이 실제 적용된 첫 부팅 후 **둘째 부팅 시 ACCESS EXCLUSIVE lock 획득 race** 가능. 단, ALTER ... ADD COLUMN 은 이미 존재하면 즉시 NOOP 으로 lock 회피.

→ 다행히 데이터 손상은 없었으나 **CPU + DB 부하 + 로그 disk 소비** 가 누적됨. CHECK 7 의 journal 노이즈가 이걸 증명.

### C. ACCESS EXCLUSIVE lock 동안 트래픽 블로킹 ⚠️

`ALTER TABLE order ADD COLUMN ...` 같은 DDL 은 `ACCESS EXCLUSIVE` lock 을 잡음 — 같은 테이블에 대한 모든 SELECT/INSERT 가 wait. 빈 컬럼 추가는 PG 11+ 에서 instant (metadata-only) 이지만:
- `CREATE INDEX IF NOT EXISTS idx_xxx ON xxx` 는 `SHARE` lock — 동시 INSERT 차단
- `CREATE UNIQUE INDEX IF NOT EXISTS` 는 검증 시간 필요 (50만 행 가정 시 수십 초)
- 대표 위험: `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order" ...` — 운영 트래픽 도중 booting worker 가 잡으면 결제 INSERT 가 wait

베치헤드 50개 매장 시점에는 데이터 적어서 instant. **500 매장 + 1년 데이터** 시점부터 문제.

### D. 마이그레이션 순서 의존성 ⚠️ (관찰됨)

`SQLModel.metadata.create_all` 이 먼저 실행 → 모델에 정의된 enum 타입이 PG 에 생성됨. 그 후 `migration_sqls` 의 정규화 UPDATE 가 실행. 만약 모델의 enum value 가 변경됐는데 데이터에 옛 값이 남아있으면 `invalid input value for enum X: "<old>"` 발생 — 이번 CHECK 7 의 패턴.

해결책: 정규화 UPDATE 가 **enum 타입 변경 전에** 실행돼야 함. 현재 구조에서는 불가능 (create_all 후에 migration_sqls 실행).

→ 회피책: WHERE 절에 `::text` 캐스트로 enum 비교 우회. 코드 변경 1 줄.

```python
# 현재 (실패):
"UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode = 'kds'",
# 수정 후:
"UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode::text = 'kds'",
```

---

## 권장 조치 (단계별)

### 단기 (1주 이내) — Strategy 1: 정규화 UPDATE enum cast 패치

목적: CHECK 7 의 stderr 노이즈 제거 + 향후 enum value 변경 시 안전.

**대상 SQL** (`backend/database.py:94~117` 추정):
```python
"UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode = 'kds'",
"UPDATE store SET payment_options = 'cash_only' WHERE payment_options = 'CASH_ONLY'",
"UPDATE store SET payment_options = 'card_and_cash' WHERE payment_options = 'CARD_AND_CASH'",
'UPDATE "table" SET status = \'ready\' WHERE status IN (\'EMPTY\', \'empty\', \'PAID\', \'paid\', \'READY\')',
'UPDATE "table" SET status = \'occupied\' WHERE status IN (\'ORDERING\', \'ordering\', \'OCCUPIED\')',
'UPDATE "table" SET status = \'occupied\' WHERE status IN (\'occupied\')',
'UPDATE "table" SET status = \'ready\' WHERE status IN (\'ready\')',
'UPDATE "table" SET status = \'checkout_requested\' WHERE status IN (\'CHECKOUT_REQUESTED\', \'checkout_requested\')',
```

**패치**: WHERE 절의 enum 컬럼에 `::text` 캐스트 추가.

```python
"UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode::text = 'kds'",
"UPDATE store SET payment_options = 'cash_only' WHERE payment_options::text = 'CASH_ONLY'",
"UPDATE store SET payment_options = 'card_and_cash' WHERE payment_options::text = 'CARD_AND_CASH'",
'UPDATE "table" SET status = \'ready\' WHERE status::text IN (\'EMPTY\', \'empty\', \'PAID\', \'paid\', \'READY\')',
'UPDATE "table" SET status = \'occupied\' WHERE status::text IN (\'ORDERING\', \'ordering\', \'OCCUPIED\')',
'UPDATE "table" SET status = \'checkout_requested\' WHERE status::text IN (\'CHECKOUT_REQUESTED\')',
```

자체 정규화 (`WHERE status='occupied'` SET 'occupied') 라인은 NOOP 이므로 삭제 가능.

**리스크**: 0. enum 값과 text 캐스트는 PG 내장 — 데이터 변환 없음.
**검증**: 부팅 후 journalctl 에 `⚠️ Migration skipped` 0건.

### 중기 (2주 이내) — Strategy 2: Advisory lock 으로 다중 워커 race 차단

목적: `--workers N` 변경 시 동시 init_db 호출 시 N-1 개 워커가 skip.

**패치** (`backend/database.py:init_db`):
```python
async def init_db():
    """서버 시작 시 PG 스키마 마이그레이션 — pg_advisory_lock 으로 단일 실행 보장."""
    from models import Store, Table, ...
    
    # 동일 PG 인스턴스에서 같은 lock key 를 사용하는 워커는 1개만 통과,
    # 나머지는 대기 후 마이그레이션 완료 시 NOOP 으로 진행.
    INIT_DB_LOCK_KEY = 0x71_72_61_6B_75_00_00_01  # 'qraku\0\0\x01' 의 8 바이트 정수
    
    async with engine.begin() as conn:
        # 트랜잭션 단위 advisory lock — 트랜잭션 끝나면 자동 해제.
        # 동시에 들어온 워커는 첫 번째 가 끝날 때까지 wait (몇 초 이내).
        await conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": INIT_DB_LOCK_KEY})
        
        # 이미 마이그레이션 끝났는지 빠른 체크 (옵션 — 향후 schema_migrations 테이블 도입 시)
        await conn.run_sync(SQLModel.metadata.create_all)
    
    # 마이그레이션 SQL 들도 lock 안에서 실행
    async with engine.begin() as conn:
        await conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": INIT_DB_LOCK_KEY})
        for sql in migration_sqls:
            try:
                await conn.execute(text(sql))
            except Exception as e:
                # ... 기존 에러 처리
                pass
    
    print("✅ DB 테이블 초기화 완료")
```

**리스크**: 워커 부팅이 1~2초 추가 (lock 대기). 트랜잭션이 끝나면 자동 해제이므로 dead-lock 위험 없음.
**검증**: `--workers 4` 시 stderr 에 "Migration skipped" / "already exists" 0건.

### 장기 (출시 후 1개월) — Strategy 3: Alembic 으로 전면 이행

목적: 인라인 마이그레이션 폐지 → 부팅 시간 단축 + 재현 가능한 schema 이력.

단계:
1. **OPR-07 선결**: 운영 VM 에 `alembic.ini` 배포 후 `alembic stamp head` 1회 — 현재 스키마 = head 마킹
2. 신규 스키마 변경은 `alembic revision --autogenerate -m "..."` 으로 작성 + 커밋
3. deploy.py 가 `alembic upgrade head` 를 부팅 전에 실행 (systemd `ExecStartPre=` 또는 별도 cron)
4. `init_db()` 에서 `migration_sqls` 제거 → `SQLModel.metadata.create_all` 만 유지 (개발 환경 폴백)
5. `migration_sqls` 의 97 개 SQL 을 Alembic revision 으로 backfill — 단, 운영 DB 는 이미 적용됐으므로 `op.execute` 가 NOOP 이 되는지 점검

**리스크**: 중간. Alembic revision 작성 + 운영 적용 절차 변경. 운영자 (자이라) 학습 필요.
**검증**: `alembic upgrade head` 후 `alembic current` = head, 부팅 시 ALTER 0 건.

---

## 우선순위 매트릭스

| 전략 | 노력 | 위험 | 효과 | 권장 시점 |
|---|---|---|---|---|
| 1 — enum cast 패치 | 30분 | 0 | CHECK 7 노이즈 제거 | 즉시 |
| 2 — advisory lock | 2시간 | 낮음 | 다중 워커 race 차단 | 출시 직후 (단일 워커일 때) |
| 3 — Alembic 이행 | 2일 | 중간 | 인라인 패턴 폐지 | 출시 D+30 |

---

## GPT-5.5 교차 검증 요청 항목

본 분석을 GPT-5.5 에 보낼 때 다음 질문 첨부:

```
Claude 가 P1 #8 (init_db race) 에 대해 다음 3 단계 전략을 제안했습니다:
  1. enum cast (::text) WHERE 절 패치
  2. pg_advisory_xact_lock 으로 다중 워커 race 차단
  3. Alembic 이행

각 전략에 대해:

A. **enum cast 패치의 안전성**:
   `WHERE kitchen_mode::text = 'kds'` 패턴이 PG 의 enum 타입에서 안전한가?
   `CAST(kitchen_mode AS text)` 와 동등한가? B-tree 인덱스 사용 가능?

B. **advisory lock 의 적정 key 설계**:
   8 바이트 정수 키 0x71726164755F0001 ('qraku\0\0\x01') 를 hard-coded
   상수로 쓰는 패턴이 충돌 위험 없는가? hash('qraku_init_db') 같은 패턴이 더
   안전한가?

C. **FastAPI lifespan + advisory lock**:
   `engine.begin()` 의 트랜잭션 단위 lock 이 startup hook 의 비동기 컨텍스트에서
   안전하게 해제되는가? 워커 N 명이 동시 진입 시 PostgreSQL connection pool
   exhaustion 가능성?

D. **Alembic + 인라인 migration 공존**:
   Strategy 3 이행 중에 development 환경 (uv run uvicorn) 은 여전히 init_db
   에 의존. 부팅 시 alembic upgrade 를 자동 호출하는 hook 이 안전한가?
   (자동 자동 동기화 vs 명시적 운영자 실행)

E. **누락된 위험**:
   본 분석이 놓친 init_db 관련 위험 (예: Redis 초기화 race, FastAPI lifespan
   shutdown 시 미완 트랜잭션 처리) 이 있는가?
```

---

## 액션 아이템

- [ ] **PG-DB-RACE-01** (즉시): Strategy 1 — enum cast WHERE 절 패치 + 자체 정규화 NOOP 라인 제거 (~10 SQL 수정, 검증 30분)
- [ ] **PG-DB-RACE-02** (출시 직후): Strategy 2 — pg_advisory_xact_lock 도입 + `--workers 4` 전환 후 stderr 0 건 확인
- [ ] **PG-DB-RACE-03** (D+30): Strategy 3 — Alembic 이행 + OPR-07 baseline stamp 의존
- [ ] **GPT-PG-DB-RACE-REVIEW**: 본 분석을 GPT-5.5 에 cross-review 요청 (위 5 질문)

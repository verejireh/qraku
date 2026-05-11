# DB Migration Audit Report — MySQL → PostgreSQL

> **작성**: 2026-05-11, db-migration-architect (opus)
> **카드**: DBM-01 산출물
> **입력**: `backend/database.py`, `backend/models.py`, `backend/routers/*.py`, `backend/seed_data.py`, `backend/migrate_*.py`, `backend/check_db.py`
> **목적**: PG 이전 전 호환성 케이스 인벤토리. DBM-02 (사이징/도구), DBM-04~06 (구현) 의 입력으로 사용.

---

## 0. 요약 (Executive Summary)

| 분류 | 항목 수 | 평가 |
|---|---|---|
| `migration_sqls` 의 MySQL-only 구문 | **19+ 케이스** | DBM-05 에서 모두 처리 가능 |
| 라우터의 raw SQL (백틱·MySQL 문법) | **`demo.py` 8건, `seed_data.py` 2건** | DBM-05b 신규 카드 권장 |
| SQLAlchemy `func.*` MySQL 전용 함수 | **`stats.py` 약 14건** (hour/year/month/dayofweek/date) | DBM-05c 신규 카드 필수 |
| 모델 (`models.py`) 의 PG 예약어 충돌 | **`order`, `table` 두 테이블** | SQLAlchemy 자동 인용 — 추가 작업 없음 |
| Python `str` Enum (DB-side ENUM 아님) | **약 12개** | 모두 VARCHAR 매핑 — 충돌 없음 |
| Legacy 마이그레이션 스크립트 | **`migrate_*.py` × 3, `check_db.py`** | DBM-05d 정리 권장 (선택) |

**결론**: 현재 plan (DBM-04~06) 으로는 부족합니다. **DBM-05b (`demo.py` raw SQL)** 와 **DBM-05c (`stats.py` 날짜 함수)** 2개 카드 추가가 필요합니다. 그 외엔 plan 대로 진행 가능.

---

## 1. `backend/database.py` 의 `migration_sqls` 인벤토리

전체 항목 수: **약 110건** (`migration_sqls` 리스트, 라인 41~201).

### 1.1 백틱 식별자 (PG 예약어) — 19 건

`order` / `table` 은 PG 예약어 → ANSI 큰따옴표 인용 필수.

| 라인 | 현재 SQL | DBM-05 후 |
|---|---|---|
| 47 | `ALTER TABLE \`order\` ADD COLUMN guest_uuid ...` | `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS guest_uuid ...` |
| 80~83 | `ALTER TABLE \`order\` ADD COLUMN order_type/square_order_id/square_payment_id/pickup_time ...` | 위와 동일 패턴 (4건) |
| 85 | `UPDATE \`order\` SET payment_status = 'unpaid' ...` | `UPDATE "order" SET ...` |
| 87 | `ALTER TABLE \`table\` ADD COLUMN guest_count ...` | `ALTER TABLE "table" ADD COLUMN IF NOT EXISTS guest_count ...` |
| 90 | `ALTER TABLE \`table\` MODIFY COLUMN status VARCHAR(50) ...` | 🔴 **MODIFY 도 호환 안 됨** → §1.2 참조 |
| 92~96 | `UPDATE \`table\` SET status = ...` | `UPDATE "table" SET status = ...` (5건) |
| 98 | `ALTER TABLE \`table\` MODIFY COLUMN status ENUM(...) ...` | 🔴 **ENUM 도 호환 안 됨** → §1.3 참조 |
| 100~101 | `ALTER TABLE \`table\` / \`order\` ADD COLUMN call_staff/needs_serving ...` | 백틱 교체 |
| 105 | `ALTER TABLE \`table\` ADD COLUMN checkout_requested_at ...` | 백틱 교체 |
| 107 | `ALTER TABLE \`order\` ADD COLUMN payment_method ...` | 백틱 교체 |
| 115 | `ALTER TABLE \`order\` ADD COLUMN pickup_code ...` | 백틱 교체 |
| 139 | `ALTER TABLE \`order\` MODIFY COLUMN table_number VARCHAR(50) ...` | 🔴 **MODIFY** → §1.2 |
| 174~175 | `ALTER TABLE \`order\` ADD COLUMN stamp_reward_used/discount_amount ...` | 백틱 교체 |
| 179 | `ALTER TABLE \`order\` ADD COLUMN used_coupon_id ...` | 백틱 교체 |
| 186 | `ALTER TABLE \`order\` ADD UNIQUE INDEX uq_order_square_payment_id (square_payment_id)` | 🔴 **인덱스 구문** → §1.4 |
| 199~200 | `ALTER TABLE \`order\` ADD COLUMN idempotency_key ... ; CREATE UNIQUE INDEX idx_order_idem_key ON \`order\`(idempotency_key)` | 백틱 교체 |

**조치**: 모든 `` `order` `` / `` `table` `` → `"order"` / `"table"`. 단순 sed 가능. 단 §1.2~1.4 의 구조적 차이는 별도 처리.

### 1.2 `MODIFY COLUMN` — MySQL only, PG 비호환

| 라인 | SQL | 의도 |
|---|---|---|
| 90 | `ALTER TABLE \`table\` MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'READY'` | 기존 ENUM → VARCHAR 변환 |
| 98 | `ALTER TABLE \`table\` MODIFY COLUMN status ENUM(...) NOT NULL DEFAULT 'READY'` | VARCHAR → ENUM |
| 139 | `ALTER TABLE \`order\` MODIFY COLUMN table_number VARCHAR(50) NOT NULL DEFAULT '0'` | INT → VARCHAR |
| 188 | `ALTER TABLE guestprofile MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | NOT NULL + 기본값 |

PG 대응 (각각 두 줄로 분해):
```sql
-- MySQL: ALTER TABLE ... MODIFY COLUMN col TYPE NOT NULL DEFAULT v
-- PG:    ALTER TABLE ... ALTER COLUMN col TYPE TYPE USING col::TYPE;
--        ALTER TABLE ... ALTER COLUMN col SET NOT NULL;
--        ALTER TABLE ... ALTER COLUMN col SET DEFAULT v;
```

**중요**: 이미 운영 MySQL 에서 이 ALTER 들은 실행 완료된 상태 (멱등). PG 빈 인스턴스에서는 SQLModel.metadata.create_all 이 처음부터 올바른 타입으로 컬럼을 만들어줌 → **이 4건의 MODIFY 는 PG 에서는 사실상 no-op 으로 만들면 안전**.

**DBM-05 권장 접근**: `MODIFY COLUMN` 항목을 그대로 두되, 예외 처리 (try/except) 가 이미 있으므로 PG 에서 syntax error 가 나도 다음으로 넘어감. **단, 부작용 없는지 확인 필요** — PG 가 syntax error 후 트랜잭션 abort 하면 이후 항목도 모두 실패. → **트랜잭션을 항목별로 분리**하거나 `MODIFY COLUMN` 항목을 명시 skip 처리 필요.

### 1.3 인라인 `ENUM(...)` 컬럼 — MySQL only

라인 98: `ENUM('READY','OCCUPIED','CHECKOUT_REQUESTED')`

PG 의 ENUM 은 `CREATE TYPE table_status AS ENUM (...)` 별도. 인라인 불가.

**현재 상황**:
- `Table.status` 의 Python 모델은 `TableStatus` (str Enum) — DB 컬럼 타입은 SQLModel 가 VARCHAR 로 매핑
- 운영 MySQL 에서만 ENUM 으로 강제했음
- PG 에서는 VARCHAR 로 두면 됨 (model 일치)

**DBM-05 권장**: 라인 98 (`MODIFY COLUMN ... ENUM(...)`) 는 PG 모드에서 skip. MySQL 모드에서도 사실 멱등 (이미 적용됨).

### 1.4 `ADD UNIQUE INDEX` 구문 차이

라인 186:
```sql
ALTER TABLE `order` ADD UNIQUE INDEX uq_order_square_payment_id (square_payment_id)
```

이건 MySQL 전용 (`ALTER TABLE ... ADD INDEX`). PG 는 `CREATE INDEX` 별도 명령.

**PG 호환 대응**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order"(square_payment_id);
```

> 이 형식은 MySQL 8 에서도 동작 → ANSI 호환 단일 SQL 로 통일 가능.

### 1.5 `JSON DEFAULT ('[]')` — 미묘한 차이

라인 45: `ALTER TABLE menu ADD COLUMN options JSON DEFAULT ('[]')`

- MySQL: `JSON DEFAULT ('[]')` (괄호 필수, MySQL 8 문법)
- PG: `JSON DEFAULT '[]'::json` 또는 `TEXT DEFAULT '[]'`
- **현재 모델 `Menu.options`** 는 `str = Field(default="[]")` — DB 컬럼은 VARCHAR/TEXT, 코드에서는 `json.loads/dumps` 로 다룸.

**DBM-05 권장**: 라인 45 를 `ALTER TABLE menu ADD COLUMN IF NOT EXISTS options TEXT DEFAULT '[]'` 로 변경 (양 DB 동작). JSON 타입 자체는 본 사이클 외 — 나중 MNU 사이클에서 jsonb 로 마이그레이션.

### 1.6 멱등성 try/except 의 MySQL 에러 메시지 의존

라인 209:
```python
if "Duplicate column name" in str(e) or "already exists" in str(e) or "1060" in str(e):
    pass
```

PG 의 컬럼 중복 에러:
- 메시지: `column "..." of relation "..." already exists`
- SQLSTATE: `42701` (`duplicate_column`)

→ `"already exists"` 가 PG 메시지에도 포함되므로 **현재 코드도 PG 에서 동작**. 단 `"1060"` / `"Duplicate column name"` 분기는 dead code 가 됨. 그대로 둬도 무해. **DBM-05 추가 권장**: `"42701"` 도 분기에 포함 (방어적).

또한 인덱스 중복 에러도 잡아야 함:
- MySQL: `Duplicate key name` / SQLSTATE 23000
- PG: `relation "..." already exists` / SQLSTATE 42P07

PG 의 `"already exists"` 가 인덱스 / 컬럼 둘 다 포함 → 현재 분기로 충분.

---

## 2. 라우터 raw SQL 인벤토리

### 2.1 `routers/demo.py` — 🔴 백틱 + raw SQL 8건

라인 224~249 (`cleanup_expired_temp_stores`):

```python
order_rows = await session.execute(
    _text(f"SELECT id FROM `order` WHERE shop_id IN ({placeholders})")
)
...
await session.execute(_text(f"DELETE FROM `order` WHERE id IN ({id_list})"))
await session.execute(_text(f"DELETE FROM `table` WHERE store_id = {sid}"))
```

**문제**:
1. `` `order` `` / `` `table` `` 백틱 — PG 비호환
2. f-string SQL — SQL injection 위험 (`shop_variants` 는 DB 에서 온 값이지만, 일반 좋은 패턴 아님)
3. 트랜잭션 안에서 raw delete — ORM cascade 우회

**조치 권장**:
- **단순 ANSI 호환화**: 백틱만 `"order"` / `"table"` 로 교체 → 양 DB 동작
- **장기**: ORM `await session.execute(delete(Order).where(...))` 형태로 리팩토링 (별도 카드)

**제안**: `DBM-05b` 신규 카드 — `demo.py` 백틱 제거 (1줄 변경 × 4건, sonnet 5분 작업).

### 2.2 `seed_data.py` — 🟡 ON DUPLICATE KEY UPDATE 2건

```python
INSERT INTO store (...) VALUES (...)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_open = VALUES(is_open)
...
INSERT INTO `table` (...) VALUES (...)
ON DUPLICATE KEY UPDATE qr_token = VALUES(qr_token), status = VALUES(status)
```

- MySQL 전용 UPSERT. PG: `INSERT ... ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col`
- 시드 스크립트는 dev 용. 운영에서 안 돌아감.

**조치 권장**:
- 본 사이클에서는 **그대로 둠** (PG 이전 후 dev 사용 시 깨지지만 운영 영향 없음)
- 별도 카드 `DBM-05d` 또는 backlog 로: PG `ON CONFLICT` 로 재작성 (10분 작업)

### 2.3 `routers/stats.py` — 🔴 MySQL 날짜 함수 14건

`SQLAlchemy func.*` 의 함수명은 DB 에 그대로 전송됨. MySQL 전용 함수는 PG 에서 syntax error:

| 라인 | 사용 | MySQL 가 받는 SQL | PG 호환 |
|---|---|---|---|
| 71, 78, 80, 107, 267 | `func.date(Order.created_at)` | `DATE(created_at)` | `(created_at)::date` 또는 `func.cast(Order.created_at, Date)` |
| 103, 109, 111, 263, 268 | `func.hour(Order.created_at)` | `HOUR(created_at)` | `func.extract('hour', Order.created_at)` |
| 292, 300 | `func.year(...)` | `YEAR(...)` | `func.extract('year', ...)` |
| 293, 300, 302 | `func.month(...)` | `MONTH(...)` | `func.extract('month', ...)` |
| 325, 332, 334 | `func.dayofweek(...)` | `DAYOFWEEK(...)` | `func.extract('dow', ...)` + 인덱스 변환 (semantics 차이 주의) |

**MySQL vs PG dayofweek semantics**:
- MySQL `DAYOFWEEK()`: 1=Sunday, 2=Monday, ..., 7=Saturday
- PG `EXTRACT(DOW FROM ...)`: 0=Sunday, 1=Monday, ..., 6=Saturday
- 즉 **MySQL 값 - 1 = PG 값**. 클라이언트 코드 (대시보드) 가 이 값을 어떻게 해석하는지 확인 필수.

**조치 권장**: **`DBM-05c` 신규 카드 필수** — `stats.py` 의 14건 모두 `func.extract / cast` 로 교체. 단 dayofweek semantics 차이는 별도 변환 적용 (또는 클라이언트 해석 수정).

이건 단순 `sed` 가 아닌 **함수 매핑 헬퍼** 작성이 깔끔합니다:
```python
# backend/utils/db_compat.py 신규
def hour(col): return func.extract('hour', col)
def year(col): return func.extract('year', col)
# ... 등
```
양 DB 모두 PG-style 로 통일 (PG 의 `EXTRACT` 는 MySQL 8 도 지원함).

### 2.4 기타 라우터 — 안전

`admin.py`, `discover.py`, `register.py`, `stats.py` 등에서 사용하는 `func.count`, `func.sum`, `func.avg`, `func.max`, `func.coalesce` 는 모두 ANSI 표준 → 양 DB 호환. 별도 작업 없음.

`func.cast(col, Type)` 도 SQLAlchemy 가 dialect 별로 적절히 변환 — 안전.

---

## 3. `backend/check_db.py`, `migrate_*.py` — Legacy

| 파일 | 내용 | 조치 |
|---|---|---|
| `check_db.py` | `SELECT name FROM sqlite_master` — **SQLite 전용**, 현 운영과 무관 | 본 사이클 외, 별도 카드 또는 삭제 |
| `migrate_kitchen_mode.py` | 단발 마이그레이션, `migration_sqls` 가 동일 작업 수행 | 본 사이클 외 |
| `migrate_menu_options.py` | 단발 마이그레이션, 동일 | 본 사이클 외 |
| `migrate_square_oauth.py` | 단발 마이그레이션, 동일 | 본 사이클 외 |

→ **조치**: backlog 에 "legacy migrate 스크립트 정리 + check_db.py 제거" 후보로 추가. 본 사이클 진행에 영향 없음.

---

## 4. `backend/models.py` — PG 예약어 / Enum / JSON 점검

### 4.1 PG 예약어 충돌 테이블

| 모델 | `__tablename__` (기본) | PG 상태 |
|---|---|---|
| `Order` | `order` | 🔴 PG 예약어 (`order`) |
| `Table` | `table` | 🔴 PG 예약어 (`table`) |
| 기타 | store, menu, customer, message, announcement, staffmember, ... | 안전 |

**SQLAlchemy 자동 처리**: PG dialect 사용 시 SQLAlchemy 가 자동으로 `"order"`, `"table"` 인용. ORM 쿼리는 모두 정상 동작.

**Raw SQL 만 수동 처리 필요** — §1.1, §2.1, §2.2 에서 모두 식별됨.

### 4.2 컬럼명 예약어 점검

| 컬럼 | PG | 비고 |
|---|---|---|
| `status` | not reserved | 안전 |
| `name` | not reserved | 안전 |
| `key` (SystemConfig.key) | not reserved (only "primary key" reserved) | 안전 |
| `value` (SystemConfig.value) | not reserved | 안전 |
| `created_at` 등 | not reserved | 안전 |
| `idempotency_key` | compound | 안전 |
| `payload_json` | compound | 안전 |

→ **컬럼명 충돌 없음**.

### 4.3 Python `str` Enum vs DB Enum

확인 결과: 모든 Enum 은 `class X(str, Enum)` Python enum 만 사용. SQLModel 이 자동으로 VARCHAR 컬럼으로 매핑 (DB-side ENUM 타입 없음).

| Enum | 값 |
|---|---|
| `KitchenColorMode` | CATEGORY, MENU, TABLE |
| `KitchenMode` | kds, square |
| `StoreCategory` | restaurant, cafe, bar, other |
| `SubscriptionType` | FREE, MONTHLY, SIXMONTH, YEARLY |
| `SubscriptionStatus` | TRIAL, ACTIVE, EXPIRED |
| `PointAccrualType` | PERCENT, FIXED |
| `PaymentOptions` | cash_only, card_and_cash |
| `TableStatus` | ready, occupied, CHECKOUT_REQUESTED ⚠️ |
| `PointTransactionType` | EARNED, USED, EXPIRED |
| `OrderType` | eat_in, take_out |
| `PaymentMethodType` | pay_at_counter, square_integrated, paypay_direct |
| `POSType` | square, smaregi, airregi, none |
| `MenuGroupType` | time_window, course, manual |
| `MessageSenderType` | admin, super_admin |

→ **DB schema 변경 없음**. 모두 VARCHAR. PG 이전에 영향 없음.

**⚠️ `TableStatus` 값 mixed case 주의**:
- Python enum: `READY = "ready"`, `OCCUPIED = "occupied"`, `CHECKOUT_REQUESTED = "CHECKOUT_REQUESTED"` (mixed)
- 운영 MySQL: 마이그레이션이 모두 대문자로 normalize 후 ENUM 강제 (`'READY'`, `'OCCUPIED'`, `'CHECKOUT_REQUESTED'`)
- PG 이전: 데이터 그대로 들고 가면 됨. ORM 비교 시 mixed case 일관성 주의 (별도 카드 — 본 사이클 외).

### 4.4 JSON 컬럼 (모두 Python `str` 로 저장)

| 모델 | 컬럼 | 사용 |
|---|---|---|
| `Menu` | `options` | JSON string (옵션 그룹 + 선택지) |
| `Menu` | `extra_translations` | JSON string (추가 언어) |
| `GlobalReview` | `tags` | JSON string (리뷰 태그) |
| `OrderItem` | `option_details` | JSON string (선택된 옵션) |
| `TakeoutTimeQuery` | `items_snapshot` | JSON string (장바구니 스냅샷) |
| `Store` (마이그레이션) | `business_hours` | TEXT (JSON 또는 문자열) |
| `EventLog` | `payload_json`, `external_payload_raw` | `Column(Text)` 명시 |
| `WebhookEvent` | `payload_raw` | `Column(Text)` 명시 |

**현재 상태**: 모두 코드에서 `json.dumps/loads`. DB 컬럼은 VARCHAR/TEXT. **PG 이전 영향 0**.

**미래 (별도 사이클 MNU)**:
- `Menu.options` 를 jsonb 로 마이그레이션 → GIN 인덱스 → 크로스 매장 옵션 검색 가능 (사용자 vision)
- 다른 JSON 컬럼들도 검색 필요 시 jsonb 로

### 4.5 sa_column=Column(Text)

3건 — `EventLog.payload_json`, `EventLog.external_payload_raw`, `WebhookEvent.payload_raw`.

PG `TEXT` 도 동일하게 지원. 호환 OK.

---

## 5. 데이터 타입 매핑 결정 표

### 1차 (본 사이클 — 마이그레이션 부담 최소)

| MySQL | PG | 비고 |
|---|---|---|
| `INT` | `INTEGER` | — |
| `BIGINT` | `BIGINT` | — |
| `SMALLINT` | `SMALLINT` | — |
| `VARCHAR(N)` | `VARCHAR(N)` | — |
| `TEXT` | `TEXT` | — |
| `JSON DEFAULT ('[]')` | `TEXT DEFAULT '[]'` | 코드가 str 로 다룸. jsonb 는 2차 |
| `DATETIME` | `TIMESTAMP WITHOUT TIME ZONE` | 의미 유지 (현재도 TZ 정보 없음) |
| `FLOAT` | `DOUBLE PRECISION` | SQLModel 기본 매핑 |
| `BOOLEAN` / `TINYINT(1)` | `BOOLEAN` | — |
| `ENUM('A','B')` 인라인 | `VARCHAR(50)` | TableStatus 만 해당, 1건 |
| `DECIMAL(p,s)` | `NUMERIC(p,s)` | 현재 미사용 |

### 2차 (별도 사이클)

| MySQL | PG (2차) | 사이클 | 가치 |
|---|---|---|---|
| JSON-as-TEXT | `jsonb` | MNU | 크로스 매장 옵션 검색 |
| `DATETIME` | `TIMESTAMPTZ` | (별도) | 타임존 정책 도입 시 |
| 지오 (현재 lat / lng FLOAT) | `geography(POINT, 4326)` | GEO | PostGIS — 근처 매장 |

---

## 6. DBM-05 호환화 액션 리스트 (구현 명세)

DBM-05 (postgres-specialist, sonnet) 가 `migration_sqls` 에 적용할 변환:

### 6.1 기계적 sed 가능 (15+ 건)

```
백틱(`) 식별자 → ANSI 큰따옴표(")
```
- `` `order` `` → `"order"` (15+ 건)
- `` `table` `` → `"table"` (8 건)

> sed 1줄로 처리 가능, 회귀 위험 매우 낮음.

### 6.2 `IF NOT EXISTS` 추가 (선택적)

대부분 ADD COLUMN 항목에 추가. MySQL 8.0.29+ / PG 9.6+ 둘 다 지원. try/except 가 이미 있으므로 필수는 아니나 **트랜잭션 abort 회피** 에 도움 (PG 는 단일 트랜잭션에서 1건 실패 시 이후 다 실패하는 경향).

### 6.3 `ALTER TABLE ... MODIFY COLUMN` (4 건)

라인 90, 98, 139, 188.

**전략 A (권장)**: 양 DB 모두에서 try 후 catch — 운영 MySQL 에는 이미 적용된 상태이므로 PG 신규 인스턴스에서 syntax error 나도 metadata.create_all 이 올바른 컬럼을 만들어 둠.

단, **PG 의 트랜잭션 abort 문제**: PG 는 syntax error 시 트랜잭션 전체 rollback. 현재 `database.py` 라인 202~212 는 `async with engine.begin() as conn` 단일 트랜잭션 → 한 건 실패 시 모두 실패.

→ **수정 필요**: 각 SQL 을 **개별 트랜잭션** 으로 실행. DBM-05 의 핵심 작업 중 하나:

```python
for sql in migration_sqls:
    try:
        async with engine.begin() as conn:   # 항목별 트랜잭션
            await conn.execute(text(sql))
    except Exception as e:
        if "already exists" in str(e) or "Duplicate" in str(e) or "1060" in str(e):
            pass
        else:
            print(f"⚠️ Migration skipped ({sql[:40]}...): {e}")
```

> 본 변경은 MySQL 운영에서도 안전 (각 항목이 멱등하므로).

### 6.4 `ADD UNIQUE INDEX` (1 건, 라인 186)

```sql
-- 변경 전
ALTER TABLE `order` ADD UNIQUE INDEX uq_order_square_payment_id (square_payment_id)

-- 변경 후 (양 DB 호환)
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order"(square_payment_id)
```

### 6.5 `JSON DEFAULT ('[]')` (1 건, 라인 45)

```sql
-- 변경 전
ALTER TABLE menu ADD COLUMN options JSON DEFAULT ('[]')

-- 변경 후 (양 DB 호환, 코드가 str 로 다룸)
ALTER TABLE menu ADD COLUMN IF NOT EXISTS options TEXT DEFAULT '[]'
```

### 6.6 에러 메시지 분기 (라인 209)

```python
# 기존
if "Duplicate column name" in str(e) or "already exists" in str(e) or "1060" in str(e):

# 권장 (PG SQLSTATE 추가)
err_str = str(e)
if any(s in err_str for s in ("Duplicate column name", "already exists", "1060", "42701", "42P07", "Duplicate key name")):
    pass
```

---

## 7. DBM 카드 갱신 권장

현재 `current-tasks.md` 의 plan 에 **2 개 카드 추가 필요** + 1 개 카드 확대:

### 신규 카드

#### **DBM-05b** — `demo.py` raw SQL 백틱 제거

- Owner: postgres-specialist (sonnet)
- Priority: 🟠 P1 (demo 기능, 운영 영향 적음, 단 PG 부팅 후 demo 페이지 호출 시 즉시 실패)
- 허용 파일: `backend/routers/demo.py`
- 작업: 라인 224, 231, 234, 237, 240, 243, 246, 249 의 `` `order` ``, `` `table` `` 백틱을 큰따옴표로 변경
- 분량: 5분

#### **DBM-05c** — `stats.py` MySQL 날짜 함수 PG 호환화

- Owner: postgres-specialist (sonnet)
- Priority: 🔴 P0 (analytics 기능 전체가 PG 에서 깨짐)
- 허용 파일:
  - `backend/utils/db_compat.py` (신규, 헬퍼)
  - `backend/routers/stats.py`
- 작업:
  - `db_compat.py` 에 `hour() / year() / month() / day_of_week() / date_only()` 5개 헬퍼 신규
  - 모두 `func.extract('hour', col)` 등 ANSI 호환으로 구현
  - `stats.py` 의 14건 사용처를 헬퍼로 교체
  - **`dayofweek` semantics 차이 주의** — MySQL `1=Sunday` vs PG `0=Sunday`. 클라이언트 코드 (`AdminView.jsx` / dashboard 컴포넌트) 가 어떻게 해석하는지 확인 후 일관성 유지 (MySQL 의미를 표준으로 두고 PG 측에서 `+1` 보정 권장)
- 검증: PG / MySQL 양쪽에서 동일 결과 반환
- 분량: 30~60분

### 카드 확대

#### **DBM-05** — `migration_sqls` ANSI 호환화 **+ 항목별 트랜잭션 분리**

- 기존 작업 + `for sql in migration_sqls` 루프를 항목별 트랜잭션으로 변경 (§6.3)
- 분량: 기존 추정보다 약간 늘어남 (~30분)

### Backlog 후보

- `seed_data.py` UPSERT 를 `ON CONFLICT` 로 (PG 이전 후 dev 시드 깨짐 해결)
- legacy `migrate_*.py`, `check_db.py` 정리
- `Menu.options` jsonb 마이그레이션 (별도 사이클 MNU)
- `DATETIME → TIMESTAMPTZ` + 타임존 정책 (별도 사이클)
- PostGIS 활성화 + Store.location POINT 컬럼 (별도 사이클 GEO)

---

## 8. PG 신규 schema 생성 시 예상되는 차이

DBM-08 에서 검증할 항목 (현 단계는 예측):

### 8.1 양 DB 동일하게 생성될 부분 (~95%)

- 모든 SQLModel 모델의 컬럼 (str / int / float / bool / datetime)
- 기본 인덱스 (PK, FK, `Field(index=True)`)
- FK 제약
- UNIQUE 제약 (`Field(unique=True)`)

### 8.2 양 DB 차이 가능성

| 항목 | MySQL | PG | 영향 |
|---|---|---|---|
| `Order.idempotency_key` UNIQUE 인덱스 이름 | `idx_order_idem_key` | SQLModel 가 다른 이름 자동 생성? | 검증 필요, 보강 SQL 필요 가능 |
| `Table.status` 컬럼 타입 | `ENUM(...)` (마이그레이션 강제) | `VARCHAR(50)` (SQLModel 기본) | 의도와 일치, 문제 없음 |
| `Menu.options` 컬럼 타입 | `JSON` (마이그레이션 강제) | `TEXT` (DBM-05 변경 후) | 의도와 일치 |
| 컬럼 기본값 표현 | MySQL: `DEFAULT 0`, `DEFAULT FALSE` | PG: 동일 | 문제 없음 |
| `created_at` 기본값 | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` | 동일 |
| Sequence (auto-increment) | `AUTO_INCREMENT` | `SERIAL` / `IDENTITY` | SQLAlchemy 가 자동 처리 |

### 8.3 검증 우선 항목

DBM-08 에서:
- 모든 인덱스 이름 비교 (`SHOW INDEX` vs `\d+ tablename`)
- FK 제약 비교
- UNIQUE 제약 비교
- 컬럼 nullable / default 비교

---

## 9. DBM-04~06 작업 가능성 자기 검증 ✅

### DBM-04 (의존성 + DATABASE_URL 추상화)

- [x] 입력 충분: `pyproject.toml` 위치, `utils/` 디렉토리 구조, `database.py` 의 URL 사용 패턴 모두 §0 / §1 / §4 에서 확인
- [x] 작업 명확: `asyncpg`, `psycopg2-binary` 추가, `to_sync_url()` 헬퍼 작성
- [x] 회귀 검증 가능: 기존 MySQL 부팅이 변경 없이 동작

### DBM-05 (`migration_sqls` ANSI 호환화)

- [x] 입력 충분: §1 (전체 인벤토리), §6 (변환 규칙) 완비
- [x] 작업 명확: 백틱 19+건 치환, JSON DEFAULT 1건, UNIQUE INDEX 1건, 트랜잭션 분리
- [x] 회귀 검증 가능: MySQL 부팅 멱등성, PG 빈 DB 부팅 (§8 검증 항목)
- [+] **확대 필요**: 트랜잭션 항목별 분리 (§6.3)

### DBM-06 (Alembic + workers 양 DB)

- [x] 입력 충분: `alembic/env.py`, `backend/workers/db.py` 의 현재 sync 변환 패턴 식별 완료
- [x] 작업 명확: `to_sync_url()` 호출로 교체
- [x] 회귀 검증 가능: MySQL 환경 alembic 동작 유지

### 추가 필요

- [+] **DBM-05b** (`demo.py` 백틱) — sonnet 5분 작업, plan 에 추가 권장
- [+] **DBM-05c** (`stats.py` 날짜 함수) — sonnet 30~60분 작업, plan 에 **추가 필수**

→ 본 보고서 + 위 2개 카드 추가하면 sonnet 이 DBM-04~06 (+05b, +05c) 모두 안전하게 진행 가능.

---

## 10. 다음 단계 (DBM-02 입력)

DBM-02 (사이징 + 도구 + 컷오버 전략) 가 본 보고서를 입력으로 결정할 항목들:

1. **Cloud SQL 사양**: 본 사이클의 데이터 양이 작아 db-g1-small (1.7GB) 또는 db-custom-1-3840 (3.75GB) 로 충분 예상. DBM-02 에서 최종 결정.
2. **마이그레이션 도구**: pgloader 가 §5 의 데이터 타입 매핑을 모두 지원 (datetime→timestamp, JSON→TEXT, ENUM→VARCHAR). DBM-02 에서 확정.
3. **컷오버 전략**: 현재 MySQL 의 `MODIFY COLUMN` 으로 강제된 ENUM / JSON 컬럼이 pgloader 로 어떻게 옮겨지는지 스테이징에서 확인 후 결정.
4. **순서**: DBM-04 (deps) → DBM-05 + 05b + 05c (코드 호환화) → DBM-06 (Alembic) → DBM-07 (compose PG) → DBM-08 (PG 빈 schema 검증) → DBM-09 (pgloader) → DBM-10 (정합성) → DBM-11 (Cloud SQL) → DBM-12 (컷오버) → DBM-13 (정리).

---

## 11. 산출물 / 다음 카드 호출

본 보고서 작성으로 DBM-01 완료. 다음:

```
# 1) DBM-05b, DBM-05c 카드를 current-tasks.md 에 추가 (architect 가 직접 또는 별도 지시)
# 2) DBM-02 시작 — db-migration-architect 에이전트(opus) 로
```

DBM-02 의 사용자 지시 프롬프트는 `current-tasks.md` 의 DBM-02 카드에 박혀있음.

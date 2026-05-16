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
| 라우터의 raw SQL (백틱·MySQL 문법) | **`demo.py` 3 백틱 (총 8 stmt), `seed_data.py` 2 백틱 + 2 UPSERT + 1 implicit cast, `reseed_demo.py` 2 백틱** | DBM-05b (demo.py) + backlog DBM-05d (seed/reseed) |
| SQLAlchemy `func.*` MySQL 전용 함수 | **`stats.py` 18건 + `register.py` 2건 + `super_admin.py` 6건 = 26건** (hour/year/month/dayofweek/date) | DBM-05c 신규 카드 필수 (허용 파일 확장) |
| 모델 (`models.py`) 의 PG 예약어 충돌 | **`order`, `table` 두 테이블** | SQLAlchemy 자동 인용 — 추가 작업 없음 |
| Python `str` Enum (DB-side ENUM 아님) | **14개** | 모두 VARCHAR 매핑 — 충돌 없음 |
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

### 2.1 `routers/demo.py` — 🔴 백틱 3건 + 일반 raw SQL 5건 (총 8 statements)

라인 225~249 (`cleanup_expired_temp_stores`, 함수 본체):

| 라인 | SQL | 백틱? |
|---|---|---|
| 225 | `SELECT id FROM \`order\` WHERE shop_id IN ({placeholders})` | 🔴 백틱 |
| 230 | `DELETE FROM orderitem WHERE order_id IN ({id_list})` | 일반 (PG OK) |
| 231 | `DELETE FROM \`order\` WHERE id IN ({id_list})` | 🔴 백틱 |
| 234 | `DELETE FROM \`table\` WHERE store_id = {sid}` | 🔴 백틱 |
| 237 | `DELETE FROM menu WHERE store_id = {sid}` | 일반 (PG OK) |
| 240 | `DELETE FROM globalreview WHERE store_id = {sid}` | 일반 (PG OK) |
| 243 | `DELETE FROM pointhistory WHERE store_id = {sid}` | 일반 (PG OK) |
| 246 | `DELETE FROM customerpoint WHERE store_id = {sid}` | 일반 (PG OK) |
| 249 | `DELETE FROM store WHERE id = {sid}` | 일반 (PG OK) |

**PG 비호환 핵심**: 백틱 3건 (라인 225, 231, 234) 만 PG 에서 syntax error.

**부수 문제 (PG 호환과는 별개)**:
1. f-string SQL — SQL injection 위험 (`shop_variants` / `id_list` 는 DB 에서 온 값이지만 일반적으로 권장 안 됨)
2. 트랜잭션 안에서 raw delete — ORM cascade 우회

**조치 권장**:
- **단순 ANSI 호환화**: 백틱 3건만 `"order"` / `"table"` 로 교체 → 양 DB 동작
- **장기 (별도 카드)**: ORM `await session.execute(delete(Order).where(...))` 형태로 리팩토링 + 파라미터 바인딩

**제안**: `DBM-05b` 신규 카드 — `demo.py` 백틱 제거 (3건, sonnet 5분 작업).

### 2.2 `seed_data.py` — 🟡 ON DUPLICATE KEY UPDATE 2건 + 백틱 2건 + implicit cast 1건

```python
# 라인 26~34
INSERT INTO store (...) VALUES (...)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_open = VALUES(is_open)

# 라인 51~59
INSERT INTO `table` (...)              # 🔴 백틱
ON DUPLICATE KEY UPDATE qr_token = VALUES(qr_token), status = VALUES(status)

# 라인 66
SELECT id, table_number, status FROM `table` WHERE store_id = :sid
ORDER BY table_number + 0              # 🟡 MySQL implicit string→int cast
```

- MySQL 전용 UPSERT (라인 31, 56). PG: `INSERT ... ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col`
- 백틱 `` `table` `` (라인 52, 66) → PG 에서 syntax error
- `ORDER BY table_number + 0` (라인 66) → PG 는 string + int 묵시적 캐스트 안 됨 → `CAST(table_number AS INTEGER)` 필요
- 시드 스크립트는 dev 용. 운영에서 안 돌아감.

**조치 권장**:
- 본 사이클에서는 **그대로 둠** (PG 이전 후 dev 사용 시 깨지지만 운영 영향 없음)
- 별도 카드 `DBM-05d` 또는 backlog 로: PG `ON CONFLICT` 로 재작성 + 백틱 제거 + implicit cast 제거 (15분 작업)

### 2.2b `reseed_demo.py` — 🟡 백틱 2건 (검증 패스 시 추가 발견)

라인 127, 135:
```python
await s.execute(text(f"DELETE FROM `table` WHERE store_id = {sid}"))   # 라인 127
await s.execute(text(f"DELETE FROM `table` WHERE store_id = {sid}"))   # 라인 135
```

- dev 전용 reseed 스크립트 (`backend/reseed_demo.py`) — 운영 영향 없음
- PG 에서 syntax error → seed_data.py 와 같은 backlog 카드 (`DBM-05d`) 에 묶어서 처리 권장

### 2.3 `routers/stats.py` — 🔴 MySQL 날짜 함수 18건 (검증 패스에서 +4건 발견)

`SQLAlchemy func.*` 의 함수명은 DB 에 그대로 전송됨. MySQL 전용 함수는 PG 에서 syntax error:

| 라인 | 사용 | MySQL 가 받는 SQL | PG 호환 | 건수 |
|---|---|---|---|---|
| 71, 78, 80, 107, 267 | `func.date(Order.created_at)` | `DATE(created_at)` | `(created_at)::date` 또는 `func.cast(Order.created_at, Date)` | 5 |
| 103, 109, 111, 263, 268 | `func.hour(Order.created_at)` | `HOUR(created_at)` | `func.extract('hour', Order.created_at)` | 5 |
| 268 (추가) | `func.hour(...)` 가 같은 라인에 2회 (group_by + order_by) | — | — | +1 |
| 292, 300 | `func.year(...)` | `YEAR(...)` | `func.extract('year', ...)` | 2 |
| 293, 300, 302 | `func.month(...)` | `MONTH(...)` | `func.extract('month', ...)` | 3 |
| 325, 332, 334 | `func.dayofweek(...)` | `DAYOFWEEK(...)` | `func.extract('dow', ...)` + 인덱스 변환 (semantics 차이 주의) | 3 |

**총 호출 건수 (라인 grep 기준)**: **18건** (기존 audit 의 "약 14건" 보다 4건 더 — 268번 라인이 group_by/order_by 양쪽에 사용, 300번 라인이 year+month 양쪽 사용 등 동일 라인에 중복 호출됨).

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

### 2.4 `routers/register.py` — 🔴 `func.date()` 2건 (검증 패스에서 추가 발견)

| 라인 | 코드 | PG 영향 |
|---|---|---|
| 421 | `func.date(Order.created_at) == today,` | 🔴 PG 에서 `DATE(...)` → 사실 PG 도 `DATE()` 함수 지원하지만 SQLAlchemy `func.date` 는 dialect 별 처리. 안전을 위해 cast 권장 |
| 484 | `(func.date(Order.created_at) == today)` | 동일 |

> **주의**: PG 는 `DATE(timestamp)` 함수가 실제로 존재함 (PostgreSQL 7.0+, `DATE(timestamp) → date`). 따라서 `func.date()` 는 **양 DB 호환** 가능성이 높음. 단 SQLAlchemy 가 dialect 별로 어떻게 컴파일하는지 dialect-level 검증 필요. **DBM-05c 헬퍼 `date_only(col)` 을 적용하면 안전 확보** + register.py 의 2건도 헬퍼로 교체 권장.

### 2.5 `routers/super_admin.py` — 🔴 `func.date()` 6건 (검증 패스에서 추가 발견)

| 라인 | 코드 |
|---|---|
| 147 | `func.date(Order.created_at).label("day"),` |
| 153 | `.group_by(func.date(Order.created_at)).order_by(func.date(Order.created_at))` (2회) |
| 395 | `func.date(Order.created_at).label("day"),` |
| 399 | `.group_by(func.date(Order.created_at))` |
| 400 | `.order_by(func.date(Order.created_at))` |

> 위 §2.4 와 동일한 PG 호환성 검증 필요. DBM-05c 의 `date_only` 헬퍼로 일괄 교체하면 안전.

**조치 권장**: DBM-05c 의 허용 파일에 `backend/routers/register.py`, `backend/routers/super_admin.py` 도 추가 (또는 단순 verify-only).

### 2.6 기타 라우터 — 안전

`admin.py`, `discover.py` 등에서 사용하는 `func.count`, `func.sum`, `func.avg`, `func.max`, `func.coalesce` 는 모두 ANSI 표준 → 양 DB 호환. 별도 작업 없음.

`func.cast(col, Type)` 도 SQLAlchemy 가 dialect 별로 적절히 변환 — 안전.

추가 검증 (검증 패스):
- `func.now / current_timestamp / curdate / curtime / sysdate / unix_timestamp / from_unixtime / str_to_date / date_format / datediff / timestampdiff / date_add / date_sub` — **모두 미사용** (양 DB 호환)
- `GROUP_CONCAT / REGEXP / RLIKE / LIKE BINARY / STRAIGHT_JOIN / FORCE INDEX` — **모두 미사용**
- `AUTO_INCREMENT / COLLATE / utf8mb4 / TINYINT / MEDIUMTEXT / LONGTEXT / UNSIGNED` — **모두 미사용**

→ MySQL-only 구문은 본 보고서가 인벤토리한 케이스가 전부.

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

확인 결과: 모든 Enum 은 `class X(str, Enum)` Python enum 만 사용 (총 **14개**, models.py 라인 11/16/20/26/32/37/41/184/339/366/489/504/514/588). SQLModel 이 자동으로 VARCHAR 컬럼으로 매핑 (DB-side ENUM 타입 없음).

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

---

## 12. 검증 패스 결과 (2026-05-11)

> **검증 일시**: 2026-05-11
> **검증 모델**: db-migration-architect (opus)
> **검증 입력**: 본 보고서 (§1~11) + 현재 worktree (`stoic-noyce-74945e`) 의 실제 코드
> **목적**: 세션 비정상 종료로 work-log 미기록 → audit 보고서가 현재 코드와 일치하는지, DBM-04~06 (+05b, +05c) sonnet 작업 입력으로 충분한지 검증

### 12.1 검증 절차

1. `backend/database.py` 의 `migration_sqls` 라인 번호 (47, 80~83, 85, 87, 90, 92~96, 98, 100~101, 105, 107, 115, 139, 174~175, 179, 186, 188, 199~200) 와 audit §1.1~1.4 표 대조 → **전 항목 일치**
2. `backend/database.py:209` 멱등 try/except 코드 확인 → audit §1.6 인용과 **정확히 일치**
3. `backend/routers/demo.py` 의 `cleanup_expired_temp_stores` 라인 225~249 패턴 확인 + `backend/` 전체에 `` `order` `` / `` `table` `` 백틱 grep
4. `backend/routers/stats.py` 의 `func.date|hour|year|month|dayofweek` grep + `backend/` 전체 동일 패턴 grep
5. `backend/models.py` 의 `class .*\(str, Enum\)` grep + `Column(Text)` grep
6. defensive sweep — `session.execute(text(`, `_text(`, `ON DUPLICATE KEY`, `func.now/curdate/datediff/date_format/...`, `AUTO_INCREMENT|TINYINT|COLLATE|utf8mb4|UNSIGNED|GROUP_CONCAT|REGEXP|FORCE INDEX` 모두 grep
7. DBM-04~06 (+05b, +05c) 의 입력 충분성 자기 검증 (§9 의 체크리스트 재실행)

### 12.2 Drift 발견 — 3 건 (audit 본문 보강 완료)

| # | 위치 | 원본 audit | 실제 코드 | 보강 |
|---|---|---|---|---|
| D1 | §2.1 표 헤더 | "백틱 + raw SQL 8건" | 백틱 실제로는 **3건** (라인 225, 231, 234), 나머지 5건은 일반 테이블에 대한 f-string raw SQL | §2.1 을 "백틱 3건 + 일반 raw SQL 5건 (총 8 stmt)" 로 재작성, 라인별 표 추가 |
| D2 | §2.3 표 헤더 | "약 14건" | grep 결과 실제 호출 **18건** (268·300 라인이 group_by/order_by 양쪽에 함수 중복 호출) | §2.3 표에 "건수" 컬럼 추가, 총합 18건 명시 |
| D3 | §4.3 + §0 표 | "약 12개" Enum | 실제 **14개** (KitchenColorMode·KitchenMode·StoreCategory·SubscriptionType·SubscriptionStatus·PointAccrualType·PaymentOptions·TableStatus·PointTransactionType·OrderType·PaymentMethodType·POSType·MenuGroupType·MessageSenderType) | §0 표·§4.3 본문 모두 14개로 보정 + 라인 번호 인용 |

### 12.3 추가 발견 케이스 (audit 가 놓침) — 4 건 (본문 보강 완료)

| # | 위치 | 패턴 | 영향 | 보강 |
|---|---|---|---|---|
| N1 | `backend/reseed_demo.py:127, 135` | `text(f"DELETE FROM \`table\` ...")` 백틱 2건 | dev 전용 reseed 스크립트 — 운영 영향 없음. PG 부팅 자체에는 무관 | §2.2b 신규 소절 추가, backlog `DBM-05d` 후보로 묶음 |
| N2 | `backend/seed_data.py:52, 66` | `\`table\`` 백틱 2건 (INSERT + SELECT) | dev 시드. audit §2.2 가 UPSERT 만 언급 → 백틱은 누락 | §2.2 본문에 라인 번호 + 백틱 추가 |
| N3 | `backend/seed_data.py:66` | `ORDER BY table_number + 0` MySQL implicit string→int cast | dev 시드. PG 는 묵시적 캐스트 안 함 → 실행 시 syntax/cast error | §2.2 본문에 implicit cast 항목 추가 |
| N4 | `backend/routers/register.py:421, 484` + `backend/routers/super_admin.py:147, 153×2, 395, 399, 400` | `func.date(Order.created_at)` 총 **8건** | analytics/register 정산 코드. **PG 의 `DATE(timestamp)` 함수는 실제 존재** → SQLAlchemy 가 dialect-aware 컴파일하므로 양 DB 호환 가능성 높지만 검증 필수 | §2.4 (register.py) + §2.5 (super_admin.py) 신규 소절 추가. DBM-05c 의 헬퍼 `date_only()` 일괄 적용 권장 |

### 12.4 Defensive Sweep 결과

| 패턴 | 결과 |
|---|---|
| `func.now / curdate / curtime / sysdate / unix_timestamp / from_unixtime / str_to_date / date_format / datediff / timestampdiff / date_add / date_sub` | 0 건 — 미사용 |
| `GROUP_CONCAT / REGEXP / RLIKE / LIKE BINARY / STRAIGHT_JOIN / FORCE INDEX / USE INDEX / IGNORE INDEX` | 0 건 — 미사용 |
| `AUTO_INCREMENT / COLLATE / utf8mb4 / TINYINT / MEDIUMTEXT / LONGTEXT / UNSIGNED` | 0 건 — 미사용 |
| `ON DUPLICATE KEY` | 2 건 (`seed_data.py` 만) — audit §2.2 에서 이미 식별 |
| `Column(JSON)` | 0 건 — 모든 JSON 데이터는 `str` + `Column(Text)` 또는 디폴트 VARCHAR (audit §4.4 일치) |
| `Column(Text)` | 3 건 — `EventLog.payload_json`, `EventLog.external_payload_raw`, `WebhookEvent.payload_raw` (audit §4.5 일치) |

→ **MySQL-only 신규 케이스 없음**. 본 보고서 (보강 후) 가 PG 비호환 인벤토리의 완전한 super-set 임을 확인.

### 12.5 DBM-04~06 (+05b, +05c) 핸드오프 가능성 — ✅ 가능

| 카드 | 입력 충분 | 비고 |
|---|---|---|
| **DBM-04** (deps + URL 추상화) | ✅ | §0 / §1 / §4 로 충분. `pyproject.toml`, `utils/` 구조 명시 |
| **DBM-05** (`migration_sqls` ANSI 호환화 + 트랜잭션 분리) | ✅ | §1 전체 인벤토리 + §6 변환 규칙 완비. 검증 패스로 라인 번호 100% 일치 확인 |
| **DBM-05b** (`demo.py` 백틱) | ✅ | §2.1 보강으로 정확한 라인 3건 (225, 231, 234) + 백틱 vs 일반 분리 명시 |
| **DBM-05c** (`stats.py` 날짜 함수) | ✅ | §2.3 보강으로 정확한 라인 18건. **단 `register.py` (라인 421, 484), `super_admin.py` (147, 153, 395, 399, 400) 도 함께 처리 권장** — DBM-05c 카드의 허용 파일에 추가 필요 |
| **DBM-06** (Alembic + workers/db.py) | ✅ | 본 검증 패스에서 별도 변경 없음 |

### 12.6 권고

- ✅ **DBM-02 진행 가능**. 본 audit 보고서 (보강 후) 가 DBM-02 (사이징 + 도구 + 컷오버) 의 입력으로 충분.
- ⚠️ **DBM-05c 카드의 "허용 파일" 확장 권장**: `backend/routers/register.py`, `backend/routers/super_admin.py` 도 함께 처리 (헬퍼 일괄 적용). `current-tasks.md` 의 DBM-05c 카드 본문을 architect 가 직접 보강하거나, postgres-specialist 가 §2.4/§2.5 를 보고 자체 인지하도록 유지 가능. **권고**: architect 가 DBM-05c 카드의 File Fence 에 두 파일 추가하는 1줄 편집.
- ⚠️ **DBM-05d (backlog) 후보 통합**: `seed_data.py` (UPSERT + 백틱 + implicit cast) + `reseed_demo.py` (백틱) → 단일 backlog 카드 `DBM-05d` 로 묶어서 PG 컷오버 직전에 처리. 운영 영향 없으므로 출시 후로 미뤄도 무방.

### 12.7 변경 내역 (이 검증 패스에서 audit 파일에 적용)

| 섹션 | 변경 |
|---|---|
| §0 요약 표 | 라우터 raw SQL 카운트 갱신 (demo.py / seed_data / reseed_demo / register / super_admin 모두 반영), `func.*` 14건 → 26건, Enum 12개 → 14개 |
| §2.1 demo.py | 헤더 "백틱 8건" → "백틱 3건 + 일반 raw SQL 5건". 라인별 백틱 여부 표 추가 |
| §2.2 seed_data.py | 백틱 2건 + implicit cast 1건 추가 명시 |
| §2.2b (신규) | `reseed_demo.py` 백틱 2건 소절 추가 |
| §2.3 stats.py | "약 14건" → "18건". 건수 컬럼 추가 |
| §2.4 (신규) | `register.py` `func.date()` 2건 소절 추가 |
| §2.5 (신규) | `super_admin.py` `func.date()` 6건 소절 추가 |
| §2.6 (구 §2.4) | "기타 라우터 안전" 본문에 defensive sweep 결과 (미사용 패턴 목록) 추가 |
| §4.3 | Enum "약 12개" → "14개" + 라인 번호 명시 |
| §12 (신규) | 본 검증 패스 결과 섹션 추가 |

---

## 13. 마이그레이션 결정 사항 (DBM-02 산출, 2026-05-11)

> **결정자**: db-migration-architect (opus)
> **입력**: §1~12 (호환성 감사 + 검증 패스 결과) + 운영자 컨텍스트 (단일 GCP VM `35.213.6.149`, 식당 수 베타, 데이터 < 1 GB, 비용 민감, 새벽 30~60분 다운타임 허용, 백업/PITR 요구)
> **목적**: DBM-03 (ADR 3개), DBM-09 (pgloader), DBM-11 (Cloud SQL 인스턴스), DBM-12 (컷오버 룬북) 의 입력
> **주의**: 운영자(자이라) 가 검토해서 변경 가능한 권장값. 묻지 않고 합리적 default 로 채움. 각 결정의 운영자 협의 항목은 `current-tasks.md` 의 OPR-09~12 와 매핑.

---

### 13.1 Cloud SQL 인스턴스 사양

#### 트레이드오프 비교

| 옵션 | vCPU / 메모리 | 디스크 | 월 비용 (US 기준) | 적합 시점 | 리스크 |
|---|---|---|---|---|---|
| do-nothing (MySQL 유지) | n/a | n/a | $0 추가 | n/a | PG 이전 목표 미달성. MySQL 한계 (PostGIS / jsonb / tsvector) 그대로 |
| **db-custom-1-3840 (1 vCPU, 3.75 GB)** ★ | 1 / 3.75 GB | 20 GB SSD, 자동 증가 | ~$45~55 / 월 (zonal, asia-northeast1) | 베타 (식당 < 30), 데이터 < 5 GB | 동시 주문 폭증 시 CPU 병목 — scale up 으로 5~10분 다운타임 해소 |
| db-g1-small (0.6 vCPU shared, 1.7 GB) | shared | 10 GB SSD | ~$25~30 / 월 | 매우 가벼운 dev/staging | shared CPU → 운영 SLA 보장 안 됨. 메모리 부족 시 OOM |
| db-custom-2-7680 (2 vCPU, 7.5 GB) | 2 / 7.5 GB | 50 GB SSD | ~$95~110 / 월 | 식당 30~100, 동시 주문 다수 | 초기 비용 과지출. 베타에서 활용도 낮음 |
| db-custom-4-16384 (4 vCPU, 16 GB) | 4 / 16 GB | 100 GB SSD | ~$200~230 / 월 | 식당 100+ | 베타 단계에 과한 사양 |

#### 권장 사양

| 항목 | 권장값 | 근거 |
|---|---|---|
| 인스턴스 타입 | **db-custom-1-3840** (1 vCPU, 3.75 GB) | 베타 단계, 매출 적음. db-g1-small 보다 메모리 여유 + non-shared CPU 로 운영 SLA 확보 |
| 디스크 | **20 GB SSD, 자동 증가 ON** | 현 데이터 < 1 GB. 자동 증가는 일방향이므로 작게 시작 |
| HA | **zonal (단일 인스턴스)** | 단일 GCP VM 운영과 매치. regional HA 는 비용 ~2배. 식당 50+ 시 검토 |
| 리전 / 존 | **asia-northeast1 / asia-northeast1-b** | 기존 GCP VM 과 동일 존 → 네트워크 latency 최소 (~1ms 이하) |
| PostgreSQL 버전 | **16** | 안정 LTS + jsonb 성숙 + EXTRACT 표준 호환 + PostGIS 3.4 지원 (GEO 사이클 대비) |
| 백업 | **매일 02:00 KST, 7일 보관** | 운영자 요구. 영업 외 시간 |
| PITR (Point-in-time Recovery) | **활성화, WAL 7일 보관** | 운영자 요구. 컷오버 직후 사고 시 즉시 복구 가능 |
| Maintenance window | **일요일 03:00~04:00 KST** | 영업 외 시간. GCP 자동 패치 시간대 |
| 사용자 | `qraku` (superuser 아님) | postgres superuser 는 콘솔 전용 |
| 데이터베이스명 | `qraku` | 단일 DB |

#### 선택 이유

1. 베타 단계 데이터 (< 1 GB) 와 식당 수 (< 30) 에 db-custom-1-3840 으로 충분, db-g1-small 의 shared CPU 리스크 회피.
2. zonal + 자동 증가 디스크로 비용 최소화하면서, scale-up 경로 (vCPU 2~4, regional HA) 가 GCP 콘솔 클릭으로 확보.
3. PG 16 은 GEO (PostGIS), MNU (jsonb GIN), SRC (tsvector + pg_trgm) 후속 사이클까지 한 번에 커버.

#### 롤백 비용

인스턴스 사이즈 변경은 **online resize 5~10분** (GCP 자동). 디스크는 일방향 증가만 가능 → 작게 시작이 안전. PG 버전 다운그레이드는 불가 → 16 으로 시작 후 유지.

> **운영자 결정 필요 (OPR-09)**: GCP 콘솔에서 위 사양으로 Cloud SQL PostgreSQL 인스턴스 생성. 비밀번호는 16자 이상 random 생성 후 secret manager 또는 `.env` 에만 보관.

---

### 13.2 네트워크

#### 트레이드오프 비교

| 옵션 | latency | 비용 | 설정 복잡도 | 보안 | 적합 시점 |
|---|---|---|---|---|---|
| do-nothing (외부 IP 직노출) | 동일 | $0 | 가장 단순 | 🔴 위험 — Cloud SQL 비번 하나만 노출되면 전 데이터 손실 | 권장 안 함 |
| **Public IP + Cloud SQL Auth Proxy** ★ | ~1~2 ms | $0 (proxy 무료) | ★ 낮음 — VM 에 binary 1개 + systemd 서비스 | IAM 인증 + TLS 자동 | 단일 VM 운영, 본 사이클 |
| Private IP + VPC Peering | < 1 ms | VPC 비용 ~$10 / 월 + Cloud SQL Private Service Connection 추가 비용 | 중간 — VPC / 서브넷 / Peering 설정 | 가장 안전 (VPC 내부) | 멀티 VM / GKE / 트래픽 100+ rps |
| Cloud SQL Connector (Python lib) | ~1~2 ms | $0 | 중간 — Python 측 추가 의존성 + IAM 토큰 갱신 로직 | IAM 인증 + TLS | proxy 대신 lib 사용하고 싶을 때 |

#### 권장

**Cloud SQL Auth Proxy (Public IP)** — VM 에 `cloud-sql-proxy` binary 설치 + systemd 서비스로 127.0.0.1:5432 listen. backend 의 `DATABASE_URL` 은 localhost 만 알면 됨.

#### 선택 이유

1. 단일 VM 운영 (`35.213.6.149`) + 단일 Cloud SQL 의 1:1 트래픽 — VPC 까지는 과함.
2. Auth Proxy 는 IAM 자동 인증 + TLS 자동 + 무료 → 가장 좋은 비용/보안/단순성 균형.
3. 향후 멀티 VM / GKE 로 갈 때만 Private IP + VPC 재검토.

#### 롤백 비용

Auth Proxy 중단 시 즉시 DB 끊김. `systemctl restart cloud-sql-proxy.service` 로 즉시 복구. VPC 로 전환은 한 번에 가능 (단 인스턴스 재생성 또는 Private IP 추가 활성화 필요, ~20분).

> **운영자 결정 필요 (OPR-10)**: GCP VM 에 Cloud SQL Auth Proxy binary 다운로드 + systemd 서비스 등록. 절차는 DBM-11 에서 deployment.md 에 보강 예정.

---

### 13.3 데이터 마이그레이션 도구

#### 트레이드오프 비교

| 도구 | schema 자동 변환 | data copy | 성능 | 재현성 | 비용 | 학습 곡선 | 본 프로젝트 적합도 |
|---|---|---|---|---|---|---|---|
| do-nothing (수동 mysqldump + psql 변환) | ❌ (수동 sed) | ✅ | 느림 (단일 스레드 import) | 낮음 (수동 sed 누락 위험) | $0 | 낮음 | 🔴 데이터 < 1 GB 인데도 사람 손이 너무 많이 가고 dayofweek 등 semantics 보정 누락 위험 |
| **pgloader** ★ | ✅ (자동 매핑 + cast 규칙) | ✅ (병렬) | 빠름 (~1 GB / 5분) | 높음 (`qraku.load` config 파일에 박힘) | $0 (오픈소스) | 중간 | ★ schema + data + 시퀀스 보정 + 인덱스를 한 명령으로. 스테이징 검증 후 운영 컷오버 그대로 재사용 |
| Google Database Migration Service (DMS) | ✅ | ✅ (read replica 방식) | 빠름 + zero-downtime 옵션 | 높음 (GCP 콘솔에서 관리) | ~$0 (Cloud SQL 비용에 포함) | 높음 — GCP 콘솔 + IAM + binlog 설정 | 🟡 베타 데이터에 과한 인프라. zero-downtime 이 본 사이클 목표 외 |
| AWS DMS | n/a (AWS 전용) | n/a | n/a | n/a | n/a | n/a | n/a (GCP 환경) |

#### 권장

**pgloader** — 스테이징 1회 검증 (DBM-09) → 운영 컷오버 (DBM-12) 동일 config 재사용.

#### 선택 이유

1. 데이터 < 1 GB + 새벽 30~60분 다운타임 허용 → DMS 의 zero-downtime 가치가 본 사이클에서 발생 안 함.
2. pgloader 는 GCP 외 환경에서도 재현 가능 (vendor lock-in 회피).
3. 단일 `qraku.load` config 파일에 변환 규칙 (DATETIME → TIMESTAMP, JSON → TEXT, ENUM → VARCHAR) 모두 박혀있어 audit §5 의 매핑 표를 1:1 로 옮길 수 있음.

#### 롤백 비용

pgloader 는 멱등 아님 — 다시 돌리면 PRIMARY KEY 충돌. 롤백은 **PG 측 데이터 truncate + 재실행**. MySQL 측은 read-only mode 로 유지하므로 롤백 시 backend 의 `DATABASE_URL` 만 MySQL 로 되돌리면 즉시 복구 (T+5분 윈도우).

> **운영자 결정 필요**: 없음 (architect + data-migration-engineer 담당).

---

### 13.4 컷오버 전략

#### 트레이드오프 비교

| 전략 | 다운타임 | 코드 변경 부담 | 정합성 검증 | 롤백 윈도우 | 본 프로젝트 적합도 |
|---|---|---|---|---|---|
| do-nothing (MySQL 유지) | 0 | 0 | n/a | n/a | n/a |
| **big-bang (점검 30~60분)** ★ | 30~60분 | 0 (이번 사이클 코드 변경만) | DBM-10 정합성 스크립트 1회 | T+5분 ~ T+30분 (.env 되돌리기) | ★ 베타 단계 + 단일 VM + 새벽 트래픽 ~0 → 가장 단순하고 안전 |
| 듀얼라이트 (코드가 양 DB 동시 쓰기) | 0 | 🔴 매우 큼 — 모든 라우터에 양 DB 트랜잭션 + 분산 트랜잭션 또는 outbox 패턴 | 매 요청마다 양 DB 정합성 비교 워커 필요 | 항시 (양쪽 살아있으므로) | 본 사이클 범위 외. 코드 변경 비용 2~3주+ |
| read replica + 컷오버 (DMS 사용 시) | < 5분 | 적음 | DMS 가 binlog 추적 → 자동 검증 | T+5분 | 🟡 DMS 사용 시만 가능. 본 사이클은 pgloader 선택 → 불가 |

#### 권장

**big-bang (새벽 점검 30~60분)**.

#### 선택 이유

1. 베타 단계 → 새벽 4~6시 트래픽 거의 0. 30~60분 다운타임 영향 매우 작음.
2. 듀얼라이트는 코드 변경 비용이 이 사이클 (DBM 총 13 카드) 의 2~3배 → ROI 매우 낮음.
3. pgloader 단일 실행 + 정합성 스크립트 (DBM-10) + smoke test 의 단순한 시퀀스로 검증 가능.

#### 롤백 비용

- T+0 ~ T+30분 사이 smoke test 실패 시: `.env` 의 `DATABASE_URL` 을 MySQL 로 되돌리고 `systemctl restart qrorder` → **5분 이내 복구**.
- T+30분 이후 ~ T+24h 사이: PG 에 들어간 신규 행 (T+0 이후) 을 MySQL 로 역복사하는 `tools/rollback_resync.py` 사전 준비 필요. 룬북에 명시.
- T+24h 이후: 롤백 비용 폭증 — 운영자 결정 필요. 사실상 forward fix 만.

> **운영자 결정 필요 (OPR-11)**: 컷오버 날짜 / 시간대 / 사전 공지 채널 확정. 권장: 일요일 또는 평일 새벽 04:00~05:00 KST. 사전 공지는 LINE / 매장 admin 페이지 배너 / 운영자 직접 연락 등 채널 선택.

---

### 13.5 다운타임 윈도우 + 사전 공지

#### 권장

| 항목 | 권장값 | 근거 |
|---|---|---|
| 컷오버 시간대 | **새벽 04:00~05:00 KST** (예비 06:00 까지) | 거의 모든 매장 영업 외 시간. 일본 / 한국 / 동남아 모두 새벽 |
| 다운타임 윈도우 | **30분 (목표), 60분 (최대)** | pgloader 5분 + 정합성 검증 5분 + smoke test 5분 + 버퍼 |
| 사전 공지 시점 | **T-72h, T-24h, T-1h** 3회 | 운영자 → 매장. 채널은 OPR-11 에서 확정 |
| 컷오버 후 모니터링 | **T+0 ~ T+24h 집중, T+24h ~ T+48h 감시** | 에러율 < 0.1% / 결제 실패율 < 0.5% 유지 확인 |
| 점검 페이지 | `503 Service Unavailable` + 예상 복구 시간 텍스트 | systemd stop 만으로도 nginx / Cloudflare 가 자동 503 |

#### 매장 측 영향

- 새벽 04:00~05:00 KST 는 거의 모든 매장 영업 외 → 손님 영향 거의 없음.
- 24시간 영업 매장 (편의점, 일부 카페) — 운영자가 사전 협의 필요.
- 식당 admin / 메뉴 / QR 모두 30~60분 접근 불가.

#### 롤백 비용

컷오버 실행 중 (T-30 ~ T+30) 에는 룬북의 "T+5 smoke test fail → 즉시 .env 되돌리기" 경로로 5분 내 복구. T+60분 넘으면 롤백 비용 증가하므로 60분 안에 success / fail 판정 필수.

> **운영자 결정 필요 (OPR-11, OPR-12)**: 사전 공지 채널 + 컷오버 시점 + `.env` 교체 권한 (운영자 본인 또는 sonnet 에이전트).

---

### 13.6 결정 요약 + DBM-03 핸드오프

| # | 결정 항목 | 선택 | 연결 ADR (DBM-03) |
|---|---|---|---|
| 13.1 | Cloud SQL 사양 | db-custom-1-3840 / 20 GB SSD / zonal / PG 16 / asia-northeast1-b / 백업+PITR | ADR-006 (왜 PG 로 가는가) |
| 13.2 | 네트워크 | Public IP + Cloud SQL Auth Proxy | ADR-006 (배포 인프라 결정) |
| 13.3 | 데이터 마이그레이션 도구 | **pgloader** (스테이징 + 운영 동일) | ADR-007 (pgloader 선택) |
| 13.4 | 컷오버 전략 | **big-bang** (새벽 30~60분) | ADR-008 (컷오버 전략) |
| 13.5 | 다운타임 윈도우 | 새벽 04:00~05:00 KST, 60분 최대 | ADR-008 |

#### DBM-03 (ADR 작성) 핸드오프 입력

- **ADR-006 (postgresql-migration)**: §13.1 + §13.2 + audit §5 (데이터 타입 매핑) 를 입력으로 "왜 MySQL 한계 → PG", Cloud SQL 사양, 네트워크 결정을 정리.
- **ADR-007 (pgloader-choice)**: §13.3 의 4 옵션 트레이드오프 표 + 선택 이유를 그대로 옮김.
- **ADR-008 (cutover-strategy)**: §13.4 + §13.5 의 big-bang + 다운타임 윈도우 + 롤백 윈도우 (T+5분 ~ T+24h) 를 정리.
- **ADR-003 (inline-migration-coexistence)** 에 "PG 컷오버 후 DBM-13 에서 superseded 예정 (Alembic 단일화)" 메모 추가.

#### 운영자 협의 항목 (OPR 매핑)

| 결정 | 운영자 액션 | OPR ID |
|---|---|---|
| §13.1 Cloud SQL 인스턴스 생성 | GCP 콘솔에서 사양대로 생성 + 비밀번호 발급 | **OPR-09** |
| §13.2 Auth Proxy 설치 | VM 에 binary + systemd 등록 (DBM-11 룬북 따름) | **OPR-10** |
| §13.4~5 컷오버 시점 / 공지 | 날짜 / 시간 / 채널 결정 + 매장 사전 공지 | **OPR-11** |
| §13.5 `.env` 교체 | 컷오버 룬북 T-5 단계, 운영자 직접 수행 | **OPR-12** |

> 본 §13 가 DBM-03 (ADR 작성) 의 입력. DBM-03 은 본 표를 기반으로 ADR 3 개 (006, 007, 008) + 색인 갱신 + ADR-003 superseded 메모.

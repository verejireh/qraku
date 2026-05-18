# Current Tasks — 2026-05 PostgreSQL 마이그레이션 사이클

> **사이클 목표**: MySQL → **PostgreSQL (GCP Cloud SQL)** 이전.
> 이번 사이클 동안 코드는 양 DB 호환을 유지하다가, 컷오버 시점에 PG 만 사용.
> 자세한 결정 배경은 [`docs/adr/`](../docs/adr/) (006~008 신규 작성).
>
> 모든 카드는 [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 1~11 + 본 사이클 추가 규칙 (양 DB 호환) 을 준수.

---

## 작업 완료 시 필수 절차

각 카드 작업이 끝날 때마다 **반드시 두 가지**:

1. **진행 보드 상태 갱신** — `TODO → ✅ DONE`
2. **`tasks/work-log.md`에 append** — 기존 템플릿 사용

사이클 종료 시:
- 모든 ✅ DONE 카드를 [`archive/2026-05-postgresql-cycle.md`](./archive/) 로 요약 이전
- 본 파일은 다시 다음 사이클의 후보 카드만 남도록 정리

---

## 진행 보드

| ID | 제목 | Phase | 우선순위 | Owner | 모델 | 상태 |
|---|---|---|---|---|---|---|
| DBM-01 | MySQL-isms 호환성 감사 | A | 🔴 P0 | db-migration-architect | **opus** | ✅ DONE |
| DBM-02 | Cloud SQL 사이징 + 도구 + 컷오버 전략 결정 | A | 🔴 P0 | db-migration-architect | **opus** | ✅ DONE |
| DBM-03 | ADR 006/007/008 작성 | A | 🔴 P0 | db-migration-architect | **opus** | ✅ DONE |
| DBM-04 | 의존성 + DATABASE_URL 추상화 | B | 🔴 P0 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-05 | `migration_sqls` ANSI 호환화 + 트랜잭션 항목별 분리 | B | 🔴 P0 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-05b | `routers/demo.py` raw SQL 백틱 제거 | B | 🟠 P1 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-05c | `routers/stats.py` MySQL 날짜 함수 PG 호환화 | B | 🔴 P0 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-06 | Alembic env.py + workers/db.py 양 DB 지원 | B | 🔴 P0 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-07 | docker-compose 에 postgres 서비스 추가 | B | 🟠 P1 | postgres-specialist | **sonnet** | ✅ DONE |
| DBM-08 | PG 빈 인스턴스 schema 생성 + 비교 | C | 🔴 P0 | postgres-specialist | **opus** | ✅ DONE (2026-05-18, Cloud SQL `postgre-sql`) |
| DBM-08b | PG 환경 통합 부팅 + `/api/readyz` 200 | C | 🟠 P1 | postgres-specialist | **sonnet** | TODO (DBM-09 후 실행 예정) |
| DBM-09 | 데이터 이전 (pgloader → pg_data_migrator) + 스테이징 1회 | D | 🔴 P0 | data-migration-engineer | **opus** | ✅ DONE (2026-05-19, 28테이블/466행/3초) |
| DBM-10 | 데이터 정합성 검증 (migration_check.py 7항목) | D | 🔴 P0 | data-migration-engineer | **opus** | ✅ DONE (2026-05-19, 7/7 PASS) |
| DBM-11 | Cloud SQL 인스턴스 + Auth Proxy + deployment.md | E | 🔴 P0 | (operator) + postgres-specialist | **sonnet** | TODO |
| DBM-12 | 컷오버 룬북 + 실행 | F | 🔴 P0 | db-migration-architect → data-migration-engineer | **opus → sonnet** | TODO |
| DBM-13 | MySQL 의존 정리 + 최적화 | G | 🟡 P2 | postgres-specialist | **sonnet** | TODO |
| OPS-04 | 운영 VM 디스크 관리 (cleanup + 모니터링) | - | 🔴 P0 | (operator) | **sonnet** | TODO (2026-05-18 disk-full 사태로 발견) |

> **우선순위 표기**: 🔴 P0 (사이클 필수) / 🟠 P1 (바람직) / 🟡 P2 (사이클 후반)

### 모델 선택 규칙

| 모델 | 용도 |
|---|---|
| **opus** | 호환성 감사 / 도구 결정 / 컷오버 전략 / ADR / 룬북 작성 (DBM-01~03, 12 의 설계 부분) |
| **sonnet** | driver 교체 / SQL 호환화 / Alembic 설정 / pgloader 실행 / 검증 (DBM-04~13 의 구현 부분) |

---

## 운영자 미완료 항목 (코드 외 작업)

기존 OPR + 이번 사이클 추가:

| ID | 항목 | 비고 |
|---|---|---|
| OPR-01 | `ENCRYPTION_KEY` | (이전 사이클 carry) |
| OPR-02 | `VITE_LINE_LIFF_ID` | (이전 사이클 carry) |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` | (이전 사이클 carry) |
| OPR-04 | `VISION_API_KEY` (선택) | (이전 사이클 carry) |
| OPR-05 | `REDIS_URL` 운영 | (이전 사이클 carry) |
| OPR-06 | PayPay 콘솔 webhook URL | (이전 사이클 carry) |
| OPR-07 | Alembic baseline stamp | (이전 사이클 carry) |
| OPR-08 | `PAYPAY_WEBHOOK_SECRET` | (이전 사이클 carry) |
| **OPR-09** | **GCP Cloud SQL PostgreSQL 인스턴스 생성** (DBM-11) | 사양 결정 후 콘솔에서 생성 |
| **OPR-10** | **Cloud SQL Auth Proxy 설치** (GCP VM) | DBM-11, systemd 서비스 |
| **OPR-11** | **컷오버 점검 윈도우 공지** (DBM-12) | 매장에 사전 공지, 30~60분 |
| **OPR-12** | **`DATABASE_URL` 운영 .env 교체** (컷오버 시) | DBM-12 룬북에 따름 |

---

# 카드 정의

> 각 카드 끝에는 **사용자 지시 프롬프트** 가 박혀있다. 그대로 복사해서 Claude 에 붙여넣으면 해당 단계를 실행한다.

---

## 🟦 DBM-01 — MySQL-isms 호환성 감사

**Owner**: db-migration-architect (opus)
**Priority**: 🔴 P0
**Depends on**: 없음 (이 카드가 모든 후속의 입력)
**Blocks**: DBM-02 ~ DBM-13

### 배경

`backend/database.py:migration_sqls` 와 라우터/유틸 코드 안에 MySQL-only 구문이 흩어져 있다.
PG 이전 전에 **무엇이 어디서 깨질 수 있는지** 인벤토리.

### 허용 파일

- `tasks/db-migration-audit.md` (신규)

> **금지**: 코드 수정 0건. 이 카드는 순수 조사 / 문서 산출.

### 산출물 목차 (audit.md)

```markdown
# DB Migration Audit Report

## 1. 코드베이스 MySQL-isms 인벤토리

### 1.1 `database.py:migration_sqls`
- backtick 식별자 사용처: <라인 번호 + SQL 인용>
- `IF NOT EXISTS` 호환성: <라인 번호>
- 데이터 타입: TINYINT(1), JSON, TEXT, DATETIME 등의 위치
- MySQL-only 구문 (CHARSET, COLLATE, ENGINE 등)

### 1.2 라우터 / 헬퍼의 raw SQL
- `session.execute(text("..."))` 사용처 grep 결과
- ORM 우회 부분 (subquery, GROUP_CONCAT 등 MySQL 함수)

### 1.3 모델 (`models.py`)
- 예약어 테이블/컬럼 (PG: `order`, `user` 등)
- `JSON` 컬럼 사용처 → jsonb 후보
- ENUM 사용처 (SQLAlchemy Enum vs PG ENUM)
- AUTOINCREMENT (모두 SQLModel 기본 처리 — 검증)

## 2. 데이터 타입 매핑 결정 표

| MySQL | PG (1차) | PG (2차, 별도 카드) |
|---|---|---|
| `INT` | `INTEGER` | — |
| `BIGINT` | `BIGINT` | — |
| `VARCHAR(N)` | `VARCHAR(N)` | — |
| `TEXT` | `TEXT` | — |
| `JSON` | `JSON` | `jsonb` (검색 / 인덱스 시) |
| `DATETIME` | `TIMESTAMP WITHOUT TIME ZONE` | `TIMESTAMPTZ` (TZ 도입 시) |
| `TINYINT(1)` | `BOOLEAN` | — |
| `DECIMAL(p,s)` | `NUMERIC(p,s)` | — |

## 3. `migration_sqls` 호환화 액션 리스트

| 라인 | 현재 SQL | PG 호환 후 |
|---|---|---|
| ... | "ALTER TABLE \`order\` ADD ..." | 'ALTER TABLE "order" ADD ...' |

## 4. 라우터의 raw SQL 위험도 분류

| 위치 | SQL 발췌 | 위험도 | 조치 |
|---|---|---|---|
| ... | "GROUP_CONCAT(...)" | 🔴 PG 미지원 → string_agg | DBM-04~06 별도 카드 |

## 5. 결론
- 호환화 가능 / 불가능 항목
- 추가로 작성해야 할 카드 제안 (있으면)
```

### 수용 기준

- [ ] `database.py:migration_sqls` 의 모든 항목이 표에 들어감
- [ ] `Grep "session\.execute\(text\(" backend/` 결과의 모든 사이트가 표에 들어감
- [ ] 데이터 타입 매핑 표 완성 (1차 / 2차 분리)
- [ ] PG 예약어와 충돌하는 식별자 명시 (`order` 테이블 등)
- [ ] **각 항목마다 호환화 가능 여부 + 책임 카드 ID 명시**

### 검증

- 본 보고서가 DBM-04, DBM-05, DBM-06 카드의 입력으로 충분한가? `postgres-specialist` 가 이 보고서만 보고 작업 가능해야 함.

### 사용자 지시 프롬프트

```
DBM-01 을 db-migration-architect 에이전트(opus)로 진행해줘.
backend/database.py 의 migration_sqls 와 라우터의 raw SQL 을 grep 으로 인벤토리하고,
tasks/db-migration-audit.md 에 호환성 보고서를 작성해줘.

코드는 절대 수정하지 마. 이 단계는 순수 조사·문서.
완료 후 DBM-04~06 sonnet 작업이 가능한지 자기 검증해줘.
```

---

## 🟦 DBM-02 — Cloud SQL 사이징 + 도구 + 컷오버 전략 결정

**Owner**: db-migration-architect (opus)
**Priority**: 🔴 P0
**Depends on**: DBM-01

### 배경

세 가지 결정을 하나의 카드에 모은다 — 이 결정들은 서로 영향을 준다 (사이즈 작으면 듀얼라이트 무리, 도구가 DMS 면 사이즈 권장값 다름 등).

### 결정 항목 (architect 가 답해야 함)

1. **Cloud SQL 인스턴스 사양**
   - vCPU / 메모리 / 디스크 (SSD GB)
   - HA 여부 (zonal vs regional)
   - 리전 (`asia-northeast1` 권장, GCP VM 과 동일)
   - PostgreSQL 버전 (16 권장)
   - 백업 / PITR 활성화 여부

2. **네트워크**
   - Public IP + Cloud SQL Auth Proxy (권장 — 기존 단일 VM 운영과 매치)
   - Private IP + VPC peering (대안, 비용 / 설정 부담)

3. **데이터 마이그레이션 도구**
   - pgloader vs Google Database Migration Service vs 자체 mysqldump+psql 변환
   - 트레이드오프 표

4. **컷오버 전략**
   - big-bang (점검 30~60분, 가장 단순) ← 권장
   - 듀얼라이트 (코드 양쪽 동시 쓰기, 본 사이클 범위 외)
   - read replica + 컷오버 (Cloud SQL DMS 사용 시 가능)

5. **다운타임 윈도우**
   - 운영자와 협의해서 결정

### 허용 파일

- `tasks/db-migration-audit.md` (DBM-01 의 결과물에 §6 결정 사항 추가)
- `docs/deployment.md` (§Cloud SQL 섹션 추가 안)

### 산출물

audit.md §6 에 결정 표:

```markdown
## 6. 마이그레이션 결정 사항

### 6.1 Cloud SQL 사양
- 인스턴스 타입: db-custom-2-7680 (2 vCPU, 7.5 GB)
- 디스크: 50 GB SSD (자동 증가)
- HA: zonal (단일 인스턴스 운영 매치)
- 리전: asia-northeast1
- PG 버전: 16
- 백업: 매일 02:00 KST, 7일 보관, PITR 활성화

### 6.2 네트워크
- 선택: Cloud SQL Auth Proxy (Public IP)
- 이유: ...

### 6.3 마이그레이션 도구
- 선택: pgloader (스테이징), 운영 컷오버 시에도 pgloader
- 이유: ...
- 도구별 트레이드오프 표: ...

### 6.4 컷오버 전략
- 선택: big-bang
- 다운타임 윈도우: 30~60분
- 사전 공지: 매장에 24시간 전
- 시간대: 점심 / 저녁 영업 외 (예: 오전 4~6시)

### 6.5 롤백 윈도우
- 컷오버 후 24시간 내 롤백 가능 — MySQL 보존 + 신규 행 역복사 스크립트
```

### 수용 기준

- [ ] 5개 항목 모두 결정 + 이유 명시
- [ ] 각 결정에 **롤백 비용** 한 줄
- [ ] DBM-03 (ADR 작성) 의 입력으로 충분

### 사용자 지시 프롬프트

```
DBM-02 를 db-migration-architect 에이전트(opus)로 진행해줘.

DBM-01 의 감사 보고서를 입력으로,
- Cloud SQL 사양 (vCPU/메모리/디스크/HA/리전/PG 버전/백업)
- 네트워크 (Public IP+Auth Proxy vs Private IP)
- 마이그레이션 도구 (pgloader vs Google DMS vs 자체 스크립트)
- 컷오버 전략 (big-bang vs 듀얼라이트 vs read replica)
- 다운타임 윈도우

다섯 가지를 결정해서 db-migration-audit.md §6 에 정리해줘.
각 결정에 트레이드오프 표 + 롤백 비용을 명시해줘.

운영자 협의 필요한 부분은 명시하고 묻지 말고 권장값으로 채워줘 (운영자가 검토해서 변경하면 됨).
```

---

## 🟦 DBM-03 — ADR 006/007/008 작성

**Owner**: db-migration-architect (opus)
**Priority**: 🔴 P0
**Depends on**: DBM-02

### 허용 파일

- `docs/adr/006-postgresql-migration.md` (신규)
- `docs/adr/007-pgloader-choice.md` (신규)
- `docs/adr/008-cutover-strategy.md` (신규)
- `docs/adr/README.md` (색인 갱신)

### 형식

기존 ADR (`001-redis-choice.md` 등) 스타일 — **결정 / 이유 / 대안 / 결론** 4 섹션. 30~80줄.

### 수용 기준

- [ ] 3개 ADR 신규 + 색인 갱신
- [ ] ADR-003 (인라인 마이그레이션 공존) 에 **superseded 예정** 메모 추가 (PG 컷오버 후 단일화)

### 사용자 지시 프롬프트

```
DBM-03 을 db-migration-architect 에이전트(opus)로 진행해줘.
DBM-02 의 결정을 ADR 3개로 정리:
- docs/adr/006-postgresql-migration.md (왜 PG 로 가는가, MySQL 한계)
- docs/adr/007-pgloader-choice.md (pgloader 선택)
- docs/adr/008-cutover-strategy.md (big-bang 선택)
docs/adr/README.md 색인도 갱신하고, ADR-003 에 "PG 컷오버 후 단일화 예정" 메모 추가해줘.
```

---

## 🟦 DBM-04 — 의존성 + DATABASE_URL 추상화

**Owner**: postgres-specialist (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-01

### 배경

`asyncpg` (async 드라이버) + `psycopg2-binary` (sync — Alembic / 워커용) 추가.
`DATABASE_URL` 의 prefix 만으로 driver 분기.

### 허용 파일

- `pyproject.toml` (deps 2개 추가)
- `backend/.env.example` (PG URL 주석 추가)
- `backend/utils/db.py` (신규 — `_to_sync_url()` 헬퍼)

> **금지**: `database.py` 수정 (DBM-05), `alembic/env.py` 수정 (DBM-06), 모델 수정.

### 구현

```python
# backend/utils/db.py
def to_sync_url(url: str) -> str:
    """async DATABASE_URL 을 sync 드라이버로 치환 (Alembic / Worker 용)."""
    if url.startswith("mysql+aiomysql://"):
        return url.replace("mysql+aiomysql://", "mysql+pymysql://", 1)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    return url
```

`.env.example` 에 두 옵션 모두:
```
# DATABASE_URL=mysql+aiomysql://kios_user:***@localhost:3306/kiospad
DATABASE_URL=postgresql+asyncpg://qraku:***@localhost:5432/qraku
```

### 수용 기준

- [ ] `uv sync` 후 `asyncpg`, `psycopg2-binary` 설치
- [ ] `to_sync_url()` 단위 검증 (네 가지 URL 케이스)
- [ ] 기존 MySQL 부팅 정상 (회귀 없음)

### 사용자 지시 프롬프트

```
DBM-04 를 postgres-specialist 에이전트(sonnet)로 진행해줘.
허용 파일은 pyproject.toml, backend/.env.example, backend/utils/db.py (신규) 만.
asyncpg 와 psycopg2-binary 의존성 추가 + to_sync_url() 헬퍼 작성해줘.
backend/database.py / alembic/env.py / 모델은 절대 건드리지 마 (다음 카드).
완료 후 기존 MySQL 부팅 회귀 없는지 검증해줘.
```

---

## 🟦 DBM-05 — `migration_sqls` ANSI 호환화

**Owner**: postgres-specialist (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-01, DBM-04

### 배경

DBM-01 의 §3 호환화 액션 리스트를 따라 `migration_sqls` 의 모든 항목을 ANSI 호환으로 변환.
**MySQL 에서도 그대로 동작해야 한다** (회귀 0).

### 허용 파일

- `backend/database.py` — `migration_sqls` 리스트만

### 변환 규칙 (audit §6 참조)

1. 백틱(`` ` ``) 식별자 → ANSI 큰따옴표 (`` `order` `` → `"order"`, `` `table` `` → `"table"`) — **약 23건**
2. 라인 45 `JSON DEFAULT ('[]')` → `TEXT DEFAULT '[]'` (코드는 str 로 다룸)
3. 라인 186 `ADD UNIQUE INDEX uq_order_square_payment_id (col)` → `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order"(col)`
4. 모든 `ADD COLUMN` 에 `IF NOT EXISTS` 추가 (트랜잭션 abort 방지)
5. 에러 메시지 분기에 PG SQLSTATE 추가: `"42701"`, `"42P07"` 도 무시 대상에 포함

### ⚠️ 핵심 추가 작업: 트랜잭션 항목별 분리 (audit §6.3)

현재 `database.py:202~212` 는 단일 `async with engine.begin()` 안에서 모든 SQL 실행 → PG 는 한 건 실패 시 트랜잭션 전체 abort, 이후 모두 실패. **항목별 트랜잭션** 으로 변경:

```python
for sql in migration_sqls:
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql))
    except Exception as e:
        if any(s in str(e) for s in ("Duplicate column name", "already exists", "1060", "42701", "42P07", "Duplicate key name")):
            pass
        else:
            print(f"⚠️ Migration skipped ({sql[:40]}...): {e}")
```

본 변경은 MySQL 운영에도 안전 (각 항목 멱등).

### 수용 기준

- [ ] audit §1 의 모든 항목 처리 (백틱, JSON, UNIQUE INDEX)
- [ ] 항목별 트랜잭션 분리
- [ ] 에러 메시지 분기에 PG SQLSTATE 포함
- [ ] **MySQL 부팅 회귀 0** — 기존 멱등성 보장
- [ ] `Grep ` ` ` 으로 backtick 0건 (database.py 내)
- [ ] PG 빈 인스턴스 부팅 시도 (DBM-08 에서 검증)

### 사용자 지시 프롬프트

```
DBM-05 를 postgres-specialist 에이전트(sonnet)로 진행해줘.
허용 파일은 backend/database.py 의 migration_sqls 리스트만.
DBM-01 의 db-migration-audit.md §3 호환화 액션 리스트를 입력으로 사용해줘.

규칙:
1. backtick → 큰따옴표
2. IF NOT EXISTS 유지
3. CHARSET/COLLATE/ENGINE 절 제거
4. MySQL-only 데이터 타입 (TINYINT(1) 등) → ANSI

기존 MySQL 부팅이 회귀 없이 동작해야 함 (멱등성).
완료 후 grep 으로 backtick 0건 확인해줘.
```

---

## 🟦 DBM-05b — `routers/demo.py` raw SQL 백틱 제거

**Owner**: postgres-specialist (sonnet)
**Priority**: 🟠 P1
**Depends on**: DBM-01

### 배경

`demo.py` 의 `cleanup_expired_temp_stores` 함수에 `_text(f"DELETE FROM \`order\` ...")` 류 raw SQL 이 8건. PG 에서 즉시 실패. audit §2.1 참조.

### 허용 파일

- `backend/routers/demo.py` (8 라인 변경)

### 작업

라인 224, 230, 231, 234, 237, 240, 243, 246, 249 의 `` `order` `` / `` `table` `` 백틱을 ANSI 큰따옴표로 변경:

```python
# 변경 전
_text(f"SELECT id FROM `order` WHERE shop_id IN ({placeholders})")
_text(f"DELETE FROM `order` WHERE id IN ({id_list})")
_text(f"DELETE FROM `table` WHERE store_id = {sid}")

# 변경 후
_text(f'SELECT id FROM "order" WHERE shop_id IN ({placeholders})')
_text(f'DELETE FROM "order" WHERE id IN ({id_list})')
_text(f'DELETE FROM "table" WHERE store_id = {sid}')
```

> 단순 식별자 인용 변경. SQL injection 보강 / ORM 전환은 별도 backlog.

### 수용 기준

- [ ] 백틱 0건 (`grep` 으로 검증)
- [ ] MySQL 환경에서 demo cleanup 회귀 없음 (ANSI 큰따옴표는 MySQL `sql_mode=ANSI_QUOTES` 가 아니어도 식별자로 인식됨 — 실제로는 MySQL 도 큰따옴표 식별자 지원 모드 있으나 안전 확인 필요)
- [ ] PG 환경에서 demo cleanup 정상 동작

### 사용자 지시 프롬프트

```
DBM-05b 를 postgres-specialist 에이전트(sonnet)로 진행해줘.
허용 파일은 backend/routers/demo.py 만.
audit §2.1 의 8건 백틱을 ANSI 큰따옴표로 변경.
주의: MySQL 의 sql_mode 가 ANSI_QUOTES 가 아니면 큰따옴표 식별자가 실패할 수 있음 — 검증 필요.
대안: `f'SELECT id FROM \\"order\\" WHERE ...'` 가 양쪽 모두 안 되면 별도 분기 또는 ORM 으로 재작성 (이 경우 사용자에게 보고).
```

---

## 🟦 DBM-05c — `routers/stats.py` MySQL 날짜 함수 PG 호환화

**Owner**: postgres-specialist (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-01

### 배경

`stats.py` 가 `func.hour() / year() / month() / dayofweek() / date()` 사용 — MySQL 전용. PG 에서는 syntax error 또는 함수 없음. analytics 기능 전체가 PG 에서 깨짐. audit §2.3 참조.

### 허용 파일

- `backend/utils/db_compat.py` (신규)
- `backend/routers/stats.py` (수정)
- `backend/routers/register.py` (수정)
- `backend/routers/super_admin.py` (수정)

> **확장 이유 (audit §12.5 권고)**: `func.date(Order.created_at)` 가 `stats.py` 외에도 `register.py` 2건 + `super_admin.py` 6건 추가 사용 → 동일 헬퍼 `date_only()` 로 일괄 교체해야 PG 컷오버 후 정산/슈퍼어드민 페이지 일관성 확보. audit §2.4, §2.5 참조.

### 작업

#### 1. `utils/db_compat.py` 신규 — ANSI 호환 헬퍼

```python
"""양 DB 호환 SQLAlchemy 함수 래퍼.

MySQL 전용 func.hour / year / month / dayofweek / date 를 ANSI EXTRACT 로 통일.
MySQL 8 / PG 13+ 모두 EXTRACT(... FROM ...) 지원.
"""
from sqlalchemy import func, cast, Date


def hour(col):
    """MySQL HOUR(x) / PG EXTRACT(HOUR FROM x) — 0~23"""
    return func.extract('hour', col)


def year(col):
    return func.extract('year', col)


def month(col):
    return func.extract('month', col)


def day_of_week(col):
    """⚠️ Semantics 통일: MySQL DAYOFWEEK 는 1=Sun..7=Sat, PG EXTRACT(DOW) 는 0=Sun..6=Sat.
    본 헬퍼는 **MySQL 의미** (1=Sun..7=Sat) 로 통일 — 기존 클라이언트 호환 보존."""
    return func.extract('dow', col) + 1


def date_only(col):
    """MySQL DATE(x) / PG x::date"""
    return cast(col, Date)
```

#### 2. 22건+ 교체 (stats.py 14건, register.py 2건, super_admin.py 6건)

> 참고: audit §2.3 의 함수 호출 라인 18건 중 동일 라인 중복 호출(group_by/order_by 양쪽) 4건을 합쳐 stats.py 본문상 **교체 대상은 14건**. register / super_admin 까지 합치면 **총 22건+**.

| 파일 | 기존 | 변경 | 라인 (audit §2.3~§2.5) |
|---|---|---|---|
| `stats.py` | `func.date(Order.created_at)` | `date_only(Order.created_at)` | 71, 78, 80, 107, 267 |
| `stats.py` | `func.hour(Order.created_at)` | `hour(Order.created_at)` | 103, 109, 111, 263, 268 |
| `stats.py` | `func.year(...)` | `year(...)` | 292, 300 |
| `stats.py` | `func.month(...)` | `month(...)` | 293, 300, 302 |
| `stats.py` | `func.dayofweek(...)` | `day_of_week(...)` | 325, 332, 334 |
| `register.py` | `func.date(Order.created_at)` | `date_only(Order.created_at)` | 421, 484 |
| `super_admin.py` | `func.date(Order.created_at)` | `date_only(Order.created_at)` | 147, 153 (×2), 395, 399, 400 |

import 추가 (세 파일 모두):
```python
# stats.py 는 5종 헬퍼 모두 사용
from utils.db_compat import hour, year, month, day_of_week, date_only

# register.py / super_admin.py 는 date_only 만 사용
from utils.db_compat import date_only
```

### 수용 기준

- [ ] `utils/db_compat.py` 신규 (5 함수)
- [ ] `stats.py` 14건 + `register.py` 2건 + `super_admin.py` 6건 모두 헬퍼로 교체
- [ ] 다음 grep 결과 0건 (세 파일 합쳐):
  ```bash
  grep -nE "func\.hour\(|func\.year\(|func\.month\(|func\.dayofweek\(|func\.date\(" \
       backend/routers/stats.py \
       backend/routers/register.py \
       backend/routers/super_admin.py
  ```
- [ ] MySQL 환경에서 stats / register 정산 / super_admin 일별 통계 응답 회귀 없음 (값 / 형식 동일)
- [ ] PG 환경에서 동일 응답 정상 (DBM-08 후 검증 가능)

### 사용자 지시 프롬프트

```
DBM-05c 를 postgres-specialist 에이전트(sonnet)로 진행해줘.
허용 파일은 다음 4개:
- backend/utils/db_compat.py (신규)
- backend/routers/stats.py
- backend/routers/register.py
- backend/routers/super_admin.py

audit §2.3 (stats.py 14건) + §2.4 (register.py 2건) + §2.5 (super_admin.py 6건)
총 22건+ 모두 db_compat 헬퍼로 교체.

특히 dayofweek 의 MySQL vs PG semantics 차이 (1=Sun vs 0=Sun) 가 핵심 —
헬퍼에서 PG 측 +1 보정하여 MySQL 의미로 통일 (기존 클라이언트 호환 보존).

MySQL 환경에서 stats / register 정산 / super_admin 일별 통계 회귀 없는지 검증.
완료 후 다음 grep 으로 세 파일 합쳐 0건 확인:
  grep -nE "func\.hour\(|func\.year\(|func\.month\(|func\.dayofweek\(|func\.date\(" \
       backend/routers/stats.py backend/routers/register.py backend/routers/super_admin.py
```

---

## 🟦 DBM-06 — Alembic env.py + workers/db.py 양 DB 지원

**Owner**: postgres-specialist (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-04

### 허용 파일

- `alembic/env.py`
- `backend/workers/db.py`

### 구현

`alembic/env.py`:
```python
from backend.utils.db import to_sync_url
url = to_sync_url(os.environ["DATABASE_URL"])
```

`backend/workers/db.py`:
```python
from backend.utils.db import to_sync_url
_url = to_sync_url(os.environ["DATABASE_URL"])
engine = create_engine(_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
```

> 두 파일 모두 기존 인라인 치환 로직을 `to_sync_url()` 호출로 교체.

### 수용 기준

- [ ] MySQL 환경에서 `uv run alembic upgrade head` 회귀 없음
- [ ] PG 환경 (DBM-07 의 docker-compose 사용) 에서 `uv run alembic stamp head` 성공
- [ ] MySQL / PG 두 환경 모두 dramatiq 워커 부팅 성공

### 사용자 지시 프롬프트

```
DBM-06 을 postgres-specialist 에이전트(sonnet)로 진행해줘.
허용 파일은 alembic/env.py 와 backend/workers/db.py 만.
DBM-04 의 to_sync_url() 헬퍼를 두 파일 모두에서 사용하도록 변경해줘.
기존 MySQL 부팅 회귀 없는지 확인해줘.
```

---

## 🟦 DBM-07 — docker-compose 에 postgres 서비스 추가

**Owner**: postgres-specialist (sonnet)
**Priority**: 🟠 P1
**Depends on**: 없음

### 배경

로컬에서 PG 호환 검증할 수 있도록 docker-compose 에 `postgres` 서비스를 **추가** (기존 `mysql` 서비스는 유지). 두 DB 가 동시에 떠있어도 OK.

### 허용 파일

- `docker-compose.yml`

### 구현

```yaml
postgres:
  image: postgres:16
  environment:
    POSTGRES_USER: qraku
    POSTGRES_PASSWORD: qraku
    POSTGRES_DB: qraku
  ports: ["5433:5432"]
  volumes: ["pg_data:/var/lib/postgresql/data"]
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U qraku"]
    interval: 5s
    retries: 10

# volumes 섹션에 pg_data: 추가
```

> backend1/2 는 그대로 mysql 사용. PG 검증은 별도 환경변수로 부팅.

### 수용 기준

- [ ] `docker compose up -d postgres` → healthy
- [ ] `psql postgres://qraku:qraku@localhost:5433/qraku -c "select 1"` 성공

### 사용자 지시 프롬프트

```
DBM-07 을 postgres-specialist 에이전트(sonnet)로 진행해줘.
docker-compose.yml 에 postgres:16 서비스 추가.
host port 5433, db/user/password 모두 qraku.
기존 mysql 서비스는 그대로 유지.
```

---

## 🟦 DBM-08 — PG 빈 인스턴스 schema 생성 + 비교

**Owner**: postgres-specialist (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-05, DBM-06, DBM-07

### 배경

코드 호환화가 끝났는지 **빈 PG 에 schema 를 직접 만들어** 검증. MySQL 운영 schema 와 비교해서 차이를 정리.

### 허용 파일

- `tasks/db-migration-audit.md` (§7 검증 결과 추가)

> 코드 변경 없음.

### 절차

```bash
# 1. PG 빈 DB 부팅 검증
docker compose up -d postgres
DATABASE_URL=postgresql+asyncpg://qraku:qraku@localhost:5433/qraku \
  uv run uvicorn backend.main:app --port 8004
# → init_db 가 metadata.create_all 후 migration_sqls 실행 → 부팅 성공해야 함

# 2. /api/readyz 200 확인

# 3. PG schema dump
pg_dump --schema-only postgres://qraku:qraku@localhost:5433/qraku > pg_schema.sql

# 4. MySQL 운영 schema dump
ssh -i qraku verejireh@35.213.6.149 \
  "mysqldump --no-data --no-tablespaces -u kios_user -p'***' kiospad" > mysql_schema.sql

# 5. 두 schema 비교 (테이블별 컬럼 / 인덱스 / 제약)
```

### 수용 기준

- [x] PG 빈 인스턴스에서 부팅 성공 (`init_pg_schema.py` → init_db 정상)
- [ ] `/api/readyz` 200 — **별도 카드 DBM-08b 로 분리** (Redis/Dramatiq 통합 부팅 필요)
- [x] `migration_sqls` 의 모든 ALTER 가 PG 에 적용됨 (재실행 멱등) — `IF NOT EXISTS` 가드 + 빈 DB 실행 시 ✅
- [x] schema 차이 표 audit.md §8.4 에 작성 (2026-05-18, 1차 — MySQL dump 도착 후 DBM-09 직전 추가 비교 예정)

### 완료 (2026-05-18)

- Cloud SQL `hotel-management-484115:asia-northeast1:postgre-sql` (PG 16.13) 에 schema 30 테이블 생성 성공
- 핵심 컬럼 spot check 10/10 [OK]
- 상세: `tasks/work-log.md` DBM-08 엔트리, `tasks/db-migration-audit.md` §8.4

### 사용자 지시 프롬프트

```
DBM-08 을 postgres-specialist 에이전트(sonnet)로 진행해줘.
docker-compose 의 postgres 서비스를 띄우고 PG 환경에서 backend 부팅 + /api/readyz 검증.
mysql 운영 schema 와 PG 신규 schema 를 mysqldump / pg_dump 로 받아서 비교해줘.
차이는 tasks/db-migration-audit.md §7 에 표로 정리.

차이가 있으면 - migration_sqls 보강 필요한지 / models.py 보강 필요한지 분류해줘.
보강이 필요하면 별도 카드 (DBM-08-fix) 제안.
```

---

## 🟦 DBM-08b — PG 환경 통합 부팅 + `/api/readyz` 200

**Owner**: postgres-specialist (sonnet)
**Priority**: 🟠 P1
**Depends on**: DBM-08, DBM-09 (운영 데이터 옮긴 후 통합 검증이 의미있음)
**예상 실행 시점**: DBM-09 직후 (운영 dump 도착 + pgloader 실행 후)

### 배경

DBM-08 은 schema 만 검증 (init_db 단독 호출). 실제 운영 부팅 시 backend 는 Redis + Dramatiq 도 필요. PG 환경에서 **uvicorn 전체 부팅** 후 `/api/readyz` 200 응답 확인.

### 허용 파일

- `tasks/db-migration-audit.md` (§8.5 또는 §10 신설 — 통합 부팅 결과 추가)
- `docs/deployment.md` (PG 환경 부팅 절차 보강)

> 코드 변경 없음. 환경 검증만.

### 절차

```bash
# 1. Redis + PG 동시 기동 (docker-compose 또는 staging)
docker compose up -d redis postgres

# 2. backend 부팅 (PG URL + Redis URL)
DATABASE_URL='postgresql+asyncpg://qraku:***@127.0.0.1:5432/qraku' \
  REDIS_URL='redis://localhost:6379/0' \
  uv run uvicorn backend.main:app --port 8004

# 3. /api/healthz 와 /api/readyz 응답 확인
curl -i http://localhost:8004/api/healthz   # 즉시 200
curl -i http://localhost:8004/api/readyz    # DB/Redis 연결 후 200

# 4. 주요 API 한 두 개 smoke test
curl http://localhost:8004/api/stores/demo
```

### 수용 기준

- [ ] PG + Redis 환경에서 uvicorn 부팅 성공 (예외 없음, init_db 통과)
- [ ] `GET /api/healthz` → 200
- [ ] `GET /api/readyz` → 200 (DB + Redis ping 통과)
- [ ] Dramatiq worker 1개 부팅 시도 → PG 에 연결 정상 (errors 없음)
- [ ] 결과 기록: `tasks/db-migration-audit.md` 의 통합 검증 섹션

### 사용자 지시 프롬프트

```
DBM-08b 를 postgres-specialist 에이전트(sonnet)로 진행해줘.
DBM-09 가 완료되어 PG 에 운영 데이터가 옮겨진 상태라고 가정.
backend + Redis + Dramatiq worker 통합 부팅 후 /api/healthz, /api/readyz, 주요 GET API 1-2개 smoke test 결과를 audit.md 에 기록해줘.
실패 시 원인 분류 — schema/연결/코드 셋 중 하나로.
```

---

## 🟦 DBM-09 — pgloader config + 스테이징 1회 실행

**Owner**: data-migration-engineer (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-08

### 배경

운영 MySQL dump 를 받아 로컬 / 스테이징 PG 로 **1회 마이그레이션**. 운영 컷오버 전 리허설.

### 허용 파일

- `tools/pgloader/qraku.load` (신규)
- `tasks/db-migration-audit.md` (§8 마이그레이션 결과 추가)

### 절차

1. 운영 MySQL 의 read-only dump (운영자 협의)
2. 로컬 staging MySQL 에 복원
3. pgloader 실행:
   ```bash
   pgloader tools/pgloader/qraku.load
   ```
4. 정합성 검증 쿼리 (DBM-10 와 연동)
5. 결과 audit.md §8 에 기록 (실행 시간, 실패 항목, 보정 수동 작업)

### 수용 기준

- [ ] pgloader config 작성
- [ ] 스테이징 1회 실행 성공
- [ ] 행 수 / MAX(id) 양 DB 일치
- [ ] PG 시퀀스 보정 (sequence value ≥ max(id)+1)
- [ ] 결과 audit.md 에 보고

### 사용자 지시 프롬프트

```
DBM-09 를 data-migration-engineer 에이전트(sonnet)로 진행해줘.
허용 파일은 tools/pgloader/qraku.load (신규) 와 tasks/db-migration-audit.md.

운영 MySQL dump 는 운영자(나) 가 제공할게 — 받기 전 단계로,
1. ADR-007 와 audit.md §2 (데이터 타입 매핑) 기반 pgloader.load config 작성
2. 로컬 mysql 컨테이너에 시드 데이터 (몇 행) 넣고 pgloader 동작 확인

운영 dump 받으면 다시 호출할 테니, 일단 config 와 시드 검증까지만 진행해줘.
```

---

## 🟦 DBM-10 — 데이터 정합성 검증 스크립트

**Owner**: data-migration-engineer (sonnet)
**Priority**: 🔴 P0
**Depends on**: DBM-09

### 허용 파일

- `tools/migration_check.py` (신규)
- `tasks/db-migration-audit.md` (§9 검증 결과)

### 검증 항목

1. **행 수 일치** — 모든 테이블
2. **MAX(id) 일치** — id 컬럼 있는 모든 테이블
3. **시퀀스 next_val** — PG sequence ≥ max(id)+1
4. **FK 정합성** — orphan 행 0
5. **인코딩** — 한국어 / 일본어 sample row 동일
6. **JSON 컬럼** — 파싱 결과 동일
7. **인덱스 / UNIQUE** — `\d+` 결과에 모두 존재

### 수용 기준

- [ ] `python tools/migration_check.py --mysql=... --pg=...` 한 번에 실행
- [ ] 모든 검증 항목 ✅ / ❌ 출력
- [ ] 보고서 audit.md §9

### 사용자 지시 프롬프트

```
DBM-10 을 data-migration-engineer 에이전트(sonnet)로 진행해줘.
tools/migration_check.py 한 파일로 양 DB 정합성 검증.
사용법: python tools/migration_check.py --mysql=URL --pg=URL
출력: 항목별 ✅/❌ + 차이 행 sample.

audit.md §9 에 한 번 실행한 결과 (스테이징) 기록해줘.
```

---

## 🟦 DBM-11 — Cloud SQL 인스턴스 + Auth Proxy + deployment.md

**Owner**: 운영자 (인스턴스 생성) + postgres-specialist (sonnet, 문서)
**Priority**: 🔴 P0
**Depends on**: DBM-02 의 사이징 결정

### 운영자 액션 (OPR-09, OPR-10)

1. **GCP 콘솔에서 Cloud SQL PostgreSQL 인스턴스 생성**
   - 사양: ADR-006 + audit.md §6.1 따름
   - 리전: `asia-northeast1-b` (GCP VM 동일)
   - PG 16
   - 기본 사용자 `qraku`, 비밀번호 발급
   - 백업 / PITR 활성화

2. **GCP VM 에 Cloud SQL Auth Proxy 설치**
   ```bash
   ssh -i qraku verejireh@35.213.6.149
   wget https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.x.x/cloud-sql-proxy.linux.amd64 \
        -O cloud-sql-proxy
   chmod +x cloud-sql-proxy
   sudo mv cloud-sql-proxy /usr/local/bin/

   # systemd 서비스 작성
   sudo tee /etc/systemd/system/cloud-sql-proxy.service ...
   sudo systemctl enable --now cloud-sql-proxy.service
   ```

### 허용 파일 (sonnet 측)

- `docs/deployment.md` (Cloud SQL 섹션 추가 + 트러블슈팅)

### 수용 기준

- [ ] 운영자 콘솔 작업 완료
- [ ] GCP VM 에서 `psql postgres://qraku:***@127.0.0.1:5432/qraku -c "select 1"` 성공 (Auth Proxy 경유)
- [ ] `deployment.md` 에 Cloud SQL 섹션 + Auth Proxy systemd 절차 추가

### 사용자 지시 프롬프트

```
DBM-11 의 문서 작업을 postgres-specialist 에이전트(sonnet)로 진행해줘.
docs/deployment.md 에 다음을 추가:
- Cloud SQL 인스턴스 생성 절차 (콘솔 화면 단계별, 사양은 ADR-006 따름)
- Cloud SQL Auth Proxy 설치 + systemd 서비스 작성
- 트러블슈팅 (연결 실패, IAM 권한 오류 등)
- backend/.env 의 DATABASE_URL 형식

실제 인스턴스 생성은 내가(운영자) 처리할 거야 — 문서만 작성하면 OK.
```

---

## 🟦 DBM-12 — 컷오버 룬북 + 실행

**Owner**: db-migration-architect (opus, 룬북 작성) → data-migration-engineer (sonnet, 실행 보조)
**Priority**: 🔴 P0
**Depends on**: DBM-09, DBM-10, DBM-11

### Phase F-1: 룬북 작성 (opus)

**허용 파일**:
- `tasks/db-migration-runbook.md` (신규)

**룬북 구조**:
```markdown
# Cutover Runbook — MySQL → PostgreSQL (Cloud SQL)

## 사전 준비 (T-24h)
- [ ] 매장 사전 공지 (점검 시간 + 사유)
- [ ] Cloud SQL 인스턴스 헬스 체크
- [ ] Auth Proxy systemd 서비스 active
- [ ] 스테이징 컷오버 1회 리허설 완료

## D-Day (T-30 ~ T+30 분)
| T  | 단계 | 명령 | 담당 | 검증 |
|---|---|---|---|---|
| -30 | 점검 공지 | (콘솔) | OP | 매장 공지 발송 |
| -25 | 주문 차단 | systemctl stop qrorder | OP | curl 503 |
| -20 | MySQL 마지막 dump | mysqldump ... | DME | dump 파일 크기 검증 |
| -15 | pgloader 실행 | pgloader ...load | DME | 종료 코드 0 |
| -10 | 시퀀스 보정 + 정합성 검증 | tools/migration_check.py | DME | 모든 항목 ✅ |
| -5  | DATABASE_URL 교체 | sed -i ... .env | OP | grep 결과 |
| 0   | systemd restart | systemctl restart qrorder | OP | active (running) |
| +5  | smoke test | curl /api/readyz, GET /api/menus/{id} | DME | 모두 200 |
| +10 | 점검 해제 | (콘솔) | OP | 매장 발송 |
| +20 | 24시간 모니터링 시작 | (대시보드) | OP | 에러율 < 0.1% |

## 롤백 (T+5 ~ T+30 분 사이 결정)
- 트리거 조건: smoke test 실패, 에러율 > 5%, 결제 실패율 > 1%
- 절차:
  1. DATABASE_URL 을 mysql+aiomysql://... 로 원복
  2. systemctl restart qrorder
  3. PG 에 들어간 신규 행 (T+0 ~ 롤백 시점) 을 MySQL 로 역복사 — `tools/rollback_resync.py` (사전 준비)
  4. 사후 분석 회의 D+1
```

### Phase F-2: 실행 (sonnet + 운영자)

룬북대로 단계별 진행. data-migration-engineer 가 명령 실행 + 로그 보존.

### 수용 기준

- [ ] 룬북 작성
- [ ] 스테이징 리허설 1회 (룬북 그대로 따라 함)
- [ ] 운영자 컷오버 시간 / 공지 확정
- [ ] 운영 컷오버 실행 — 모든 smoke test ✅
- [ ] T+24h 모니터링 정상

### 사용자 지시 프롬프트 (Phase F-1)

```
DBM-12 의 룬북 작성을 db-migration-architect 에이전트(opus)로 진행해줘.
tasks/db-migration-runbook.md 에 컷오버 룬북 작성 — 시간표(T-30 ~ T+30) 형식.
각 단계는 명령 + 담당 + 검증 기준 명시.
롤백 절차도 포함 (트리거 조건 + 단계 + 사후 작업).

ADR-008, audit.md §6 을 입력으로 사용해줘.
```

### 사용자 지시 프롬프트 (Phase F-2 — 스테이징 리허설)

```
DBM-12 Phase F-2 (스테이징 리허설) 를 data-migration-engineer 에이전트(sonnet)로 진행해줘.
tasks/db-migration-runbook.md 의 단계를 스테이징에서 그대로 따라 실행하고,
각 단계별 결과 / 소요 시간 / 이슈를 audit.md §10 에 기록해줘.
운영 DB 는 절대 만지지 마.
```

### 사용자 지시 프롬프트 (Phase F-2 — 운영 컷오버)

```
운영 컷오버 시점에 직접 실행. data-migration-engineer 에이전트(sonnet)로 진행하되,
각 단계마다 사용자 (운영자) 승인 후 다음 단계 진행.
로그는 backend.log 에 timestamp 와 함께 기록.
실패 시 즉시 룬북 §롤백 진입.
```

---

## 🟦 DBM-13 — MySQL 의존 정리 + 최적화

**Owner**: postgres-specialist (sonnet)
**Priority**: 🟡 P2
**Depends on**: DBM-12 컷오버 후 24~48 시간 안정 운영

### 배경

PG 운영 안정 확인 후 MySQL 흔적 제거.

### 허용 파일

- `pyproject.toml` (`aiomysql`, `pymysql` 제거)
- `backend/utils/db.py` (mysql 분기 삭제)
- `alembic/env.py` (mysql 분기 삭제)
- `backend/workers/db.py` (mysql 분기 삭제)
- `docker-compose.yml` (`mysql` 서비스 제거)
- `docs/architecture.md` (As-Is 갱신)
- `docs/adr/003-inline-migration-coexistence.md` (superseded 표시 + ADR-009 신규?)
- `tasks/current-tasks.md`, `work-log.md`

### 수용 기준

- [ ] `aiomysql`, `pymysql` 의존성 제거
- [ ] `to_sync_url()` 단일 분기
- [ ] docker-compose `mysql` 서비스 제거
- [ ] architecture.md As-Is 갱신
- [ ] (선택) `JSON → jsonb` 마이그레이션 (별도 카드 후보)

### 사용자 지시 프롬프트

```
DBM-13 을 postgres-specialist 에이전트(sonnet)로 진행해줘.
컷오버 후 24~48 시간 안정 운영을 확인한 시점에서만 시작.

MySQL 의존 코드 / 패키지 / docker 서비스 모두 제거.
docs/architecture.md 의 As-Is 를 PG 단일로 갱신.
ADR-003 에 "DBM-13 으로 superseded" 메모 + 필요 시 ADR-009 작성.

JSON → jsonb 마이그레이션은 별도 카드로 두고 본 카드에서는 안 함.
```

---

# 사용자 (당신) 가이드 — 단계별 어떻게 지시하나

> 이 사이클은 **architect 결정 → 구현 → 검증 → 운영 컷오버** 의 4 단계.
> 각 단계마다 모델을 명확히 바꾸면서 진행한다.

## 사이클 시작

1. **모델을 opus 로 전환**:
   ```
   /model claude-opus-4-7
   ```
2. **DBM-01 시작** — 위 카드의 사용자 지시 프롬프트 그대로 복붙.
3. 산출물 (`tasks/db-migration-audit.md`) 확인.

## Phase A 완료까지 (DBM-01~03, opus)

- DBM-01 끝나면 결과 보고서를 직접 한 번 읽고 누락된 케이스 있나 검토.
- 발견하면 "이 케이스가 빠졌어, 추가해줘" 한 번 더 지시.
- DBM-02, DBM-03 차례로 진행.

## Phase B 시작 — 모델 전환

```
/model claude-sonnet-4-6
```

이후 DBM-04 ~ DBM-07 순차 진행. **카드별로 1회씩 sonnet 호출**.
호출 사이마다:
- 변경된 파일 git diff 한 번 보고 OK → commit (또는 sonnet 에 commit 부탁)
- 다음 카드로 넘어감

## Phase C 검증 단계 (DBM-08)

- sonnet 으로 진행. PG 컨테이너 띄우고 부팅 + schema 비교.
- 결과 audit.md §7 읽고 차이가 의미있으면 보강 카드 (DBM-08-fix) 추가 후 다시 sonnet.

## Phase D 데이터 마이그레이션 (DBM-09, DBM-10)

- sonnet 으로 진행. 단, **운영 MySQL dump 는 본인 (운영자) 가 직접 받아서 제공**.
  ```bash
  ssh -i qraku verejireh@35.213.6.149 \
    "mysqldump --single-transaction --no-tablespaces -u kios_user -p'***' kiospad" \
    | gzip > qraku_$(date +%Y%m%d).sql.gz
  ```
  파일을 적절한 위치에 두고 sonnet 에 경로 알려줌.

## Phase E (운영자 본인 수행)

- GCP 콘솔에서 Cloud SQL 인스턴스 생성 (DBM-02 사양 따름).
- VM 에 Auth Proxy 설치 (DBM-11 룬북 따름).
- 문서 갱신은 sonnet.

## Phase F 컷오버 — 가장 신중

1. **룬북 작성** — opus 로 전환 후 DBM-12 Phase F-1.
2. **스테이징 리허설** — sonnet, 룬북 그대로 따라.
3. **운영 컷오버 일정 확정** — 매장 공지, 시간 (예: 새벽 4~6 시).
4. **컷오버 실행** — sonnet 호출 + 본인 (운영자) 가 매 단계 승인. 단계별 로그 보존.
5. **24h 모니터링** — 본인 직접. 에러율 / 결제 / WS 정상 확인.

## Phase G 정리 (DBM-13)

- 컷오버 후 **24~48시간** 안정 확인 후에만 시작. 절대 당일에 안 함.
- sonnet 으로 진행.

## 모델 전환 빈도 정리

| 단계 | 모델 | 카드 |
|---|---|---|
| Phase A | opus | DBM-01, 02, 03 |
| Phase B | sonnet | DBM-04, 05, 06, 07 |
| Phase C | sonnet | DBM-08 |
| Phase D | sonnet | DBM-09, 10 |
| Phase E | sonnet (문서) + 운영자 (인스턴스) | DBM-11 |
| Phase F-1 | opus (룬북) | DBM-12 |
| Phase F-2 | sonnet + 운영자 | DBM-12 |
| Phase G | sonnet | DBM-13 |

## 카드 사이 핸드오프 체크리스트 (당신이 매번 확인)

- [ ] 직전 카드의 산출물 (보고서 / 코드) 한 번 직접 읽기
- [ ] 변경 파일이 카드의 허용 파일 목록과 일치하는지 git diff 로 확인
- [ ] 누락된 결정 / 케이스 있으면 다음 카드 호출 전 보강 지시
- [ ] commit 메시지에 카드 ID 포함 (예: `feat(DBM-04): asyncpg 의존성 + DATABASE_URL 추상화`)
- [ ] `tasks/work-log.md` append 됐는지 확인 (sonnet 이 자동 append 안 했으면 한 줄 지시)

---

## 다음 사이클 후보 (Backlog)

### 마켓플레이스 / 미니홈피 / 발견 전략 (출시 전후 핵심 차별화)

> 핵심 컨셉: `qraku.com/{shop_id}` 를 식당의 공개 미니홈피로 활용 + 위치 기반 발견 + 데이터 가치화.
> 본 사이클(DBM, PG 이전) 후 순차 진행.

#### MKT — 미니홈피 v1 (출시 전 권장, DBM 직후 진행)

**현재 보유**: 메뉴 / 가격 / 설명, 영업시간, 위치 표시, 매장 추가 사진 갤러리 (이미 구현됨).

**v1 범위** (A + 사진 갤러리 + 매장 소개):
- `Store` 모델에 컬럼 추가: `mini_homepage_public` (bool), `intro_text`, `slug` (선택, URL 친화)
- 공개 미니홈피 페이지 — FastAPI Jinja2 SSR 권장 (SEO 위해)
  - 라우트: `/{shop_id}` (또는 `/{slug}`)
  - 메뉴 / 사진 / 가격 / 영업시간 / 위치 (지도 임베드) / 매장 소개
  - 테이크아웃 선결제 prominent CTA (기존 결제 흐름 재사용)
- 식당 admin 에 opt-in 토글 + 미리보기 + 소개 텍스트 입력
- 메타 태그 기본 (title / description / og:image)
- 비공개 매장은 `/{shop_id}` 접근 시 운영 화면 (현 동작) 유지

**v2 (출시 후)**: 후기 / 평점 (업주 opt-in 공개), 외부 SNS 임베드 (Instagram), 배너 이미지 별도 설정.

#### GEO — 지오 발견 (MKT 직후 권장)

- PostGIS extension 활성화 (Cloud SQL 콘솔 또는 `CREATE EXTENSION postgis`)
- `Store.location POINT` 컬럼 + GIST 인덱스
- 식당 admin: 주소 → 좌표 변환 (Google Geocoding API)
- 공개 API: `GET /api/discover/nearby?lat=&lng=&radius=&category=`
- 발견 페이지 `/find` 또는 `/near` — 현재 위치 기반 매장 리스트 + 지도
- 영업중 / 테이크아웃 가능 / 카테고리 필터
- 핵심 쿼리 (예):
  ```sql
  SELECT * FROM store
   WHERE category = :cat AND takeout_enabled
     AND mini_homepage_public
     AND ST_DWithin(location::geography, ST_MakePoint(:lng,:lat)::geography, :m)
   ORDER BY ST_Distance(location, ST_MakePoint(:lng,:lat)) LIMIT 20;
  ```

#### SEO — 발견성 강화 (MKT/GEO 와 한 사이클로 묶어도 OK)

- 미니홈피 메타 태그 풍부화 (OG / Twitter Card / schema.org `Restaurant`)
- `sitemap.xml` 자동 생성 (공개 매장만)
- `robots.txt` + 검색엔진 등록 (Google Search Console / Bing Webmaster)
- 가격 / 영업시간 schema.org 구조화 데이터 → 구글 검색 결과 카드
- 매장 admin 에 "Google Maps 의 웹사이트 필드에 미니홈피 URL 등록" 안내 + 1클릭 복사

#### SRC — 텍스트 검색 (식당 수 50+ 시점)

- PG `tsvector` + `pg_trgm` — 매장명 / 메뉴명 / 카테고리 검색
- 자동완성 (오타 허용)
- 카테고리 트리 정비

#### MNU — 메뉴 옵션 강화 (식당 수 30+ 시점)

- `Menu.options` 컬럼 `JSON → jsonb` 마이그레이션
- GIN 인덱스 추가
- 메뉴별 "추가 요청 메모" 기능
- 크로스 매장 옵션 검색 (비건 / 글루텐프리 / 알레르기 / 매운맛 등)

#### REV — 후기 / 평점 시스템 (출시 후 일정 매장 수 확보 후)

- `Review` 모델 (손님 → 매장)
- 매장 admin opt-in 공개 토글
- 미니홈피 페이지에 후기 섹션
- 별점 분포 / 최근 후기 / 응답 기능

#### ANA — 데이터 가치화 (출시 ~ 6개월 후)

- 일 / 주 / 월 매장 인사이트 대시보드
- 시간대별 매출 / 인기 메뉴 / 재방문율
- AI 추천 (Gemini 기반): "비슷한 매장의 인기 메뉴", "이 시간에 잘 팔리는 메뉴"
- 마케팅 메시지 (LINE 푸시) 워커 — 신메뉴 공지 / 쿠폰

### 이전 사이클 carry-over (인프라 / 운영)

- 멀티 인스턴스 실배포 검증 (이미 코드는 준비됨 — OPS-01 docker-compose)
- 결제 재시도 / POS 동기화 워커 (Dramatiq 인프라 재사용)
- 영수증 PDF / NSFW 검사 워커화
- PayPay Direct E2E 테스트 (sandbox)
- Smaregi / AirRegi 어댑터 본격 구현
- 食べ放題 인원 변경 / 시간 연장

### 본 사이클에서 발생한 것 (DBM 완료 후 별도 카드)

- DATETIME → TIMESTAMPTZ + 타임존 정책 도입
- PG read replica 도입 (트래픽 증가 시)
- `migration_sqls` 단일화 (PG 단독 안정화 후)
- Cloud SQL HA on (식당 수 100+ 시점)

### 출시 전후 우선순위 권장

| 순서 | 사이클 | 출시 전 필수도 | 비고 |
|---|---|---|---|
| 1 | **DBM** (현 사이클, PG 이전) | 🔴 출시 전 필수 | 출시 후엔 매우 어렵다 |
| 2 | **MKT v1** (미니홈피 공개 + opt-in) | 🟠 차별화 핵심 | 가능하면 출시 전 |
| 3 | **GEO** (PostGIS + 근처 매장) | 🟠 차별화 핵심 | MKT 와 같이 묶으면 좋음 |
| 4 | **SEO** (메타 태그 + sitemap) | 🟠 미니홈피 가치의 핵심 | MKT/GEO 와 한 묶음 가능 |
| 5 | **MNU** (jsonb + 옵션 검색) | 🟡 출시 후, 매장 수 ~30 | 본인이 처음 언급한 기능 |
| 6 | **SRC** (텍스트 검색) | 🟡 매장 수 ~50 | 발견성 보강 |
| 7 | **REV** (후기 시스템) | 🟢 매장 수 ~100 | 신뢰 자산 누적 |
| 8 | **ANA** (데이터 인사이트) | 🟢 출시 6개월+ | 데이터 누적 후 |

---

## 🟥 OPS-04 — 운영 VM 디스크 관리 (cleanup + 모니터링)

**Owner**: operator + postgres-specialist (실행)
**Priority**: 🔴 P0
**발견 경위**: 2026-05-18 DBM-09 mysqldump 시도 중 SSH 안 됨 → 시리얼 로그에 `No space left on device` 반복 → VM 재부팅 + 디스크 10G → 29G 확장으로 임시 복구.

### 즉시 회수 가능 (총 ~4.5G, 서비스 영향 0)

```bash
# 1. snapd 자체 제거 (서버에 불필요, 2.5G)
sudo systemctl stop snapd && sudo apt-get purge --yes snapd && sudo rm -rf /var/lib/snapd /var/cache/snapd /snap

# 2. journald 사이즈 제한 + 정리 (800M → ~200M)
sudo journalctl --vacuum-size=200M
sudo bash -c 'cat > /etc/systemd/journald.conf.d/size-limit.conf <<EOF
[Journal]
SystemMaxUse=200M
SystemKeepFree=1G
EOF'
sudo systemctl restart systemd-journald

# 3. rsyslog 강제 rotate + 압축 (800M+)
sudo logrotate -f /etc/logrotate.d/rsyslog

# 4. Playwright 캐시 삭제 (~/.cache/ms-playwright, 622M, 운영 무관)
rm -rf ~/.cache/ms-playwright
```

### 장기 보강

- [ ] **모니터링 알람**: GCP Monitoring 에서 디스크 사용률 > 80% 알람 (Cloud Monitoring → Alerting Policy)
- [ ] **logrotate 점검**: `/etc/logrotate.d/` 의 앱 로그 (nginx, uvicorn) rotate 주기 확인 + 압축 활성
- [ ] **systemd-journald 설정 영구화**: `SystemMaxUse=200M` 유지
- [ ] **apt 캐시 자동 정리**: `cron.daily` 또는 `unattended-upgrades` 설정

### 수용 기준

- [ ] 디스크 사용률 < 50% (현재 32%, 더 줄이기)
- [ ] 모니터링 알람 1개 이상 설정됨
- [ ] journald + rsyslog 사이즈 cap 영구 적용
- [ ] (선택) snapd 제거 또는 의도적 잔존 결정

### 사용자 지시 프롬프트

```
OPS-04 운영 VM 디스크 cleanup + 모니터링 진행.
ssh -i D:/myproject/qraku verejireh@35.213.6.149 로 들어가서
위 즉시 회수 가능 4개 명령 실행 후 df -h 결과 확인.
이후 GCP Monitoring 알람 정책 1개 추가 (디스크 80% 임계).
결과는 tasks/work-log.md 에 OPS-04 엔트리 append.
```

---

## 카드 작성 규칙 / 사이클 종료 절차

기존과 동일 — [`docs/architecture.md` §5](../docs/architecture.md), 이전 사이클 [archive](./archive/2026-05-saas-infra-cycle.md) 참조.

---

## 참고

- 직전 사이클: [`archive/2026-05-saas-infra-cycle.md`](./archive/2026-05-saas-infra-cycle.md)
- 호환성 감사: [`db-migration-audit.md`](./db-migration-audit.md) (DBM-01 산출)
- 컷오버 룬북: [`db-migration-runbook.md`](./db-migration-runbook.md) (DBM-12 산출)
- 신규 ADR: [`../docs/adr/006-postgresql-migration.md`](../docs/adr/006-postgresql-migration.md), `007-pgloader-choice.md`, `008-cutover-strategy.md` (DBM-03 산출)
- 신규 에이전트: [`../agents/db-migration-architect.md`](../agents/db-migration-architect.md), `postgres-specialist.md`, `data-migration-engineer.md`
- Work log (모든 사이클): [`work-log.md`](./work-log.md)

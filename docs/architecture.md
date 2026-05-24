# Architecture — QRaku.com

> QR 기반 레스토랑 주문/결제 SaaS의 현재 아키텍처.
> **무엇이 어디에 있고, 왜 그렇게 두는가**를 설명한다.
> 주요 설계 결정의 배경은 [`adr/`](./adr/) 에 별도 기록.

---

## 1. 현재 아키텍처 (As-Is, 2026-05-24 PG 컷오버 후 기준)

### 1.1 한눈에 보기

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GCP VM (단일 인스턴스, 운영)                     │
│  35.213.6.149  (hajime, asia-northeast1-a) ← qraku.com              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ FastAPI (uvicorn, systemd qrorder.service) ─ port 8003        │   │
│  │  ├─ /api/*   : REST (routers/*.py)                            │   │
│  │  ├─ /ws/*    : WebSocket + Redis Pub/Sub 어댑터               │   │
│  │  ├─ /api/healthz, /api/readyz : 헬스체크                      │   │
│  │  └─ /*       : SPA catch-all → frontend-react/dist/           │   │
│  └────┬─────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       │   ┌──────────────────────────────────────────┐              │
│       ├──▶│ Cloud SQL Auth Proxy (systemd)           │              │
│       │   │  127.0.0.1:5432  → asyncpg/psycopg2      │              │
│       │   │  HTTP health: 127.0.0.1:9090             │              │
│       │   └────┬─────────────────────────────────────┘              │
│       │        │ mTLS                                               │
│       │        ▼                                                    │
│       │   ┌────────────────────────────────────────┐                │
│       │   │ Cloud SQL PostgreSQL 16 (REGIONAL HA)  │                │
│       │   │  postgre-sql / asia-northeast1         │                │
│       │   │  db-custom-1-3840, max_conn=100        │                │
│       │   │  - models.py = 진실공급원              │                │
│       │   │  - database.py:migration_sqls 인라인   │                │
│       │   └────────────────────────────────────────┘                │
│       │                                                             │
│       └──▶ Redis (asyncio, decode_responses=True)                   │
│              - WebSocket Pub/Sub (`ws:store:*`)                     │
│              - Idempotency-Key 잠금 + 결과 캐시                      │
│              - WS 인증 토큰 단기 저장                                 │
│              - Dramatiq 큐 브로커 (워커 동작 시)                      │
└─────────────────────────────────────────────────────────────────────┘
        ▲                                          ▲
        │                                          │
   브라우저 (손님 / 스태프 / 관리자)        외부 (Square, PayPay, Stripe)
```

> **DB 이력**: 2026-05-23 컷오버로 MySQL (aiomysql) → Cloud SQL PostgreSQL (asyncpg + Auth Proxy) 전환. 본 문서는 컷오버 후 상태만 기술. 컷오버 위험·검증 기록은 [`../tasks/pg-cutover-risk-audit.md`](../tasks/pg-cutover-risk-audit.md), [`../tasks/pg-cutover-verification-results.md`](../tasks/pg-cutover-verification-results.md).

### 1.2 멀티 인스턴스 대응

코드는 **이미 다중 인스턴스 가능 상태**이지만, 운영은 단일 인스턴스 유지 중.

```
                       ┌─ Dev 환경 (docker-compose) ─┐
                       │                              │
                       │  backend1:8003 ──┐           │
                       │  backend2:8004 ──┼─ Redis ──┘
                       │  worker        ──┘
                       └──────────────────────────────┘
```

- **WebSocket 메시지 fan-out**: 인스턴스 A 발행 → Redis publish → 인스턴스 B 의 `psubscribe("ws:store:*")` 가 수신 → 로컬 dispatch.
- **자기 메시지 dedup**: `instance_id` 비교로 발행 인스턴스는 Pub/Sub 수신을 skip (로컬 dispatch 와 중복 방지). 자세한 내용은 [`adr/004-websocket-pubsub-lazy-start.md`](./adr/004-websocket-pubsub-lazy-start.md).
- **DB 풀 총량 제약**: Cloud SQL `max_connections=100`. 현재 1 worker × (pool_size=10 + max_overflow=20) = 30. workers=4 로 늘리면 120 > 100 → 차단. 워커 증설 시 pool 축소 또는 max_connections 상향 필수.

### 1.3 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 백엔드 | FastAPI + SQLModel + asyncpg | PostgreSQL 강제 (SQLite 런타임 금지) |
| 캐시·큐·Pub/Sub | Redis (redis-py asyncio) | [ADR-001](./adr/001-redis-choice.md) |
| 프론트 | React 18 + Vite + React Router | 정적 빌드 → FastAPI 가 서빙 |
| 결제 | Square Web Payments / PayPay Direct / Stripe (구독) | Adapter 패턴 (`services/pos/`) |
| 실시간 | 네이티브 WebSocket + Redis Pub/Sub | `utils/websocket.ConnectionManager` |
| 백그라운드 워커 | Dramatiq + Redis | [ADR-002](./adr/002-dramatiq-over-celery.md) |
| 마이그레이션 | `database.py:migration_sqls` (인라인) + Alembic (신규) | [ADR-003](./adr/003-inline-migration-coexistence.md) |
| 배포 | GCP VM 단일 인스턴스 + `deploy.py` (paramiko) + systemd | 자세한 내용은 [`deployment.md`](./deployment.md) |

### 1.4 라우터 도메인 분포

라우터 파일은 도메인별 1파일 (`backend/routers/*.py`). 자세한 책임 분리는 [`coding-rules.md` 규칙 3](./coding-rules.md#규칙-3--라우터-책임-경계).

### 1.5 인증 구조

```
staff API   (/api/staff/*)    → 마스터PIN 세션 또는 require_admin (JWT)
register    (/api/register/*) → 마스터PIN 세션 또는 require_admin
orders      (/api/orders/*)   → 공개 생성, 수정/삭제는 인증 필수
admin       (/api/admin/*)    → require_admin (JWT) + store_id 교차 검증
ws          (/ws/*)           → 단기 토큰 인증 (?token=...)  [ADR-005]
ws/token    (/api/ws/token/*) → 토큰 발급 (admin/staff/customer 분기)
webhooks    (/api/webhooks/*) → 서명 검증 + WebhookEvent UNIQUE 멱등성
```

### 1.6 결제 3-Track + Webhook

| 트랙 | 동작 |
|---|---|
| **Square 결제** | Square Web Payments 카드 / PayPay (Square 통합) + Square POS 연동 |
| **PAY_AT_COUNTER** | 주문만 생성, 계산대 직접 결제 |
| **PayPay Direct** | PayPay API 직접 호출. 콜백 페이지 + webhook **이중 안전망** (멱등성 보장) |

자세한 멱등성·webhook 규칙은 [`payment-rules.md`](./payment-rules.md).

### 1.7 백그라운드 워커

```
backend/workers/
├─ broker.py             ← Dramatiq Redis 브로커 등록
├─ db.py                 ← sync 엔진 (postgresql+psycopg2, utils/db.py:to_sync_url() 로 자동 치환)
└─ translate_tasks.py    ← 메뉴 자동 번역 (Gemini) — 3-Phase 분리 (PG-CAP-05)
```

- 워커는 FastAPI lifecycle 외부 → `manager.broadcast` 사용 금지.
- WebSocket 이벤트 발행은 **sync Redis publish + WS-02 envelope 형식 일치**. 백엔드 인스턴스의 `_pubsub_listener` 가 fan-out.
- 메뉴 등록 응답 시간 < 200ms (번역은 워커가 처리 후 `TRANSLATION_COMPLETED` 이벤트 발행).
- `translate_menu` task: Load → External API (Gemini) → Write 3-Phase 분리로 DB session hold 시간 최소화. `update_menu` 가 번역 소스 필드 변경 시 actor 재enqueue.

---

## 2. 컴포넌트 위치 규약

새로 추가하는 모든 코드의 **표준 위치**:

```
backend/
├─ main.py                  ← 라우터 등록 + lifecycle 훅
├─ models.py                ← 모든 모델 (단일 진실 공급원)
├─ database.py              ← PG asyncpg 엔진 + 인라인 마이그레이션
├─ routers/
│  └─ <domain>.py           ← 라우터 (도메인별 1파일)
├─ services/
│  ├─ pos/                  ← 결제/POS 어댑터
│  └─ <domain>/             ← 새 도메인 서비스
├─ utils/
│  ├─ auth.py / jwt.py / crypto.py / refunds.py  ← (기존)
│  ├─ websocket.py          ← Redis Pub/Sub 어댑터 포함
│  ├─ redis.py              ← redis-py asyncio 싱글톤
│  ├─ event_log.py          ← 감사 로그 헬퍼
│  ├─ idempotency.py        ← Redis SETNX 잠금 + 결과 캐시
│  ├─ events.py             ← WebSocket envelope 표준화
│  ├─ db.py                 ← async→sync URL 치환 (asyncpg→psycopg2)
│  ├─ db_compat.py          ← PG 시간/날짜 helper (date_only/hour/year/month/day_of_week, JST 변환)
│  └─ time_helpers.py       ← now_utc_naive / now_jst / JST 변환 8 helper (datetime.utcnow 대체)
└─ workers/
   ├─ broker.py             ← Dramatiq 브로커 설정
   ├─ db.py                 ← 워커 sync DB 엔진
   └─ <domain>_tasks.py
```

**신규 디렉토리는 위 트리에만 생성한다.** 기존 모듈 위치 변경 금지.

---

## 3. 데이터 모델 (현재 시점)

| 모델 | 비고 |
|---|---|
| `Store` / `Menu` / `Order` / `OrderItem` / `Table` 등 | 도메인 핵심 |
| `EventLog` | 모든 상태 변경 작업의 감사 로그 |
| `WebhookEvent` | 외부 webhook 수신 기록 + `(provider, event_id)` UNIQUE |
| `Order.idempotency_key VARCHAR(64) UNIQUE` | 클라이언트 재시도 차단 |
| `RefundLog` | 부분/전액 환불 기록 |
| `StaffMember` / `StaffAttendance` | 스태프 + 출퇴근 |
| `MenuGroup` / `MenuGroupItem` / `TabehoudaiSession` | 食べ放題 / 飲み放題 / 시간대 메뉴 그룹 |
| `Message` / `Announcement` | 매장 ↔ 슈퍼어드민 1:1 메시지 |
| `PaymentSettings` | 매장별 결제 라우팅 (`payment_method_type` + `pos_type`) |
| `StoreDisplaySettings` | KDS / Register / Staff page 토글 |

신규 마이그레이션은 `database.py:migration_sqls` + Alembic revision **양쪽**에 추가 (이중 안전망 기간).

### 3.1 Enum 규약 (PG 컷오버 사이클 산물)

모든 `(str, Enum)` 멤버는 **`name == value` 규칙** 준수 (대문자):

```python
class PaymentMethodType(str, Enum):
    PAY_AT_COUNTER = "PAY_AT_COUNTER"          # value 가 name 과 동일
    SQUARE_INTEGRATED = "SQUARE_INTEGRATED"
    PAYPAY_DIRECT = "PAYPAY_DIRECT"
```

- **이유**: SQLAlchemy 가 INSERT 시 `enum.name` (대문자) 으로 저장하지만 lookup 도 `name` 기준. raw `UPDATE` 로 소문자 정규화하면 hydration `LookupError`.
- **자동 차단**: `tools/predeploy_smoke.py` #8 (SQLModel Enum field `name == value`) 가 deploy 전 새 mismatch 감지 시 FAIL. 운영 데이터는 `database.py` 방어 `UPDATE` 가 자동 정규화.
- **이력**: 2026-05-24 PG-AUDIT-ENUM-CONSISTENCY 로 6개 enum 일괄 통일 (KitchenMode/PaymentOptions/TableStatus/PaymentMethodType/POSType/MenuGroupType/MessageSenderType/StoreCategory).

### 3.2 시간 / 타임존 규약

| 컬럼 / 변수 | 저장 형식 | 비고 |
|---|---|---|
| `Order.created_at` 등 DB datetime | UTC **naive** TIMESTAMP (`WITHOUT TIME ZONE`) | 컷오버 시 DATETIME → TIMESTAMP. `tzinfo=None` 유지 |
| Python 코드 내 default | `now_utc_naive()` ([`utils/time_helpers.py`](../backend/utils/time_helpers.py)) | `datetime.utcnow()` 사용 금지 (Py 3.12+ deprecated) |
| 사장님 "오늘 매출" 등 JST 기준 | `today_start_jst_as_utc_naive()` 등 helper | JST calendar day 의 UTC 표현 |
| group_by date | `db_compat.date_only()` 등 | PG `timezone('Asia/Tokyo', col)::date` literal SQL (bindparam 회피 — GROUP BY 매칭 위해) |
| 핫패스 day filter | UTC range (`>= start AND < end`) | `Order.created_at` index 활용 가능 |

- **자동 차단**: `predeploy_smoke` #3 (utcnow grep, legacy/seed 제외 0건), #7 (db_compat SQL compile).
- **분석**: [`../tasks/p1-dt-migrate-02-utcnow-classification-analysis.md`](../tasks/p1-dt-migrate-02-utcnow-classification-analysis.md), [`../tasks/p1-dt-dg-04-hotpath-utc-range-analysis.md`](../tasks/p1-dt-dg-04-hotpath-utc-range-analysis.md).

---

## 4. 환경변수

| 변수 | 용도 | 필수도 |
|---|---|---|
| `DATABASE_URL` | PG 연결 (`postgresql+asyncpg://...`) — Auth Proxy 경유 시 `127.0.0.1:5432` | 🔴 필수 |
| `REDIS_URL` | Redis 연결 (`redis://...`) | 🔴 필수 |
| `SECRET_KEY` | JWT 서명 | 🔴 필수 |
| `ENCRYPTION_KEY` | Fernet 키 (운영자 발급) | 🔴 필수 |
| `FRONTEND_BASE_URL` | PayPay 콜백 베이스 | 🔴 필수 |
| `DRAMATIQ_BROKER_URL` | 워커 브로커 (보통 `REDIS_URL` 동일) | 🟠 워커 가동 시 |
| `PAYPAY_WEBHOOK_SECRET` | PayPay webhook 서명 키 | 🟠 |
| `WS_AUTH_TOKEN_TTL_SECONDS` | WS 인증 토큰 TTL (기본 300) | 🟡 옵션 |
| `IDEMPOTENCY_TTL_SECONDS` | Idempotency 결과 캐시 TTL (기본 86400) | 🟡 옵션 |
| `INSTANCE_ID` | WS Pub/Sub 인스턴스 식별자 | 🟡 옵션 (디버깅) |
| `VITE_LINE_LIFF_ID` | LINE LIFF (스탬프/포토리뷰) | 🟠 |
| `VISION_API_KEY` | GCP Vision (NSFW 차단) | 🟡 옵션 |

`.env.example` 파일에 동시 추가 ([`coding-rules.md` 규칙 9](./coding-rules.md#규칙-9--의존성--환경변수-추가)).

---

## 5. 마이그레이션 운영 (Alembic + 인라인 공존)

자세한 결정 배경은 [`adr/003-inline-migration-coexistence.md`](./adr/003-inline-migration-coexistence.md).

### 5.1 두 시스템 공존

| 시스템 | 위치 | 역할 |
|---|---|---|
| `migration_sqls` (인라인) | `backend/database.py` | 서버 startup 마다 실행되는 멱등 SQL. 기존/현재 운영의 단일 진실공급원 |
| Alembic | `alembic/`, `alembic.ini` | 신규 변경부터 — 정식 마이그레이션 도구 |

**이중 안전망 기간**: 같은 변경을 양쪽에 모두 추가한다. 충분한 운영 검증 후 `migration_sqls` 를 단계적으로 deprecate.

### 5.2 Baseline (최초 1회)

- **신규 dev 환경**: `init_db()` 가 `metadata.create_all` 후 `uv run alembic stamp head` 1회.
- **기존 운영 환경**: 운영자가 첫 배포 시 1회 `uv run alembic stamp head` 수동 실행 (OPR-07).
- `alembic/versions/0001_baseline.py` 는 의도적으로 **no-op**.

### 5.3 신규 스키마 변경 절차

```bash
# 1. backend/models.py 수정
# 2. autogenerate
uv run alembic revision --autogenerate -m "add staff_phone column"

# 3. 생성된 alembic/versions/xxxx_*.py 수기 검토
#    - Enum / JSONB 노이즈 제거
#    - 운영 안전성 확인

# 4. 같은 SQL 을 backend/database.py:migration_sqls 에도 추가
#    "# [YYYY-MM-DD] 설명"
#    "ALTER TABLE staffmember ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL",

# 5. 커밋
```

### 5.4 자동 실행

- `backend/main.py` startup 에서 **`migration_sqls` 만 자동 실행** (멱등 `ALTER ... IF NOT EXISTS` + 정규화 `UPDATE`).
- `alembic upgrade head` 는 자동 실행 안 함 — 운영자 수동 (OPR-07 기준).
- `deploy.py` 도 Alembic 자동 실행 안 함.

### 5.5 Autogenerate 한계

- **SQLModel Enum 컬럼**: VARCHAR 매핑 → Enum 멤버 변경 추적 X. 수기 검토 필수.
- **JSONB 컬럼** (`Menu.options`, `Store.extra_translations`): 매번 차이 검출 → 노이즈 제거 필수.
- **인덱스 누락**: `migration_sqls` 의 일부 인덱스가 SQLModel metadata 에 없을 수 있음.

### 5.6 DATABASE_URL 드라이버 치환

`alembic/env.py` 와 `workers/db.py` 가 [`utils/db.py:to_sync_url()`](../backend/utils/db.py) 로 `postgresql+asyncpg://` → `postgresql+psycopg2://` 자동 치환 (sync 엔진 필요).

### 5.7 init_db 동시 실행 안전성

`init_db()` 는 PostgreSQL `pg_advisory_xact_lock` 으로 보호 — 다중 인스턴스 부팅 시 마이그레이션 race 차단. 단일 트랜잭션 내에서 마이그레이션 + enum cast (`::text`) 모두 수행. 분석: [`../tasks/p1-init-db-race-analysis.md`](../tasks/p1-init-db-race-analysis.md).

---

## 6. Deploy 전 자동 smoke (`tools/predeploy_smoke.py`)

8단계 자동 검증 — deploy 전후 실행 권장. 종료 코드 0 = OK.

| # | 검증 항목 | 차단 회귀 |
|---|---|---|
| 1 | `compileall backend/` | syntax 회귀 |
| 2 | `import backend.models` + time_helpers | import time error |
| 3 | `grep datetime.utcnow` (legacy/seed 제외 0건) | Py 3.12+ deprecation 누락 |
| 4 | JWT admin/super/staff 생성 + decode | jwt 라이브러리 / SECRET_KEY 회귀 |
| 5 | Event ts `+00:00` 형식 | browser-compat 회귀 |
| 6 | time_helpers (now_utc_naive / today_jst / 8 helper 동작) | tz 변환 회귀 |
| 7 | `db_compat` SQL compile (timezone literal + Integer cast + GROUP BY 매칭) | PG-AUDIT-GROUPBY/DECIMAL 류 회귀 |
| 8 | SQLModel Enum field `name == value` | PG-AUDIT-ENUM-CONSISTENCY 류 회귀 (raw UPDATE 가 lookup mismatch 야기) |

```bash
# Local (Windows):
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe tools/predeploy_smoke.py

# 운영 VM:
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 \
  "cd ~/qr-order-system && ./.venv/bin/python tools/predeploy_smoke.py"
```

---

## 7. 비범위 (Out of Scope) — 현재 의도적으로 안 하는 것

- **Kubernetes / 자동 스케일링** — Docker Compose 단계까지만.
- **로그 수집기 (ELK / Loki)** — stdout + 파일 로테이션 유지.
- **APM (Sentry / Datadog)** — 운영 트래픽 늘면 검토.
- **AI 매출 분석 / 마케팅 Agent** — 다음 사이클 후보.
- **Smaregi / AirRegi 어댑터 본격 구현** — placeholder 유지.
- **TIMESTAMPTZ 전면 이행** — P1 #7 Strategy 3, OPR-07 Alembic baseline 선행 필수. D+30 p95 측정 후.

---

## 8. 알려진 한계 (As-Is)

1. **단일 서버 운영** — 코드는 멀티 인스턴스 가능. Nginx + 2 backend 실배포는 다음 사이클. Cloud SQL `max_connections=100` 이 풀 총량 제약.
2. **PayPay Direct E2E 미검증** — sandbox 계정으로 실 결제 흐름 테스트 필요.
3. **Smaregi / AirRegi adapter** — placeholder.
4. **테스트 스위트 없음** — Playwright 골든패스 20 tests 만 존재 (`frontend-react/tests/e2e/`). 백엔드 단위/통합 테스트 도입은 별도 사이클.
5. **로그 수집기 없음** — stdout + `~/qr-order-system/backend.log` 파일.
6. **워커 상시 가동 안 함** — 메뉴 번역이 워커 가동 시에만 처리됨. 운영자 수동 또는 systemd `qrworker.service` 추가 시 자동화.
7. **`pg_stat_statements` 비활성** — Cloud SQL flag + `CREATE EXTENSION` 필요 (OPR-15). 50매장 트래픽 분석 핵심.

---

## 9. 참고 문서

- 코딩 규칙: [`coding-rules.md`](./coding-rules.md)
- WebSocket 설계: [`websocket-rules.md`](./websocket-rules.md)
- 결제 규칙: [`payment-rules.md`](./payment-rules.md)
- 배포: [`deployment.md`](./deployment.md)
- 설계 결정: [`adr/`](./adr/)
- 작업 카드: [`../tasks/current-tasks.md`](../tasks/current-tasks.md)
- PG 컷오버 위험·검증: [`../tasks/pg-cutover-risk-audit.md`](../tasks/pg-cutover-risk-audit.md), [`../tasks/pg-cutover-verification-results.md`](../tasks/pg-cutover-verification-results.md)
- PG 컷오버 사이클 아카이브: [`../tasks/archive/2026-05-dbm-pg-cycle.md`](../tasks/archive/2026-05-dbm-pg-cycle.md)
- 직전 사이클 산출물: [`../tasks/archive/2026-05-saas-infra-cycle.md`](../tasks/archive/2026-05-saas-infra-cycle.md)
- 에이전트 정의: [`../agents/`](../agents/)

# Architecture — QRaku.com

> QR 기반 레스토랑 주문/결제 SaaS의 현재 아키텍처.
> **무엇이 어디에 있고, 왜 그렇게 두는가**를 설명한다.
> 주요 설계 결정의 배경은 [`adr/`](./adr/) 에 별도 기록.

---

## 1. 현재 아키텍처 (As-Is, 2026-05-10 기준)

### 1.1 한눈에 보기

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GCP VM (단일 인스턴스, 운영)                     │
│  35.213.6.149   ←  qraku.com                                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ FastAPI (uvicorn, systemd qrorder.service) ─ port 8003        │   │
│  │  ├─ /api/*   : REST (routers/*.py)                            │   │
│  │  ├─ /ws/*    : WebSocket + Redis Pub/Sub 어댑터               │   │
│  │  ├─ /api/healthz, /api/readyz : 헬스체크                      │   │
│  │  └─ /*       : SPA catch-all → frontend-react/dist/           │   │
│  └────┬─────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ├──▶ MySQL (aiomysql, pool 10/20) ── models.py 진실공급원      │
│       │     - database.py:migration_sqls 인라인 마이그레이션         │
│       │     - alembic/ (신규 변경부터 사용, 이중 안전망 기간)        │
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

### 1.3 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 백엔드 | FastAPI + SQLModel + aiomysql | MySQL 강제 (SQLite 런타임 금지) |
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
├─ db.py                 ← sync 엔진 (mysql+pymysql)
└─ translate_tasks.py    ← 메뉴 자동 번역 (Gemini)
```

- 워커는 FastAPI lifecycle 외부 → `manager.broadcast` 사용 금지.
- WebSocket 이벤트 발행은 **sync Redis publish + WS-02 envelope 형식 일치**. 백엔드 인스턴스의 `_pubsub_listener` 가 fan-out.
- 메뉴 등록 응답 시간 < 200ms (번역은 워커가 처리 후 `TRANSLATION_COMPLETED` 이벤트 발행).

---

## 2. 컴포넌트 위치 규약

새로 추가하는 모든 코드의 **표준 위치**:

```
backend/
├─ main.py                  ← 라우터 등록 + lifecycle 훅
├─ models.py                ← 모든 모델 (단일 진실 공급원)
├─ database.py              ← MySQL 엔진 + 인라인 마이그레이션
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
│  └─ events.py             ← WebSocket envelope 표준화
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
| `TabehoudaiMenuGroup` / `TabehoudaiSession` | 食べ放題 / 飲み放題 |

신규 마이그레이션은 `database.py:migration_sqls` + Alembic revision **양쪽**에 추가 (이중 안전망 기간).

---

## 4. 환경변수

| 변수 | 용도 | 필수도 |
|---|---|---|
| `DATABASE_URL` | MySQL 연결 (`mysql+aiomysql://...`) | 🔴 필수 |
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
#    - Enum / JSON-as-TEXT 노이즈 제거
#    - 운영 안전성 확인

# 4. 같은 SQL 을 backend/database.py:migration_sqls 에도 추가
#    "# [YYYY-MM-DD] 설명"
#    "ALTER TABLE staffmember ADD COLUMN phone VARCHAR(32) NULL",

# 5. 커밋
```

### 5.4 자동 실행하지 않음

- `backend/main.py` startup 에서 `alembic upgrade head` 호출 안 함.
- `deploy.py` 도 마이그레이션 자동 실행 안 함 — 운영자 수동.

### 5.5 Autogenerate 한계

- **SQLModel Enum 컬럼**: String 매핑 → Enum 변경 추적 X. 수기 검토 필수.
- **JSON-as-TEXT** (`Menu.options`, `Store.extra_translations`): 매번 차이 검출 → 노이즈 제거 필수.
- **인덱스 누락**: `migration_sqls` 의 일부 인덱스가 SQLModel metadata 에 없을 수 있음.

### 5.6 DATABASE_URL 드라이버

`alembic/env.py` 와 `workers/db.py` 가 `mysql+aiomysql://` → `mysql+pymysql://` 자동 치환 (sync 엔진 필요).

---

## 6. 비범위 (Out of Scope) — 현재 의도적으로 안 하는 것

- **PostgreSQL 이전** — MySQL 정상 동작 중. 트래픽 한계 시 별도 사이클.
- **Kubernetes / 자동 스케일링** — Docker Compose 단계까지만.
- **로그 수집기 (ELK / Loki)** — stdout + 파일 로테이션 유지.
- **APM (Sentry / Datadog)** — 운영 트래픽 늘면 검토.
- **AI 매출 분석 / 마케팅 Agent** — 다음 사이클 후보.
- **Smaregi / AirRegi 어댑터 본격 구현** — placeholder 유지.

---

## 7. 알려진 한계 (As-Is)

1. **단일 서버 운영** — 코드는 멀티 인스턴스 가능. Nginx + 2 backend 실배포는 다음 사이클.
2. **PayPay Direct E2E 미검증** — sandbox 계정으로 실 결제 흐름 테스트 필요.
3. **Smaregi / AirRegi adapter** — placeholder.
4. **테스트 스위트 없음** — 단위/통합 테스트 도입은 별도 사이클.
5. **로그 수집기 없음** — stdout + `~/qr-order-system/backend.log` 파일.

---

## 8. 참고 문서

- 코딩 규칙: [`coding-rules.md`](./coding-rules.md)
- WebSocket 설계: [`websocket-rules.md`](./websocket-rules.md)
- 결제 규칙: [`payment-rules.md`](./payment-rules.md)
- 배포: [`deployment.md`](./deployment.md)
- 설계 결정: [`adr/`](./adr/)
- 작업 카드: [`../tasks/current-tasks.md`](../tasks/current-tasks.md)
- 직전 사이클 산출물: [`../tasks/archive/2026-05-saas-infra-cycle.md`](../tasks/archive/2026-05-saas-infra-cycle.md)
- 에이전트 정의: [`../agents/`](../agents/)

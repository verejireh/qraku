# Architecture — QRaku.com

> QR 기반 레스토랑 주문/결제 SaaS의 현재 아키텍처 + 이번 사이클의 개선 목표 아키텍처.
> 이 문서는 **무엇이 어디에 있고, 왜 그렇게 두는가**를 설명한다.

---

## 1. 현재 아키텍처 (As-Is)

### 1.1 한눈에 보기

```
┌────────────────────────────────────────────────────────────────┐
│                       GCP VM (단일 서버)                        │
│  35.213.6.149   ←  qraku.com                                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ FastAPI (uvicorn)  ── port 8003                           │  │
│  │  ├─ /api/*  : REST 라우터들 (routers/*.py)                │  │
│  │  ├─ /ws/*   : WebSocket 엔드포인트 (in-memory manager)    │  │
│  │  └─ /*      : SPA catch-all → frontend-react/dist/        │  │
│  └────────────────┬─────────────────────────────────────────┘  │
│                   │                                            │
│                   ▼                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ MySQL (aiomysql, pool_size=10, max_overflow=20)           │  │
│  │  - models.py 단일 진실 공급원                              │  │
│  │  - database.py: 시작 시 ALTER TABLE 인라인 마이그레이션    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
        ▲                                          ▲
        │                                          │
   브라우저 (손님 / 스태프 / 관리자)        외부 (Square, PayPay, Stripe)
```

### 1.2 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 백엔드 | FastAPI + SQLModel + aiomysql | MySQL 강제 (SQLite 런타임 금지) |
| 프론트 | React 18 + Vite + React Router | 정적 빌드 → FastAPI가 서빙 |
| 결제 | Square Web Payments / PayPay Direct / Stripe (구독) | Adapter 패턴 (`services/pos/`) |
| 실시간 | 네이티브 WebSocket | `utils/websocket.ConnectionManager` (in-process dict) |
| 배포 | GCP VM 단일 인스턴스 + `deploy.py` (paramiko) | systemd / nginx 등 미사용 |

### 1.3 라우터 도메인 분포

라우터 파일은 도메인별 1파일 (`backend/routers/*.py`). 자세한 책임 분리는 [`coding-rules.md` 규칙 3](./coding-rules.md#규칙-3--라우터-책임-경계).

### 1.4 인증 구조

```
staff API  (/api/staff/*)   → 마스터PIN 세션 또는 require_admin (JWT)
register   (/api/register/*) → 마스터PIN 세션 또는 require_admin
orders     (/api/orders/*)   → 공개 생성만 허용, 수정/삭제는 인증 필수
admin      (/api/admin/*)    → require_admin (JWT) + store_id 교차 검증
ws         (/ws/*)          → 현재 인증 없음 (개선 대상)
```

### 1.5 결제 3-Track

| 트랙 | 동작 |
|---|---|
| **Square 결제** | Square Web Payments 카드 / PayPay (Square 통합) + Square POS 연동 |
| **PAY_AT_COUNTER** | 주문만 생성, 계산대 직접 결제 |
| **PayPay Direct** | PayPay API 직접 호출, 낮은 수수료 |

자세한 멱등성·webhook 규칙은 [`payment-rules.md`](./payment-rules.md).

### 1.6 알려진 한계 (As-Is)

1. **단일 서버 의존**: 서버 1대 죽으면 서비스 전체 중단. WebSocket 모두 끊김.
2. **WebSocket 상태가 인메모리**: 다중 인스턴스 운영 불가. (자세한 건 [`websocket-rules.md`](./websocket-rules.md))
3. **Redis 미존재**: 캐시 / Pub/Sub / 락 / 큐 모두 없음. 매번 DB hit.
4. **백그라운드 워커 없음**: 번역, 결제 재시도, POS 동기화 등 동기 처리 — 응답 지연.
5. **이벤트 / 감사 로그 없음**: 누가 언제 무엇을 했는지 추적 불가.
6. **PayPay Webhook 미수신**: 손님이 콜백 페이지 닫으면 주문 미생성 가능.
7. **환불 라우터 미구현**: `RefundLog` 모델만 있고 엔드포인트 없음.
8. **DB 마이그레이션이 인라인 ALTER**: 서버 시작에 의존. Alembic 등 도구 없음.

---

## 2. 목표 아키텍처 (To-Be)

이번 개선 사이클의 목적은 **"단일 서버 + 인메모리 상태"에서 "운영 가능한 SaaS 인프라"로 전환**하는 것.
단, 한 번에 다 가지 않고 **3개 레이어로 나눠 단계적 도입**한다.

### 2.1 한눈에 보기 (최종 목표)

```
                        ┌──────────────────────┐
                        │      Nginx (TLS)      │
                        └────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
         ┌────────┐         ┌────────┐         ┌────────┐
         │FastAPI │         │FastAPI │  ...    │FastAPI │   (수평 확장)
         │  app1  │         │  app2  │         │  appN  │
         └───┬────┘         └───┬────┘         └───┬────┘
             │                  │                  │
             └──────┬───────────┴──────────────────┘
                    │
        ┌───────────┴──────────┐
        ▼                      ▼
   ┌─────────┐           ┌──────────┐
   │  MySQL  │           │  Redis   │  ← Pub/Sub + 캐시 + 큐 + 락
   │  (RDS)  │           │ (single) │
   └─────────┘           └─────┬────┘
                               │
                          ┌────┴─────┐
                          ▼          ▼
                    ┌─────────┐ ┌─────────┐
                    │ Worker  │ │ Worker  │   (Dramatiq)
                    │   #1    │ │   #2    │
                    └─────────┘ └─────────┘
```

### 2.2 도입 컴포넌트

#### Redis (이번 사이클 P1)

용도:
1. **WebSocket Pub/Sub** — 다중 FastAPI 인스턴스 간 이벤트 전달 (`channel: ws:store:{store_id}`)
2. **캐시** — 메뉴 / 매장 설정 / 번역 / 활성 食べ放題 세션
3. **분산 락** — 주문 생성 멱등성, webhook 중복 처리 방지
4. **큐 브로커** — Dramatiq 백엔드
5. **Idempotency Key 저장** — 단기 TTL (24h)로 중복 요청 차단

**미도입 시점**: 자체 구축한 simple in-memory 캐시는 사용 금지 (인스턴스 늘리면 비일관 발생).

#### Background Worker (이번 사이클 P2)

선택: **Dramatiq + Redis**
- Celery 대비 가볍고 FastAPI와 잘 맞음
- 작업 정의: `backend/workers/<domain>_tasks.py`
- 실행: `dramatiq workers.translate_tasks workers.payment_retry_tasks ...`

대상 작업:
- 메뉴 자동 번역 (Gemini API 호출)
- 결제 webhook 도착 후 후처리
- POS 동기화 재시도
- 영수증 PDF 생성
- 사진 NSFW 검사 (Vision API)
- 마케팅 메시지 발송 (LINE / 이메일)

#### Event Log (이번 사이클 P1)

새 모델 `EventLog` (`models.py`에 append):
```python
class EventLog(SQLModel, table=True):
    id: int = Field(primary_key=True)
    store_id: int = Field(index=True)
    actor_type: str  # customer | staff | admin | system | webhook
    actor_id: Optional[str] = None
    action: str  # order.created, order.cancelled, refund.issued, ...
    target_type: Optional[str] = None  # order | refund | session | ...
    target_id: Optional[int] = None
    payload_json: Optional[str] = None  # 작업 컨텍스트
    external_payload_raw: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
```

자세한 사용 규칙은 [`coding-rules.md` 규칙 8](./coding-rules.md#규칙-8--로깅--감사-audit-규칙).

#### 멀티 인스턴스 / Docker (이번 사이클 P3)

이번 사이클의 **목표는 "준비"까지**. 실제 인스턴스 증설은 트래픽이 늘 때.

준비 작업:
1. `Dockerfile` (백엔드용) + `docker-compose.yml` (개발/스테이징용 — backend, mysql, redis, worker)
2. 모든 인메모리 상태 제거 (WebSocket Pub/Sub로 이전, 메뉴 캐시 Redis로)
3. 헬스체크 엔드포인트 (`GET /api/healthz`, `GET /api/readyz`)
4. 환경변수 기반 설정 일원화

#### Alembic (이번 사이클 P2)

`database.py` 인라인 마이그레이션을 영구적으로 두면 안 됨. **Alembic 도입**:
- 기존 `migration_sqls`는 그대로 유지 (이미 운영 중인 환경 보호)
- **새 스키마 변경부터** Alembic 리비전으로 작성
- 기존 항목은 시간을 두고 점진적으로 Alembic 리비전으로 이관

---

## 3. 단계별 도입 순서 (Sequencing)

### Phase 1 — Reliability Foundation (이번 사이클 핵심)

| # | 항목 | 산출물 |
|---|---|---|
| 1 | Redis 도입 (단일 인스턴스, 캐시 + 분산 락) | `utils/redis.py`, 환경변수 `REDIS_URL` |
| 2 | EventLog 모델 + 헬퍼 (`utils/event_log.py`) | 모든 상태 변경 작업에 적용 |
| 3 | 멱등성 강화 (Idempotency-Key 헤더 + Redis TTL) | `utils/idempotency.py` |
| 4 | PayPay Webhook 엔드포인트 | `routers/webhooks.py`에 PayPay 추가 |
| 5 | 환불 라우터 (`POST /api/admin/orders/{id}/refund`) | `routers/admin.py` 또는 신규 `routers/refunds.py` |
| 6 | 멀티테넌시 감사 (모든 라우터 grep + 누락 보강) | `agents/backend-reliability.md`가 수행 |

### Phase 2 — Realtime Robustness

| # | 항목 | 산출물 |
|---|---|---|
| 1 | WebSocket Redis Pub/Sub | `utils/websocket.py` 리팩토링 (Pub/Sub 어댑터) |
| 2 | WebSocket 인증 토큰 (path/쿼리에 단기 토큰) | `routers/ws.py` + 토큰 발급 엔드포인트 |
| 3 | WebSocket 메시지 스키마 정의 | `docs/websocket-rules.md` 참고 |
| 4 | 헬스체크 엔드포인트 | `main.py`에 `/api/healthz`, `/api/readyz` |

### Phase 3 — Scale-Out Preparation

| # | 항목 | 산출물 |
|---|---|---|
| 1 | Dramatiq + Redis 큐 도입 | `workers/` 디렉토리 + 첫 작업(번역) 이전 |
| 2 | Dockerfile + docker-compose | 개발 환경부터 |
| 3 | Alembic 도입 (신규 변경부터) | `alembic/` 디렉토리, `database.py`와 병행 |
| 4 | 결제 재시도 / POS 동기화 워커화 | 동기 호출 → 큐에 enqueue |

---

## 4. 컴포넌트 위치 규약

새로 추가하는 모든 코드의 **표준 위치**:

```
backend/
├─ main.py                  ← 라우터 등록만
├─ models.py                ← 모든 모델 (단일 진실 공급원)
├─ database.py              ← MySQL 엔진 + 인라인 마이그레이션
├─ routers/
│  └─ <domain>.py           ← 라우터 (도메인별 1파일)
├─ services/
│  ├─ pos/                  ← 결제/POS 어댑터 (기존)
│  └─ <domain>/             ← 새 도메인 서비스 (필요 시)
├─ utils/
│  ├─ auth.py               ← (기존)
│  ├─ jwt.py                ← (기존)
│  ├─ crypto.py             ← (기존)
│  ├─ refunds.py            ← (기존)
│  ├─ websocket.py          ← (기존, Phase 2에서 Pub/Sub로 리팩토링)
│  ├─ redis.py              ← ★신규 (Phase 1)
│  ├─ event_log.py          ← ★신규 (Phase 1)
│  ├─ idempotency.py        ← ★신규 (Phase 1)
│  └─ cache.py              ← ★신규 (Phase 1, Redis 래퍼)
└─ workers/                 ← ★신규 (Phase 3)
   ├─ __init__.py
   ├─ broker.py             ← Dramatiq 브로커 설정
   ├─ translate_tasks.py
   ├─ payment_retry_tasks.py
   └─ pos_sync_tasks.py
```

**신규 디렉토리는 위 트리에만 생성한다.** 기존 모듈 위치 변경 금지.

---

## 5. 데이터 모델 변화 요약 (이번 사이클)

| 모델 | 변경 | 비고 |
|---|---|---|
| `EventLog` | **신규** | 감사 로그 (모든 상태 변경) |
| `WebhookEvent` | **신규** | 외부 webhook 수신 기록 + 멱등성 키 |
| `Order` | `idempotency_key VARCHAR(64) NULL UNIQUE` 추가 | 클라이언트 재시도 차단 |
| `Order` | `dispatch_state VARCHAR(32) DEFAULT 'pending'` | 워커 처리 상태 (Phase 3) |
| `RefundLog` | (기존) — 라우터에서 사용 시작 | |

신규 마이그레이션은 모두 `database.py`의 `migration_sqls` 리스트 끝에 `# [2026-05-XX] 목적` 주석과 함께 append.

---

## 6. 환경변수 추가 (이번 사이클)

| 변수 | 용도 | 도입 Phase |
|---|---|---|
| `REDIS_URL` | Redis 연결 (예: `redis://localhost:6379/0`) | Phase 1 |
| `DRAMATIQ_BROKER_URL` | 워커 브로커 (보통 `REDIS_URL`과 같음) | Phase 3 |
| `WS_AUTH_TOKEN_TTL_SECONDS` | WebSocket 인증 토큰 TTL (기본 300) | Phase 2 |
| `IDEMPOTENCY_TTL_SECONDS` | Idempotency-Key Redis TTL (기본 86400) | Phase 1 |
| `EVENT_LOG_RETENTION_DAYS` | 감사 로그 보존 기간 (기본 365) | Phase 1 |

`.env.example` 파일에 동시 추가 ([`coding-rules.md` 규칙 9](./coding-rules.md#규칙-9--의존성--환경변수-추가)).

---

## 7. ChatGPT 피드백 8개 항목 vs 본 문서 매핑

| ChatGPT 항목 | 본 문서 대응 |
|---|---|
| ① SQLite 위험 | ❌ 사실 오류 — 이미 MySQL. `database.py`는 SQLite 런타임 금지. (단, `pool_size` 모니터링은 필요) |
| ② Redis 미존재 | §2.2 Redis (Phase 1) |
| ③ 멱등성 | [`payment-rules.md`](./payment-rules.md) + Phase 1 항목 #3 |
| ④ 이벤트 로그 | §2.2 EventLog (Phase 1) |
| ⑤ AI 기능 고도화 | **이번 사이클 범위 외** — 인프라 안정화 후 |
| ⑥ 단일 서버 의존 | Phase 3 (이번 사이클은 "준비"까지) |
| ⑦ 백그라운드 큐 | §2.2 Dramatiq (Phase 3) |
| ⑧ 멀티테넌시 검증 | Phase 1 #6 (감사 작업) |

---

## 8. 비범위 (Out of Scope) — 이번 사이클에 하지 않는 것

- **PostgreSQL 이전** — MySQL이 잘 동작 중. 트래픽이 한계에 닿으면 별도 사이클.
- **AI 매출 분석 / 마케팅 Agent** — 다음 사이클.
- **Smaregi / AirRegi 어댑터 본격 구현** — placeholder 유지.
- **Kubernetes / 자동 스케일링** — Phase 3에서도 Docker Compose 단계까지만.
- **로그 수집기(ELK/Loki)** — 일단 stdout + 파일 로테이션으로.

---

## 9. 참고 문서

- 코딩 규칙: [`coding-rules.md`](./coding-rules.md)
- WebSocket 설계: [`websocket-rules.md`](./websocket-rules.md)
- 결제 규칙: [`payment-rules.md`](./payment-rules.md)
- 작업 카드: [`../tasks/current-tasks.md`](../tasks/current-tasks.md)
- 에이전트 정의: [`../agents/`](../agents/)

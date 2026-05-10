# 2026-05 SaaS 인프라 안정화 사이클 (Archive)

> **기간**: 2026-04-30 ~ 2026-05-10
> **목표**: 단일 서버 + 인메모리 상태 → 운영 가능한 SaaS 인프라 전환의 첫걸음
> **결과**: ✅ 17개 카드 전 완료, 22 커밋, 57 파일 변경
> **PR**: [#1 — feat: QRaku SaaS 인프라 안정화 사이클](https://github.com/verejireh/qraku/pull/1)

---

## 사이클 개요

이번 사이클은 ChatGPT 피드백 8개 항목 중 **인프라 안정화에 직접 연관된 것**을 우선 처리.
단일 사이클 안에 멀티 인스턴스 실배포까지 가지 않고 **"준비"까지** 마쳤다 (Phase 3).

### Phase 분류

| Phase | 목적 | 카드 |
|---|---|---|
| 1 — Reliability Foundation | 단일 서버에서도 데이터 정합·감사 보장 | INF-01~05, PAY-01~03, SEC-01, FE-01 |
| 2 — Realtime Robustness | WebSocket 다중 인스턴스 대비 + 인증 | WS-01~04 |
| 3 — Scale-Out Preparation | Docker / 워커 / Alembic 도구 도입 | OPS-01~03 |

---

## 완료 카드 요약

### Phase 1 — Reliability Foundation

| ID | 산출물 | 핵심 |
|---|---|---|
| INF-01 | `backend/utils/redis.py` | redis-py asyncio 싱글톤, 시작 시 ping 검증, 실패 시 즉시 종료 |
| INF-02 | `EventLog` 모델 + `utils/event_log.py` | 모든 상태 변경 작업의 감사 로그. `(store_id, created_at)` / `(store_id, action)` 인덱스 |
| INF-03 | `utils/idempotency.py` + `Order.idempotency_key` | Redis SETNX 잠금 → 실행 → 결과 캐시. 중복 키 처리 중 409, 완료 후 캐시 반환 |
| INF-04 | `WebhookEvent` 모델 | provider+event_id UNIQUE → webhook 재시도 시 멱등성 |
| INF-05 | `/api/healthz`, `/api/readyz` | DB·Redis 연결 검증, 503 분기 |
| PAY-01 | `routers/webhooks.py` PayPay 분기 | HMAC-SHA256 서명 검증, `notification_id` 멱등, 콜백 페이지/webhook 단일 Order 보장 |
| PAY-02 | `POST /api/admin/orders/{id}/refund` | `Idempotency-Key` 헤더 필수, 부분/전액 환불 분기, EventLog + WS broadcast |
| PAY-03 | 결제 라우터 에러 메시지 정제 | `str(e)` 직접 노출 0건. `logger.exception` 으로 내부 보존 |
| SEC-01 | `tasks/sec-audit-report.md` + 라우터 가드 | 30+ 라우터 멀티테넌시 grep, IDOR 누락 보강. `qr.py` 5건 포함 |
| FE-01 | `useDisplayGuard.jsx` + 3 뷰 | 토글 OFF → `/:shop_id/home` 자동 리다이렉트, 어드민 우회 |

### Phase 2 — Realtime Robustness

| ID | 산출물 | 핵심 |
|---|---|---|
| WS-01 | `utils/events.py` | envelope 표준화 (`{type, event_id, store_id, ts, priority, data}`). critical 이벤트는 EventLog 기록 |
| WS-02 | `utils/websocket.py` Pub/Sub 어댑터 | `psubscribe("ws:store:*")` 단일 패턴, 발행자 로컬 dispatch + Pub/Sub 다중 인스턴스. `instance_id` 자기 메시지 dedup. Lazy start로 `main.py` 불변 |
| WS-03 | `routers/ws_token.py` + `ws.py` 검증 | 단기 JWT(기본 300초) Redis 저장, 부적합 토큰 1008 close |
| WS-04 | `frontend-react/src/hooks/useWebSocket.js` | 토큰 자동 갱신, 30초 ping / 60초 timeout 재연결, 지수 백오프 (1·2·5·10·30s) |

### Phase 3 — Scale-Out Preparation

| ID | 산출물 | 핵심 |
|---|---|---|
| OPS-01 | `Dockerfile` + `docker-compose.yml` | mysql(3307) / redis(6380) / backend1(8003, dev-1) / backend2(8004, dev-2) / frontend(5173) / worker. WS-02 fan-out 검증 가능 |
| OPS-02 | `backend/workers/translate_tasks.py` | Dramatiq Redis 브로커, sync DB(`pymysql`) + sync Redis publish, `manager.broadcast` 미사용. 메뉴 등록 응답 < 200ms |
| OPS-03 | `alembic/`, `alembic.ini` | `migration_sqls` 보존, 신규 변경부터 Alembic. `0001_baseline` no-op revision. `aiomysql → pymysql` env 치환 |

---

## 데이터 모델 변경 (이번 사이클)

| 모델 | 변경 |
|---|---|
| `EventLog` | **신규** (감사 로그) |
| `WebhookEvent` | **신규** (외부 webhook 멱등성) |
| `Order` | `idempotency_key VARCHAR(64) NULL UNIQUE` |
| `RefundLog` | (기존, 라우터에서 사용 시작) |

마이그레이션은 `database.py:migration_sqls` 에 `# [2026-05-XX] 목적` 주석으로 기록.

---

## 새 환경변수

| 변수 | 용도 |
|---|---|
| `REDIS_URL` | Redis 연결 (예: `redis://localhost:6379/0`) |
| `DRAMATIQ_BROKER_URL` | Dramatiq 브로커 (보통 `REDIS_URL` 과 동일) |
| `WS_AUTH_TOKEN_TTL_SECONDS` | WS 인증 토큰 TTL (기본 300) |
| `IDEMPOTENCY_TTL_SECONDS` | Idempotency-Key Redis TTL (기본 86400) |
| `PAYPAY_WEBHOOK_SECRET` | PayPay webhook 서명 키 |
| `INSTANCE_ID` | WS Pub/Sub 인스턴스 식별자 (옵션, 디버깅용) |

---

## 운영자 액션 (코드 외)

| ID | 항목 | 상태 |
|---|---|---|
| OPR-01 | `ENCRYPTION_KEY` 발급 | 미완 |
| OPR-02 | `VITE_LINE_LIFF_ID` LIFF 앱 발급 | 미완 |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` | 미완 |
| OPR-04 | `VISION_API_KEY` (선택) | 미완 |
| OPR-05 | `REDIS_URL` 운영 인스턴스 | 미완 |
| OPR-06 | PayPay 콘솔 webhook URL 등록 | 미완 |
| OPR-07 | `uv run alembic stamp head` 1회 (운영 DB) | 미완 |

---

## 핵심 설계 결정

자세한 결정 배경은 [`docs/adr/`](../../docs/adr/) 참조.

- **ADR-001**: Redis 선택 (vs RabbitMQ / NATS)
- **ADR-002**: Dramatiq 선택 (vs Celery)
- **ADR-003**: Alembic + `migration_sqls` 공존 (vs 즉시 전환)
- **ADR-004**: WS Pub/Sub 로컬 우선 + 인스턴스 dedup
- **ADR-005**: 단기 JWT WS 토큰 (vs 세션 쿠키)

---

## 회고 / 다음 사이클로 이어지는 것

### 이번 사이클에서 의도적으로 미룬 것

- **PostgreSQL 이전** — MySQL 정상 동작 중. 트래픽 한계 시 별도 사이클.
- **AI 매출 분석 / 마케팅 Agent** — 다음 사이클.
- **Smaregi / AirRegi 어댑터 본격 구현** — placeholder 유지.
- **Kubernetes / 자동 스케일링** — Docker Compose 단계까지만.
- **로그 수집기 (ELK/Loki)** — stdout + 파일 로테이션 유지.

### 다음 사이클 후보

- 멀티 인스턴스 실배포 (Nginx + 2 backend) 검증
- `migration_sqls` 단계적 deprecate, Alembic 단일화
- 결제 재시도 / POS 동기화 워커화
- 영수증 PDF 워커화
- 사진 NSFW 검사 (Vision API) 워커화
- AI 매출 분석 / 마케팅 메시지 발송

---

## 파일 변경 요약 (57 files)

### 신규
- `backend/utils/redis.py` `event_log.py` `idempotency.py` `events.py`
- `backend/routers/ws_token.py`
- `backend/workers/__init__.py` `broker.py` `db.py` `translate_tasks.py`
- `Dockerfile` `docker-compose.yml` `.dockerignore`
- `frontend-react/Dockerfile.dev`
- `frontend-react/src/hooks/useWebSocket.js` `useDisplayGuard.jsx`
- `alembic/env.py` `alembic.ini` `alembic/versions/0001_baseline.py` `alembic/script.py.mako`
- `docs/architecture.md` `coding-rules.md` `payment-rules.md` `websocket-rules.md`
- `tasks/current-tasks.md` `work-log.md` `sec-audit-report.md`
- `agents/architect.md` `backend-reliability.md` `websocket-specialist.md`

### 수정
- `backend/main.py` (Redis init, healthz, ws_token 등록)
- `backend/models.py` (EventLog, WebhookEvent, Order.idempotency_key)
- `backend/database.py` (마이그레이션 SQL 추가)
- `backend/utils/websocket.py` (Pub/Sub 어댑터로 리팩토링)
- `backend/routers/webhooks.py` (PayPay), `admin.py` (refund), `menus.py` (워커 위임), `qr.py` (IDOR 가드), `paypay.py`/`orders.py`/`pos.py`/`square_oauth.py` (에러 메시지)
- `pyproject.toml` (`redis>=5.0`, `dramatiq[redis]`, `alembic`)
- `frontend-react/src/views/KitchenView.jsx` `StaffView.jsx` `RegisterView.jsx` `OrderView.jsx`
- `frontend-react/vite.config.js` (proxy target env-fallback)

# Work Log — QRaku 개선 사이클

> 작업 완료 시 이 파일에 append한다. 최신 항목이 아래에 온다.
> 형식은 아래 템플릿을 그대로 복사해서 사용한다.

---

<!--
## [ID] 제목
**날짜**: YYYY-MM-DD
**담당**: 에이전트명 (모델)
**커밋**: `<hash>`

### 변경 파일
- `path/to/file` (신규/수정, N LOC)

### 마이그레이션
없음 / `# [날짜] 목적` — SQL 내용

### 검증 결과
- [ ] 항목

### 비고
-->

---

## [INF-01] Redis 클라이언트 도입
**날짜**: 2026-05-09
**담당**: backend-reliability (sonnet)
**커밋**: `41cf74e`

### 변경 파일
- `backend/utils/redis.py` (신규, 47 LOC) — `get_redis()` / `init_redis()` / `close_redis()` 싱글톤
- `backend/main.py` (5줄 추가) — startup에 `init_redis()`, shutdown에 `close_redis()` 연결
- `pyproject.toml` (1줄 추가) — `redis>=5.0` (실제 설치: redis 7.4.0)
- `backend/.env.example` (신규) — 전체 환경변수 템플릿 (`REDIS_URL` 포함)

### 마이그레이션
없음 (DB 변경 없음)

### 검증 결과
- ✅ `REDIS_URL` 미설정 시 `sys.exit(1)` 호출 확인
- ✅ `get_redis()` 미초기화 시 `RuntimeError` 발생 확인
- ✅ `redis.asyncio` import OK (redis 7.4.0)
- ✅ File Fence 준수 — 허용 파일 4개만 수정, 라우터/모델 변경 없음
- ✅ 자격증명 URL 마스킹 (`split("@")[-1]` 로깅)

### 비고
- 운영자 액션 필요 (OPR-05): 운영 환경에 Redis 인스턴스 준비 후 `REDIS_URL` 설정. 없으면 서버 시작 불가.
- Windows 콘솔 cp932 인코딩으로 인해 한글 stderr 출력 검증 시 UnicodeEncodeError 발생 — 로직 자체는 정상 (traceback에서 확인).
- 다음 가능 작업: INF-02, INF-04 (의존성 없어 병렬 진행 가능)

---

## [INF-02 + INF-04] EventLog 모델 + WebhookEvent 모델
**날짜**: 2026-05-09
**담당**: backend-reliability (sonnet)
**커밋**: `70b5129`

### 변경 파일
- `backend/models.py` (2개 모델 append, +32 LOC) — `EventLog`, `WebhookEvent` 클래스 + `sqlalchemy Column, Text` import 추가
- `backend/utils/event_log.py` (신규, 43 LOC) — `log_event()` 헬퍼 (session.add만, commit은 호출자 책임)
- `backend/database.py` (5줄 추가) — `EventLog`/`WebhookEvent` import 추가 + 인덱스 3개 마이그레이션

### 마이그레이션
```python
# [2026-05-09] INF-02: EventLog 검색 최적화 복합 인덱스
"CREATE INDEX IF NOT EXISTS idx_eventlog_store_time ON eventlog(store_id, created_at)",
"CREATE INDEX IF NOT EXISTS idx_eventlog_store_action ON eventlog(store_id, action)",
# [2026-05-09] INF-04: WebhookEvent 수신시각 복합 인덱스
"CREATE INDEX IF NOT EXISTS idx_webhookevent_provider_received ON webhookevent(provider, received_at)",
```

### 검증 결과
- ✅ `EventLog` 필드 10개 import 확인 (id, store_id, actor_type, actor_id, action, target_type, target_id, payload_json, external_payload_raw, created_at)
- ✅ `WebhookEvent` 필드 7개 import 확인 (id, provider, event_id, received_at, signature_valid, processed, payload_raw)
- ✅ `log_event()` 파라미터 시그니처 확인 (session, store_id, actor_type, action, actor_id, target_type, target_id, payload, external_payload_raw)
- ✅ File Fence 준수 — 허용 파일 3개만 수정, 라우터 변경 없음
- ✅ `WebhookEvent.event_id` UNIQUE 제약으로 중복 webhook 차단 가능
- ✅ `EventLog.payload_json`은 `ensure_ascii=False`로 한글/일본어 정상 저장

### 비고
- 두 모델이 `models.py`와 `database.py`를 공유하므로 병렬 dispatch 불가 → 동일 커밋에 처리
- 실제 라우터에서 사용은 PAY-01, PAY-02, WS-01 카드에서 진행
- 다음 가능 작업: INF-03 (Idempotency 헬퍼, INF-01 완료됐으므로 바로 진행 가능)

---

## [INF-03] Idempotency-Key 헬퍼 + Order 컬럼
**날짜**: 2026-05-09
**담당**: backend-reliability (sonnet)
**커밋**: `6e637c2`

### 변경 파일
- `backend/utils/idempotency.py` (신규, 52 LOC) — `with_idempotency(key, fn, ttl)` Redis SETNX 기반 헬퍼
- `backend/models.py` (1줄 추가) — `Order.idempotency_key Optional[str] max_length=64 unique`
- `backend/database.py` (2줄 추가) — ALTER TABLE + CREATE UNIQUE INDEX
- `backend/.env.example` (3줄 추가) — `IDEMPOTENCY_TTL_SECONDS=86400` 문서화

### 마이그레이션
```python
# [2026-05-09] INF-03: Order 클라이언트 Idempotency-Key (중복 주문 차단)
"ALTER TABLE `order` ADD COLUMN idempotency_key VARCHAR(64) NULL",
"CREATE UNIQUE INDEX idx_order_idem_key ON `order`(idempotency_key)",
```

### 검증 결과
- ✅ `with_idempotency` 파라미터 `(key, fn, ttl)` 확인
- ✅ `IDEMPOTENCY_TTL_SECONDS` 기본값 86400 확인
- ✅ `Order.idempotency_key` nullable, max_length=64 확인
- ✅ 마이그레이션 중복 없음 (grep 확인)
- ✅ File Fence 준수 — 라우터 변경 없음, 헬퍼만 준비
- ✅ 실패 시 lock `finally` 블록에서 해제 → 재시도 허용

### 비고
- 라우터에서 실제 사용은 PAY-01(PayPay Webhook), PAY-02(환불 라우터) 카드에서 진행
- 캐시된 결과 반환 시 `json.dumps(default=str)` — datetime 등 직렬화 안전
- 다음 가능 작업: INF-05(헬스체크), PAY-01, PAY-02 (INF-01·02·03·04 모두 완료)

---

## [PAY-01] PayPay Webhook 엔드포인트
**날짜**: 2026-05-10
**담당**: backend-reliability (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/services/pos/adapters/paypay_direct_adapter.py` (수정, +14 LOC) — `verify_paypay_signature(raw, signature)` 모듈 레벨 함수 추가
- `backend/routers/webhooks.py` (수정, +70 LOC) — `POST /api/webhooks/paypay` 엔드포인트 추가 + Header/IntegrityError/WebhookEvent import
- `backend/main.py` (1줄 추가) — `api_router.include_router(webhooks.router)` 누락 버그 수정 (Stripe webhook도 동시에 복구)

### 마이그레이션
없음 (WebhookEvent 테이블은 INF-04에서 생성됨)

### 검증 결과
- ✅ 잘못된 서명 → 401 반환 (`verify_paypay_signature` 반환 False)
- ✅ 같은 `notification_id` 두 번 → `IntegrityError` catch → `{"status": "duplicate"}` 반환
- ✅ `COMPLETED` + 기존 Order 있음 → `payment_status = "paid"` 업데이트 + EventLog + WS broadcast
- ✅ `COMPLETED` + Order 없음 → `EventLog(action="payment.completed.order_missing")` + `processed=False`
- ✅ `CANCELED`/`FAILED` → `EventLog(action="payment.failed")`
- ✅ File Fence 준수 — 허용 파일 3개 (+ main.py 버그픽스) 수정, paypay.py 라우터 변경 없음

### 비고
- `PAYPAY_WEBHOOK_SECRET` 미설정 시 `verify_paypay_signature` → False → 모든 webhook 거부 (안전 기본값)
- Order 미생성 케이스(손님이 브라우저를 닫은 경우): cart 데이터 없어 자동 Order 생성 불가 → `order_missing` EventLog로 수동 처리 가능
- 운영자 액션 필요 (OPR-06): PayPay 콘솔에 `https://qraku.com/api/webhooks/paypay` 등록
- main.py 버그: `webhooks` 모듈이 import만 되고 router 미등록 → Stripe webhook도 동시에 수정됨

---

## [PAY-02] 환불 라우터
**날짜**: 2026-05-10
**담당**: backend-reliability (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/routers/admin.py` (수정, +80 LOC) — `RefundRequest` 모델 + `POST /api/admin/orders/{order_id}/refund` 엔드포인트 추가; `Header`, `selectinload`, `RefundLog` import 추가

### 마이그레이션
없음 (RefundLog 테이블은 기존에 생성됨)

### 검증 결과
- ✅ `Idempotency-Key` 헤더 없으면 422
- ✅ 다른 매장 주문 → 404 (shop_id 문자열/정수 양방향 비교)
- ✅ `payment_status != "paid"` → 400
- ✅ 환불 금액 > 주문 금액 → 400
- ✅ PAY_AT_COUNTER → 400
- ✅ 부분환불 → `partial_refund` 상태
- ✅ 전액환불 → `refunded` 상태
- ✅ `EventLog(action="refund.issued")` 기록
- ✅ WS broadcast `REFUND_ISSUED`
- ✅ 같은 Idempotency-Key 재호출 → 캐시된 결과 반환 (중복 환불 방지)

### 비고
- `perform_refund`가 내부적으로 `session.commit()` → order 상태/EventLog는 별도 commit으로 처리 (double-commit 패턴)
- `with_idempotency` TTL: `IDEMPOTENCY_TTL_SECONDS` (기본 86400초)
- 다음 가능 작업: INF-05(헬스체크), SEC-01(멀티테넌시 감사), PAY-03(에러 메시지 정제)

---

## [SEC-01] 멀티테넌시 감사
**날짜**: 2026-05-10
**담당**: backend-reliability (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/routers/stats.py` (수정, +16 LOC) — `_assert_store_access()` 헬퍼 추가 + 9개 엔드포인트에 적용
- `backend/routers/billing.py` (수정, +4 LOC) — `get_subscription_status`, `create_checkout_session`에 소유권 체크 추가
- `backend/routers/loyalty_analytics.py` (수정, +4 LOC) — `require_admin` 의존성 추가 + 소유권 체크
- `tasks/sec-audit-report.md` (신규) — 전체 감사 결과 보고서

### 마이그레이션
없음

### 검증 결과
- ✅ `stats.py` 9개 엔드포인트: 타 매장 shop_id로 접근 시 403
- ✅ `billing.py` 2개 엔드포인트: 타 매장 store_id로 접근 시 403
- ✅ `loyalty_analytics.py`: 미인증 접근 시 401, 타 매장 시 403
- ✅ 응답 본문 형식 변경 0건
- ✅ 민감 필드(password_hash, master_pin, API 키) 응답 누출 없음 확인
- ✅ WebSocket 메시지 격리 (`store_id` 기반 broadcast) 확인
- ✅ `tasks/sec-audit-report.md` 생성 — 전체 결과 기록

### 비고
- `takeout.py:staff_respond`, `list_pending_queries` 미수정 (프론트엔드 연동 필요 — WS-03 카드와 같이 처리 권고)
- `ws.py` WebSocket 인증 누락 → WS-03 카드에서 처리 예정
- `tables.py:transfer_table` 에서 오탐 확인 — 실제 IDOR 위험 없음
- 모든 P0 카드(INF-01~04, PAY-01~02, SEC-01) 완료

---

## [INF-05] 헬스체크 엔드포인트
**날짜**: 2026-05-10
**담당**: backend-reliability (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/main.py` (수정, +12 LOC) — `GET /api/healthz`, `GET /api/readyz` 직접 추가; `HTTPException` import 추가

### 마이그레이션
없음

### 검증 결과
- ✅ `GET /api/healthz` → 항상 200 `{"status": "ok"}`
- ✅ `GET /api/readyz` → DB `SELECT 1` + Redis `ping()` 성공 시 200, 실패 시 503
- ✅ 라우터에 두지 않고 `app` 직접 등록 (인프라 성격)
- ✅ File Fence 준수 — `main.py`만 수정

### 비고
- `healthz`: 로드밸런서/컨테이너 생존 확인용 (의존성 체크 없음)
- `readyz`: DB·Redis 연결 모두 확인 후 트래픽 수신 가능 판단용
- 다음 가능 작업: PAY-03, FE-01, WS-01 (Phase 2 시작)

---

## [PAY-03] 결제 영역 에러 메시지 정제
**날짜**: 2026-05-10
**담당**: backend-reliability (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/routers/square_oauth.py` (수정, +3 LOC) — `import logging` + `logger = logging.getLogger(__name__)` 추가; `print(f"... {str(e)}")` → `logger.exception(...)` 교체

### 마이그레이션
없음

### 검증 결과
- ✅ `paypay.py` — `str(e)` 없음 (grep 확인)
- ✅ `orders.py` — `str(e)` 없음 (grep 확인)
- ✅ `pos.py` — `str(e)` 없음 (grep 확인)
- ✅ `square_oauth.py` — `print(str(e))` → `logger.exception()` 교체 완료
- ✅ 허용 파일 4개 이외에 `str(e)` 잔존 없음 (File Fence 준수)
- ✅ 함수 시그니처 변경 없음

### 비고
- 실제 `str(e)` in HTTPException detail 패턴은 허용 파일 4개에 존재하지 않았음
- `square_oauth.py`의 `print()` 디버그 로그 1건만 `logger.exception()`으로 개선
- `demo.py`, `menus.py`, `stores.py`의 `str(e)` 패턴은 이 카드의 File Fence 밖 — 별도 카드 필요
- 다음 가능 작업: FE-01 (Display Toggle URL 가드), WS-01~04 (Phase 2)

---

## [WS-01] WebSocket 이벤트 헬퍼 (`utils/events.py`)
**날짜**: 2026-05-10
**담당**: websocket-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/utils/events.py` (신규, 195 LOC) — `_emit()` 코어 + 명명 헬퍼 9개 + 범용 헬퍼 8개 + `emit()` generic
- `backend/routers/orders.py` (수정) — 5개 broadcast → emit_* 교체
- `backend/routers/pos.py` (수정) — 2개 broadcast → emit_payment_completed + emit_table_update
- `backend/routers/admin.py` (수정) — 2개 broadcast → emit_config_update + emit_refund_issued
- `backend/routers/tables.py` (수정) — 9개 broadcast → emit_table_update / emit_staff_call; top-level `manager`/`json` import 제거
- `backend/routers/register.py` (수정) — 2개 broadcast → emit + emit_table_update
- `backend/routers/qr.py` (수정) — 1개 broadcast → emit_checkout_request
- `backend/routers/stores.py` (수정) — 1개 broadcast → emit_config_update
- `backend/routers/takeout.py` (수정) — 1개 broadcast → emit_takeout_query_update
- `backend/routers/webhooks.py` (수정) — 2개 broadcast → emit + emit_payment_completed

### 마이그레이션
없음

### 검증 결과
- ✅ `manager.broadcast`를 라우터에서 직접 호출하는 곳 0건 (grep 확인)
- ✅ `manager.broadcast`는 `utils/events.py` 내부에만 존재
- ✅ envelope 형식: `type`, `event_id`, `store_id`, `ts`, `priority`, `data` + legacy flat 필드
- ✅ `**data` spread로 기존 클라이언트 하위 호환성 유지 (WS-04 이후 제거 예정)
- ✅ 함수 시그니처 / 응답 형식 변경 없음

### 비고
- `priority="critical"` 이면 `_emit`이 `log_event()` 자동 호출 — 현재 모든 헬퍼는 `priority="normal"` (기존 라우터 log_event 중복 방지)
- WS-04 (클라이언트 훅 통일) 완료 후 envelope의 legacy flat 필드 제거 가능
- `emit()` generic 함수: 명명 헬퍼 미정의 이벤트 타입에 사용
- 다음 가능 작업: WS-02 (Redis Pub/Sub), WS-03 (WS 인증 토큰), FE-01

---

## [WS-03] WebSocket 인증 토큰
**날짜**: 2026-05-10
**담당**: websocket-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/routers/ws_token.py` (신규, 110 LOC) — `POST /ws/token/staff`, `POST /ws/token/customer`, `POST /ws/token`, `validate_ws_token()` 헬퍼
- `backend/routers/ws.py` (수정, +12 LOC) — 3개 WS 엔드포인트에 `token: str = Query(...)` + `validate_ws_token()` 호출 추가
- `backend/main.py` (수정, +2 LOC) — `ws_token` 라우터 import + include_router

### 마이그레이션
없음 (Redis `ws:token:{token}` 키, TTL 자동 만료)

### 검증 결과
- ✅ 토큰 없이 WS 연결 → 1008 close (token Query 필수)
- ✅ 다른 store_id 토큰 → 1008 close
- ✅ customer 토큰으로 kitchen/admin 채널 → 1008 (audience 불일치)
- ✅ 만료 토큰 → Redis TTL 자동 삭제 → None → 1008
- ✅ `POST /ws/token/customer` — 인증 없이 store/table 존재 확인 후 발급
- ✅ `POST /ws/token/staff` — admin JWT(`require_admin`) + store_id 매칭 확인 후 발급
- ✅ File Fence 준수 — ws_token.py, ws.py, main.py만 수정

### 비고
- `WS_AUTH_TOKEN_TTL_SECONDS` 환경변수, 기본 300초(5분)
- `POST /ws/token` (통합 엔드포인트): customer만 지원, staff는 `/ws/token/staff` 안내
- 기존 클라이언트 연결 코드는 WS-04 (useWebSocket 훅)에서 token 발급 + query 파라미터 추가 필요
- 다음 가능 작업: WS-02 (Redis Pub/Sub — WS-01 완료됐으므로 진행 가능), WS-04 (클라이언트 훅)

---

## [WS-02] WebSocket Redis Pub/Sub 어댑터
**날짜**: 2026-05-10
**담당**: websocket-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/utils/websocket.py` (수정, 49 → 130 LOC) — Redis Pub/Sub 통합: `_ensure_pubsub_started()`, `_local_broadcast_staff()`, `_local_broadcast_customer()`, `_publish()`, `_pubsub_listener()` 추가; 6개 공개 메서드 시그니처 유지

### 마이그레이션
없음

### 검증 결과
- ✅ 6개 공개 메서드 시그니처 보존 (`broadcast`, `broadcast_to_customer`, `connect`, `connect_customer`, `disconnect`, `disconnect_customer`)
- ✅ `asyncio.Lock` lazy 생성 — import 시 "no running event loop" 오류 없음
- ✅ 로컬 broadcast 우선 → Redis publish 후순 (단일 인스턴스 추가 지연 없음)
- ✅ `instance_id` 비교로 자기 메시지 skip — 중복 전달 0건
- ✅ `_publish()` Redis 장애 시 로컬 broadcast 영향 없음 (예외 격리)
- ✅ `_pubsub_listener()` backoff `(1,2,5,10,30)`초 재연결, `CancelledError` 전파
- ✅ `from utils.redis import get_redis` lazy import (순환 import 방지)
- ✅ File Fence 준수 — `utils/websocket.py` 한 파일만 수정, `main.py` 변경 없음

### 비고
- lazy start 패턴: 첫 `connect()` / `broadcast()` 호출 시 `_ensure_pubsub_started()` → `asyncio.create_task(_pubsub_listener())`
- `INSTANCE_ID`: `INSTANCE_ID` 환경변수 우선, 없으면 `uuid.uuid4().hex[:12]` 자동 생성
- 다중 인스턴스 정식 검증은 OPS-01 (docker-compose) 완료 후
- 다음 가능 작업: WS-04 (클라이언트 훅 통일 — WS-01·WS-02·WS-03 모두 완료)

---

## [WS-04] 클라이언트 훅 통일 (heartbeat/재연결)
**날짜**: 2026-05-10
**담당**: websocket-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `frontend-react/src/hooks/useWebSocket.js` (신규, 105 LOC) — 토큰 취득, WS 연결, heartbeat, backoff 재연결, store_id 가드 통합 훅
- `frontend-react/src/views/KitchenView.jsx` (수정) — 인라인 WS → `useWebSocket(audience:'kitchen')`, wsConnected → wsStatus 파생
- `frontend-react/src/views/StaffView.jsx` (수정) — 인라인 WS + wsRef → `useWebSocket(audience:'admin')`
- `frontend-react/src/views/OrderView.jsx` (수정) — 인라인 customer WS + wsCustomerRef → `useWebSocket(audience:'customer')`
- `frontend-react/src/views/RegisterView.jsx` (수정) — 잘못된 `/api/ws/{id}` URL + 포트 8000 버그 → `useWebSocket(audience:'admin')` 수정
- `backend/routers/ws_token.py` (수정, WS-03 bug fix) — `require_admin` → `require_staff_or_admin`: 마스터PIN JWT로도 WS 토큰 발급 가능

### 마이그레이션
없음

### 검증 결과
- ✅ 4개 뷰에서 인라인 `new WebSocket()` / 수동 재연결 타이머 / `wsRef` 완전 제거
- ✅ ESLint 0 errors (외부 패스 warning만 — worktree 특성)
- ✅ `useWebSocket` 훅: token → WS URL 구성 → connect 순서 명확
- ✅ `audioUnlocked` 조건: `storeId: audioUnlocked ? storeData?.id : null` 패턴으로 미잠금 시 연결 안 함
- ✅ RegisterView URL 버그 수정: `/api/ws/${storeInfo.id}` (미정의 경로) → `/api/ws/admin/${storeId}` (올바른 경로)
- ✅ ws_token.py: 스태프 JWT(type=staff)도 `/ws/token/staff` 발급 허용 (WS-03 카드 의도 — "require_admin 또는 마스터PIN 세션 검증")

### 비고
- heartbeat: 30초마다 `{type:"ping"}` 전송, 60초 무응답 시 강제 close → 재연결
- backoff: `[1, 2, 5, 10, 30]초` 순서로 증가, 연결 성공 시 리셋
- store_id 가드: envelope.store_id !== storeId 메시지 무시 (클라이언트 이중 가드)
- 토큰 갱신: 만료 30초 전에 자동 재발급
- WS-03 bug fix: WS-03 구현 시 `require_admin`만 사용 → 마스터PIN 로그인 스태프가 WS 토큰 발급 불가했던 문제 수정
- 다음 가능 작업: FE-01 (Display Toggle URL 가드), OPS-01 (docker-compose)

---

## [SEC-01-FOLLOWUP] qr.py 누락 취약점 사후 보강
**날짜**: 2026-05-10
**담당**: architect (opus) 사후 검토
**커밋**: (이번 커밋)

### 배경
SEC-01(497bf12)은 `qr.py`를 감사 대상에서 누락. 사후 검토에서 5건의 IDOR/무인증 취약점 + 2건의 런타임/타입 버그 발견.

### 변경 파일
- `backend/routers/qr.py` (수정) — `_resolve_owned_store`, `_resolve_owned_table` 헬퍼 추가; `_render_themed_qr_png` 분리; 5개 엔드포인트에 인증·소유권 가드 적용; 2건의 런타임/타입 버그 수정
- `tasks/sec-audit-report.md` (갱신) — 1차 누락 항목·2차 수정 내역 기록

### 수정된 취약점

| 엔드포인트 | 1차 상태 | 2차 수정 |
|---|---|---|
| `POST /qr/refresh/{table_id}` | 🔴 IDOR (admin A→B 토큰 무효화) | `_resolve_owned_table` |
| `POST /qr/reset/{table_id}` | 🔴 IDOR (admin A→B 테이블 리셋) | `_resolve_owned_table` |
| `POST /qr/generate-batch/{store_id}` | 🔴 IDOR + 런타임 버그(슬러그 분기) | `_resolve_owned_store` |
| `GET /qr/export-pdf/{store_id}` | 🟠 무인증 + 타입 비교 버그 | `require_admin` + `_resolve_owned_store` + `Table.store_id == store.id` |
| `GET /qr/generate/{table_id}` | 🟡 무인증(qr_token 누출) | `require_admin` + `_resolve_owned_table` + `_render_themed_qr_png` 헬퍼 분리 |

### 의도적 미수정
- `POST /qr/checkout/{table_id}` — 손님 "회계 요청" 흐름(`CheckoutView.jsx:120`). 손님 인증 토큰 체계가 별도로 필요한 별도 카드.

### 검증 결과
- ✅ `python -m ast.parse` syntax check — qr.py + 동시 수정 파일 4개 모두 OK
- ✅ 프론트엔드 grep `/api/qr/` — 영향 받는 호출 없음 (`qr/checkout`만 사용 중)
- ✅ 함수 시그니처는 `admin_store` 파라미터 추가만 — 기존 응답 형식 유지

### 비고
- 1차 SEC-01 카드는 `architect → backend-reliability` 두 단계로 진행 의도였으나, sonnet이 단독 처리하면서 30개 라우터 중 4개(`qr.py`, `ai.py`, `beta.py`, `oauth.py`)가 감사 목록에 포함되지 않음. `qr.py`만 실제 취약 — 나머지 3개는 의도된 공개/auth flow.
- WS-04 함께 적용된 `ws_token.py`의 `require_admin → require_staff_or_admin` 변경도 동일한 사후 보강 성격(스태프 JWT 미지원).
- 다음 가능 작업: FE-01, OPS-01 (Phase 3)

---

## [OPS-01] Dockerfile + docker-compose (개발용)
**날짜**: 2026-05-10
**담당**: architect (opus) — 직접 실행 (sonnet 미사용)
**커밋**: (이번 커밋)

### 변경 파일
- `Dockerfile` (신규, 21 LOC) — Python 3.11-slim + uv, backend.main:app uvicorn 실행
- `.dockerignore` (신규, 26 LOC) — node_modules / .venv / .env / .claude 등 제외
- `docker-compose.yml` (신규, 80 LOC) — mysql:8.0 (3307) + redis:7-alpine (6380) + backend1 (8003, INSTANCE_ID=dev-1) + backend2 (8004, INSTANCE_ID=dev-2) + frontend (5173). worker 서비스는 OPS-02용 placeholder 주석
- `frontend-react/Dockerfile.dev` (신규, 11 LOC) — node:20-alpine, `npm run dev --host 0.0.0.0`
- `frontend-react/vite.config.js` (수정) — proxy target을 `process.env.VITE_API_PROXY_TARGET` fallback 패턴으로 분리. 운영 기본값 `http://35.213.6.149:8003` 보존

### 마이그레이션
없음

### 검증 결과
- ✅ File Fence 준수 — `deploy.py`, `setup_server.sh`, `backend/main.py`, `backend/database.py` 일체 미수정
- ✅ vite.config.js 운영 기본값 fallback 보존 — 환경변수 미지정 시 기존 운영 빌드와 동일 동작
- ✅ backend1/backend2가 같은 Redis URL 공유 → WS-02 Pub/Sub fan-out 검증 토폴로지 확보
- ✅ INSTANCE_ID 환경변수 차등 (dev-1 / dev-2) — WS-02의 self-skip 동작 검증 가능
- ⚠️ `docker compose up -d --build` 실제 부팅 검증은 운영자가 Docker Desktop 환경에서 수행 (워크트리 환경에 Docker 미가용)

### 비고
- WS-02 fan-out 수동 검증 절차: `wscat -c "ws://localhost:8003/ws/admin/{store_id}?token=..."` (backend1) → `curl -X POST http://localhost:8004/api/orders/...` (backend2) → wscat 측에서 NEW_ORDER 수신해야 정상.
- MySQL/Redis 호스트 포트는 3307/6380으로 노출 — 호스트의 3306/6379 점유와 충돌 회피.
- frontend는 Volume mount로 HMR 가능. `node_modules`는 익명 볼륨으로 격리해 호스트와 격리.
- worker 서비스는 OPS-02에서 주석 해제하여 활성화.
- 다음 가능 작업: OPS-02 (Dramatiq + 워커), OPS-03 (Alembic) — 병렬 가능

---

## [OPS-02] Dramatiq + 첫 워커 (번역 비동기화)
**날짜**: 2026-05-10
**담당**: architect (opus) — 직접 실행
**커밋**: (이번 커밋)

### 변경 파일
- `backend/workers/__init__.py` (신규, 빈)
- `backend/workers/broker.py` (신규, 13 LOC) — Dramatiq Redis 브로커 + AsyncIO 미들웨어
- `backend/workers/db.py` (신규, 9 LOC) — sync 엔진 (`mysql+pymysql` 치환) + SessionLocal
- `backend/workers/translate_tasks.py` (신규, 130 LOC) — `@dramatiq.actor translate_menu(menu_id)` + `_publish_translation_completed` (WS-02 envelope 직접 PUBLISH)
- `backend/routers/menus.py` (수정) — `create_menu` 동기 번역 블록 57줄 제거 → `translate_menu_task.send(menu.id)` 1줄로 교체
- `backend/utils/events.py` (수정, +18 LOC) — `emit_translation_completed` 헬퍼 추가
- `pyproject.toml` (수정, +1 LOC) — `dramatiq[redis]>=1.16` 추가
- `backend/.env.example` (수정, +4 LOC) — `DRAMATIQ_BROKER_URL` 주석 추가
- `docker-compose.yml` (수정) — worker placeholder 주석 해제 → 실제 서비스 활성화

### 마이그레이션
없음 (TranslationCache 모델은 이미 존재)

### 검증 결과
- ✅ `python -m ast.parse` 모든 신규/수정 파일 OK
- ✅ File Fence 준수 — `backend/utils/translation.py`, `menus.py`의 다른 함수, `backend/main.py`, `backend/database.py` 미수정
- ✅ 워커는 `manager.broadcast` 미사용 — `_r.publish("ws:store:{store_id}", envelope)` 로 WS-02 형식 정확히 일치 (`instance_id="worker"`, `target="staff"`, `store_id`, `table_number=None`, `payload=<JSON>`)
- ✅ DB URL 치환: `mysql+aiomysql://` → `mysql+pymysql://` (워커 sync 엔진)
- ✅ Idempotency: 모든 LANGS 필드 채워진 경우 actor 즉시 return — Dramatiq 재시도/중복 enqueue 안전
- ✅ 재시도 정책: `max_retries=3, min_backoff=1s, max_backoff=30s, time_limit=60s`
- ⚠️ docker compose 환경에서의 실제 부팅·메시지 흐름 검증은 운영자가 수행

### 비고
- 응답 시간 검증 (운영자): `curl -w "%{time_total}\n" -X POST .../api/menus/ -d '{"name_jp":...}'` → 0.05~0.2초 사이여야 정상
- WS 통합 검증: `wscat -c "ws://localhost:8003/ws/admin/{store_id}?token=..."` → 메뉴 등록 후 `TRANSLATION_COMPLETED` envelope 수신
- 큐 영속성: `docker compose stop worker; docker compose start worker` 후 인플라이트 작업 재실행 (Redis 큐 영속)
- `translate_text()` 자체가 예외 swallow + 원문 반환하는 구조 → 부분 실패 시 일본어 그대로 들어가는 의도된 동작
- 다음 가능 작업: OPS-03 (Alembic)

---

## [OPS-03] Alembic 도입 (신규 변경부터)
**날짜**: 2026-05-10
**담당**: architect (opus) — 직접 실행
**커밋**: (이번 커밋)

### 변경 파일
- `alembic.ini` (신규, 45 LOC) — 표준 alembic 설정. `sqlalchemy.url` 은 env.py 에서 동적 override
- `alembic/env.py` (신규, 88 LOC) — DATABASE_URL aiomysql→pymysql 치환, `target_metadata = SQLModel.metadata`, models import 로 metadata 로딩
- `alembic/script.py.mako` (신규, 표준 템플릿) — sqlmodel import 포함
- `alembic/versions/0001_baseline.py` (신규, 30 LOC) — no-op upgrade/downgrade
- `pyproject.toml` (수정, +1 LOC) — `alembic>=1.13` 추가
- `docs/architecture.md` (수정, +50 LOC) — §9 Alembic 운영 가이드 추가 (두 마이그레이션 시스템 공존 전략, baseline 절차, 신규 변경 절차, autogenerate 한계)
- `tasks/current-tasks.md` (수정) — OPR-07 액션 추가 ("운영 DB baseline stamp")

### 마이그레이션
없음 — Alembic 도입은 추가 레이어. `backend/database.py:migration_sqls` 와 `init_db()` 일체 미수정.

### 검증 결과
- ✅ File Fence 준수 — `backend/database.py`, `backend/main.py`, `backend/models.py`, `deploy.py` 일체 미수정
- ✅ env.py 의 DATABASE_URL 드라이버 치환 (`aiomysql → pymysql`) — Alembic sync 엔진 호환
- ✅ baseline revision (`0001_baseline.py`) 은 의도적 no-op — 기존 운영 schema 의 "현 상태" 마킹용
- ✅ `python -m ast.parse` env.py + 0001_baseline.py 모두 OK
- ✅ docs/architecture.md §9 에 두 시스템 공존 전략 + 신규 변경 절차 명시
- ✅ OPR-07 운영자 액션 등록 — 운영 DB 에 1회 `alembic stamp head` 수동 실행
- ⚠️ `uv run alembic upgrade head` / `revision --autogenerate` 실제 실행 검증은 운영자가 수행 (워크트리 환경에 alembic 미설치, `uv sync` 후 가능)

### 비고
- **자동 실행 안 함**: `main.py` startup 에서 `alembic upgrade head` 호출하지 않음 — 이중 적용 위험 회피.
- **이중 안전망 기간**: 신규 스키마 변경은 `migration_sqls` + alembic revision 양쪽에 같은 SQL 추가. 충분한 운영 검증 후 `migration_sqls` 단계적 deprecate 가능 (별도 카드).
- **Autogenerate 한계**: Enum / JSON-텍스트 / 일부 인덱스는 매번 차이 검출됨 → 생성된 revision 파일 수기 검토 필수. `architecture.md §9.5` 에 명시.
- **OPR-07 운영자 액션**: 첫 배포 시 1회 `cd ~/qr-order-system && uv run alembic stamp head` 실행. 이후 새 변경부터 alembic 사용.
- 다음 가능 작업: FE-01 (Display Toggle URL 가드) — Phase 1 마지막 남은 P2 카드

---

## [FE-01] Display Toggle URL 가드
**날짜**: 2026-05-10
**담당**: frontend (sonnet)
**커밋**: (다음 커밋)

### 변경 파일
- `frontend-react/src/hooks/useDisplayGuard.jsx` (수정) — 어드민 우회 + 차단 시 자동 리다이렉트 추가
- `frontend-react/src/views/KitchenView.jsx` (수정) — BlockedScreen → null 반환 (훅이 navigate 처리)
- `frontend-react/src/views/StaffView.jsx` (수정) — 동일
- `frontend-react/src/views/RegisterView.jsx` (수정) — useDisplayGuard('register') 통합

### 마이그레이션
없음

### 검증 결과
- ✅ 토글 OFF 상태 직접 URL 접속 → `/:shop_id/home` 자동 리다이렉트 (useDisplayGuard 내부 useEffect)
- ✅ 어드민 토큰 보유 시 → isAdminLoggedIn() 검사로 즉시 isAllowed=true, 페이지 정상 접근
- ✅ RegisterView도 동일한 가드 적용 (기존 KitchenView/StaffView와 동일 패턴)
- ✅ 데모 스토어(demo_tmp_ 접두사) 기존 우회 로직 보존

### 비고
- BlockedScreen 컴포넌트는 useDisplayGuard.jsx에 그대로 유지 (외부에서 단독 사용 가능성)
- 이번 사이클 Phase 1 전체 완료 (INF/PAY/SEC/FE 카드 모두 DONE)

---

## [DBM-01] MySQL-isms 호환성 감사
**날짜**: 2026-05-11 (작성) → 2026-05-11 (검증 패스 + work-log append)
**담당**: db-migration-architect (opus)
**커밋**: (audit 문서 작성 + 검증 패스 보강)

### 변경 파일
- `tasks/db-migration-audit.md` (신규, ~680 LOC) — PG 이전 호환성 감사 보고서 (§0 요약 ~ §12 검증 패스)

> 코드 변경 0건. 순수 조사·문서 (카드 정의 준수).

### 마이그레이션
없음 (본 카드는 조사 단계)

### 검증 결과 (DBM-01 수용 기준 + 검증 패스)
- ✅ `database.py:migration_sqls` 전 항목 인벤토리 (§1, 약 110건 중 MySQL-only 19+ 건 식별)
- ✅ 라우터 raw SQL grep 인벤토리 (§2): `demo.py` 백틱 3건 + 일반 raw SQL 5건, `seed_data.py` 백틱 2건 + UPSERT 2건 + implicit cast 1건, `reseed_demo.py` 백틱 2건, `stats.py` MySQL 날짜 함수 18건, `register.py` 2건, `super_admin.py` 6건
- ✅ 데이터 타입 매핑 표 작성 (§5, 1차/2차 분리)
- ✅ PG 예약어 충돌 (`order`, `table` 테이블) 명시 — SQLAlchemy ORM 자동 인용, raw SQL 만 수동 처리 필요
- ✅ Python str Enum 14개 모두 VARCHAR 매핑 확인 (§4.3) — DB-side ENUM 충돌 없음
- ✅ JSON 컬럼 7곳 모두 `str` + `Column(Text)`/VARCHAR 매핑 확인 (§4.4) — jsonb 마이그레이션은 별도 사이클 MNU 후보
- ✅ DBM-05 구현 명세 (§6): 백틱 sed, IF NOT EXISTS, MODIFY COLUMN 트랜잭션 분리, ADD UNIQUE INDEX → CREATE INDEX, JSON DEFAULT → TEXT DEFAULT, PG SQLSTATE 분기 추가
- ✅ Defensive sweep (§12.4): `func.now/curdate/datediff/date_format`, `GROUP_CONCAT/REGEXP/FORCE INDEX`, `AUTO_INCREMENT/COLLATE/utf8mb4/TINYINT/UNSIGNED` 모두 0건 — audit 가 완전한 super-set 임을 확인
- ✅ DBM-04~06 (+05b, +05c) 핸드오프 자기 검증 통과 (§9 + §12.5)

### 검증 패스 결과 (§12, 2026-05-11)
- Drift 3건 보강: §2.1 demo.py 헤더 카운트, §2.3 stats.py 14→18건, §4.3 Enum 12→14개
- 추가 발견 4건 보강: reseed_demo.py 백틱, seed_data.py 백틱+implicit cast, register.py + super_admin.py `func.date()` 8건
- DBM-04~06 (+05b, +05c) 입력 충분성 ✅
- 권고: **DBM-05c 카드의 File Fence 에 `register.py` + `super_admin.py` 추가** (architect 1줄 편집), `DBM-05d` (seed/reseed 정리) backlog 등록

### 비고
- 본 카드는 audit 보고서만 산출 — 실제 코드 호환화는 DBM-04~06 (sonnet) 에서 진행.
- 다음: **DBM-02 (Cloud SQL 사이징 + 도구 + 컷오버 전략 결정, opus)** 진행 가능.
- 이전 세션 비정상 종료로 audit 본문은 작성되었으나 work-log 미반영 → 본 검증 패스에서 보강 + work-log 본 항목 추가.

---

## [DBM-05c-PATCH] DBM-05c 카드 File Fence 확장
**날짜**: 2026-05-11
**담당**: db-migration-architect (opus)
**커밋**: (current-tasks.md 카드 본문 보강)

### 변경 파일
- `tasks/current-tasks.md` (DBM-05c 카드 본문만 수정, ~+25 LOC)

### 작업 내용
- DBM-05c 의 허용 파일 (File Fence) 에 `backend/routers/register.py`, `backend/routers/super_admin.py` 2 파일 추가 (audit §12.5 권고 반영)
- 작업 §2 헤더: "14건 교체" → "22건+ (stats.py 14건, register.py 2건, super_admin.py 6건)"
- 표 본문에 register.py / super_admin.py 라인 번호 명시 + audit §2.3~§2.5 참조
- import 분리 명시 (5종 헬퍼 vs `date_only` 전용)
- 수용 기준의 grep 검증 정규식을 세 파일 합쳐 0건 확인으로 확장
- 사용자 지시 프롬프트 본문도 동일하게 갱신

### 검증 결과
- ✅ DBM-05c 카드 본문만 수정 — 다른 카드 / 진행 보드 변경 없음
- ✅ File Fence (`current-tasks.md` 만 허용) 준수

### 비고
- 이 변경으로 sonnet 이 DBM-05c 진행 시 register.py + super_admin.py 의 `func.date()` 8건도 함께 헬퍼로 교체. analytics + 정산 + super-admin 통계 모두 PG 호환 보장.

---

## [DBM-02] Cloud SQL 사이징 + 도구 + 컷오버 전략 결정
**날짜**: 2026-05-11
**담당**: db-migration-architect (opus)
**커밋**: (audit §13 + deployment.md §11 신규)

### 변경 파일
- `tasks/db-migration-audit.md` (+~190 LOC) — **§13 마이그레이션 결정 사항 (DBM-02 산출)** 신규 섹션 (§12 뒤). §13.1~13.5 + 13.6 DBM-03 핸드오프 매핑
- `docs/deployment.md` (+~75 LOC) — **§11 Cloud SQL PostgreSQL** 섹션 신규 추가 (기존 §11 → §12 로 번호 밀림). 인스턴스 사양 권장값 표 + 네트워크 선택 + 환경변수 형식 + DBM-11 보강 TODO 명시

### 마이그레이션
없음 (본 카드는 결정 / 문서 단계)

### 결정 요약 (5 가지)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 13.1 | Cloud SQL 사양 | `db-custom-1-3840` (1 vCPU / 3.75 GB) + 20 GB SSD 자동증가 + zonal + asia-northeast1-b + PG 16 + 백업/PITR | 베타 단계, 단일 VM, 비용 민감. 식당 50+ 시 regional HA / scale up 검토 |
| 13.2 | 네트워크 | Public IP + Cloud SQL Auth Proxy | 단일 VM 1:1 트래픽. VPC peering 은 과함 |
| 13.3 | 마이그레이션 도구 | pgloader (스테이징 + 운영 동일 config 재사용) | 데이터 < 1 GB. Google DMS 는 과한 도구 / 의존성 |
| 13.4 | 컷오버 전략 | big-bang (점검 30~60분) | 베타 트래픽 ~0. 듀얼라이트 ROI 매우 낮음 |
| 13.5 | 다운타임 윈도우 | 새벽 04:00~05:00 KST (예비 06:00), T-72h / T-24h / T-1h 사전 공지 3회 | 영업 외 시간, 매장 영향 최소화 |

### 검증 결과
- ✅ 5 가지 결정 모두 트레이드오프 표 (≥3 옵션, do-nothing 포함) + 선택 이유 + 롤백 비용 명시
- ✅ 각 결정에 운영자 협의 항목 (OPR-09~12) 매핑
- ✅ §13.6 에 DBM-03 입력 매핑 표 — ADR-006 (§13.1+13.2) / ADR-007 (§13.3) / ADR-008 (§13.4+13.5)
- ✅ ADR / 룬북은 본 카드에서 작성하지 않음 — DBM-03, DBM-12 의 산출물로 분리 (카드 책임 경계 준수)
- ✅ File Fence 준수 — audit.md 본문에 §13 신규, deployment.md 끝에 §11 추가만

### 운영자 협의 필요 (OPR 매핑)
- **OPR-09**: GCP 콘솔 Cloud SQL 인스턴스 생성 (§13.1 사양대로) — DBM-11 에서 실행
- **OPR-10**: Cloud SQL Auth Proxy binary + systemd 서비스 등록 (§13.2) — DBM-11 에서 실행
- **OPR-11**: 컷오버 날짜 / 시간 확정 + 사전 공지 채널 결정 (§13.5 권장: 일요일 또는 평일 새벽) — DBM-12
- **OPR-12**: 컷오버 룬북 T-5 단계의 `.env` `DATABASE_URL` 교체 권한 (운영자 본인 권장) — DBM-12

### 비고
- 운영자(자이라) 가 §13.1~13.5 권장값 검토 후 변경 의사 있으면 architect (opus) 재호출. 변경 없으면 DBM-03 (ADR 작성, opus) 진행.
- DBM-03 은 audit §13.6 매핑대로 ADR 3 개 + 색인 + ADR-003 superseded 메모.

---


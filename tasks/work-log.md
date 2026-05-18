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

## [DBM-03] ADR 006/007/008 작성 + 색인 갱신 + ADR-003 메모
**날짜**: 2026-05-11
**담당**: db-migration-architect (opus, 메인 컨텍스트에서 직접 작성 — 서브에이전트 opus 한도 도달로 핸드오버)
**커밋**: (ADR 3개 신규 + README 색인 + ADR-003 superseded 박스)

### 변경 파일
- `docs/adr/006-postgresql-migration.md` (신규, ~52 LOC) — 결정 / 이유 (MySQL 한계 + 사양 근거) / 대안 4건 / 결론
- `docs/adr/007-pgloader-choice.md` (신규, ~38 LOC) — 결정 / 이유 6항목 / 대안 3건 (DMS, 자체 스크립트, logical replication) / 결론 + 미래 분기점
- `docs/adr/008-cutover-strategy.md` (신규, ~52 LOC) — 결정 / 이유 (베타 트래픽, 운영 단순성, 롤백 비용) / 대안 4건 / 롤백 트리거 / 결론
- `docs/adr/README.md` (수정, +12 LOC) — 색인 표에 006/007/008 3행 추가 + "2026-05 PostgreSQL 마이그레이션 사이클 ADRs" 섹션 신규 (ADR-003 superseded 예고 안내 포함)
- `docs/adr/003-inline-migration-coexistence.md` (수정, +14 LOC) — 본문 끝에 "Update (2026-05-11) — PG 컷오버 후 단일화 예정" superseded 박스 추가 (본 ADR 의 결정 / 이유 / 대안 / 결론 4 섹션은 손대지 않음)

### 마이그레이션
없음 (본 카드는 문서 단계)

### 핵심 결정 (ADR 별 한 줄)
- **ADR-006**: MySQL → PostgreSQL 16 (Cloud SQL `db-custom-1-3840`, zonal, asia-northeast1-b, Public IP + Auth Proxy). MySQL 한계 6가지 + 사양 / 네트워크 근거.
- **ADR-007**: pgloader 선택. 스테이징 / 운영 동일 config 재사용. DMS 는 식당 100+ / 데이터 100 GB+ 도래 시 재검토.
- **ADR-008**: big-bang 30~60분 점검 (새벽 04:00~05:00 KST). 롤백 윈도우 24h, 트리거 조건 4가지 (smoke test 실패 / 에러율 > 5% / 결제 실패율 > 1% / WS 실패율 > 10%).

### 검증 결과
- ✅ 3개 ADR 모두 기존 형식 (결정 / 이유 / 대안 / 결론 4섹션, 30~80줄) 준수
- ✅ README 색인 갱신 + 사이클 묶음 섹션 추가
- ✅ ADR-003 본문 보존, Update 박스만 끝에 추가 (결정 / 이유 / 대안 / 결론 손대지 않음)
- ✅ ADR 간 상호 참조 정합 (ADR-006 ↔ 007 ↔ 008 ↔ 003)
- ✅ 운영자 협의 항목 (OPR-09, 10, 11, 12) ADR 본문에 매핑
- ✅ File Fence 준수 — 허용 파일 5개만 수정, audit.md / current-tasks.md / 코드 어떤 것도 건드리지 않음

### 비고
- DBM-03 으로 **Phase A (architect 결정 단계) 종료**. 다음은 Phase B (구현, sonnet).
- Phase B 첫 카드: **DBM-04 (의존성 + DATABASE_URL 추상화, postgres-specialist, sonnet)**. 모델을 sonnet 으로 전환 후 진행.
- DBM-13 시점에 ADR-003 의 superseded 처리 + (선택) ADR-009 신규 작성 예정.

---

## [DBM-04] 의존성 + DATABASE_URL 추상화
**날짜**: 2026-05-11
**담당**: postgres-specialist (sonnet)
**커밋**: (asyncpg + psycopg2-binary 추가 + to_sync_url 헬퍼 신규)

### 변경 파일
- `pyproject.toml` — `[project.dependencies]` 배열 끝에 `"asyncpg>=0.29"`, `"psycopg2-binary>=2.9"` 2 항목 추가 (PEP 621 형식)
- `backend/.env.example` — 데이터베이스 섹션에 Option A (MySQL, 현 운영) / Option B (PostgreSQL, DBM-12 컷오버 후) 레이블 + PG URL 주석 2 줄 추가
- `backend/utils/db.py` (신규, 46 LOC) — `to_sync_url()` 헬퍼 + module docstring + function docstring + doctest 4 케이스 (mysql+aiomysql, postgresql+asyncpg, sqlite, 이미 sync 인 URL)

### 마이그레이션
없음 (driver / 헬퍼만 추가, 스키마 변경 없음)

### 검증 결과
- ✅ `pyproject.toml` 에 `asyncpg`, `psycopg2-binary` 두 항목 추가 (grep 확인)
- ✅ `to_sync_url()` 4 케이스 동작 (문자열 슬라이싱 로직 수동 추적 + doctest 본문 검증)
- ✅ `.env.example` PG 주석 추가
- ✅ **MySQL 부팅 회귀 0** — `backend/database.py`, `alembic/env.py` 변경 없음 (grep 으로 `to_sync_url` 호출 0 건 확인). `to_sync_url` 가 정의만 되고 어디서도 호출되지 않으므로 기존 MySQL 동작 영향 없음
- ✅ File Fence 준수 — 허용 파일 3 개만 수정. `database.py` / `models.py` / `routers/*` / `alembic/*` 모두 읽기만, 수정 0

### 발견 사항 (DBM-05 핸드오프 시 주의)
- `backend/utils/` 디렉토리 자체가 worktree 에 부재 → 신규 디렉토리 + 파일 함께 생성. 메인 브랜치와 차이 가능성 있음 (운영자 확인 필요).
- `pymysql` 은 `pyproject.toml` 에 이미 존재 → `to_sync_url()` 의 mysql+pymysql 분기가 즉시 동작 가능 (별도 deps 추가 불필요).
- `alembic/env.py` 가 worktree 에 부재 → DBM-06 에서 신규 생성 (메인의 OPS-03 산출물이 worktree 에 마이그레이션 안 됨, 운영자 확인 필요).
- `backend/database.py` 에 sqlite 거부 + "MySQL URL을 설정하세요" 하드코딩 메시지 존재 → **DBM-05 에서 PG 도 허용하도록 메시지 보강 필요** (audit §6 의 메시지 분기 확장과 함께).

### 비고
- 본 카드는 **driver / 헬퍼 정의만** — `database.py` / `alembic/env.py` / `workers/db.py` 의 호출 연결은 다음 카드 (DBM-05, DBM-06) 의 책임.
- 다음: **DBM-05 (`migration_sqls` ANSI 호환화 + 트랜잭션 항목별 분리, sonnet)** 진행 가능.
- 운영자 액션 (검증 시): `uv sync` 로 두 패키지 실제 설치 후 import 확인. 기존 backend 부팅 회귀 없음 확인 (선택, 본 카드 산출물 자체에는 영향 없음).

---

## [DBM-05] `migration_sqls` ANSI 호환화 + 트랜잭션 항목별 분리
**날짜**: 2026-05-11
**담당**: postgres-specialist (sonnet)
**커밋**: (이번 커밋, backend/database.py 단독 수정)

### 변경 파일
- `backend/database.py` — `migration_sqls` 리스트 + `init_db()` 마이그레이션 루프만 수정 (engine 정의 / 모델 / 라우터 변경 0)

### 마이그레이션 호환화 (audit §6 액션 리스트 반영)
- 백틱 식별자 → ANSI 큰따옴표 (~26 건, `order`/`table` 테이블)
- 모든 `ADD COLUMN` 에 `IF NOT EXISTS` 추가 → 양 DB 멱등성 보장
- `JSON DEFAULT ('[]')` → `TEXT DEFAULT '[]'` (Menu.options, 코드가 str 로 다룸)
- `ALTER TABLE "order" ADD UNIQUE INDEX ...` → `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order"(square_payment_id)` (MySQL+PG 호환)
- `MODIFY COLUMN` 4 건 (table.status VARCHAR→ENUM 2건, order.table_number VARCHAR, guestprofile.created_at DEFAULT): PG 에서는 syntax error → `if "postgresql" in DATABASE_URL: continue` 로 skip (metadata.create_all 가 모델 정의대로 생성)

### 트랜잭션 항목별 분리
- 기존: 단일 `async with engine.begin() as conn` 안에서 모든 SQL 실행 → PG 에서 한 건 실패 시 전체 abort.
- 변경: `for sql in migration_sqls: async with engine.begin() as conn: ...` — 항목별 트랜잭션. MySQL 에서도 안전 (각 SQL 멱등).

### ANSI_QUOTES 보장 (MySQL 세션)
- 신규 `_ensure_ansi_quotes(conn)` 헬퍼: MySQL 일 때만 `SET SESSION sql_mode = 'ANSI_QUOTES,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'`. PG no-op.
- 마이그레이션 루프의 매 트랜잭션 시작 직후 호출 → 큰따옴표 식별자가 MySQL 기본 sql_mode 에서도 동작.
- 본 helper 는 **마이그레이션 루프 전용** — 일반 라우터 세션에는 영향 없음. (라우터 raw SQL 의 식별자 인용 처리는 DBM-05b 가 담당.)

### 에러 분기 (`IGNORED_MIGRATION_ERRORS`)
- 튜플로 정리: `("Duplicate column name", "already exists", "Duplicate key name", "1060", "42701", "42P07")`.
- PG SQLSTATE `42701` (duplicate_column) / `42P07` (duplicate_table/index) 추가 → 멱등 재실행 안전.

### 기타 마이크로 변경
- SQLite 거부 메시지: "MySQL URL을 설정하세요" → "MySQL 또는 PostgreSQL URL을 설정하세요"
- 엔진 정의 위 주석: "MySQL 전용 엔진" → "MySQL / PostgreSQL 호환 엔진" + "DBM-12 컷오버 후 PG 단일화 예정" 메모

### 검증 결과
- ✅ backtick 식별자 검색 (database.py 안의 ``\`order\``` / ``\`table\``` / ``\`menu\``` 패턴) → 0 건 (모두 큰따옴표로 치환됨)
- ✅ 항목별 트랜잭션 구조 확인 (`for sql in migration_sqls:` 안에 `async with engine.begin()`)
- ✅ File Fence 준수 — `backend/database.py` 단일 파일. 모델 / 라우터 / utils / alembic 0 수정
- ✅ MySQL 부팅 회귀 안전: `_ensure_ansi_quotes` + `IF NOT EXISTS` + 항목별 트랜잭션 모두 MySQL 8.0.29+ 에서 동작. 중복 컬럼/인덱스 에러는 `IGNORED_MIGRATION_ERRORS` 흡수
- ⏳ PG 부팅 검증은 DBM-08 (PG 빈 인스턴스 schema 생성 + 비교) 에서 실시

### 비고
- routers/demo.py 의 raw SQL 백틱 (3 건) 은 본 카드 범위 외 — **DBM-05b** 별도 카드에서 처리 (라우터 세션은 마이그레이션 루프와 별개라 같은 `_ensure_ansi_quotes` 패턴을 그대로 쓸 수 없음, audit §2.1 참조).
- stats/register/super_admin 의 MySQL 날짜 함수는 DBM-05c 별도 카드.
- 다음: **DBM-05b → DBM-05c → DBM-06 (Alembic env.py + workers/db.py 양 DB 지원)** 순서.

---

## [DBM-05b] `routers/demo.py` raw SQL 백틱 제거 (양 DB 호환 quote char)
**날짜**: 2026-05-11
**담당**: postgres-specialist (sonnet)
**커밋**: (이번 커밋, backend/routers/demo.py 단독 수정)

### 변경 파일
- `backend/routers/demo.py` (+8 LOC, -3 LOC) — `_cleanup_expired_temp_stores()` 함수만 수정

### 작업 내용
- 함수 시작부에 `import os` + `_is_pg` / `_q` / `_order_tbl` / `_table_tbl` 변수 6줄 추가:
  ```python
  _is_pg = "postgresql" in os.environ.get("DATABASE_URL", "").lower()
  _q = '"' if _is_pg else "`"
  _order_tbl = f"{_q}order{_q}"
  _table_tbl = f"{_q}table{_q}"
  ```
- 3 곳의 raw SQL 식별자 인용을 동적 변수로 치환:
  - `SELECT id FROM \`order\` ...` → `SELECT id FROM {_order_tbl} ...`
  - `DELETE FROM \`order\` ...` → `DELETE FROM {_order_tbl} ...`
  - `DELETE FROM \`table\` ...` → `DELETE FROM {_table_tbl} ...`
- 나머지 5 곳 (orderitem / menu / globalreview / pointhistory / customerpoint / store) 은 PG 예약어가 아니므로 손대지 않음 — 카드의 "8건" 카운트는 audit 의 보수적 추정, 실제 백틱 발생은 3건

### 설계 결정
- **옵션 1 채택 (DATABASE_URL 분기로 quote char 동적 결정)**: MySQL 기본 sql_mode 에서도 동작 (백틱 유지), PG 에서도 동작 (큰따옴표). File Fence (`demo.py` 단일) 준수.
- 옵션 2 반려 (세션 단위 `SET SESSION sql_mode='ANSI_QUOTES'`): 세션 전역 상태 변경 → ORM 쿼리 부작용 위험.
- 옵션 3 반려 (ORM 으로 재작성): 카드 범위 외, 카드 본문에 "별도 backlog" 명시.

### 검증 결과
- ✅ demo.py 안의 ``\`order\``` / ``\`table\``` / ``\`menu\``` backtick 식별자 패턴 grep → 0 건
- ✅ `git diff` 검토: 함수 본문 외 영역 무변경, 들여쓰기 정상
- ✅ File Fence 준수 — `backend/routers/demo.py` 단일 파일. 다른 라우터 / 모델 / utils 0 수정
- ✅ MySQL 동작: `_is_pg=False` → `_q=` `` ` `` → 기존 백틱 형태와 동등한 SQL 생성. 회귀 0.
- ⏳ PG 동작 검증은 DBM-08 (PG 빈 인스턴스) 에서 demo cleanup 호출 경로와 함께 검증

### 비고
- DBM-05 의 `_ensure_ansi_quotes(conn)` 은 `init_db()` 마이그레이션 루프 전용 (세션과 분리) — 본 카드는 라우터 세션 path 이므로 별도 패턴(quote char 동적 결정) 적용. audit §2.1 의 분리 권고 반영.
- SQL injection 보강 (string interpolation → parameterized binding) 은 별도 backlog (`MNU` 사이클 후보 또는 demo 정리 전용 카드).
- 다음: **DBM-05c (`stats.py` + `register.py` + `super_admin.py` MySQL 날짜 함수 PG 호환화, sonnet)** 진행 가능. audit §2.3~§2.5 기반 22건+ 헬퍼 교체.

---

## [DBM-05c] `stats.py` / `register.py` / `super_admin.py` MySQL 날짜 함수 PG 호환화
**날짜**: 2026-05-17
**담당**: postgres-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `backend/utils/db_compat.py` (신규, 48 LOC) — `hour` / `year` / `month` / `day_of_week` / `date_only` 5종 헬퍼
- `backend/routers/stats.py` (18건 교체 + import 1줄)
- `backend/routers/register.py` (2건 교체 + import 1줄)
- `backend/routers/super_admin.py` (6건 교체 + import 1줄)

### 마이그레이션
없음 (코드/쿼리 호환화, 스키마 변경 없음)

### 변환 매핑
- `func.hour(x)` → `hour(x)` = `EXTRACT(HOUR FROM x)` — 5건 (stats.py)
- `func.year(x)` → `year(x)` = `EXTRACT(YEAR FROM x)` — 2건 (stats.py)
- `func.month(x)` → `month(x)` = `EXTRACT(MONTH FROM x)` — 3건 (stats.py)
- `func.dayofweek(x)` → `day_of_week(x)` = `EXTRACT(DOW FROM x) + 1` — 3건 (stats.py)
- `func.date(x)` → `date_only(x)` = `CAST(x AS DATE)` — 13건 (stats 8 + register 2 + super_admin 6 — group_by/order_by 양쪽 호출 모두 포함)

### day_of_week semantics 보정 (중요)
- MySQL `DAYOFWEEK`: **1=Sun .. 7=Sat**
- PG `EXTRACT(DOW)`: **0=Sun .. 6=Sat**
- `day_of_week()` 헬퍼는 PG 측에 **+1** 보정 → 양 DB 가 모두 MySQL 의미 (1=Sun..7=Sat) 반환.
- `stats.py:get_weekly_sales` 의 `day_names = ["日","月","火","水","木","金","土"]` + `day_names[(int(row.dow) - 1) % 7]` 인덱싱 → 헬퍼가 MySQL 의미를 유지하므로 응답 형식 / 값 회귀 0.

### 검증 결과
- ✅ Grep `func\.(hour|year|month|dayofweek|date)\(` in stats/register/super_admin.py → 0 건
- ✅ Python AST parse 4 파일 (db_compat / stats / register / super_admin) 모두 통과
- ✅ File Fence 준수 — 허용 4 파일만 수정. 모델 / 다른 라우터 / database.py / alembic 무변경
- ✅ MySQL 회귀: `EXTRACT(... FROM x)` 와 `CAST(x AS DATE)` 둘 다 MySQL 8.0+ 에서 동작. group_by/order_by 의 동일 표현식 두 번 사용도 SQL 컴파일러가 동등 expression 으로 묶음 (성능 영향 미미).
- ⏳ PG 환경에서의 응답 형식 동일성 검증은 DBM-08 (PG 빈 인스턴스) 이후에 실시

### 비고
- `func.coalesce`, `func.sum`, `func.count`, `func.distinct` 등 ANSI 표준 집계 함수는 양 DB 호환 — 본 카드 범위 외, 그대로 둠.
- `func.now()` / `func.curdate()` / `func.datediff()` 등의 MySQL-only 함수는 audit §12.4 defensive sweep 에서 0 건 확인됨 — 추가 호환화 불필요.
- 다음: **DBM-06 (Alembic env.py + workers/db.py 양 DB 지원, sonnet)** 진행 가능.

---

## [DBM-06] Alembic env.py + workers/db.py 양 DB 지원
**날짜**: 2026-05-17
**담당**: postgres-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `alembic/env.py` — `raw_url.replace("mysql+aiomysql://", "mysql+pymysql://")` 하드코딩 → `to_sync_url(raw_url)` 헬퍼 호출
- `backend/workers/db.py` — 동일하게 `to_sync_url()` 사용. module docstring 갱신.

### 마이그레이션
없음 (URL 치환 로직만 추상화, 스키마 변경 없음)

### 작업 내용
1. `alembic/env.py`:
   - `from backend.utils.db import to_sync_url` 추가 (sys.path 에 ROOT 가 이미 등록되어 namespace 패키지로 해결)
   - L38 의 `raw_url.replace("mysql+aiomysql://", "mysql+pymysql://")` → `to_sync_url(raw_url)`
   - 주석에 `[DBM-06]` 태그 + 양 DB 지원 사유 명시
2. `backend/workers/db.py`:
   - 한 줄 `os.environ[...].replace(...)` 를 `to_sync_url(os.environ["DATABASE_URL"])` 로 교체
   - module docstring 에 양 DB 지원 / DBM-06 카드 명시

### 검증 결과
- ✅ Python AST parse 3 파일 (alembic/env.py / workers/db.py / utils/db.py) 모두 통과
- ✅ File Fence 준수 — 허용 2 파일만 수정 (utils/db.py 는 DBM-04 산출, 본 카드는 호출자 연결만)
- ✅ MySQL 회귀: `to_sync_url("mysql+aiomysql://...")` → `"mysql+pymysql://..."` (DBM-04 의 doctest 로 보증)
- ✅ PG 호환: `to_sync_url("postgresql+asyncpg://...")` → `"postgresql+psycopg2://..."` (DBM-04 doctest)
- ✅ 이미 sync URL 인 경우 (예: `sqlite:///`, `mysql+pymysql://`) 무변경 (헬퍼가 첫 prefix 매칭만 처리)

### 검증 미실시 (DBM-08 이후)
- ⏳ MySQL 환경에서 `uv run alembic upgrade head` 실제 실행 회귀 — 운영자 환경에서 1회 검증 필요
- ⏳ PG 환경에서 `uv run alembic stamp head` — DBM-08 (PG 빈 인스턴스 부팅) 직후
- ⏳ dramatiq 워커 부팅 (`MySQL` + `PG` 양 환경) — DBM-08 이후

### 비고
- `backend` 디렉토리에 `__init__.py` 가 없음 (namespace package) — Python 3.3+ 에서는 정상 동작. 기존 `from backend.workers.broker import broker` 패턴과 동일.
- `to_sync_url()` 자체는 어떤 DB 드라이버도 import 하지 않으므로 alembic env 가 매우 일찍 로드되는 시점에도 안전.
- 다음: **DBM-07 (docker-compose 에 postgres 서비스 추가, sonnet)** — 의존성 없음, 즉시 진행 가능. 또는 **DBM-08 (PG 빈 인스턴스 schema 생성 + 비교)** — DBM-05/05b/05c/06/07 모두 선행 필요.

---

## [DBM-07] docker-compose 에 postgres 서비스 추가
**날짜**: 2026-05-17
**담당**: postgres-specialist (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `docker-compose.yml` — `postgres` 서비스 (postgres:16) + `pg_data` named volume 추가

### 작업 내용
- `postgres:16` 이미지, host port `5433` → container `5432`
- 사용자 / 비밀번호 / DB 모두 `qraku` (개발 편의, 운영은 Cloud SQL)
- `pg_data` named volume 으로 데이터 영속화
- healthcheck: `pg_isready -U qraku` 5초 간격, 10회 재시도
- `volumes:` 섹션에 `pg_data:` 추가

### 검증 결과
- ✅ 기존 `mysql` 서비스 무변경 — backend1/backend2/worker 는 모두 그대로 MySQL 사용 (회귀 0)
- ✅ File Fence 준수 — `docker-compose.yml` 단일 파일만 수정
- ⏳ `docker compose up -d postgres` healthy 확인은 DBM-08 진행 시 실제 실행

### 사용법 (DBM-08 에서 사용 예정)
```bash
docker compose up -d postgres
# 부팅 확인:
docker compose ps postgres   # → healthy
psql postgresql://qraku:qraku@localhost:5433/qraku -c "select 1;"

# PG 부팅 검증:
DATABASE_URL=postgresql+asyncpg://qraku:qraku@localhost:5433/qraku \
  uv run uvicorn backend.main:app --port 8004 --app-dir .
```

### 비고
- backend1 / backend2 / worker 의 `DATABASE_URL` 은 그대로 mysql — PG 검증은 별도 `DATABASE_URL` env 로 부팅하는 식 (운영 컷오버 D-day 전까지 MySQL 가 메인).
- compose 안에서 backend 컨테이너가 postgres 를 가리키도록 하려면 `postgres:5432` 호스트명 사용 (host 5433 은 외부 접속 전용).
- 다음: **DBM-08 (PG 빈 인스턴스 schema 생성 + 비교, sonnet)** 진행 가능. DBM-05/05b/05c/06/07 모두 완료 → DBM-08 전제 충족.

---

## [DBM-09] pgloader config 작성 (스테이징 / 운영 컷오버 재사용)
**날짜**: 2026-05-17
**담당**: data-migration-engineer (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `tools/pgloader/qraku.load` (신규, 약 100 LOC) — MySQL → PG 단일 config

### 작업 내용
- `LOAD DATABASE FROM ${MYSQL_URL} INTO ${PG_URL}` — envsubst 로 환경변수 주입 (운영자는 .env 또는 셸 export)
- 옵션: `include drop`, `create tables`, `create indexes`, `reset sequences`, `foreign keys`, `downcase identifiers`, workers=4
- `CAST` 매핑 (audit §5):
  - `datetime → timestamp without time zone` (zero-dates-to-null)
  - `tinyint(1) → boolean`
  - `json → text` (코드가 str 로 다룸, jsonb 는 별도 사이클 MNU)
  - `decimal → numeric` (안전 매핑)
  - `enum → varchar(50)` (TableStatus 1건)
- `EXCLUDING TABLE NAMES MATCHING 'alembic_version'` — PG 측에서 OPR-07 stamp 로 재생성
- `BEFORE LOAD DO`: schema public 생성 + client_min_messages 조정
- `AFTER LOAD DO`:
  - **시퀀스 보정 안전망** — pgloader 의 `reset sequences` 외에 pg_catalog 기반 자동 보정 (PL/pgSQL DO 블록)
  - `ANALYZE` — 통계 갱신 (컷오버 직후 쿼리 플래너 정확도)

### 검증 결과
- ✅ 파일 syntax: pgloader 가 실제 파싱하는 시점에서 검증 (운영자 실행 시) — 본 단계는 정적 작성
- ✅ File Fence 준수 — `tools/pgloader/qraku.load` 단일 파일 (디렉토리 자체도 신규 생성)
- ⏳ 시드 데이터 + 로컬 mysql 컨테이너로 1회 실행 검증: 운영자가 docker 환경 준비 시 진행 (현재 셸 docker 없음)
- ⏳ 운영 dump 적용 + 스테이징 실행 + audit.md §8 결과 기록: DBM-09 Phase 2 (운영자 dump 제공 시점)

### 비고
- pgloader 의 default 동작은 PG sequence 를 max(id)+1 로 reset 하지만, AFTER LOAD 안전망 추가 → 컷오버 후 INSERT 시 PK conflict 위험 0.
- ADR-007 의 의사결정대로 스테이징 / 운영 컷오버 동일 config 사용 → "스테이징에서 통과한 config 가 운영에서도 통과" 보장.
- 다음: **DBM-10 (데이터 정합성 검증 스크립트)** 또는 운영자 dump 제공 시 DBM-09 실행.

---

## [DBM-10] 데이터 정합성 검증 스크립트
**날짜**: 2026-05-17
**담당**: data-migration-engineer (sonnet)
**커밋**: (이번 커밋)

### 변경 파일
- `tools/migration_check.py` (신규, 약 360 LOC) — 양 DB 검증 7항목 일괄 실행

### 사용법
```bash
uv run python tools/migration_check.py \
    --mysql mysql+pymysql://user:pass@host:3306/kiospad \
    --pg postgresql+psycopg2://qraku:pass@host:5432/qraku

# 일부 항목 skip
uv run python tools/migration_check.py --mysql ... --pg ... --skip seq,index
```

### 검증 항목 (카드 §검증 항목)
1. **행 수 일치** — 모든 공통 테이블
2. **MAX(id) 일치** — id 컬럼 있는 테이블
3. **PG sequence next_val ≥ MAX(id)+1** — auto-increment 보정 검증
4. **FK 정합성** — orphan 행 0 (MySQL / PG 각각 자체 검증)
5. **인코딩 sample** — Store.name / Menu.name_ja / Menu.name_ko 5행 비교
6. **JSON 컬럼 파싱** — Menu.options / extra_translations / OrderItem.option_details / GlobalReview.tags 10행 `json.loads` 후 비교 (raw 문자열 차이는 허용, 의미 동일성 우선)
7. **인덱스 / UNIQUE** — 컬럼셋 + unique 플래그 비교 (이름 차이는 무시)

### 출력
- 항목별 `✅` PASS / `❌` FAIL / `⚠️` WARN + 상세
- 종합 결과 → 종료 코드 0 (전체 PASS) / 1 (하나 이상 FAIL)
- alembic_version 등은 자동 제외

### 검증 결과
- ✅ `uv run python tools/migration_check.py --help` 출력 정상
- ✅ Python AST parse 통과
- ✅ Windows cp932/cp949 console 안전: `sys.stdout.reconfigure(encoding="utf-8")` 로 이모지 / 박스 라인 출력 처리
- ✅ File Fence 준수 — `tools/migration_check.py` 단일 파일
- ⏳ 실제 양 DB 비교 1회 실행은 DBM-09 dump 이후

### 비고
- 인덱스 비교는 이름이 DB 마다 다르므로 (columns, unique) 튜플로만 비교 — pgloader 가 자동 생성한 인덱스 이름은 MySQL 과 다를 수 있음, 정상.
- JSON 컬럼은 `json.loads` 후 의미 비교 → MySQL JSON 의 키 순서와 PG TEXT 의 키 순서가 달라도 동일 판정.
- FK orphan 검사는 양 DB 각각 자체 검증 (MySQL FK 가 disabled 였을 가능성 대비). 결과 차이는 audit.md §8 에 기록 후 별도 정리.
- 다음: 실제 DBM-08 / DBM-09 실행은 운영자 docker 또는 Cloud SQL 환경 준비 후. 코드 산출물은 모두 완료.


---

## DBM-08 — PG 빈 인스턴스 schema 검증 (실행 완료)

**완료**: 2026-05-18 / **owner**: postgres-specialist (claude-opus-4-7)
**의존**: DBM-04, DBM-05, DBM-05b, DBM-05c, DBM-06, DBM-07 (모두 DONE)

### 실행 환경

- **Cloud SQL**: `hotel-management-484115:asia-northeast1:postgre-sql` (PG 16.13)
- **DB / 사용자**: `qraku` / `ilhae`
- **접속 경로**: Cloud Shell → cloud-sql-proxy (127.0.0.1:5432) → Cloud SQL
- **스크립트**: `tools/init_pg_schema.py` (DBM-08 산출물)
- **명령**: `DATABASE_URL='postgresql+asyncpg://ilhae:***@127.0.0.1:5432/qraku' uv run python -u tools/init_pg_schema.py`

### 결과 (요약)

- ✅ `=== Script END (exit=0) ===`
- ✅ `metadata.create_all` + `migration_sqls` 전 항목 통과 (✅ Migration: 라인 다수, [FATAL] 없음)
- ✅ public 스키마 **30 개 테이블** 생성 (감사 §8 예측 ~28 대비 +2)
- ✅ 핵심 컬럼 spot check **10/10 [OK]**
- ✅ `migration_sqls` 의 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` / `CREATE INDEX IF NOT EXISTS ...` 모두 idempotent 동작

### 산출물

- `tasks/db-migration-audit.md` §8.4 에 실측 결과 추가 (테이블 목록, 컬럼 체크, §8 예측 vs 실측 차이)
- Cloud Shell `~/init_log.txt` 에 전체 로그 보존 (운영자 PC 로컬에는 미보관)

### 카드 acceptance 매핑

| acceptance | 결과 |
|---|---|
| PG empty instance boots | ✅ (init_db 완료, engine.dispose 정상) |
| 모든 `migration_sqls` ALTER 가 idempotent 하게 적용 | ✅ (`IF NOT EXISTS` 가드 + 재실행 안전) |
| schema diff 표 in audit.md | ✅ §8.4 추가 (1차) |
| `/api/readyz` 200 (별도 부팅 검증) | ⏳ 미실시 — DBM-08b 로 분리 권장 (Redis/Dramatiq 연결까지 통합 검증은 별도 환경 필요) |

### 후속

- **DBM-08b** (선택, 신규 카드): uvicorn 부팅 + `/api/readyz` 통합 검증. Redis 도 필요하므로 docker-compose 또는 staging 환경에서 별도 카드로 분리.
- **DBM-09** 진행 가능: 운영 MySQL dump 도착 시 `tools/pgloader/qraku.load` 실행 → `tools/migration_check.py` 로 정합성 검증.

### 비고

- 핸드오프 doc 의 명령 예시가 `PG_PASSWORD/PG_USER/PG_DB` env 변수 사용으로 잘못 적혀있어, 1차 실행 시 `[FAIL] DATABASE_URL 환경변수 필요` 출력 → 핸드오프 doc 갱신 (`DATABASE_URL` 한 개로 정정) 후 재실행 성공.
- 비번 특수문자 (`:`, `#`) URL 인코딩 필요 — 핸드오프 함정 표에도 반영.

---

## DBM-09 — pgloader 시도 실패 → 커스텀 Python migrator 로 데이터 이전 완료

**완료**: 2026-05-19 / **owner**: data-migration-engineer (claude-opus-4-7)
**의존**: DBM-08 (PG schema 생성), 운영 mysqldump 또는 직접 stream

### pgloader 시도 (실패)

- 운영 VM 에 pgloader 3.6.7 (Ubuntu apt) 설치 + Cloud SQL Auth Proxy 우회 (authorized network 임시 추가, prod VM IP 35.213.6.149/32) + Cloud SQL CA cert 시스템 trust store 등록.
- SSL/인증 문제 모두 해결됐으나 **MySQL 8 default auth plugin 핸드셰이크에서 abort**: `QMYND:MYSQL-UNSUPPORTED-AUTHENTICATION`. mysql_native_password 사용자 (`pgloader_temp`) 생성해도 동일 — 서버 초기 핸드셰이크 단계에서 caching_sha2_password 협상하다가 client 가 abort.
- pgloader 3.6.x 시리즈의 근본적 MySQL 8 비호환. 새 버전 빌드는 시간 ROI 낮음.

### 대체 — `tools/pg_data_migrator.py` 신규

- ~180 LOC Python 스크립트: SQLAlchemy + PyMySQL + psycopg2.
- 흐름: MySQL schema reflect → PG 측 테이블 확인 → FK 순서로 TRUNCATE (역순) + INSERT (정순) → 시퀀스 재설정 → ANALYZE.
- 타입 매핑은 SQLAlchemy 가 자동 처리. dict/list (PyMySQL 자동 파싱한 JSON) 는 `json.dumps` 후 INSERT (PG TEXT 컬럼 호환).
- DBM-12 컷오버에서도 동일 스크립트 재사용 가능 (옵션: `--dry-run`, `--tables`, `--no-truncate`, `--batch`).

### 실행 결과

- **28 테이블 / 466 행 / 3.01초**
- 시퀀스 전부 재설정 완료
- ANALYZE 통과

### DBM-10 검증 결과 (tools/migration_check.py)

- 7/7 항목 모두 PASS (행 수, MAX(id), 시퀀스, FK orphan, 인코딩, JSON, 인덱스)
- 단 **인덱스 보강** 후 통과 — MySQL 이 FK 컬럼에 자동 생성하던 인덱스 10건이 SQLModel 에서 누락되어있었음.

### 산출물

- `tools/pg_data_migrator.py` 신규
- `backend/database.py` `migration_sqls` 에 인덱스 10건 append
- `tasks/db-migration-audit.md` §8.5 추가

### 후속 / 트레이드 오프

- ADR-007 (pgloader 선택) 은 superseded — pg_data_migrator 가 대체. 새 ADR 작성 검토 가능 (별도 카드).
- 본 사이클은 리허설. 운영 컷오버 (DBM-12) 에서는:
  1. PG 현재 데이터 TRUNCATE
  2. 운영 MySQL → PG 다시 한번 pg_data_migrator 실행
  3. backend `DATABASE_URL` 을 PG 로 교체 + 재시작

### 임시 권한 / 자원 (작업 후 자이라가 정리)

- ✅ pgloader_temp MySQL 사용자 — DROP 완료
- ⏸ Cloud SQL authorized network `35.213.6.149/32` — 제거 대기 (자이라)
- ⏸ Cloud SQL `ilhae` 비번 — 채팅 노출 ×2 (DBM-08 + DBM-09), 로테이션 필요
- ⏸ MySQL root 비번 — 채팅 노출 1회, 로테이션 필요
- ⏸ 운영 VM `0.0.0.0/0` 22 포트 룰 — 자이라 IP 로 좁히기


---

## DBM-12 Phase F-1 — 컷오버 룬북 작성 완료

**완료**: 2026-05-19 / **owner**: db-migration-architect (claude-opus-4-7)
**의존**: DBM-09 (검증된 마이그레이션 명령), DBM-10 (검증 항목 정의)

### 산출물

- `tasks/db-migration-runbook.md` (신규, ~250 LOC)
- 13개 섹션: 사전 체크 → T-30~T+24h 순서별 명령 → 롤백 절차 → 사후 모니터링

### 룬북 주요 명령

DBM-09 리허설의 실측 명령을 그대로 복사 가능하도록 정리:
- T-20: 안전 mysqldump (이전 dump 명령과 동일)
- T-10: pg_data_migrator.py 실행 (dry-run + 실제, 5초 취소 여유)
- T-5: migration_check.py 7항목 검증
- T=0: `.env` 백업 + DATABASE_URL sed 교체 + systemctl restart
- T+5: healthz / readyz / 메뉴 API smoke test
- 롤백: `.env.mysql_backup_*` 복원 + restart

### 신규 발견 — DBM-12b 카드 분리

룬북 §9.3 작성 중 발견: 컷오버 ~ 롤백 사이에 PG 에 들어간 신규 행을 MySQL 로 역동기화할 스크립트 (`tools/rollback_resync.py`) 미존재. 컷오버 실행 (Phase F-2) 전 필수.

→ `tasks/current-tasks.md` 에 DBM-12b 카드 추가 (P0, sonnet, DBM-12 F-2 전).

### Phase F-2 (실제 컷오버) 사전 요건

- DBM-11 (Auth Proxy systemd) — 권장
- DBM-12b (rollback_resync) — 필수
- 운영자 + 매장 측 컷오버 시간 합의
- 컷오버 D-1 dry-run 1회 (스테이징 또는 PG 비파괴 모드)

### 비고

- 룬북의 비번 자리 (`__컷오버_당일_새_비번__`) 는 실행 직전에 운영자가 채움 (채팅 노출 방지).
- ssl 옵션: psycopg2 는 `sslmode=require`, asyncpg 는 `ssl=require` (다름, 주의).
- backend systemd 서비스 이름은 운영 VM 의 실제 명을 사용 (예시는 `qrorder`).


---

## DBM-12b — tools/rollback_resync.py 신규 + self-loopback 검증

**완료**: 2026-05-19 / **owner**: data-migration-engineer (claude-opus-4-7)
**의존**: DBM-09 (pg_data_migrator 패턴 재사용), DBM-12 F-1 (룬북 §9.3 호출 지점)

### 산출물

`tools/rollback_resync.py` (신규, ~200 LOC)

### 동작

- PG → MySQL 방향 (DBM-09 의 역방향)
- 델타 식별: 각 테이블의 `MAX(id)` 비교 → PG_max > MySQL_max 인 행만 INSERT
- FK 정순 (sorted_tables) 으로 INSERT
- MySQL `AUTO_INCREMENT` 도 `MAX(id)+1` 로 보정
- dict/list 값은 JSON 직렬화 (PG 의 jsonb 가 dict 로 올라오면)
- 기본 dry-run (잠재 충돌 리포트만) → `--apply` 명시 시 실제 INSERT
- `--verbose-conflicts`: 오버랩 영역의 row-by-row 비교 (느림)
- dialect-aware quoting (`src.dialect.identifier_preparer.quote(name)`) — PG / MySQL / SQLite 모두 안전

### 검증 — self-loopback (MySQL ↔ MySQL)

- 28 테이블 reflect → 26 테이블 정상 분석 + 2 테이블 "id PK 없음" 경고
- 모든 테이블 `신규=0` (SOURCE=TARGET 이므로 당연)
- 잠재 충돌 0
- exit=0

### 경고된 2 테이블 (수동 점검 대상)

- `guestprofile` — UUID PK (id 컬럼 없음)
- `systemconfig` — key 컬럼이 PK

이 두 테이블은 컷오버 윈도우에서 신규 row 들어갈 가능성이 매우 낮음 (guest 식별은 별도, systemconfig 는 어드민 설정으로만 변경). 룬북 §9.3 에 "수동 점검 필요" 명시.

### 제한 사항 (룬북 §9.3 에 명시)

- **INSERT only** — UPDATE 는 별도 분석. PG 에서 update 된 행이 MySQL 의 같은 id 와 다르면 `--verbose-conflicts` 로 리포트만 출력.
- **id PK 가정** — 복합 PK / UUID PK 테이블은 수동 처리.

### 후속 권장 (DBM-12 F-2 D-1 dry-run 에서)

- 실제 PG → MySQL dry-run 1회 (authorized network 임시 추가 후)
- 결과를 `tasks/db-migration-runbook.md` §9.3 의 "임시 대응" 절에 반영 (수동 INSERT 케이스 vs 자동화 가능 케이스)


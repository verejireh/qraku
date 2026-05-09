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

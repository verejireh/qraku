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

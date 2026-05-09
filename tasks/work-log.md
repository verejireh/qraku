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

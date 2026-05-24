# PostgreSQL Cutover Stabilization Survey

작성일: 2026-05-21
대상 worktree: `stabilize/post-pg-cutover`
상태 전제: MySQL 에서 PostgreSQL 로 이전 완료

## 목적

PostgreSQL 컷오버 이후 코드, 설정, 문서, 테스트에 남아 있는 MySQL/SQLite 전제와 운영 리스크를 제거한다. 이 문서는 바로 수정해야 할 항목을 먼저 정리한 조사 메모다.

## 우선 수정 사항

### 1. `docker-compose.yml` 기본 DB를 PostgreSQL로 전환

현재 `docker-compose.yml`에는 `mysql` 서비스가 기본으로 남아 있고, `backend1`, `backend2`, `worker`의 `DATABASE_URL`도 `mysql+aiomysql://...`로 설정되어 있다.

수정 방향:
- `postgres` 서비스를 기본 DB로 사용하도록 `DATABASE_URL=postgresql+asyncpg://...`로 교체
- backend/worker의 `depends_on`을 `mysql`이 아니라 `postgres` 기준으로 정리
- `mysql_data` 볼륨과 MySQL 헬스체크가 더 이상 필요 없는지 확인 후 제거 또는 명확히 legacy로 분리
- 주석의 "기존 mysql 서비스와 동시 운영 가능" 문구를 컷오버 완료 상태에 맞게 갱신

### 2. `backend/.env.example`을 PostgreSQL 기준으로 갱신

현재 예시는 MySQL URL을 기본값처럼 보여준다.

수정 방향:
- 기본 예시를 `postgresql+asyncpg://qraku:***@localhost:5432/qraku`로 변경
- MySQL 예시는 제거하거나 "pre-cutover legacy only"로 격하
- Cloud SQL Proxy 사용 시 `127.0.0.1:5432` 예시를 함께 제공

### 3. 배포 문서의 MySQL 운영 절차 제거/갱신

`docs/deployment.md`에는 MySQL 설치, `mysqldump`, `mysql.service`, MySQL slow query log 등 컷오버 전 운영 절차가 아직 많이 남아 있다.

수정 방향:
- 신규 배포 절차를 PostgreSQL/Cloud SQL 기준으로 재작성
- 백업/복구 절차를 Cloud SQL 백업, PITR, `pg_dump`/`psql` 기준으로 변경
- `mysql.service` 의존성 설명을 PostgreSQL 또는 Cloud SQL Proxy 의존성으로 변경
- 컷오버 관련 섹션은 "이미 완료됨" 상태에 맞게 사후 운영 절차로 정리

### 4. 아키텍처 문서의 DB 설명 갱신

`docs/architecture.md`는 여전히 "FastAPI + SQLModel + aiomysql", "MySQL 강제", `mysql+pymysql` 등의 설명을 포함한다.

수정 방향:
- 런타임 DB를 PostgreSQL + `asyncpg`로 변경
- Alembic/worker sync 경로는 `postgresql+psycopg2`로 설명
- MySQL 중심 다이어그램과 환경변수 설명을 PostgreSQL 기준으로 수정

### 5. 백엔드 내부 문서 `backend/claude.md` 갱신

`backend/claude.md`에 MySQL 전용, `aiomysql`, SQLite 런타임 금지 등의 오래된 설명이 남아 있다.

수정 방향:
- `database.py` 설명을 PostgreSQL 기본, SQLite 금지로 정리
- `DATABASE_URL` 예시를 `postgresql+asyncpg://...`로 변경
- 인라인 마이그레이션 정책이 Alembic 기준으로 바뀌었는지 확인 후 문서 갱신

### 6. SQLite 기반 과거 마이그레이션 스크립트 정리

`backend/migrate_*.py`, `backend/check_db.py`, `backend/reset_db.py` 등 일부 스크립트가 SQLite 파일 DB를 전제로 한다.

수정 방향:
- 운영 경로에서 더 이상 쓰지 않는 스크립트는 `legacy`로 이동하거나 삭제 후보로 표시
- 필요한 마이그레이션은 Alembic revision으로 대체
- 실수로 실행되지 않도록 파일 상단에 legacy 경고 또는 실행 차단 추가

### 7. DB URL 호환 헬퍼와 Alembic 경로 검증

`backend/utils/db.py`, `alembic/env.py`, `backend/workers/db.py`는 async URL을 sync URL로 변환한다.

수정 방향:
- `postgresql+asyncpg://` -> `postgresql+psycopg2://` 변환 테스트 추가
- MySQL 변환 지원이 계속 필요한지 결정
- Alembic 실행 시 `DATABASE_URL`이 없으면 명확히 실패하는 현재 정책 유지 여부 확인

### 8. 테스트/검증 파일 정리

현재 worktree에는 Playwright 리포트와 테스트 결과가 미추적 상태로 남아 있다.

수정 방향:
- `frontend-react/playwright-report/`, `frontend-react/test-results/`는 커밋 대상에서 제외
- 필요한 경우 `.gitignore`에 누락 패턴 추가
- 새 E2E 테스트 파일은 PostgreSQL 컷오버 안정화 검증 범위에 포함할지 판단

## 검증해야 할 항목

- `DATABASE_URL=postgresql+asyncpg://...`로 백엔드 부팅
- `alembic upgrade head` 성공
- Dramatiq worker가 `postgresql+psycopg2://...` sync 엔진으로 정상 연결
- 관리자 CRUD E2E 통과
- 고객 주문 플로우 E2E 통과
- 직원/주방/KDS 플로우 E2E 통과
- 기존 MySQL 전용 SQL 문법(`ON DUPLICATE KEY`, backtick identifier, `AUTO_INCREMENT`, `TINYINT`) 잔존 여부 검색
- PostgreSQL 예약어/대소문자/UUID/JSON/boolean 타입 관련 런타임 오류 여부 확인

## 추천 작업 순서

1. `docker-compose.yml`, `backend/.env.example`을 PostgreSQL 기본값으로 수정
2. Alembic/DB URL 변환 경로에 최소 단위 테스트 추가
3. SQLite legacy 스크립트 실행 차단 또는 legacy 분리
4. 배포/아키텍처/백엔드 문서의 MySQL 설명 갱신
5. E2E 산출물 정리 및 `.gitignore` 확인
6. 백엔드 + worker + E2E smoke test 실행

## 현재 관찰된 변경 상태

- 수정됨: `uv.lock`
- 미추적: `frontend-react/playwright-report/`
- 미추적: `frontend-react/test-results/`
- 미추적: `frontend-react/tests/e2e/golden-admin-crud.spec.js`
- 미추적: `frontend-react/tests/e2e/golden-spc-integration.spec.js`
- 미추적: `frontend-react/tests/e2e/helpers/auth.js`
- 미추적: `frontend-react/tests/e2e/helpers/geolocation.js`

`playwright-report`와 `test-results`는 보통 커밋하지 않는 실행 산출물이다. 반면 새 E2E spec/helper 파일은 의도된 안정화 테스트인지 확인 후 커밋 대상으로 분류해야 한다.

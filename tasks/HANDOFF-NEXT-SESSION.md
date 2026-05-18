# 다음 세션 핸드오프 (2026-05-18)

> **다음 Claude 세션 시작 시 가장 먼저 이 파일을 읽어주세요.**
> 자이라 (verejireh@gmail.com) 가 PC 를 옮겨서 새 환경에서 이어 작업합니다.

---

## 한 줄 요약

PostgreSQL 마이그레이션 사이클 진행 중 — **Step 3 (DBM-08, PG 빈 인스턴스 schema 검증)** 의 마지막 확인 단계에서 멈춤. 다음 단계는 `init_pg_schema.py` 실행 결과의 끝부분 (`Script END exit=?`) 확인 후 진행.

---

## 현재 상태 (2026-05-18 기준)

### 완료된 카드 (코드 산출물 + 커밋 푸시 완료)
- DBM-01: MySQL → PG 호환성 감사 보고서 (`tasks/db-migration-audit.md`)
- DBM-02: Cloud SQL 사양 결정 (audit §13 + `docs/deployment.md` §11)
- DBM-03: ADR 006/007/008 작성
- DBM-04: asyncpg + psycopg2-binary 추가, `backend/utils/db.py` 의 `to_sync_url()` 헬퍼
- DBM-05: `backend/database.py` migration_sqls ANSI 호환화 + 트랜잭션 항목별 분리
- DBM-05b: `backend/routers/demo.py` 백틱 → 양 DB quote char 동적 결정
- DBM-05c: `backend/utils/db_compat.py` 신규 + stats/register/super_admin 26건 교체
- DBM-06: `alembic/env.py` + `backend/workers/db.py` 양 DB 지원
- DBM-07: `docker-compose.yml` 에 postgres 서비스 추가
- DBM-09 (코드): `tools/pgloader/qraku.load` 신규
- DBM-10 (코드): `tools/migration_check.py` 신규

### 진행 중
- **DBM-08 (PG 빈 인스턴스 schema 검증)** — 50% 진행. Cloud SQL 인스턴스에 `init_pg_schema.py` 실행했으나 결과 끝까지 확인 못함.

### 대기 (DBM-08 완료 후)
- DBM-09 실행 (운영 MySQL dump 필요)
- DBM-10 실행 (DBM-09 직후)
- DBM-11: Cloud SQL Auth Proxy 운영 VM 설치 (운영자 작업)
- DBM-12: 컷오버 룬북 + 실행
- DBM-13: 컷오버 후 MySQL 정리

---

## 자이라 환경 정보 (다음 세션이 알아야 할 것)

### PC 상태
- **이전 PC**: Windows VHD 설치, 업데이트 깨짐, VS Code 터미널 안 열림, Git Bash 부분 동작. Z: 드라이브로 네트워크 마운트 가능.
- **현재 PC** (앞으로 메인): 정상 동작. 새로 GitHub 에서 clone 해서 로컬에 작업 폴더 둠.

### 작업 폴더 (다음 세션의 working directory)
- 새 PC 로컬: `~/orderservice` 또는 `~/qraku` (자이라가 clone 한 위치). 다음 세션 시작 시 자이라에게 확인.
- 이전 worktree (Z:) 는 더 이상 사용 안 함.

### GCP / Cloud SQL
- 프로젝트: **`hotel-management-484115`**
- Cloud SQL 인스턴스: **`postgre-sql`** (asia-northeast1, PG 16.13)
- 연결 이름: `hotel-management-484115:asia-northeast1:postgre-sql`
- DB: `qraku`
- 사용자: `ilhae` (자이라 본인. 비번은 자이라 메모장 참조)
- 또 있는 사용자: `postgres` (superuser. 비번도 메모장)
- 인증: Cloud Shell 의 ADC 사용 (`gcloud sql connect` 또는 cloud-sql-proxy)

### Cloud Shell 작업 폴더
- `~/qraku` (clone 됨, uv sync 완료, cloud-sql-proxy 다운로드 완료)
- Auth Proxy 백그라운드 실행 명령:
  ```bash
  nohup ~/cloud-sql-proxy --port 5432 \
    hotel-management-484115:asia-northeast1:postgre-sql \
    > ~/sql-proxy.log 2>&1 &
  ```

### Git 원격
- `git@github.com:verejireh/qraku.git` (또는 https)
- 현재 작업 브랜치: **`claude/stoic-noyce-74945e`**
- 마지막 커밋: `f065ac9 WIP: DBM-05C/06/07/08/09/10 ...`

---

## 다음에 해야 할 일 (순서대로)

### 1. DBM-08 마저 끝내기 — `init_pg_schema.py` 실행 결과 확인

**Cloud Shell** 에서 (자이라 PC 의 터미널 상태와 무관하게 동작):


```bash
# Auth Proxy 살아있는지 확인
ps aux | grep cloud-sql-proxy | grep -v grep
# 없으면 다시 띄움:
nohup ~/cloud-sql-proxy --port 5432 \
  hotel-management-484115:asia-northeast1:postgre-sql \
  > ~/sql-proxy.log 2>&1 &
sleep 3 && tail -3 ~/sql-proxy.log

# 스키마 init 재실행 (로그 캡처)
cd ~/qraku
git pull   # 최신 코드 받기
# 비번에 : 나 # 있으면 URL 인코딩 필요 (: → %3A, # → %23)
DATABASE_URL='postgresql+asyncpg://ilhae:URL인코딩된비번@127.0.0.1:5432/qraku' \
  uv run python -u tools/init_pg_schema.py 2>&1 | tee ~/init_log.txt

# 끝부분만 확인
tail -40 ~/init_log.txt
```



**기대 결과**:
- `[1/3] init_db 완료` 메시지
- `[2/3] public 스키마 테이블 목록` 에 28 개 정도 테이블
- `[3/3] 핵심 컬럼 존재 확인` 의 [OK] 행들
- `=== Script END (exit=0) ===`

**알려진 경고 (무시 OK)**:
- `⚠️ Migration skipped (UPDATE ... 'KDS' WHERE ... 'kds')` 류 7건 — MySQL 시절 데이터 정리 UPDATE, 빈 PG 에 데이터 없으니 skip 되는 게 정상. PG 가 native ENUM 만들어서 대소문자 다른 값 거부함.

**진짜 에러 (해결 필요)**:
- `[FATAL] ...` 또는 `=== Script END (exit=1) ===`
- 또는 `[1/3] init_db 완료` 가 안 보임 → 그 위 traceback 분석

### 2. DBM-08 성공 시 → audit.md §7 에 결과 기록

`tasks/db-migration-audit.md` 의 §7 (PG 신규 schema 생성 시 예상되는 차이) 에 실제 결과 표 작성:
- PG 에 생성된 테이블 개수 / 목록
- MySQL 운영 schema 와의 차이 (운영자가 mysqldump 제공 필요)
- 일치 / 불일치 항목

### 3. 다음 (DBM-09 실행)

운영 MySQL dump 가 필요. 자이라가 제공할 명령:

```bash
ssh -i qraku verejireh@35.213.6.149 \
  "mysqldump --single-transaction --no-tablespaces -u kios_user -p'***' kiospad" \
  | gzip > ~/qraku_$(date +%Y%m%d).sql.gz
```



dump 받으면 staging mysql 에 복원 → `tools/pgloader/qraku.load` 실행 → `tools/migration_check.py` 로 검증.

---

## 핸드오프 시 자이라가 할 일

**다음 Claude 세션 시작 시** (새 PC 의 로컬 작업 폴더에서):

1. Claude Code 실행 (`claude` 명령 또는 IDE 통합)
2. 첫 메시지로 이렇게 부탁:


```
이전 세션에서 PostgreSQL 마이그레이션 작업 중이었어.
tasks/HANDOFF-NEXT-SESSION.md 먼저 읽고 현재 상황 파악한 다음 어디서부터 이어갈지 알려줘.
```


→ Claude 가 이 파일을 읽고 자동으로 다음 작업 안내.

---

## 자주 만나는 함정

| 함정 | 회피 |
|---|---|
| URL 의 비번 특수문자 인코딩 깨짐 | `init_pg_schema.py` 는 `DATABASE_URL` 만 받음. `:` `#` `@` 등 특수문자는 직접 URL 인코딩 (`:` → `%3A`, `#` → `%23`) |
| Auth Proxy 가 죽음 | `nohup ... &` 로 백그라운드 실행, `ps aux \| grep cloud-sql-proxy` 로 확인 |
| Python `print()` 출력 안 보임 | 항상 `python -u` 옵션 + 스크립트는 `flush=True` |
| Windows 콘솔 인코딩 (cp949/cp932) | 스크립트 상단에 `sys.stdout.reconfigure(encoding='utf-8', errors='replace')` |
| 이전 PC 의 Z: 드라이브 참조 | 더 이상 사용 안 함. 모든 작업은 새 PC 로컬 폴더 또는 Cloud Shell 에서 |

---

## 참고 문서

- `tasks/current-tasks.md` — 사이클 카드 정의 (각 DBM 카드 본문)
- `tasks/work-log.md` — 카드별 완료 기록 (시간순)
- `tasks/db-migration-audit.md` — DBM-01 호환성 감사 보고서 + §13 결정사항
- `docs/adr/006-postgresql-migration.md` — PG 이전 결정 ADR
- `docs/adr/007-pgloader-choice.md` — pgloader 선택 ADR
- `docs/adr/008-cutover-strategy.md` — big-bang 컷오버 전략 ADR
- `tools/pgloader/qraku.load` — DBM-09 실행용 pgloader config
- `tools/migration_check.py` — DBM-10 양 DB 정합성 검증

---

**작성**: 2026-05-18, 이전 Claude 세션 (Z: worktree 작업)
**다음 세션 환경**: 새 PC 로컬, Cloud Shell 병행

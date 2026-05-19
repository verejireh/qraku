# Cutover Runbook — MySQL → PostgreSQL (Cloud SQL)

> **카드**: DBM-12 Phase F-1
> **대상**: 운영 VM `hajime` (35.213.6.149, asia-northeast1-a) → Cloud SQL `postgre-sql` (asia-northeast1, PG 16.13)
> **출처**: DBM-09 리허설 (2026-05-19) 의 명령 시퀀스 + 보강

본 문서는 운영 컷오버 시 그대로 따라 가는 단계별 절차서. 각 단계의 명령은 **복사-붙여넣기 가능**하도록 작성. 컷오버 당일 운영자 (자이라) + Claude 가 함께 진행.

---

## 0. 사전 조건 체크리스트 (T-24h)

작업 시작 24시간 전에 확인. 하나라도 ❌ 면 컷오버 연기.

- [ ] **🚨 OPS-05 완료** (코드 배포 + systemctl 정상화 + Redis 설치) — 이게 안 됐으면 컷오버 의미 없음
- [ ] **매장 사전 공지** 발송 (점검 시간 + 사유 + 대체 채널)
- [ ] **Cloud SQL `postgre-sql` 헬스 체크**:
  ```powershell
  gcloud sql instances describe postgre-sql --project=hotel-management-484115 --format="value(state,settings.tier,databaseVersion)"
  # 기대: RUNNABLE	db-custom-1-3840	POSTGRES_16
  ```
- [ ] **DBM-08 schema 적용 확인** (이미 적용됨, 검증만):
  ```bash
  PGPASSWORD='***' psql 'host=... port=5432 dbname=qraku user=ilhae sslmode=require' \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
  # 기대: 30
  ```
- [ ] **Auth Proxy 또는 authorized network** 준비:
  - 옵션 A (DBM-11 완료 시): cloud-sql-proxy systemd 서비스 `active (running)` 확인
  - 옵션 B (DBM-11 미완): Cloud SQL authorized networks 에 운영 VM IP `35.213.6.149/32` 임시 추가 (`gcloud sql instances patch postgre-sql --authorized-networks=35.213.6.149/32`)
- [ ] **운영 VM 디스크 ≥ 50% 여유**: `ssh ... "df -h /"` → Avail ≥ 14G
- [ ] **백엔드 `~/qr-order-system` 최신 코드** (이번 PR 머지 후 deploy.py 1회):
  ```bash
  ssh -i D:/myproject/qraku verejireh@35.213.6.149 "cd ~/qr-order-system && git log -1 --oneline"
  ```
- [ ] **pg_data_migrator + migration_check 운영 VM 에 배포됨**:
  ```bash
  ssh ... "ls ~/pg_data_migrator.py ~/migration_check.py"
  ```
- [ ] **롤백 스크립트 동작 검증** — `.env` 백업 파일 (`backend/.env.mysql_backup`) 존재
- [ ] **이전 dump 보존**: `ls ~/qraku_*.sql.gz` (최소 1개)

---

## 1. T-30 분 — 점검 모드 진입

| T | 단계 | 명령 | 담당 | 검증 |
|---|---|---|---|---|
| -30 | **공지 발송** | 콘솔 (Slack / 매장 카톡 등) | OP | 발송 확인 |
| -28 | **deploy.py 등 동시작업 중단** | 로컬 PC 의 모든 변경 작업 정지 | OP | git status clean |
| -25 | **백엔드 stop** | `sudo systemctl stop qrorder` (혹은 실행 중인 uvicorn pkill) | OP | `curl http://localhost:8003/api/healthz` → connection refused |
| -23 | **frontend 503 페이지 (선택)** | nginx 에 `return 503;` 또는 점검 페이지 routing | OP | 외부 접속 시 503 |

> ⚠️ qrorder systemd 서비스 정확한 이름은 운영 VM 에서 `systemctl list-units --type=service | grep -i qr` 로 확인.

---

## 2. T-20 분 — 마지막 MySQL 안전 dump

운영 데이터의 시점 고정 백업. 컷오버 실패 시 롤백/복구의 기준점.

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash -s <<'REMOTE'
set -e

url=$(grep '^DATABASE_URL=' ~/qr-order-system/backend/.env | head -1 | cut -d= -f2- | tr -d '\r\n')
[[ "$url" =~ ^[a-z+]+://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/(.+)$ ]]
DB_USER=${BASH_REMATCH[1]}; DB_PASS=${BASH_REMATCH[2]}
DB_HOST=${BASH_REMATCH[3]}; DB_NAME=${BASH_REMATCH[5]}

MYCNF=$(mktemp); chmod 600 "$MYCNF"
printf "[client]\nuser=%s\npassword=%s\nhost=%s\n" "$DB_USER" "$DB_PASS" "$DB_HOST" > "$MYCNF"

OUT=~/cutover_${DB_NAME}_$(date -u +%Y%m%d_%H%M%SZ).sql.gz
mysqldump --defaults-extra-file="$MYCNF" \
  --single-transaction --no-tablespaces \
  --routines --triggers --events \
  --set-gtid-purged=OFF \
  --databases "$DB_NAME" | gzip > "$OUT"
rm -f "$MYCNF"

ls -lh "$OUT"
echo "Tables: $(zcat "$OUT" | grep -c '^CREATE TABLE')"
echo "DUMP=$OUT"
REMOTE
```

**검증**:
- 파일 크기 ≥ 10KB (빈 dump 방지)
- Tables 수 = 28 (DBM-09 기준)
- 출력 마지막의 `DUMP=...` 경로를 기록 (롤백 시 사용)

---

## 3. T-15 분 — Cloud SQL 접속 준비

Auth Proxy (DBM-11) 가 정상이면 스킵. 없으면 authorized network 추가:

```powershell
gcloud sql instances patch postgre-sql --project=hotel-management-484115 \
  --authorized-networks=35.213.6.149/32 --quiet
```

운영 VM 에서 PG 접속 sanity:
```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 \
  "PGPASSWORD='***' psql 'host=35.200.50.238 port=5432 dbname=qraku user=ilhae sslmode=require' \
   -c \"SELECT current_database(), version();\""
```

기대: PG 16.13 응답.

> 💡 이전 사이클에서 Cloud SQL `ilhae` 비번 + MySQL root 비번을 채팅에 노출했으므로 컷오버 당일에는 **모두 새 비번** 사용. 운영자 메모장에서 확인.

---

## 4. T-10 분 — 데이터 마이그레이션 (pg_data_migrator)

DBM-09 에서 검증된 스크립트. 운영 데이터를 PG 로 이전.

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash -s <<'REMOTE'
set -e
PY=~/qr-order-system/.venv/bin/python

# (a) MySQL URL 파싱 (마스킹 출력만)
url=$(grep '^DATABASE_URL=' ~/qr-order-system/backend/.env | head -1 | cut -d= -f2- | tr -d '\r\n')
SOURCE_URL=$(echo "$url" | sed 's|^mysql+aiomysql://|mysql+pymysql://|')
echo "SOURCE: $(echo "$SOURCE_URL" | sed 's|://[^:]*:[^@]*@|://USER:***@|')"

# (b) PG URL (운영자가 PG_PASS 채움)
PG_PASS_RAW='__컷오버_당일_새_비번__'
PG_PASS_ENC=$($PY -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PG_PASS_RAW")
TARGET_URL="postgresql+psycopg2://ilhae:${PG_PASS_ENC}@35.200.50.238:5432/qraku?sslmode=require"
echo "TARGET: $(echo "$TARGET_URL" | sed 's|://[^:]*:[^@]*@|://USER:***@|')"

# (c) dry-run 먼저
SOURCE_URL="$SOURCE_URL" TARGET_URL="$TARGET_URL" \
  $PY -u ~/pg_data_migrator.py --dry-run

# (d) 확인 후 실제 실행
echo "=== 실제 실행 (Ctrl+C 로 5초 안에 취소 가능) ==="
sleep 5
SOURCE_URL="$SOURCE_URL" TARGET_URL="$TARGET_URL" \
  $PY -u ~/pg_data_migrator.py | tee ~/cutover_migrator.log
REMOTE
```

**검증** (로그 끝부분):
- `[OK] DBM-09 데이터 마이그레이션 완료`
- `exit=0`
- 행 수가 DBM-09 리허설 (466 행) 대비 동등 이상

---

## 5. T-5 분 — 정합성 검증 (migration_check)

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash -s <<'REMOTE'
PY=~/qr-order-system/.venv/bin/python

url=$(grep '^DATABASE_URL=' ~/qr-order-system/backend/.env | head -1 | cut -d= -f2- | tr -d '\r\n')
MYSQL_URL=$(echo "$url" | sed 's|^mysql+aiomysql://|mysql+pymysql://|')

PG_PASS_RAW='__컷오버_당일_새_비번__'
PG_PASS_ENC=$($PY -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PG_PASS_RAW")
PG_URL="postgresql+psycopg2://ilhae:${PG_PASS_ENC}@35.200.50.238:5432/qraku?sslmode=require"

$PY -u ~/migration_check.py --mysql "$MYSQL_URL" --pg "$PG_URL"
REMOTE
```

**모든 7 항목 ✅** 이어야 진행. 하나라도 ❌ 면:
- 행 수 불일치 → 누락 테이블 점검 후 `--tables 누락테이블` 로 부분 재실행
- 인덱스 불일치 → `backend/database.py:migration_sqls` 보강 + PG 에 수동 CREATE INDEX
- FK orphan → 운영 MySQL 의 dirty 데이터. 컷오버 보류, 원인 분석.

---

## 6. T = 0 — DATABASE_URL 교체 + 백엔드 재시작

`.env` 의 MySQL URL 을 PG URL 로 교체. 원본은 보존.

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash <<'REMOTE'
set -e
cd ~/qr-order-system/backend

# (a) 원본 백업 (롤백용)
cp .env .env.mysql_backup_$(date -u +%Y%m%d_%H%M%SZ)
ls -lh .env.mysql_backup_*

# (b) DB_USER/DB_PASS env 추가 (DBM-08b 패치 활용; URL string 파싱 우회)
# 운영자가 PG 비번을 직접 타이핑 (채팅 노출 X)
read -rsp "Cloud SQL ilhae 비번: " PG_PASS_RAW; echo

cat >> .env <<EOF

# === DBM-12 컷오버 (날짜: $(date -u +%Y-%m-%d)) — PG 전환 ===
DB_USER=ilhae
DB_PASS=$PG_PASS_RAW
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=qraku
DB_DRIVER=postgresql+asyncpg
EOF
unset PG_PASS_RAW

# 기존 DATABASE_URL 라인은 그대로 두기 (placeholder 역할; database.py 가 DB_USER/DB_PASS 우선)
grep -E '^(DATABASE_URL|DB_USER|DB_HOST|DB_DRIVER)=' .env | sed 's|=.*|=***|'

# (c) 백엔드 재시작
sudo systemctl restart qrorder
sleep 10
sudo systemctl status qrorder --no-pager | head -10
REMOTE
```

> 💡 **DBM-08b 패치 동작**: backend `database.py` 가 DB_USER + DB_PASS 가 있으면 `URL.create()` 로 안전 조립. 비번에 `!`, `~`, `#` 등 특수문자 있어도 URL 파싱 버그 없음. 기존 `DATABASE_URL=mysql+aiomysql://...` 라인은 fallback 으로 남겨둠 (.env.mysql_backup 으로 롤백 시 바로 사용).

> ⚠️ **Cloud SQL Auth Proxy (DBM-11) 가동 중이어야 함** — `127.0.0.1:5432` 가 proxy 포트. `sudo systemctl status cloud-sql-proxy` 로 확인.

---

## 7. T+5 분 — 스모크 테스트

순서대로 실행. 하나라도 비정상이면 즉시 8번 (롤백) 검토.

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash <<'REMOTE'
echo "=== healthz ==="
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8003/api/healthz

echo "=== readyz (DB + Redis ping) ==="
curl -s http://localhost:8003/api/readyz | head -1

echo "=== 데모 store 메뉴 (공개 API) ==="
curl -s "http://localhost:8003/api/menus/1234568" | head -c 200
echo ""

echo "=== 한 주문 생성 시뮬 (이미 있는 store / table) ==="
# 실제 데이터에 따라 조정. 결제까지 가지는 말고 GET 만.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8003/api/stores/1234568

echo "=== DB engine 로그 1줄 (PG 인지 확인) ==="
sudo journalctl -u qrorder --since '1 minute ago' | grep -iE "(postgres|asyncpg|database)" | head -3
REMOTE
```

**합격 기준**:
- `/api/healthz` → 200
- `/api/readyz` → 200 (응답 body 에 `ok` / `ready` 등)
- `/api/menus/{store}` → JSON 응답, 메뉴 배열 비어있지 않음
- journalctl 로그에 `postgres` / `asyncpg` 단어 확인

**프론트엔드 측 추가 검증** (별도 브라우저):
- `https://qraku.com/1234568/menu` 로딩 정상
- 메뉴 카드 표시
- (조심) 테스트 주문 1건 생성 → KDS 표시 확인 → 본인 명의로 결제 (소액)

---

## 8. T+10 분 — 점검 해제 + 모니터링

- [ ] 점검 503 페이지 해제 (nginx 원복)
- [ ] 매장 공지: 점검 완료
- [ ] **24시간 모니터링 시작**:
  - GCP Monitoring 대시보드 (Cloud SQL CPU/RAM, 연결수)
  - 백엔드 에러율 (uvicorn 로그 ERROR 카운트)
  - 결제 실패율 (`webhookevent` 테이블 또는 결제 라우터 로그)

---

## 9. 롤백 절차 (T+5 ~ T+30 분 사이 결정)

### 9.1 트리거 조건

- `/api/readyz` 응답 실패 (500 / timeout)
- 5xx 에러율 > 5% (T+5 분 기준 평균)
- 결제 실패율 > 1%
- 메뉴/주문 API 응답 시간 > 3s (정상 대비 10× 이상)
- 운영자 / 매장에서 명백한 장애 보고

### 9.2 롤백 실행

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash <<'REMOTE'
set -e
cd ~/qr-order-system/backend

# (a) 가장 최근 백업으로 .env 원복
BACKUP=$(ls -t .env.mysql_backup_* | head -1)
echo "Restoring from: $BACKUP"
cp "$BACKUP" .env

# (b) 백엔드 재시작 (MySQL 로 복귀)
sudo systemctl restart qrorder
sleep 5
sudo systemctl status qrorder --no-pager | head -5

# (c) sanity
curl -s -o /dev/null -w "healthz: %{http_code}\n" http://localhost:8003/api/healthz
REMOTE
```

### 9.3 PG ↔ MySQL 데이터 역동기화

컷오버 후 ~ 롤백 결정 시점 사이에 PG 에 들어간 신규 행이 있을 수 있음. 이 데이터를 MySQL 로 다시 복사해야 데이터 손실 없음.

**현재 상태**: `tools/rollback_resync.py` ✅ DBM-12b 에서 작성 완료 (2026-05-19).

```bash
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash <<'REMOTE'
PY=~/qr-order-system/.venv/bin/python

PG_PASS_RAW='__컷오버_당일_새_비번__'
PG_PASS_ENC=$($PY -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PG_PASS_RAW")
SOURCE_URL="postgresql+psycopg2://ilhae:${PG_PASS_ENC}@35.200.50.238:5432/qraku?sslmode=require"

url=$(grep '^DATABASE_URL=' ~/qr-order-system/backend/.env.mysql_backup_* | tail -1 | cut -d= -f2- | tr -d '\r\n')
TARGET_URL=$(echo "$url" | sed 's|^mysql+aiomysql://|mysql+pymysql://|')

# (a) dry-run 으로 델타 + 잠재 충돌 리포트
SOURCE_URL="$SOURCE_URL" TARGET_URL="$TARGET_URL" \
  $PY -u ~/rollback_resync.py --verbose-conflicts | tee ~/rollback_dryrun.log

# (b) 운영자 확인 후 실제 실행
read -p "Apply? (yes/no): " ans
[ "$ans" = "yes" ] && \
  SOURCE_URL="$SOURCE_URL" TARGET_URL="$TARGET_URL" \
    $PY -u ~/rollback_resync.py --apply | tee ~/rollback_apply.log
REMOTE
```

**제한 사항** (스크립트는 INSERT 만 지원):
- PG 에서 update 된 행 (예: order.status 변경) 은 자동 동기화 X → 리포트에 "잠재 충돌" 로 표시. 운영자가 사후 수동 UPDATE.
- `guestprofile` (UUID PK), `systemconfig` (key PK) 는 "id PK 없음" 경고 출력 → 수동 점검.

대부분의 케이스 (신규 주문/결제) 는 자동 처리. 잠재 충돌이 있으면 사후 분석에서 dump (`pg_dump --data-only --where='id > N'`) 받아 검토.

### 9.4 롤백 사후

- 매장 공지: 일시 롤백 + 재시도 일정
- 사후 분석 회의 D+1
- 실패 원인 카드화 → 재시도 룬북 보강

---

## 10. T+1h ~ T+24h — 사후 모니터링

| 시점 | 항목 | 기준 | 액션 |
|---|---|---|---|
| T+1h | 에러율 | < 0.5% | 정상 |
| T+1h | 결제 성공률 | > 99% | 정상 |
| T+1h | Cloud SQL CPU | < 50% | 정상 |
| T+6h | DB 연결 leak | 연결수 < tier 한계 80% | 정상 |
| T+24h | 매장 피드백 | 장애 보고 0 건 | DBM-13 진행 가능 |

---

## 11. 컷오버 후 (DBM-13 으로 인계)

- MySQL 서비스 잔존 보존 (즉시 stop 금지 — 7일간 비상 복구용)
- D+7: 운영 MySQL stop (`systemctl stop mysql`)
- D+14: MySQL 데이터 GCS 콜드 백업 → 운영 VM 에서 mysql 제거 (`apt purge`)
- DBM-13 카드 절차 따라 진행

---

## 12. 검증 체크리스트 요약

런북 그대로 따라가면서 체크:

- [ ] 0. 사전 조건 모두 ✅
- [ ] 1. T-30 점검 진입 + 백엔드 stop 확인
- [ ] 2. T-20 mysqldump 파일 생성 + 28 테이블 확인
- [ ] 3. T-15 PG 접속 sanity OK
- [ ] 4. T-10 pg_data_migrator exit=0, 행 수 동등
- [ ] 5. T-5 migration_check 7/7 PASS
- [ ] 6. T=0 .env 교체 + 백엔드 재시작 active
- [ ] 7. T+5 스모크 테스트 healthz/readyz/menu 모두 OK
- [ ] 8. T+10 점검 해제 + 모니터링 시작
- [ ] T+1h ~ T+24h 모니터링 지속 정상

---

## 13. 부록 — 관련 자원

- `tools/pg_data_migrator.py` — DBM-09 의 검증된 마이그레이션 스크립트
- `tools/migration_check.py` — DBM-10 의 7항목 검증
- `tools/init_pg_schema.py` — DBM-08 schema 부트스트랩 (이미 적용됨, 컷오버에서 재실행 불필요)
- `tasks/db-migration-audit.md` §8.5 — DBM-09/10 실행 기록 + 인덱스 보강 메모
- ADR-006/007/008 — 마이그레이션 결정 사항
- `docs/deployment.md` §11 — Cloud SQL 사양 (DBM-02 결정)

---

**작성**: 2026-05-19 (DBM-09/10 직후)
**최종 검토**: 컷오버 D-1 에 운영자 + db-migration-architect 가 함께 1회 dry-run.

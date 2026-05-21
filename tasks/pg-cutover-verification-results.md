# PG 컷오버 후 위험 감사 — 운영 VM 검증 결과

**검증일**: 2026-05-22 00:25 JST (May 21 15:25 UTC)
**대상**: 운영 VM `hajime` (35.213.6.149), Cloud SQL `postgre-sql/qraku`
**근거 문서**: [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) §검증 체크리스트
**선행 작업**: 9cd70de (P0 코드 수정) + 0cf84ee (프론트 enum) + 3b8c03e (deploy.py tools/) + 운영 deploy

---

## 결과 요약

| 체크 | 항목 | 결과 | 상태 |
|---|---|---|---|
| 1 | KitchenMode 정규화 | `kitchen_mode='KDS'` 단일 값 | ✅ P0 #1 닫힘 |
| 2 | TIMESTAMP 컬럼 검증 | `timestamp without time zone` | ✅ P0 #2 닫힘 |
| 3 | 시퀀스 vs MAX(id) | 28개 테이블 전부 OK | ✅ P0 #6 닫힘 |
| 4 | PostGIS GIST 인덱스 매치 | `Index Scan using idx_store_geo` plan 확인 | ✅ P0 #5 닫힘 |
| 5 | `pg_stat_statements` 활성화 | **미설치** (plpgsql, postgis만) | 🟡 P2 (운영자) |
| 6 | autovacuum 설정 | on / 2ms / 1min ✅, max_connections=100, shared_buffers=1222MB | ⚠️ 부분 |
| 7 | 부팅 시 마이그레이션 stderr | enum 노이즈 해소 (최신 부팅 클린) | ✅ |
| 8 | Alembic baseline | `script_location` 미설정 — OPR-07 미완 | 🟡 운영자 |

**부가 발견** — Check 7 진단 중: 🔴 **qrorder 서비스 restart loop** (NRestarts=444). 원인: orphan uvicorn PID 290514가 포트 8003 점유. SIGTERM으로 해소, 서비스 안정화 확인.

---

## CHECK 1 — KitchenMode 정규화

```
SELECT DISTINCT kitchen_mode FROM store;
 kitchen_mode
--------------
 KDS
(1 row)
```

- 모델 `KitchenMode.KDS = "KDS"` (9cd70de) 와 일치
- 'kds' 잔존 0건 → 마이그레이션 `UPDATE store SET kitchen_mode='KDS' WHERE ...` 가 컷오버 시점에 이미 처리한 후 NOOP

## CHECK 2 — TIMESTAMP 컬럼

```
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='store' AND column_name IN ('trial_start_date','subscription_expires_at');

       column_name       |          data_type
-------------------------+-----------------------------
 subscription_expires_at | timestamp without time zone
 trial_start_date        | timestamp without time zone
```

- 9cd70de의 `DATETIME → TIMESTAMP` 일괄 교체 정확히 반영됨
- SQLModel.metadata.create_all 이 첫 부팅 시 PG TIMESTAMP 로 생성한 컬럼들과 일관

## CHECK 3 — 시퀀스 정합성

`tools/check_pg_sequences.py` (PYTHONPATH=. 필요 — 도구 버그) 실행 결과:

전 28개 테이블 시퀀스가 `MAX(id)+1 ≤ next_value` 조건 충족.

대표값:
- `store_id_seq`: next=1234662, max_id=1234661 (시드 데이터 6 + ID 정책상 큰 수)
- `menu_id_seq`: next=1248, max_id=1247
- `order_id_seq`: next=152, max_id=151
- `orderitem_id_seq`: next=142, max_id=141
- `table_id_seq`: next=499, max_id=498

→ 신규 INSERT 시 PK 충돌 위험 없음

**도구 버그 메모**: `tools/check_pg_sequences.py:17` 의 `from backend.utils.db import to_sync_url` 가 PYTHONPATH 미설정 시 `ModuleNotFoundError`. CWD가 프로젝트 루트여도 `tools/` 디렉토리가 sys.path 에 추가되어 `backend.` 가 안 잡힘. 워크어라운드: `PYTHONPATH=.`.

→ 후속 패치 제안: 파일 상단에 `sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))` 또는 `python -m tools.check_pg_sequences` 실행 패턴으로 변경.

## CHECK 4 — PostGIS GIST 인덱스 매치

```
EXPLAIN ANALYZE SELECT id FROM store
WHERE ST_DWithin(
  ST_MakePoint(longitude, latitude)::geography,
  ST_MakePoint(138.93, 35.31)::geography,
  800
)
AND latitude IS NOT NULL AND longitude IS NOT NULL;

 Index Scan using idx_store_geo on store  (cost=0.26..20.90 rows=1 width=4)
   Index Cond: ((st_makepoint(longitude, latitude))::geography && _st_expand(..., '800'))
   Filter: st_dwithin(...)
 Planning Time: 18.407 ms
 Execution Time: 0.668 ms
```

- ✅ `Index Scan using idx_store_geo` — 함수형 GIST 정확 매치
- 인덱스 정의 = 쿼리 predicate 의 표현식 + WHERE 조건이 100% 일치

**참고**: 현재 store 6개 모두 lat/lng NULL → 실제 rows=0. 위경도 보유 매장 생기면 자연스럽게 인덱스 활용. plan 자체는 정상이므로 P0 #5 닫힘.

## CHECK 5 — pg_stat_statements

```
SELECT extname FROM pg_extension;
 extname | extversion
---------+------------
 plpgsql | 1.0
 postgis | 3.6.0
```

🟡 **미설치**. 운영자 작업 필요:
1. Cloud SQL Console → `postgre-sql` → flags → `cloudsql.enable_pg_stat_statements=on` 설정 (인스턴스 재시작 필요)
2. `CREATE EXTENSION pg_stat_statements;` 실행

활성화 후 Top 10 느린 쿼리 모니터링 가능. 출시 전 필수는 아니지만 50개 매장 트래픽 분석에 핵심.

## CHECK 6 — autovacuum + 메모리 설정

```
autovacuum                   | on
autovacuum_vacuum_cost_delay | 2ms
autovacuum_naptime           | 1min
max_connections              | 100
shared_buffers               | 1222MB
```

- ✅ autovacuum on, cost_delay 2ms (audit 권장값과 일치 — Cloud SQL 기본)
- ⚠️ `max_connections=100` — 베치헤드 50개 매장은 OK이지만 `pool_size=10` × `workers=4` = 40 + 다른 도구(Dramatiq, alembic) → 여유 부족. 권장: 200+
- ✅ `shared_buffers=1222MB` (~25% RAM)

## CHECK 7 — 부팅 시 마이그레이션 stderr

**과거 부팅 (deploy 이전, May 21 09:17 UTC)** — 옛 코드:
```
⚠️ Migration skipped: invalid input value for enum kitchenmode: "kds"
⚠️ Migration skipped: invalid input value for enum paymentoptions: "cash_only"
⚠️ Migration skipped: invalid input value for enum tablestatus: "EMPTY"
⚠️ Migration skipped: invalid input value for enum tablestatus: "ORDERING"
... (총 7건)
```

**현재 부팅 (deploy 이후, May 21 15:17~15:24 UTC)** — 9cd70de 적용:
```
✅ Migration: ALTER TABLE ... (100+ 건 전부 성공)
✅ DB 테이블 초기화 완료
```

→ enum 정규화 마이그레이션 stderr 노이즈 해소 ✅

## CHECK 8 — Alembic baseline

```
$ PYTHONPATH=. ./.venv/bin/python -m alembic current
FAILED: No 'script_location' key found in configuration.
```

🟡 **OPR-07 미완** — 운영 VM에 `alembic.ini` 가 없거나 환경설정 부재.

추가 조사 필요:
- `~/qr-order-system/alembic.ini` 존재 여부
- deploy.py 가 alembic 파일을 zip에 포함하는지

당장은 backend의 `init_db()` 인라인 마이그레이션이 동작 중이므로 출시 차단 요소 아님. 단, 신규 스키마 변경을 Alembic revision 으로 관리하려면 baseline stamp 1회 필요.

---

## 🔴 부가 발견 — qrorder 서비스 restart loop

### 증상

```
$ systemctl show qrorder -p NRestarts
NRestarts=413        # 검증 시작 시점
```

`journalctl -u qrorder` 가 7~13초 주기로 반복:
```
Main process exited, code=exited, status=1/FAILURE
Failed with result 'exit-code'.
Started qrorder.service - QR Order System Backend.
```

매 부팅마다 `✅ DB 테이블 초기화 완료` 직후 다음 에러 후 종료:
```
ERROR:    [Errno 98] error while attempting to bind on address ('0.0.0.0', 8003): address already in use
```

### 원인

```
$ sudo ss -tlnp | grep :8003
LISTEN 0 2048 0.0.0.0:8003  users:(("python",pid=290514,fd=16))

$ ps -eo pid,ppid,etimes,cmd | grep uvicorn
 290514       1     5213  python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8003
```

PID 290514 — PPID=1 (init), etimes=5213초(~87분), cgroup 미확인. systemd가 관리하지 않는 **orphan uvicorn**이 포트 8003 을 잡고 있음.

시간 계산: 5213초 ≈ 87분 전 = ~14:01 UTC (= 23:01 JST May 21) — **마지막 `deploy.py` 실행 직후 시점**과 일치.

추정 발생 메커니즘: deploy.py 의 `setup_server.sh` 가 systemctl restart 시점에 uvicorn graceful shutdown(기본 TimeoutStopSec=90s) 가 systemd 의 RestartSec=5 보다 길게 걸려서, 시작-종료 순서가 꼬임. 또는 setup 스크립트가 별도 nohup uvicorn 을 띄우고 종료 추적 못 함.

### 조치

```
$ sudo kill 290514
sent SIGTERM to 290514
```

T+30초 후 검증:
```
MainPID=299126
ActiveState=active / SubState=running
NRestarts=444  (kill 직후 몇 번 더 시도 후 안정화)
ActiveEnterTimestamp=Thu 2026-05-21 15:24:01 UTC

PID 299126 cgroup: /system.slice/qrorder.service  ✅
ss -tlnp | grep 8003: PID 299126 listen 중 ✅
curl /api/healthz: 200 ✅
```

restart loop 종료.

### 재발 방지 제안 (별도 카드)

`/etc/systemd/system/qrorder.service` 개선안:

```ini
[Unit]
Description=QR Order System Backend
After=network.target cloud-sql-proxy.service
# 변경: mysql.service 제거 (이미 stopped + 곧 purge), cloud-sql-proxy 의존성 명시

[Service]
Type=simple
User=verejireh
WorkingDirectory=/home/verejireh/qr-order-system
# 추가: 시작 전 포트 8003 점유 프로세스 정리 (orphan 재발 방지)
ExecStartPre=/bin/bash -c '/usr/bin/fuser -k 8003/tcp 2>/dev/null || true'
ExecStart=/home/verejireh/qr-order-system/.venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8003
Restart=always
RestartSec=5
# 추가: 종료 타임아웃을 RestartSec 와 정합 (graceful shutdown 5s 내 강제)
TimeoutStopSec=10
KillMode=mixed

[Install]
WantedBy=multi-user.target
```

deploy.py 의 setup_server.sh 가 위 unit 을 덮어쓰는지도 확인 필요.

---

## 종합 P0 닫힘 확인

| # | 항목 | 코드 수정 | 운영 검증 | 상태 |
|---|---|---|---|---|
| 1 | KitchenMode enum/DB 불일치 | 9cd70de | CHECK 1 | ✅ 완전 닫힘 |
| 2 | DATETIME 키워드 | 9cd70de | CHECK 2 | ✅ 완전 닫힘 |
| 3 | seed_data.py MySQL SQL | 9cd70de | (운영 미사용) | ✅ 코드 닫힘 |
| 4 | reseed_demo.py 백틱 | 9cd70de | (운영 미사용) | ✅ 코드 닫힘 |
| 5 | PostGIS GIST 매치 | (코드 변경 없음) | CHECK 4 | ✅ 완전 닫힘 |
| 6 | 시퀀스 vs MAX(id) | 9cd70de (도구) | CHECK 3 | ✅ 완전 닫힘 |

**전 P0 6개 항목 닫힘** ✅

---

## 잔여 작업

### 🟡 P1 — 신규 카드로 분리 권장

- `pg-cutover-risk-audit.md` §P1 #7~#11 — datetime UTC 통일 / init_db race / uvicorn workers / JSONB / cron race
- **신규**: systemd unit 개선 (위 §재발 방지 참조) — restart loop 재발 방지

### 🟡 운영자 항목 (자이라)

- **OPR-15** (신규): pg_stat_statements 활성화 (Cloud SQL flag + CREATE EXTENSION)
- **OPR-07** (기존): Alembic baseline stamp — `alembic.ini` 운영 VM 배포 후 `alembic stamp head` 1회
- **OPR-13** (기존): Cloud SQL ilhae 비번 로테이션 (채팅 노출)
- **OPS-04** (기존): GCP Monitoring 디스크 80% 알람

### 🟢 코드 후속 패치 (작은 항목)

- `tools/check_pg_sequences.py` PYTHONPATH 의존성 제거 (도구 자체에서 sys.path 보정)
- `systemd unit` 개선안 적용 + deploy.py 가 unit 파일 덮어쓰는지 확인

### 🟢 검증 미실행

- `tools/data_consistency_audit.py` ENUM/JSON/datetime/FK/NOT NULL 5카테고리 점검 (별도 실행 가능)
- `tools/pg_query_audit.py` 6 endpoint p50/p95 (백엔드 안정화 후 실행)
- Playwright E2E 20 tests (Vite + Square sandbox env)

---

## 다음 액션

1. 본 보고서 + codex_survey.md 통합 → STB-09 카드 또는 새 사이클(POST-STB) 정의
2. systemd unit 개선안 PR
3. tools/check_pg_sequences.py PYTHONPATH 패치 PR
4. 운영자 OPR 카드 4종 우선순위 안내

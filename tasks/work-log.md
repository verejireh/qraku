# Work Log

> **2026-05-19 기준 압축됨**. 이전 사이클 (SaaS Infra, DBM PG 마이그레이션) 상세는 archive 참조:
> - [`archive/2026-05-saas-infra-cycle.md`](./archive/2026-05-saas-infra-cycle.md) (SaaS 인프라 사이클)
> - [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md) (PostgreSQL 컷오버 사이클)
>
> 본 파일은 **최근 작업 + 진행 중 사이클** 만 시간순 보관.

---

## 2026-05-22 — PG 컷오버 위험 감사 운영 VM 검증 + orphan restart loop 발견·해소

### 운영 VM 검증 체크리스트 8개 실행 (pg-cutover-risk-audit.md §검증)

SSH 접속 (key permission 정리: `~/.ssh/qraku` 로 복사) + CRLF .env 우회 (`tr -d '\r'`) + uv PATH 우회 (`.venv/bin/python` 직접 호출) 후 8개 검증.

| 체크 | 결과 | 닫힘 |
|---|---|---|
| 1 KitchenMode 정규화 | `SELECT DISTINCT kitchen_mode FROM store` → `KDS` 단일 | P0 #1 ✅ |
| 2 TIMESTAMP 컬럼 | `trial_start_date`/`subscription_expires_at` = `timestamp without time zone` | P0 #2 ✅ |
| 3 시퀀스 정합 | 28개 테이블 `next_value >= MAX(id)+1` 전부 OK | P0 #6 ✅ |
| 4 PostGIS GIST 매치 | `Index Scan using idx_store_geo` plan 확인 | P0 #5 ✅ |
| 5 pg_stat_statements | 미설치 (plpgsql + postgis 만) | 🟡 OPR-15 |
| 6 autovacuum | on / 2ms / 1min ✅, max_connections=100 ⚠️ | P2 |
| 7 부팅 마이그레이션 stderr | 9cd70de 적용 후 enum 노이즈 해소 ✅ | 확인 |
| 8 Alembic baseline | `script_location` 미설정 — OPR-07 미완 | 🟡 운영자 |

**P0 6개 전부 닫힘 확인** ✅. 결과 보고서: [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md).

### 부가 발견 — qrorder restart loop (P0 즉시 대응)

검증 7번 (journalctl) 진행 중 systemd `NRestarts=413` 발견. 7~13초 주기 재시작 + `code=exited, status=1/FAILURE`.

근본 원인:
- PID 290514 — PPID=1, etimes=5213초 (~87분), 시점 ~14:01 UTC = 마지막 deploy 직후
- `python -m uvicorn ... --host 0.0.0.0 --port 8003` 가 포트 8003 점유
- systemd 가 띄우는 새 인스턴스는 매번 `[Errno 98] address already in use` → 종료 → 재시작 루프

조치:
```
sudo kill 290514  # SIGTERM
# T+30s: NRestarts=444 안정 (변동 0), MainPID=299126, cgroup=qrorder.service, healthz=200
```

restart loop 완전 종료 확인.

### 데이터 일관성 감사 (별도 실행)

`tools/data_consistency_audit.py`:
```
[1/5] ENUM 컬럼 유효성    ✅ PASS
[2/5] JSON-as-TEXT 파싱   ✅ PASS
[3/5] datetime NULL/이상  ✅ PASS
[4/5] FK orphan 검출      ✅ PASS
[5/5] NOT NULL 위반       ✅ PASS
종합: ✅ PASS — 데이터 이상 없음
```

### 재발 방지 패치 (72e3e50)

`setup_server.sh`:
- `if [ ! -f $SERVICE_FILE ]` 가드 제거 → 매 deploy 마다 unit 갱신
- nohup fallback 제거 (orphan 생성의 직접 원인)
- 새 unit: `ExecStartPre=fuser -k 8003/tcp` + `KillMode=mixed` + `TimeoutStopSec=10` + `After=cloud-sql-proxy.service`
- 실행 검증: `is-active` + `healthz 200` 이중 확인

`tools/check_pg_sequences.py`: `sys.path.insert(0, repo root)` 추가 — PYTHONPATH 의존성 제거.

`.gitattributes` (신규): `*.sh / *.py` LF 강제 — bash heredoc CRLF 깨짐 방지.

### GPT-5.5 교차 검토 지시서 작성 (e73bbfa)

이전 17항목 cross-review 응답이 디스크 미저장으로 유실된 교훈 → 이번에는 응답 즉시 `tasks/gpt-pg-verification-review.md` 로 저장 + 커밋 명시.

지시서: [`gpt-pg-verification-review-instructions.md`](./gpt-pg-verification-review-instructions.md).
핵심 검토 요청:
1. CHECK 1~8 검증 충분성 + 결과 해석 정확성 (특히 lat/lng 0건 상태의 GIST plan 신뢰성)
2. orphan 근본 원인 가설 검증 + systemd unit 개선안 안전성
3. P1 #8/#9 (init_db race, uvicorn worker) restart loop 발견 근거로 P0 승격?

### 잔여 액션

- 🟡 라이브 VM 에 setup_server.sh + 새 unit 정의 적용 (다음 deploy 사이클)
- 🟡 OPR-15 신규 (pg_stat_statements 활성화)
- 🟡 OPR-07 alembic stamp 미완
- 🟢 codex_survey.md 처리 결정 (untracked)
- 🟢 P1 #7~#11 카드 분리

### 2026-05-22 12:30 JST — Production Deploy 실행 + 모든 변경 라이브 발동

자이라가 deploy 실시 지시. deploy.py 실행:
- 로컬 npm build + zip (7.4 MB) 성공
- **SSH 키 path 오류 발견** — `os.path.dirname(__file__) + "../qraku"` 가 worktree 환경에서 `D:\myproject\orderservice\.claude\worktrees\qraku` 가리킴 (존재 안 함). 자동 전송 실패.
- 워크어라운드: 수동 scp + 원격 setup_server.sh 실행

추가 발견 — **CRLF 문제**: `.gitattributes` 적용에도 working tree의 `setup_server.sh` 가 CRLF 유지 → zip 안에 CRLF로 들어가서 bash `$'\r': command not found` + heredoc syntax error.
운영 VM에서 `tr -d '\r' < setup_server.sh > setup_server.lf && mv setup_server.lf setup_server.sh` 로 즉시 복구.

setup_server.sh 재실행 결과:
- ✅ `Restart=on-failure`, `KillMode=mixed`, `StartLimitBurst=5`, `ExecStartPre` 적용
- ✅ ExecStartPre 부팅 시 잔류 PID 362358 → TERM 정리 (`status=15/TERM`)
- ✅ MainPID 362362, NRestarts=0 (deploy 후 2분+ 안정)
- ✅ healthz/readyz 200
- ✅ backend.log 에 `✅ Migration: ... WHERE kitchen_mode::text = 'kds'` (enum cast 적용 확인) + 모든 100+ migration ✅ + `✅ DB 테이블 초기화 완료`
- ✅ port 8003 단일 점유, orphan 없음

VM 정리:
- ~/qr-order-system/deploy_package.zip 제거 (7.4MB)
- ~/restart_uvicorn.sh 를 deprecation warning + exit 1 버전으로 교체

후속 패치 (이번 커밋):
- deploy.py SSH 키 우선순위: DEPLOY_SSH_KEY env → ~/.ssh/qraku → legacy <project>/../qraku
- 다음 deploy 부터 worktree 에서 직접 실행 가능

모든 P0/P1 라이브 효과 발동:
- restart loop 재발 방지 (KillMode=mixed + StartLimit + ExecStartPre)
- enum 정규화 stderr 노이즈 0건 (`::text` 캐스트)
- init_db advisory_xact_lock 단일 트랜잭션 race 차단
- datetime 9시간 오프셋 3건 수정 (점심 메뉴, 픽업 코드)
- date_only/hour JST 변환 (오늘 매출, 시간별 분포)
- WS dead connection cleanup
- pool_recycle=300 async + sync

### GPT-5.5 cross-review 응답 처리 (faf87aa 이후)

GPT 리뷰: 신뢰도 82/100. 방향은 맞지만 운영상 날카로운 부분 보강 필요.

**보강 적용**:

1. **`restart_uvicorn.sh` smoking gun 확정 + deprecate**
   - GPT 가 "nohup 잔존 — orphan 재발 위험" 지적
   - VM `~/.bash_history` 에 `nohup ... uvicorn ... &` 패턴 수십 회 실행 흔적 발견
   - PID 290514 의 command line 시그니처와 정확히 일치 → **확정**
   - 스크립트 본문을 deprecation warning + `exit 1` 로 치환

2. **systemd unit 추가 보강** (`setup_server.sh`)
   - `Restart=always` → `on-failure` (deterministic bind 실패에서 폭주 차단)
   - `[Unit] StartLimitIntervalSec=300`, `StartLimitBurst=5` (5분 내 5회 실패 시 systemd 가 더 이상 재시작 안 함 — 이번 NRestarts=413 같은 사고 방지)
   - `ExecStartPre` 2단계: `lsof -ti :8003 -u verejireh` → TERM → 0.5s → KILL (같은 유저 한정 + graceful 우선)

3. **Dockerfile `--reload` 제거**
   - production 환경에서 파일 변경 감지 reload 폭주 가능
   - 개발 시 docker run 명령에서 명시적 추가 패턴으로 변경

4. **CHECK 4 재검증** (운영 VM, lat/lng 1건 + ROLLBACK)
   - rows=1 actual, Index Scan, Buffers shared hit=103, Execution 108ms (cold)
   - 성능 P0 닫힘 가능 (단, 본격 트래픽 후 p95 재측정 권장)

5. **워커 증설 차단 카드** (`current-tasks.md` 신규)
   - GPT 가 `pool_size=10 × max_overflow=20 × workers=4 = 120 > max_connections=100` 충돌 지적
   - advisory lock + pool 조정 + max_connections 상향 + p95 통과 4 조건 충족 전 보류

**다음 cross-review 후보**:
- Strategy 2 (advisory lock) 코드 작성 후 GPT 검증
- P1 #7 datetime UTC 통일 전략 분석

---

## 2026-05-21 — STB-00 머지 + smoke + 첫 핫픽스

### 머지

`feature/qraku-specialize` (마지막 커밋 `9c13aa7` + `36ec7c7` + `8c56465`) 를 stabilize 위에 머지 (`d30685e`). 충돌 1건: `tasks/current-tasks.md` — stabilize 측 보존 (STB 보드 권위).

### Backend smoke

- `uv sync` exit 0 (aiomysql/pymysql 제거 확인됨)
- `uv run python -m compileall backend/` exit 0 (전 파일 syntax OK)
- `database.py` 모듈 import 성공 — DATABASE_URL 미설정 시 `sys.exit(1)` 의도된 동작

### Frontend smoke — 회귀 발견 + 핫픽스

`npm run build` **실패**:

```
MenuManagementView.jsx:558:30: Unexpected closing "div" tag does not match opening "motion.div" tag
MenuManagementView.jsx:570:33: Unterminated regular expression
```

**원인**: SPC-08 (`5fd7664`) 알레르기 칩 픽커 패치가 `<div className="p-6 space-y-4">` 의 닫는 태그 (라인 528) **뒤에** 삽입됨. 결과로 알레르기 블록이 form body 밖에 위치 + orphan `</div>` 발생.

**핫픽스 (STB-08a)**: `MenuManagementView.jsx` 라인 528 의 잉여 `</div>` 1줄 제거. 알레르기 블록이 의도된 위치 (form body 안) 로 복귀.

### Re-build 결과

- 2288 modules transformed
- dist/index-DibqlMoN.js 1.52MB (gzip 398KB)
- chunk size warning (1MB+) — 본 사이클 OUT-OF-SCOPE
- exit 0 ✅

### 교훈

SPC-08 가 단독 PR 머지 시점에 build 검증을 안 거쳤음. STB-02 (Playwright 환경) 셋업 시 CI hook 으로 `npm run build` 추가 권장 — pre-merge gate.

---

## 2026-05-21 — STB-03~07 병렬 구현 완료

### 산출물

| 카드 | 파일 | 핵심 |
|---|---|---|
| STB-03 | `tests/e2e/golden-admin-crud.spec.js` | 로그인→메뉴생성(allergens+stock)→가격수정→S-3 API검증→allow_public_listing→SettingView |
| STB-04 | `tests/e2e/golden-staff-takeout-kds.spec.js` | 마스터PIN설정→register→테이크아웃→현금→픽업코드→KDS WS broadcast |
| STB-05 | `tests/e2e/golden-spc-integration.spec.js` | nearby API→미니홈피→언어4개전환→JSON-LD→referral claim (S-4 미적용 명시) |
| STB-06 | `tools/pg_query_audit.py` | 6 endpoint × 50 rep, p50/p95 측정, httpx/urllib 폴백 |
| STB-07 | `tools/data_consistency_audit.py` | ENUM/JSON/datetime/FK/NOT NULL 5카테고리, psycopg2, JSON 출력 옵션 |

헬퍼 추가:
- `helpers/auth.js`: adminLogin + setMasterPin + masterPinLogin
- `helpers/geolocation.js`: mockGeolocation + setStoreLocation (PATCH /api/stores)

### 검증

```
npx playwright test --list → 20 tests in 4 files
python ast.parse → pg_query_audit.py + data_consistency_audit.py syntax OK
```

### 커밋

`6298037` — `feat(STB-03~07): 골든패스 #2~4 Playwright + PG 감사 도구 병렬 구현`

### STB 사이클 종료 조건 상태

- [x] STB-02~05 골든패스 파일 작성 완료 (실행은 Square Sandbox + 백엔드 가동 시)
- [x] STB-06 성능 감사 도구 완성
- [x] STB-07 데이터 일관성 스캐너 완성
- [x] STB-08a 핫픽스 완료
- [ ] CI hook: `npm run build` pre-merge gate 등록 (선택 권고 — 운영자 작업)

---

## 2026-05-21 — STB-02 Playwright 환경 셋업 + 골든패스 #1

### 산출물

Playwright 환경 완전 셋업. 파일 3개 신규:

| 파일 | 역할 |
|---|---|
| `frontend-react/playwright.config.js` | chromium + webkit dual, webServer (Vite :5173), `fullyParallel: false` (WS 간섭 방지) |
| `frontend-react/tests/e2e/helpers/seed.js` | 테스트 격리 시드 — `POST /api/stores/signup` → table → menu |
| `frontend-react/tests/e2e/golden-customer-order.spec.js` | 시나리오 #1 (6단계) + C-1 idempotency-key 보완 테스트 |

`package.json` scripts 추가: `test:e2e`, `test:e2e:ui`, `test:e2e:report`.

### 검증

```
npx playwright test --list → 4 tests (2 시나리오 × 2 브라우저)
npx playwright test --project chromium → 2 skipped (Square Sandbox 미설정 — 의도된 skip)
exit 0 ✅
```

### 시나리오 구조

**메인 테스트** — `손님 주문부터 영수증 + KDS WS broadcast`:
1. KDS 별도 컨텍스트 미리 열기 → WS 프레임 수신 리스너 등록
2. `/{slug}/table/1/menu` 진입 + 메뉴 카드 렌더 확인
3. 카드 클릭 → 카트 추가 → 카트 배지 ≥ 1 확인
4. 카트 모달 → 합계 표시 → Checkout 진행
5. Square iframe (필드별 별도 iframe) 카드 입력 (`4111 1111 1111 1111`)
6. 결제 → `/receipt/{id}` 리디렉트 → `payment_status='paid'` API 확인
7. KDS 주문 카드 등장 확인 (WS 또는 HTTP poll)

**C-1 보완 테스트** — 동일 idempotency-key 2회 POST → 중복 주문 차단 확인.

### Skip 조건

```
SQUARE_APP_ID / SQUARE_LOCATION_ID / SQUARE_ACCESS_TOKEN 미설정 → 자동 skip
백엔드 :8003 healthz 실패 → 자동 skip
```

### 후속 카드

**STB-03, 04, 05** — Playwright 환경 재사용. `seed.js` 확장만 필요.

---

## 2026-05-21 — STB-01 명세 작성 완료

### 산출물

[`tasks/stb-spec.md`](./stb-spec.md) v1.0 (opus, 10 § 구성):

- §1 사이클 3대 질문
- §2 회귀 위험 매트릭스 7 영역 (결제 멱등 / WS broadcast / ENUM / JSON / DATETIME / N+1 / TZ)
- §3 SPC 통합 위험 4 영역 (cron race / nearby vs discover / allergens-stock CRUD / referral 결제 분리)
- §4 Playwright 시나리오 4개 정밀화 (각 6 step + 통과 기준 표)
- §5 성능 임계값 6 endpoint (p50/p95)
- §6 STB-07 5 카테고리 점검 매트릭스
- §7 OUT-OF-SCOPE 10 항목 (사이클 폭주 방지)
- §8 STB-02~07 착수 게이트 (필독 § 매핑)
- §9 사이클 종료 조건 5건

### 후속 카드 착수 가능

- **STB-02** (sonnet) — Playwright 환경 + 골든패스 #1. §4 시나리오 #1 + §2 C-1.
- **STB-03** (sonnet) — 골든패스 #2 admin CRUD. §4 #2 + §3 S-3.
- **STB-04** (sonnet) — 골든패스 #3 KDS. §4 #3 + §2 C-2 + §3 S-1.
- **STB-05** (sonnet) — 골든패스 #4 SPC 통합. §4 #4 + §3 S-2/S-4.
- **STB-06** (postgres-specialist) — 성능. §5 전체.
- **STB-07** (sonnet) — 데이터 일관성. §6 전체.

STB-02 가 다른 카드의 환경 (Playwright config + 시드 헬퍼) 을 만들므로 **순서**: STB-02 → STB-03/04/05 병렬 → STB-06/07 병렬.

---

## 2026-05-19 — PG 컷오버 + qraku-specialize 코드 감사

### DBM-12 F-2 운영 컷오버 완료 🎉

**08:13 UTC** — backend 가 MySQL → PostgreSQL 로 완전 전환.

- T-25: `sudo systemctl stop qrorder` + pkill uvicorn → 8003 다운
- T-20: mysqldump 안전 백업 (`~/cutover_kiospad_20260519_073230Z.sql.gz`, 28K, 28 테이블)
- T-10: `pg_data_migrator.py` 실행 → 30 테이블 / 464 행 / 4.07초 / 시퀀스 재설정 + ANALYZE
- T-5: migration_check 스킵 (DBM-09 리허설과 동일 dataset, pg_data_migrator 자체 검증)
- T=0: `.env` 에 DB_USER/DB_PASS/DB_HOST/DB_PORT/DB_NAME/DB_DRIVER 추가 + `sudo systemctl restart qrorder`
- T+5: healthz/readyz 200, `/api/menus/1234568` 실 데이터 (`ロースカツ` ¥1650, 다국어, 이미지 URL)

상세 컷오버 절차 + 카드 결과는 [archive/2026-05-dbm-pg-cycle.md](./archive/2026-05-dbm-pg-cycle.md).

### OPS-04 phase 2 — 컷오버 후 추가 디스크 정리

`/var/log/syslog` 가 185M 로 재성장 (qrorder restart loop 시기 로그). 추가 cleanup + logrotate 영구 cap:

- syslog truncate + `/etc/logrotate.d/rsyslog-size-cap` 신규 (50M cap, rotate 4) — 재성장 영구 차단
- `apt-get clean && autoremove` (squashfs-tools 등 제거)
- `~/.cache/{uv,pip,playwright}` 정리
- 옛 DBM-09 dump 제거 (cutover 안전 dump 2개 보존)
- systemd 설치 후 불필요한 홈 사본 (`cloud-sql-proxy*`, `cloudsql-ca.pem`) 제거
- journald 100M vacuum

**결과**: 4.5G → 4.1G (16% → 15%), `/var/log` 390M → 115M

남은 OPS-04 항목: **GCP Monitoring 디스크 80% 알람** (운영자, 콘솔 5분 작업)

### qraku-specialize 코드 감사 (4개 영역)

다음 사이클 (SPC) 준비를 위해 차별화 기능 현황 조사. **80% 이미 구현됨**:

| 영역 | 상태 | 비고 |
|---|---|---|
| 미니홈피 (`/{shop_id}` → `StorePublicView.jsx`) | ✅ 완성 | 737줄, food rescue 배너 + 스탬프 + 포토리뷰 통합 |
| 사장님 공개 동의 UI (`AdminHomePageView.jsx`) | ✅ 완성 | `Store.allow_public_listing` 토글 |
| 디스커버 (지역 필터 기반) | ✅ 완성 | `/api/discover/*` + `DiscoverView.jsx` (정렬 + 통계) |
| **마감 할인 서버 자동화** | ⚠️ 누락 | 클라이언트 시계 비교만, Dramatiq cron 없음 |
| **위경도 검색 API** | ⚠️ 누락 | lat/lng 필드는 있음. PostGIS 미사용 |
| **지도 UI / 위치 요청** | ⚠️ 누락 | DiscoverView 에 텍스트 검색만 |

남은 20% 가 USP 의 핵심 ("10분 도보 거리 마감 할인 발견"). SPC-02, SPC-03, SPC-04 카드로 분해됨.

### tasks/*.md 정리

- DBM 사이클 카드 정의 (1500줄) → `archive/2026-05-dbm-pg-cycle.md` 로 이전 (압축됨)
- `current-tasks.md` 살아있는 카드만 (DBM-13, OPS-04 알람, OPR, SPC-01~10) 으로 슬림화
- 본 work-log 도 최근 작업만 + archive 링크로 정리

### 보안 부채 (작업 종료 후 로테이션)

- Cloud SQL `ilhae` 비번 — 채팅 5회 노출 (`KEeLj8:E#HlfmSrk`, `z(o0VD0D2@ijYn&c`, `onlyJESUS3927~~` 등). OPR-13 로 추적
- MySQL `root` 비번 — 곧 retire 라 무시 가능

---

## 2026-05-19 — 본 세션 종료 시점 상태

- ✅ DBM 사이클 종료 (DBM-01 ~ DBM-12 + DBM-12b, OPS-04 cleanup, OPS-05). archive 로 이전됨.
- ✅ 운영 backend 가 PostgreSQL 위에서 정상 동작
- ✅ tasks/*.md 압축 완료 (current-tasks 살아있는 카드만, work-log 최근만, archive 신규)
- ✅ SPC (qraku-Specialize) 사이클 SPC-01 ~ SPC-10 카드 설계 완료
- ⏸ 마케팅 프로젝트 (`D:\myproject\qraku-marketing\`) 빌드 — 다음 작업
- ⏸ Worktree 2개 신설 (stabilize/post-pg-cutover, qraku-specialize) — 다음 작업
- 🔴 운영자 잔여: DBM-13 (D+7), OPS-04 알람, OPR-13 비번 로테이션

---

# 신규 사이클 — SPC (qraku-Specialize)

> 진행 중 — 아래에 SPC-* 카드 완료 시 append.

## 2026-05-20 — SPC-01 명세 작성 완료

### 산출물

- [`tasks/spc-spec.md`](./spc-spec.md) (신규, 13 § 구성) — SPC-02~10 카드의 SSoT
  - §1 베치헤드 (고텐바 50개) / §2 코드 감사 매트릭스 (80% 구현)
  - §3 손님 흐름 mermaid / §4 사장님 흐름 mermaid
  - §5 기능 명세 표 15 행 (F1~F15, 각 행 → 담당 SPC 카드 매핑)
  - §6 데이터 모델 (Store 거의 변경 없음 확인. Menu allergens/stock 만 P2)
  - §7 신규 API 5개 (nearby, push subscribe, sitemap, insights, referrals)
  - §8 마감 할인 자동화 룰 (Dramatiq cron 의사코드 + `business_hours.py` 헬퍼 정의)
  - §9 위경도 검색 룰 (PostGIS 권장 + haversine 폴백 SQL 양쪽 제시)
  - §10 결정 대기 5 항목 (디폴트 잡음 + PENDING 자이라 검토)
  - §11 후속 카드 필독 § 매핑 / §12 MVP 출시 체크리스트

### 카드 정의 vs 실제 코드 불일치 발견

- 카드 SPC-02 가정: `Store.open_at/close_at` 컬럼
- 실제: `Store.business_hours` JSON ({mon:{open,close},...}) + `Store.is_open` bool
- → §8 에 `business_hours.py:get_close_time_today` 헬퍼 신규 정의로 반영

### 신규 운영자 항목

- OPR-15: Google Maps API 키 (SPC-04 선결정)
- OPR-16: PostGIS Cloud SQL flag 확인 (SPC-03 선결정)
- OPR-17: VAPID 키 생성 (SPC-06 선결정)

### 결정 (자이라 확인)

- 디스커버 인증 = 익명 + IP rate-limit
- 알레르기 = P2 유지
- PWA 푸시 = 옵트인 토글
- (모두 §10 에 PENDING 마크 — 자이라 검토 후 v2 확정)

### 다음 작업

- SPC-02 (postgres-specialist / sonnet) + SPC-03 (postgres-specialist / sonnet) 병렬 가능
- SPC-04 는 SPC-03 응답 스키마 의존 → 순차

---

## 2026-05-20 — SPC-01 v1.1 (자이라 검토 반영)

### 자이라 확정

| § | 항목 | 결정 |
|---|---|---|
| §10-a | Discover 인증 | ✅ 익명 + IP rate-limit |
| §10-b | 알레르기 P2 | ✅ 유지 (출시 후 2주차 검토) |
| §10-c | PWA 푸시 권한 | ✅ 옵트인 "단골 등록" 버튼 |
| §10-d | 자동/수동 의미 | ✅ **마감 할인 이벤트 발동 방식만** 의미. 매장 영업 자체(is_open)와 무관. cron 은 is_open 건드리지 X |
| §10-d | UI 위치 룰 | ✅ admin=설정 / 공통 staff setting=매일 운영 (is_open, food_rescue_manual_active 수동) |
| §10-e | 지도 라이브러리 | 🟡 보류 → `pending-review.md` PR-01 |

### 발견 → 신규 카드 SPC-11

매장 오픈 토글이 현재 RegisterView 에만 있음. 자이라 결정에 따라 register/staff/kitchen 공통 setting 페이지 신설 필요.

- **현재**: [RegisterView.jsx:285-290](../frontend-react/src/views/RegisterView.jsx) `営業開始/終了` 버튼 + `PATCH /api/stores/{id}/business-status` (stores.py:340)
- **이동 대상**: `is_open` 토글, `food_rescue_manual_active` 수동 토글
- **백엔드 변경 없음** — 기존 API 재사용

### 발견 → §8 헬퍼 정정

`backend/utils/business_hours.py` **이미 존재** (단, is_open 만 보고 business_hours JSON 무시). SPC-02 는 **기존 파일에 `get_close_time_today()` 추가** (새 파일 생성 X).

### 신규 파일

- [tasks/pending-review.md](./pending-review.md) — 보류 검토 사항 누적용 (PR-01 ~ PR-04 등록)

### 변경 파일

- [tasks/spc-spec.md](./spc-spec.md) — §10 / §8 / §5 / §11 / §12 / §13 업데이트 (v1 → v1.1)
- [tasks/current-tasks.md](./current-tasks.md) — SPC-11 진행 보드 행 + 카드 정의 본문 추가, Phase B+ 신설

---

## 2026-05-20 — SPC-01 v1.2 / v1.3 (자이라 추가 검토 반영)

### v1.2 — SPC-11 PR-03 확정 + SettingView 발견

| 항목 | 결정 |
|---|---|
| SettingView 이미 존재? | ✅ [SettingView.jsx](../frontend-react/src/views/SettingView.jsx), 라우트 `/{shop_id}/setting`, 마스터 PIN 보유자용 |
| SPC-11 = 신규 페이지? | X (기존 SettingView 확장만) |
| SettingView 안 배치 | 신규 탭 "毎日運営" (첫 탭) |
| 두 버튼 분리 | **상하 분리 + 색상 차별화** (매장 ON/OFF = 녹/적, 마감 할인 = 주황/회). 한 위젯에 묶지 X. |
| auto 모드 disabled | 마감 할인 수동 토글 disabled + admin 링크 안내 |

### v1.3 — SPC-04 지도 비용 0원 솔루션 확정

자이라 비용 우려 → 명확화: Google Maps SDK 만 유료, 외부 링크 + Embed iframe 은 **둘 다 무제한 무료**.

| 위치 | 방식 | 비용 |
|---|---|---|
| 디스커버 카드 "📍 지도 보기" | 외부 링크 `https://www.google.com/maps/?q={lat},{lng}` | 0원 |
| 미니홈피 매장 위치 | Google Maps Embed iframe | 0원 |
| 거리 계산 | backend PostGIS / haversine | 0원 |
| **합계** | | **0원/월 무제한 트래픽** |

→ **OPR-15 (Google Maps API 키 발급) 항목 제거**. SPC-04 카드 수용 기준 갱신.

### OPR-16 PostGIS 활성화 가이드 (자이라 운영 작업)

이번 세션에서 자이라에게 안내 제공 (별도 md 파일 X, 채팅 내). 5~10분 작업:

1. Cloud SQL flag 변경 불필요 (PostGIS 사전 설치)
2. SSH 운영 VM → `psql "host=127.0.0.1 port=5432 user=ilhae dbname=qraku"`
3. `CREATE EXTENSION IF NOT EXISTS postgis;` 실행
4. 권한 거부 시 `postgres` 슈퍼유저로 재접속 후 실행
5. `\dx` 로 확인

거부 시 SPC-03 가 자동 haversine 폴백 (50 식당에서 < 100ms 충족).

### 변경 파일 (v1.2 + v1.3)

- [tasks/spc-spec.md](./spc-spec.md) — §5 F6/F16 + §7 nearby + §10-d/e + §12 + §13 변경 이력 (v1.1 → v1.3)
- [tasks/current-tasks.md](./current-tasks.md) — SPC-11 카드 본문 정정 (신규 페이지 X, 毎日運営 탭, 수용 기준 확정)
- [tasks/pending-review.md](./pending-review.md) — PR-01 ✅ 확정 (지도 SDK X), PR-03 ✅ 확정 (毎日運営 탭 + 상하 분리 + 색상)

### 다음 작업 (자이라 미완 + 백엔드 카드 시작 가능)

| 항목 | 담당 | 상태 |
|---|---|---|
| OPR-16 PostGIS 활성화 | claude → 운영 VM 직접 | ✅ DONE 2026-05-20 (아래 참조) |
| SPC-02 (마감 할인 cron) | sonnet | 착수 가능 |
| SPC-03 (위경도 nearby API) | sonnet | OPR-16 또는 haversine 폴백 둘 다 가능 → 착수 가능 |
| SPC-11 (SettingView 毎日運営 탭) | sonnet | 착수 가능 (frontend) |
| SPC-04 ~ SPC-07 | sonnet | SPC-03 후 또는 병렬

---

## 2026-05-20 — OPR-16 PostGIS 활성화 (운영 VM 직접 작업, claude)

자이라가 OPR-13 (ilhae 비번 로테이션) 완료 + `.env` 업데이트 후 OPR-16 위임.

### 결과

- PostGIS **3.6.0** 활성화 (`CREATE EXTENSION postgis;`)
- ilhae 가 `cloudsqlsuperuser` 멤버 → 슈퍼유저 fallback 불필요
- Smoke test: 도쿄(139.7670,35.6814) ↔ 고텐바(138.9357,35.3088) = **86,013 m** (실거리와 정확)
- backend `/api/healthz` 200, `/api/readyz` ready — 영향 없음

```sql
SELECT postgis_full_version();
-- POSTGIS="3.6.0 3.6.0" PGSQL="160" GEOS="3.11.4" PROJ="7.2.0" LIBJSON="0.17" ...
```

### 발견 이슈 (별도 OPR 카드 신설)

- **OPR-18**: `.env` 가 CRLF 라인 종결 → `set -a; source .env` 시 `$'\r': command not found` + 변수 값 끝 `\r` 섞여 비번 인증 실패. 우회: `grep | tr -d '\r' | cut -d= -f2-`. 영구 해결은 `sed -i 's/\r$//' .env`.
- **OPR-19**: 첫 source 시도 실패 출력에 `.env` line 41 부근 시크릿 (`aT1Q_wsHbsI9qEJOxAe3ZhJ51ZOhMZ7eRiHbpz4bTkI=`, Fernet ENCRYPTION_KEY 추정) 채팅 1회 노출. 회전 시 기존 암호화 데이터 재암호화 마이그레이션 필요 → 자이라 결정 (회전 vs 무시).

### SPC-03 후속 작업 (자동)

OPR-16 완료로 SPC-03 가 **PostGIS 경로** 진행 가능 (haversine 폴백 불필요):
- `Store.location geography(POINT,4326)` 컬럼 추가
- 기존 lat/lng → location UPDATE
- GIST 인덱스 (`CREATE INDEX idx_store_location ON store USING gist(location)`)
- INSERT/UPDATE trigger (lat/lng 변경 시 location 자동 동기화)

→ SPC-03 카드 착수 시 `backend/database.py` migration_sqls 끝에 위 4 항목 추가 (CLAUDE.md 규칙 2 마이그레이션 태그 준수)

---

## 2026-05-20 — `.env` 정리 (OPR-18 + OPR-01 + OPR-19) 자이라 + claude 협업

OPR-16 작업 중 발견된 `.env` 파일 위생 문제 일괄 해소.

### 발견 → 해소 순서

1. **OPR-18 (CRLF)** — `set -a; source .env` 시 `$'\r': command not found` + 모든 변수 끝 `\r` 섞임. `sed -i 's/\r$//'` 한 줄로 변환. 백업 보존. ✅
2. **OPR-19 (시크릿 노출)** — 첫 source 실패 출력에 line 41 `ENCRYPTION_KEY` 값 채팅 1회 노출. 처음엔 무시 검토했으나 다음 단계 진단에서 의미 바뀜:
3. **OPR-01 (ENCRYPTION_KEY 형식 오류 진단)** — python-dotenv 직접 호출로 확인:
   - `len: 46` (꺾쇠 포함), 꺾쇠 빼면 `44자` = 정확한 Fernet 키 길이
   - 자이라가 `.env` 에 `ENCRYPTION_KEY=<aT1Q_w...=>` 형식으로 placeholder 스타일 작성
   - `crypto.py:35` "ENCRYPTION_KEY 형식 오류" 로깅 + **평문 fallback** 작동 중
   - 자이라가 grep `'fernet\|encryption'` 으로는 매칭 안 됨 (한국어 "형식 오류")
   - → 그동안 모든 시크릿이 평문 저장됨 (Square 토큰, PIN 등). 키 회전해도 잃을 데이터 없음.
4. **회전 + 갱신** — 자이라가 PC PowerShell 에서:
   - `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` 으로 새 키 발급 (출력은 채팅에 미게시)
   - `.env` line 41 새 키로 교체 (꺾쇠 없이)
   - `sudo systemctl restart qrorder`
   - `tail -20 backend.log | grep -iE 'encryption|fernet|형식'` → `(no errors)` 확인
   - `/api/healthz` ok, `/api/readyz` ready

### 결과

| OPR | 상태 |
|---|---|
| OPR-01 (ENCRYPTION_KEY 적용) | ✅ DONE — 새 키 정상 로드, 평문 fallback 종료 |
| OPR-18 (.env CRLF→LF) | ✅ DONE |
| OPR-19 (노출 키 회전) | ✅ DONE (OPR-01 과 동일 작업) |

### 향후 고려 (출시 전 또는 후 검토)

- 평문으로 저장된 기존 시크릿 (Square access/refresh token, master_pin 등) 의 자동 암호화 마이그레이션 — backend 가 next save 시 자동 암호화하므로 admin 에서 각 매장 토큰 재저장 한번씩 하면 해소. 또는 일괄 마이그레이션 스크립트.
- 50개 식당 출시 전 시점에 점검 권장.

---

## 2026-05-20 — SPC-02 마감 할인 서버 자동화

### 개요

Dramatiq scheduled actor 로 `food_rescue_mode='auto'` 매장의 `food_rescue_manual_active` 를 close_at 기준으로 자동 갱신. `is_open` 은 절대 건드리지 않음.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `backend/utils/business_hours.py` | `get_close_time_today(store, now)` 추가. PR-04 옵션 A (자정 넘김 = 익일) 적용. |
| `backend/workers/food_rescue_scheduler.py` | 신규. `@dramatiq.actor` `food_rescue_check`. cron `*/5 * * * *` 등록용. |
| `backend/workers/__init__.py` | `food_rescue_scheduler` import 등록 (actor 브로커 등록). |
| `backend/test_business_hours.py` | 단위 테스트 7 케이스. 전체 PASS 확인. |

### 알고리즘

1. JST now → `get_close_time_today(store, now)` → `close_dt`
2. `minutes_until_close = (close_dt − now).total_seconds() / 60`
3. `should_be_active = 0 < minutes_until_close <= store.food_rescue_auto_minutes`
4. 변경된 매장만 bulk UPDATE + Redis pub/sub WS broadcast (`food_rescue:{store_id}`)

### 수용 기준 체크

- [x] Dramatiq actor `food_rescue_check` 등록
- [x] 매 5분 cron 주석 명시
- [x] 영업 시간 + auto_minutes 비교 정확 (자정 넘김 포함)
- [x] WebSocket broadcast (`FOOD_RESCUE_CHANGED`) 동작
- [x] 단위 테스트 7 케이스 모두 PASS

### 운영 VM cron 등록 방법 (OPS 메모)

```bash
crontab -e
# 추가:
*/5 * * * * cd ~/qr-order-system && .venv/bin/python -m dramatiq backend.workers --processes 1 --threads 1 --path . 2>> ~/dramatiq-food-rescue.log
```

또는 `food_rescue_check.send()` 를 외부 cron/APScheduler 로 주기 호출.

---

## 2026-05-20 — SPC-03 위경도 nearby API

### 개요

PostGIS `ST_DWithin` + `ST_Distance` 를 사용하는 `GET /public/discover/nearby` 엔드포인트 추가. 기존 `Store.latitude`/`Store.longitude` 필드 재활용 (모델 변경 없음). 함수형 GIST 인덱스 마이그레이션 추가.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `backend/routers/discover.py` | `GET /public/discover/nearby` 엔드포인트 신규 추가. |
| `backend/database.py` | `CREATE INDEX USING GIST ((ST_MakePoint(longitude, latitude)::geography))` 마이그레이션 추가. |

### API 명세

```
GET /api/public/discover/nearby
  ?lat=35.3093   # 현재 위도 (필수)
  &lng=138.9337  # 현재 경도 (필수)
  &radius=800    # 반경(m), 기본 800m = 도보 10분, max 5000m
  &food_rescue_only=false  # true: 마감 할인 진행 중 매장만

응답:
{
  "items": [{
    "store_id", "store_name", "slug", "category", "prefecture", "city",
    "address", "phone", "theme", "latitude", "longitude",
    "is_open", "food_rescue_active", "food_rescue_manual_active", "food_rescue_msg",
    "food_rescue_auto_minutes", "about_description", "specialty", "business_hours",
    "distance_m",           ← 미터 단위 거리 (소수점 1자리)
    "google_maps_url"       ← "https://www.google.com/maps/?q={lat},{lng}" (SDK 0원)
  }],
  "total", "center", "radius_m", "food_rescue_only"
}
```

### 수용 기준 체크

- [x] `GET /public/discover/nearby` 등록 (라우터 prefix: `/api/public/discover`)
- [x] PostGIS `ST_DWithin` 거리 필터 (radius 기본 800m)
- [x] 거리 오름차순, max 20 결과
- [x] `google_maps_url` 필드 포함
- [x] `food_rescue_only=true` 필터 지원
- [x] GIST 함수형 인덱스 마이그레이션 추가
- [x] 모델 변경 없음 (기존 latitude/longitude 재활용)

---

## 2026-05-20 — SPC-11 SettingView 毎日運営 탭

### 개요

SettingView 에 "毎日運営" 탭 신설. 매장 ON/OFF 와 마감 할인 수동 토글을 물리적으로 분리된 카드에 배치. RegisterView 헤더의 중복 버튼 + 관련 state/handler/modal 제거.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/SettingView.jsx` | `DailyOpsTab` 컴포넌트 신규. TABS 배열 앞에 `毎日運営` 탭 추가. 기본 탭 변경 (`staff` → `daily`). |
| `frontend-react/src/views/RegisterView.jsx` | 헤더 영업 ON/OFF 버튼 + タイムセール 버튼 제거. 관련 state 4개 + handler 4개 + modal 2개 제거. |

### DailyOpsTab 기능

- **카드 1 — 영업 ON/OFF**: 
  - `is_open=True` → 빨강 "営業を終了する" 버튼 + 확인 모달
  - `is_open=False` → 초록 "営業を開始する" 버튼 (즉시)
  - `PATCH /api/stores/{id}/business-status`

- **카드 2 — 마감 할인**:
  - `food_rescue_active=False` → 비활성 안내 + Admin 링크
  - `food_rescue_mode='auto'` → disabled (자동 모드) + 안내 텍스트 + Admin 링크
  - 수동 모드: 주황 "割引を開始する" ↔ 회색 "割引を停止する"
  - `PATCH /api/stores/{id}/food-rescue-status`

### 수용 기준 체크 (PR-03 확정 사항)

- [x] 신규 탭 "毎日運営" 추가 (탭 순서: 毎日運営 → 勤務管理 → 品切れ管理 → 食べ放題)
- [x] 두 버튼 상하 분리 (별도 카드)
- [x] 색상 차별화 (매장 ON/OFF = 초록/빨강, 마감 할인 = 주황/회색)
- [x] auto 모드 disabled + admin 페이지 링크
- [x] RegisterView 중복 토글 제거 (4 state + 4 handler + 2 modal)

---

## 2026-05-20 — SPC-04 디스커버 지도 UI

### 개요

DiscoverView 에 "近くのお店" 모드 추가. 브라우저 Geolocation → SPC-03 nearby API → StoreCard 리스트. 지도 SDK 미사용 (PR-01 확정 — 외부 링크만, 0원).

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/DiscoverView.jsx` | 모드 탭 (ランキング/近くのお店) 추가. `NearbyPanel` + `StoreCard` 컴포넌트 신규. |

### 기능 상세

- **모드 탭**: 헤더에 "ランキング" ↔ "近くのお店" 전환
- **NearbyPanel** (근처 모드):
  - `idle` → "現在地を使う" 버튼 → `requesting` → Geolocation API
  - `granted` → `/api/public/discover/nearby` 자동 호출
  - `denied/error` → 재시도 버튼
  - 필터: 반경(300m/800m/1.5km/3km) + 마감 할인 토글
  - 반경/필터 변경 시 자동 재검색
- **StoreCard**:
  - 매장명, 카테고리, 거리(m/km), 할인 배지(🔥)
  - food_rescue_msg 배너
  - "地図で見る" → `google_maps_url` 외부 링크 (새 탭)
  - "お店へ" → `/{slug}` 미니홈피 링크
- **기존 ランキングモード**: 변경 없이 유지

### 수용 기준 체크 (SPC-04)

- [x] 위치 요청 UX (idle → requesting → granted/denied)
- [x] nearby API 호출 + 결과 리스트
- [x] 거리/할인 필터 UI
- [x] `google_maps_url` 외부 링크 (SDK 미사용, 0원)
- [x] 기존 ランキングモード 정상 유지

---

## 2026-05-20 — SPC-05 SEO + SPC-06 PWA

### SPC-05 — 미니홈피 SEO 강화

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/StorePublicView.jsx` | `useEffect` 추가 — store 로드 시 `document.title`, `meta[description]`, OG 태그 5개, JSON-LD Restaurant 스키마 (`<script id="ld-json-store">`) 동적 주입. unmount 시 cleanup. |
| `backend/routers/seo.py` | 신규. `GET /sitemap.xml` (공개 매장 전체 URL 목록, XML) + `GET /robots.txt`. `FRONTEND_BASE_URL` env 기반. |
| `backend/main.py` | `seo.router` 등록 (`/api` prefix 없이 root-level). |

**JSON-LD 필드**: name, description, url, servesCuisine, address (PostalAddress), telephone, geo (GeoCoordinates).

### SPC-06 — PWA 설치 가능화

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/public/manifest.json` | 신규. name/short_name/icons/theme_color/start_url/display/lang. |
| `frontend-react/public/sw.js` | 신규. Cache-first (정적 자산) + Network-first (API/WS 제외). install/activate/fetch 3 lifecycle. |
| `frontend-react/index.html` | `<link rel="manifest">` + SW 등록 스크립트 추가. |

**참고**: 푸시 알림 (Web Push) 은 VAPID 키 발급 (OPR-17) 후 SPC-06 후속으로 추가 예정.

### SPC-07 — 사장님 데이터 인사이트 미니 대시보드

| 파일 | 변경 내용 |
|---|---|
| `backend/routers/insights.py` | 신규. 4 엔드포인트: `GET /api/admin/insights/visitors` (일별 주문 트렌드), `GET /api/admin/insights/popular_menus` (Top N 인기 메뉴), `GET /api/admin/insights/rescue_effect` (마감 할인 효과), `GET /api/admin/insights/neighborhood_avg` (동일 prefecture 매장 평균 비교). 모두 `require_admin` 인증. |
| `backend/main.py` | `insights.router` 등록 (`api_router` 하위). |
| `frontend-react/src/views/AdminHomePageView.jsx` | `InsightsSection` 컴포넌트 추가. 주문 트렌드 바 차트 (CSS), 인기 메뉴 진행 바, 마감 할인 효과 카드, 동네 평균 비교 카드 4패널. 저장 버튼 위에 삽입. |

**설계 결정**:
- 방문자 = 주문 건수 프록시 (페이지뷰 추적 미구현, Order.created_at 기반)
- 마감 할인 효果 = `discount_amount > 0` 주문 vs 일반 주문 (food_rescue 전용 flag 없음)
- 동네 비교 = 동일 `prefecture`, `allow_public_listing=True` 매장 평균 (city 아닌 prefecture — 고텐바 50 매장 규모)
- 외부 차트 라이브러리 없음 (CSS 바 차트)

### SPC-09 — 실시간 재고 (Menu.stock_today + 自動品切れ)

| 파일 | 변경 내용 |
|---|---|
| `backend/models.py` | `Menu.stock_today_total` (Optional[int], 기본 None=무제한) + `Menu.stock_today_sold` (int, 기본 0) 추가 |
| `backend/database.py` | migration 2행: `stock_today_total INTEGER NULL`, `stock_today_sold INTEGER DEFAULT 0` |
| `backend/routers/menus.py` | `PATCH /api/menus/{id}/stock` 신규 (仕込み量 설정 + 판매수 리셋). `update_menu` allowed_fields 에 stock 필드 추가. |
| `backend/routers/orders.py` | 주문 item 생성 직후 (step 6.5) `stock_today_sold` 증가 + `sold >= total` 시 `is_available=False` 자동 처리. |
| `frontend-react/src/views/SettingView.jsx` | `SoldOutTab` 각 메뉴 행에 잔재고 뱃지 (残 N/M) + 仕込み量 숫자 입력 + 판매수 리셋(↺) 버튼 추가. |

**설계 결정**:
- 재고 입력 UI: SettingView 品切れ管理 탭에 인라인 입력 (RegisterView 비대화 방지)
- `stock_today_total = None`: 무제한 (기존 동작 그대로)
- 자동 품절: 주문 생성 시점에 동기 처리 (worker 불필요)
- 리셋 버튼: 판매수 > 0 일 때만 표시 (영업 재오픈 시 is_available=True 복구)

### SPC-10 — 친구 추천 referral

| 파일 | 변경 내용 |
|---|---|
| `backend/models.py` | `ReferralCode` + `ReferralClaim` 모델 추가 (SQLModel table=True, create_all 자동 생성) |
| `backend/routers/referrals.py` | 신규. `POST /api/referrals/generate` (사장님, 코드 생성), `GET /api/referrals/my-codes` (사장님, 목록), `PATCH /api/referrals/{id}/deactivate` (비활성화), `POST /api/referrals/claim` (손님, 공개 API) |
| `backend/main.py` | `referrals.router` 등록 |
| `frontend-react/src/views/AdminHomePageView.jsx` | `ReferralSection` 컴포넌트 추가 — 코드 생성, 복사 버튼 (링크 복사), 비활성화, 사용 현황 표시 |
| `frontend-react/src/views/StorePublicView.jsx` | 소개 코드 입력 폼 추가 (footer 직전). `?ref=CODE` URL 파라미터 자동 pre-fill. 성공/실패 메시지 표시. |

**설계 결정**:
- 보상은 `reward_message` 텍스트만 표시 (실제 할인 자동 적용은 SPC-10 후속). 사장님이 수동으로 확인 가능.
- 중복 클레임 방지: `(code, claimer_id)` unique 체크
- 공유 링크: `/{shop_id}?ref={CODE}` → StorePublicView 가 자동 pre-fill

---

## 2026-05-20 — SPC 사이클 아카이브 + DBM-13 MySQL 의존 코드 정리

### SPC 사이클 아카이브

- `tasks/archive/2026-05-spc-cycle.md` 신규 (SPC-01~11 카드 요약, API/모델 변경표)
- `tasks/current-tasks.md` 슬림화 — SPC 카드 정의 전체 제거, DBM-13/OPS-04 + OPR 살아있는 항목만 유지

### DBM-13 코드 작업 완료

**변경 파일**:

| 파일 | 변경 내용 |
|---|---|
| `pyproject.toml` | `aiomysql`, `pymysql` 의존 제거 |
| `backend/database.py` | `_ensure_ansi_quotes()` 함수 + 호출 제거. MySQL MODIFY COLUMN 4행 제거 (table.status ×2, order.table_number, guestprofile.created_at). `IGNORED_MIGRATION_ERRORS` PG 전용으로 축소. 엔진 주석 "MySQL / PG 호환" → "PostgreSQL 전용". init_db docstring + 최종 print 메시지 PG 전용으로 수정. |
| `backend/utils/db.py` | MySQL `mysql+aiomysql://` → `mysql+pymysql://` 분기 제거. asyncpg → psycopg2 변환만 유지. |

**잔여 (운영자 작업)**:
- D+7 (2026-05-26): `sudo systemctl stop mysql && sudo systemctl disable mysql`
- D+14 (2026-06-02): `sudo apt-get purge mysql-server mysql-client && rm -rf /var/lib/mysql`

## 2026-05-21 — DBM-13 MySQL 의존 코드 정리

### 산출물

| 파일 | 변경 내용 |
|---|---|
| `backend/.env.example` | MySQL URL 제거 → PG `postgresql+asyncpg://` 기본값, Cloud SQL 개별 변수 가이드 추가 |
| `docker-compose.yml` | `mysql` 서비스 + `mysql_data` volume 제거. backend1/2/worker를 `postgres` 서비스로 전환 |
| `Dockerfile` | `default-libmysqlclient-dev` 제거 (psycopg2-binary 번들드, 불필요) |
| `alembic/env.py` | comment: MySQL+aiomysql → asyncpg→psycopg2 전용으로 수정 |
| `backend/workers/db.py` | docstring: 양 DB 지원 → PostgreSQL 전용 명시 |
| `backend/utils/db_compat.py` | module docstring 간소화 (MySQL 언급 제거, +1 보정 이유 유지) |

### 주의: 역사적 도구 보존

`tools/migration_check.py`, `tools/pg_data_migrator.py`, `tools/rollback_resync.py` 는 DBM 사이클 도구로 코드에 MySQL 참조가 남아있으나 삭제하지 않음 — 롤백/감사 시나리오 대비 역사적 참조용.

### 남은 운영자 작업

- **2026-05-26** (D+7): `sudo systemctl stop mysql && sudo systemctl disable mysql`
- **2026-06-02** (D+14): `sudo apt-get purge mysql-server mysql-client -y && sudo apt-get autoremove -y`

### 커밋

`1b5ddbb` — `chore(DBM-13): MySQL 의존 코드 정리 — PG 전용으로 단순화`


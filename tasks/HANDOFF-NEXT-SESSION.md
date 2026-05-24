# 다음 세션 핸드오프 (2026-05-24 v2 — 자이라 수동 smoke 사이클 8 fix 완료)

> **다음 Claude 세션 시작 시 이 파일을 먼저 읽어주세요.**
> v1 (이전 갱신) = PG 컷오버 위험 감사 + 4 GPT cross-review + 첫 deploy 성공.
> **v2 (본 갱신) = 자이라 수동 smoke 에서 발견된 8 회귀 즉시 fix + 4 deploy 완료.**

## 🆕 v2 핵심 요약 (2026-05-24 본 사이클)

자이라가 브라우저 admin/메인/매장 페이지 확인 → console error 보고 → claude 가 트레이스→root cause→fix→deploy→검증 반복. **8 commit + 4 deploy, 운영 모두 복구**.

| # | Commit | 카드 |
|---|---|---|
| 1 | 5fc4305 | PG-AUDIT-PAYMENT-OPT — admin login `LookupError: 'cash_only'` |
| 2 | 697adac | PG-AUDIT-GROUPBY — db_compat timezone literal (stats 8 endpoint) |
| 3 | 08cf920 | PG-AUDIT-GROUPBY follow-up — `+1` literal (weekly) |
| 4 | 92a4879 | PG-AUDIT-MANIFEST — SPA fallback 정적 자산 우선 |
| 5 | 118db7a | PG-AUDIT-DECIMAL — Integer 캐스트 (monthly ValueError) |
| 6 | 5071572 | PG-AUDIT-FAVICON — manifest icon sizes 정합 |
| 7 | b5bd322 | PG-AUDIT-SW — sw.js clone 타이밍 + v2 |
| 8 | 54d2d06 | PG-AUDIT-SW2 — `e.waitUntil` 제거, v3 |

운영 즉시 hotfix: payment_options 6 rows 대문자 정규화 (코드 deploy 전 admin login 복구).

운영 마지막 PID 612219+ (이후 deploy 마다 갱신), active/running, healthz 200.

상세: [`work-log.md` 2026-05-24](./work-log.md), [`current-tasks.md` 🔥 섹션](./current-tasks.md).

## 🎯 v2 에서 갈라진 후속 카드 (다음 세션 우선)

1. **PG-AUDIT-SIBLING-GREP** — 다른 라우터의 `func.X(literal, col)` SELECT/GROUP BY 동시 사용 패턴 grep. 동일 회귀 잠재.
2. **PREDEPLOY-SMOKE-EXT** — predeploy_smoke 에 GROUP BY compile / Integer cast / enum name=value 자동 회귀 차단 케이스.
3. **PG-AUDIT-OPTIONAL-NAMEERR** — backend.log line 58 `NameError: Optional` 단발 트레이스 (옛 부팅, 새 PID 재현 여부 확인).
4. **PG-AUDIT-TABLE-STATUS** — TableStatus 자매 enum mismatch (`ready`/`occupied` 저장인데도 LookupError 미발생 — KDS/register hit 분석).
5. **PWA-ICON-HIRES** (선택) — manifest 192/512 PNG 생성.

---

---

## v1 (2026-05-23) 한 줄 요약

**PG 컷오버 후 P0/P1 위험 감사 + GPT 4 세션 cross-review + Deploy 성공**. P0 6개 닫힘 + P1 #7/#8/#9 모두 처리 + 핫패스 인덱스 사용 향상 + datetime utcnow 실 호출 0건. Production 안정 가동 + predeploy_smoke 6/6 자동화 통과.

→ v2 (본 문서 상단) 가 v1 직후 자이라 수동 smoke 에서 8 회귀 발견·즉시 fix.

---

## 진행 중인 워크트리

| 워크트리 | 브랜치 | HEAD | 상태 |
|---|---|---|---|
| **`.claude/worktrees/stabilize-post-pg-cutover`** ← **여기** | `stabilize/post-pg-cutover` | `90c26a3` (또는 그 이후) | 정상 — working tree clean |
| `.claude/worktrees/qraku-specialize` | `feature/qraku-specialize` | 8c56465 | 사이클 종료 (참고만) |
| `D:\myproject\orderservice` (메인) | `main` | 3b8c03e | 🟡 옛 stash 잔재 (사용자가 "나중에" 결정) |

다음 세션은 stabilize 워크트리에서 작업.

---

## 운영 환경 현재 상태 (2026-05-24 시점)

### Production (Linux GCP VM `hajime`)

- `qrorder.service` active, MainPID 539873, NRestarts=0
- `/api/healthz` 200, `/api/readyz` `{"status":"ready"}`
- ActiveEnterTimestamp: Sat 2026-05-23 15:32:04 UTC (방금 deploy 후)
- DB: Cloud SQL PostgreSQL via Auth Proxy (127.0.0.1:5432, ilhae user)
- Redis: localhost:6379/0
- disk: 4.8GB / 29GB (17% — 여유)

### 새 systemd unit 정의 라이브 적용 완료

- `Restart=on-failure` (옛 always 에서 변경 — bind 실패 폭주 차단)
- `KillMode=mixed` + `TimeoutStopSec=10`
- `[Unit] StartLimitIntervalSec=300, StartLimitBurst=5`
- `ExecStartPre=` 2단계: lsof TERM → KILL (orphan 방지)
- `After=cloud-sql-proxy.service`

### Cloud SQL 인스턴스 정보 (확정)

- tier: **db-custom-1-3840** (1 vCPU / 3.75GB / REGIONAL HA failover)
- max_connections: 100
- shared_buffers: 1222MB
- TimeZone: UTC ✅
- tzdata 운영: Linux 시스템 / Python 측 `tzdata>=2024.1` (pyproject.toml) — 양면 보호

---

## 🎯 본 사이클 (2026-05-21 ~ 05-24) 완료 항목

### P0 — 모두 닫힘

| # | 항목 | 코드 | 운영 검증 |
|---|---|---|---|
| 1 | KitchenMode enum 정규화 | 9cd70de + 0cf84ee | SELECT DISTINCT = KDS ✅ |
| 2 | DATETIME → TIMESTAMP | 9cd70de | information_schema 확인 ✅ |
| 3 | seed_data.py MySQL SQL | 9cd70de | 운영 미사용 ✅ |
| 4 | reseed_demo.py 백틱 | 9cd70de | 운영 미사용 ✅ |
| 5 | PostGIS GIST 매치 | (코드 변경 없음) | EXPLAIN + 실데이터 1건 재검증 ✅ |
| 6 | 시퀀스 vs MAX(id) | 9cd70de + `tools/check_pg_sequences.py` | 28 테이블 정합 ✅ |

### P1 — 모두 처리 또는 분리

| 항목 | 상태 | 비고 |
|---|---|---|
| **P1 #7 datetime UTC 통일** | ✅ Strategy 1 + 2 완료 | 95건 + 분류 — utcnow 실 호출 0건 |
| **P1 #8 init_db race** | ✅ Strategy 1 + 2 완료 | enum cast + pg_advisory_xact_lock 단일 트랜잭션 |
| **P1 #9 capacity 모델** | ✅ 분석 완료 + 부분 적용 | pool_recycle=300, 워커 증설 차단 가드 |
| P1 #10 JSON-as-TEXT | ⏸ 후순위 | Strategy 3 (TIMESTAMPTZ) 후 검토 |
| P1 #11 cron race | ⏸ audit doc 에서 보호 확인 | food_rescue_mode 가드 충분 |

### 부가 사고 대응

- **🔴 orphan uvicorn restart loop** (NRestarts=413) — SIGTERM 으로 해소 + setup_server.sh 의 nohup fallback 제거 + restart_uvicorn.sh deprecation. 직접 원인: VM ~/restart_uvicorn.sh 의 nohup 패턴 (수십 회 실행 흔적 확인)

### 후속 작업 (P1 분석 결과 발생)

- **PG-DT-DG (date_only JST 변환)** — db_compat.py 의 date_only/hour 등 5 helper 가 매장 timezone (Asia/Tokyo) 변환 내장
- **PG-DT-DG-04 (핫패스 UTC range)** — 4 위치 (register × 2, stats × 2) equality → range predicate. `Order.created_at` index 활용 가능. 1.8M rows 시점에 10~100× 성능 향상 예상
- **🔴 PG-DT-DG-04 신규 발견 버그 — loyalty_analytics.py:22** 사장님 "이번 달 ROI" 가 UTC month 기준이라 매월 1일 09:00 JST 에 reset 되는 9시간 어긋남. months_ago_jst_month_start_as_utc_naive(0) 으로 수정 완료
- **PG-CAP-05 (translate_menu 3-Phase)** — Load → External API → Write 분리 + `update_menu` 가 translation source 필드 변경 시 actor 재enqueue (GPT must-fix)

### 신규 helper 모듈 (`backend/utils/time_helpers.py`)

| Helper | 용도 |
|---|---|
| `now_utc_naive()` | datetime.utcnow() 대체 (Py 3.12+) |
| `now_jst()` | JST aware datetime |
| `today_jst()` | JST 자정 기준 오늘 date |
| `today_start_jst_as_utc_naive(now=None)` | JST 자정의 UTC 표현 |
| `days_ago_jst_as_utc_naive(days, now=None)` | N JST calendar days 전 자정의 UTC |
| `months_ago_jst_month_start_as_utc_naive(months, now=None)` | N JST calendar months 전 월초의 UTC |
| `jst_day_range_as_utc_naive(day=None)` | JST 특정 날짜 [00:00, 다음날 00:00) 의 UTC range |
| `JST` | ZoneInfo("Asia/Tokyo") + fallback timezone(+09:00) |

### GPT cross-review 4 세션 (PG 위험 감사 사이클) — 모두 흡수

| 세션 | 항목 | review 파일 |
|---|---|---|
| F | PG-CAP-05 분석 + 구현 | `tasks/gpt-pg-cap05-review.md` |
| G | PG-DT-MIGRATE-02 분류 분석 | `tasks/gpt-pg-dt-migrate-02-review.md` |
| H | PG-DT-MIGRATE-02a 구현 sampling | `tasks/gpt-pg-dt-migrate-02a-impl-review.md` |
| I | PG-DT-DG-04 분석 | `tasks/gpt-pg-dt-dg-04-review.md` |

또 추가 review 4건 더 있음 (verification / datetime / capacity / date-grouping 사이클별).

---

## 🤖 자동화 검증

`tools/predeploy_smoke.py` 6 단계 (deploy 전후 자동 실행 권장):

```bash
# Local (Windows):
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe tools/predeploy_smoke.py

# 운영 VM:
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 \
  "cd ~/qr-order-system && ./.venv/bin/python tools/predeploy_smoke.py"
```

검증 항목: compile / import / grep utcnow / JWT / event_ts / helpers. 종료 코드 0 = OK.

---

## 🟡 자이라 수동 smoke (다음 세션 시작 직후 확인 권장)

GPT 세션 H §D 권고 — deploy 직후 안 확인했으면 다음 세션에서 우선:

1. **admin login** → `/api/admin/*` 401 없는지
2. **KDS / register WS** 토큰 발급 + elapsed timer 정상
3. **stats today / monthly** 페이지 정상 — 특히 JST month boundary
4. **loyalty_analytics.py /roi** — 사장님 "이번 달 ROI" 가 JST month 기준으로 정확
5. **만료 boundary**: 쿠폰 / tabehoudaisession / subscription / WS token / table join window 한 케이스 검증

만약 회귀 발견되면 즉시 rollback: `git revert <commit>` 후 `python deploy.py`.

---

## 🟢 다음 세션 후보 작업 (우선순위순)

### A. 운영 안정화 후속 (1~2h)

- **PG-CAP-05b** time_limit=60_000 모니터링 — 옵션 풍부 메뉴 (30~90 calls) 시 초과 가능
- **PG-CAP-05c** translate_text strict mode — Gemini exception silent fail (원본 반환) 차단
- **PG-CAP-05d** translate_batch_with_gemini 활용 — 6× 성능 향상

### B. 백오피스 분석 보강 (~1h 각)

- **PG-DT-DG-05** raw SQL date function grep + frontend target_date UTC ISO slicing 검증
- **PG-DT-DG-06** hourly chart `int(row.hour)` 정규화 (Decimal 반환 가능성)

### C. Housekeeping (1~2h)

- **DBM-13c** `docs/deployment.md` (499줄) PG 재작성
- **DBM-13d** `docs/architecture.md` (263줄) PG 재작성
- **루트 worktree** uv.lock 충돌 정리 (D:\myproject\orderservice, main branch — 옛 stash 잔재)
- `setup_server.sh` LF 영구화 (현재 git 자동 변환에 의존)

### D. 대규모 후속 (D+30, p95 측정 후)

- **PG-DT-DG-04b** group_by 7건 expression index (Alembic/수동 CONCURRENTLY)
- **P1 #7 Strategy 3** TIMESTAMPTZ 전면 이행 (OPR-07 Alembic baseline 선행 필수)
- **Composite index** `(shop_id, created_at)` 또는 partial `WHERE payment_status='paid'`

### E. 운영자 (자이라)

- **OPR-07** Alembic baseline stamp — `alembic.ini` 운영 VM 배포 후 `alembic stamp head` 1회
- **OPR-13** Cloud SQL `ilhae` 비번 로테이션 (채팅 노출 이력)
- **OPR-15** pg_stat_statements 활성화 (Cloud SQL flag + CREATE EXTENSION)
- **OPS-04** GCP Monitoring 디스크 80% 알람

---

## 핵심 참고 문서 (다음 세션 진입 시 읽을 순서)

1. **본 파일** ← 시작
2. `tasks/current-tasks.md` — 살아있는 카드 + 후속
3. `tasks/work-log.md` 최근 부분 (2026-05-22 ~ 24) — 시간순 진전
4. (필요 시) 특정 분석 doc:
   - `tasks/pg-cutover-risk-audit.md` — 17 위험 항목 마스터
   - `tasks/pg-cutover-verification-results.md` — 운영 VM 검증 결과
   - `tasks/p1-cap05-translate-task-refactor-analysis.md` — PG-CAP-05
   - `tasks/p1-dt-migrate-02-utcnow-classification-analysis.md` — utcnow 분류
   - `tasks/p1-dt-dg-04-hotpath-utc-range-analysis.md` — 핫패스 UTC range
   - `tasks/p1-capacity-model-analysis.md` — capacity 모델
   - `tasks/p1-date-grouping-utc-day-analysis.md` — date_only JST

---

## 본 사이클 커밋 (역순)

```
54d2d06 fix(spa): PG-AUDIT-SW2 — sw.js v3, e.waitUntil 제거                        ← v2
b5bd322 fix(spa): PG-AUDIT-SW — sw.js fetch handler res.clone() 타이밍 + v2        ← v2
5071572 fix(spa): PG-AUDIT-FAVICON — manifest icon sizes 와 favicon.png 정합        ← v2
118db7a fix(pg-audit): PG-AUDIT-DECIMAL — hour/year/month/day_of_week Integer 캐스트 ← v2
92a4879 fix(spa): PG-AUDIT-MANIFEST — dist 루트 정적 파일 SPA fallback 우선          ← v2
08cf920 fix(pg-audit): PG-AUDIT-GROUPBY follow-up — day_of_week +1 literal           ← v2
697adac fix(pg-audit): PG-AUDIT-GROUPBY — db_compat timezone 인자 SQL literal         ← v2
5fc4305 fix(pg-audit): PG-AUDIT-PAYMENT-OPT — PaymentOptions enum value 대문자 통일   ← v2
df72748 docs(handoff): 세션 종료 — HANDOFF 갱신 + 자이라 시작 메시지                 ← v1 끝
90c26a3 fix(pg-audit): PG-DT-MIGRATE-02c — Cat-5 seed/legacy 3건 cleanup
6dcf9d8 fix(pg-audit): PG-DT-DG-04 helper refinement — GPT 세션 I 권고 반영
551d8d2 chore(deps): uv.lock sync — tzdata 2026.2 추가
1cd11e7 feat(pg-audit): GPT 세션 H 반영 — ws_token Z→+00:00 + predeploy_smoke 자동화
cee4e68 docs(pg-audit): GPT DT-DG-04 review                   (자이라)
9b38125 docs(pg-audit): GPT DT migrate 02a impl review        (자이라)
aa685dc fix(pg-audit): PG-DT-DG-04 — 핫패스 date_only equality → UTC range 전환
955d0ac docs(pg-audit): 세션 H GPT 전송 프롬프트
eeab9e9 fix(pg-audit): PG-DT-MIGRATE-02a — Cat-1/3/4/6 일괄 (95건 / 21 파일)
fa47244 fix(pg-audit): PG-DT-MIGRATE-02b — Cat-2 rolling window + loyalty JST month
fa01c1e docs(pg-audit): GPT DT migrate 02 review              (자이라)
66bc7c0 feat(pg-audit): PG-DT-MIGRATE-02 prep — tzdata + JST fallback + 2 helpers
50059ce docs(pg-audit): GPT CAP-05 review                     (자이라)
97713a7 fix(pg-audit): PG-CAP-05 IMPL — 3-Phase 분리 + update_menu re-enqueue
e0607f9 fix(pg-audit): GPT C+D 응답 반영 — date_only JST + WS cleanup + pool_recycle
... (이전 PG 컷오버 + STB 사이클 — archive/2026-05-stb-cycle.md)
```

---

## 다음 세션 시작 시 첫 메시지 템플릿

`tasks/zaira-next-session-start-message.md` 에 사용자 직접 복붙용 메시지 보관. 다음 세션 시작 시 그 내용 그대로 Claude 에 입력.

---

**v1 작성**: 2026-05-24 (PG 위험 감사 사이클 + 4 GPT cross-review + Deploy 성공 시점)
**v2 작성**: 2026-05-24 (자이라 수동 smoke 사이클 8 fix + 4 deploy 완료)
**다음 세션 추정 작업**: v2 후속 카드 (PG-AUDIT-SIBLING-GREP → PREDEPLOY-SMOKE-EXT → PG-AUDIT-OPTIONAL-NAMEERR → PG-AUDIT-TABLE-STATUS) 순. 그 후 v1 잔여 (PG-CAP-05b/c/d, DBM-13c/d, OPR-07, OPR-13, OPR-15).

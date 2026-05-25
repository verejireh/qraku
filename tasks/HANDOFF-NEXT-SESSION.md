# 다음 세션 핸드오프 (2026-05-25 v5 — Claude 카드 100% 소진 + deploy 대기)

> **다음 Claude 세션 시작 시 이 파일을 먼저 읽어주세요.**
> v1 = PG 컷오버 위험 감사 + 4 GPT cross-review + 첫 deploy 성공.
> v2 = 자이라 수동 smoke 에서 발견된 8 회귀 즉시 fix + 4 deploy 완료.
> v3 = 정리 단계 B/C/D/E + 출시 안정화 + stabilize → main 머지 완료.
> v4 = 출시 후 사후 처리 — ENUM 5/5 + DBM-13c/d + PG-CAP-05b/c + PWA 아이콘 완료.
> **v5 (본 갱신) = PG-CAP-05d + PayPay 자동 Order + P2 에러 정제 + 옛 docs 정리. Claude 측 backlog 100% 소진. origin/main push 완료, deploy 대기.**

## 🚨 v5 첫 우선 작업 — GPT 점검 (권장) → Deploy

**Deploy 전 GPT-5.5 cross-review 받기 권장** (이전 사이클 패턴과 일치 — 결제 critical + 신규 schema + race condition):
- [`zaira-gpt-send-prompt-paypay-auto-order.md`](./zaira-gpt-send-prompt-paypay-auto-order.md) — PAYPAY-AUTO-ORDER 점검 (🔴 강력 권장)
- [`zaira-gpt-send-prompt-pg-cap05d.md`](./zaira-gpt-send-prompt-pg-cap05d.md) — PG-CAP-05d 점검 (🟡 권장)

GPT must-fix 있으면 fix 후 deploy. 없으면 바로 deploy.

본 세션 11 commit 이 origin/main 에 push 됐으나 **운영 VM 에 deploy 안 됨**.
GPT 점검 후 (또는 점검 생략 결정 시) `python deploy.py` 실행. 그 후 자이라 수동 smoke 권장.

```bash
cd D:\myproject\orderservice   # main worktree (git pull 먼저)
git pull origin main
uv run deploy.py
```

Deploy 후 검증:
```bash
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 \
  "systemctl show qrorder -p MainPID -p NRestarts -p ActiveState; \
   curl -s -m 3 -o /dev/null -w 'healthz=%{http_code}\n' http://127.0.0.1:8003/api/healthz"
```

## 🎯 v5 핵심 — Claude 측 backlog 100% 소진 (11 commits)

본 세션 main 위로 누적된 11 commit (역순):

| Commit | 카드 | 내용 |
|---|---|---|
| 9e6cf84 | **PAYPAY-CLEANUP** | cleanup_pending_paypay_orders 액터 — PendingPayPayOrder TTL 정리 (cron 권장) |
| 35b9948 | docs(frontend) | Display Toggle URL 가드 "이미 처리됨" 명시 |
| 51c9d92 | docs(claude-md) | Display Toggle URL 가드는 이미 구현됨 — 옛 issue 정리 |
| 84d0288 | **PAYPAY-AUTO-ORDER** | PayPay webhook 자동 Order 생성 — PendingPayPayOrder 모델 + snapshot + 자동 생성 |
| 1acae42 | docs(claude-md) | outdated "미완료 작업" 정리 (PayPay Webhook + 환불 라우터는 이미 구현됨 표시) |
| 66f63b7 | **P2-ERROR-SANITIZE** | str(e) 직접 반환 5건 일반화 (menus / stores / oauth / demo) |
| bd45319 | docs(handoff) | PG-CAP-05d 완료 반영 |
| 06efbe3 | **PG-CAP-05d** | translate_menu name+desc Gemini batch (6→1 calls) — translate_menu_fields_batch 신규 |
| afed142 | docs(handoff) | v4 — 출시 후 사후 처리 사이클 완료 |
| c201a32 | **PWA-ICON-HIRES** | 192/512 PNG 아이콘 + manifest 등록 + tools/generate_pwa_icons.py |
| 1164187 | **PG-CAP-05b** | translate_menu time_limit 모니터링 |

(0ec2a95 DBM-13c/d 도 본 사이클 산물이나 v4 작성 전 push 됨)

## 🎯 v5 도중 발견된 핵심 — outdated docs 다수

CLAUDE.md / frontend-react/CLAUDE.md 의 "미완료 작업" / "Known Issues" 섹션이
실제 코드 상태와 불일치한 항목 다수 발견·정리:

| 항목 | 실제 상태 |
|---|---|
| PayPay Webhook 엔드포인트 | 이미 구현됨 ([webhooks.py:106](../backend/routers/webhooks.py:106)) — 본 사이클에서 자동 Order 생성 폴백 추가 |
| 환불 라우터 | 이미 구현됨 ([admin.py:499](../backend/routers/admin.py:499)) — 변경 불요 |
| Display Toggle URL 가드 | 이미 구현됨 ([useDisplayGuard.jsx](../frontend-react/src/hooks/useDisplayGuard.jsx)) — 4 view 전부 적용 |
| P2 에러 메시지 정제 | 본 사이클에서 5건 모두 정리 |

→ 다음 세션은 CLAUDE.md 가 신뢰 가능한 상태에서 시작.

## 🆕 v5 신규 모델 — PendingPayPayOrder

[backend/models.py:686](../backend/models.py) — PayPay 콜백 미진입 폴백용 cart snapshot.

- `merchant_payment_id` UNIQUE — 동일 결제 중복 저장 차단
- `cart_snapshot` (JSON Text) — `[{menu_id, quantity, option_details}]`
- `amount` (스탬프/쿠폰 차감 후 최종) + `guest_uuid` + `stamp_reward_used` + `coupon_id`
- `expires_at` (default +30분) + `consumed_at` — TTL + 멱등성

신규 테이블이라 `SQLModel.metadata.create_all` 자동 생성 (ALTER 불요).
**Deploy 후 첫 부팅 시 운영 PG 에 `pendingpaypayorder` 테이블 자동 생성됨.**

운영 cron 권장 (매시 정각):
```
0 * * * * cd ~/qr-order-system && .venv/bin/python -m dramatiq backend.workers \
          --processes 1 --threads 1 --path . -- cleanup_pending_paypay_orders.send()
```

## 🟡 진짜 남은 작업 (Claude 처리 불가 — 외부 자원 필요)

| ID | 항목 | 차단 사유 |
|---|---|---|
| **PAYPAY-E2E** | PayPay Direct E2E 테스트 | PayPay 개발자 계정 + sandbox API credentials 필요 |
| **OPR-07** | Alembic baseline stamp | 운영 VM SSH + `alembic stamp head` 1회 |
| **OPR-13** | Cloud SQL ilhae 비번 로테이션 | GCP Cloud SQL admin 권한 |
| **OPR-14** | 22 포트 방화벽 IP 재조정 | GCP VPC 권한 |
| **OPR-15** | pg_stat_statements 활성화 | Cloud SQL flag + 재시작 |
| **OPR-17** | VAPID 키 생성 | `npx web-push generate-vapid-keys` 1회 (운영자 결정) |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 | GCP 콘솔 5분 |
| **POS-SMAREGI** | Smaregi 어댑터 구현 | 외부 POS 계약 + API spec 필요 |
| **POS-AIRREGI** | AirRegi 어댑터 구현 | 외부 POS 계약 + API spec 필요 |
| **PAYPAY-CLEANUP-CRON** | cleanup_pending_paypay_orders cron 등록 | 운영 VM crontab 편집 |

## ⚠️ Deploy 시 주의

본 세션 변경 중 **schema 변경 1건 (신규 테이블)**:
- `PendingPayPayOrder` 테이블 — `SQLModel.metadata.create_all` 가 첫 부팅 시 자동 생성
- ALTER TABLE 마이그레이션 없음 — `database.py.migration_sqls` 변경 없음
- Cloud SQL 의 advisory_xact_lock 단일 트랜잭션 패턴 (ad19215) 에 안전하게 통합됨

Deploy 후 첫 검증:
```bash
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 \
  "psql 'host=127.0.0.1 port=5432 user=ilhae dbname=qraku' \
   -c '\\dt pendingpaypayorder'"
```
→ table 표시되면 OK.

## 📋 권장 자이라 smoke 시나리오 (deploy 후)

본 세션 변경 코드의 검증 우선순위:

1. **PayPay 결제 → 콜백 페이지 닫기 → webhook 자동 Order 생성**
   - sandbox 환경 권장 (실제 결제 금액 0~수십엔 테스트)
   - 결제 후 콜백 페이지를 의도적으로 닫음 → KDS 에 새 주문 나타나는지 확인
   - DB `pendingpaypayorder.consumed_at` 설정 확인

2. **PayPay 결제 → 콜백 페이지 정상 폴링 (기존 경로)**
   - 회귀 없음 확인 (square_payment_id UNIQUE 로 race 방지)

3. **메뉴 신규 생성 시 번역 시간 단축 확인**
   - PG-CAP-05d 효과: 6 calls → 1 call (~6× 빨라짐)
   - WS 알림 `TRANSLATION_COMPLETED` 도착 시간 측정

4. **에러 메시지 일반화 확인**
   - 잘못된 이미지 업로드 시 일반 메시지 ("画像ファイルを処理できませんでした...")
   - 데모 생성 실패 시 일반 메시지 ("デモストアの作成に失敗しました...")

5. **PWA 아이콘 — 모바일에서 홈 화면 추가 시 192/512 아이콘 표시**

---

## 🎉 v4 핵심 — 출시 후 사후 처리 사이클 완료 (2026-05-25)

main 머지 후 "출시 후 사후 처리 OK" 섹션의 카드를 소진. 남은 Claude 작업은 PG-CAP-05d (6× 성능, 후순위) 1건만.

| 카드 | Commit | 비고 |
|---|---|---|
| PG-AUDIT-ENUM-CONSISTENCY 5/5 | d468a13 / 4a90049 / ed027f1 / 97888c0 / 7b2a97b | MessageSender / StoreCategory / POSType / PaymentMethod / MenuGroup |
| DBM-13c/d | 0ec2a95 | deployment.md + architecture.md PG 재작성 |
| PG-CAP-05b | 1164187 | translate_menu time_limit 모니터링 |
| PWA-ICON-HIRES | c201a32 | icon-192.png + icon-512.png + manifest 등록 + tools/generate_pwa_icons.py |
| PG-CAP-05d | 06efbe3 | translate_menu name+desc Gemini batch (6→1 calls) — translate_menu_fields_batch 신규 |

**Claude 카드 모두 소진 — 남은 stabilization 작업 0건.**
운영자(자이라) 카드: OPR-07 / OPR-13 / OPR-14 / OPR-15 / OPR-17 / OPS-04.

---

## 🎉 v3 핵심 — 정식 출시 상태

- ✅ stabilize/post-pg-cutover → main 머지 완료 (**25675d3**)
- ✅ origin/main 푸시 완료
- ✅ 운영 PID 648952 active/running, healthz 200
- ✅ predeploy_smoke 8/8 PASS (회귀 자동 차단 #7 + #8)
- ✅ 출시 차단 요소 0

**main 머지 commit 의 코드 = stabilize 마지막 deploy 코드** — 별도 재배포 불요.

다음 세션 작업 위치는 **메인 worktree `D:\myproject\orderservice` (main 브랜치)** 권장. stabilize worktree 는 별도 사이클 시작 시까지 유지.

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

## 🎯 v2 정리 단계 (B/C/D/E) 처리 결과

| 카드 | 결과 |
|---|---|
| B. PG-AUDIT-SIBLING-GREP | ✅ 자매 회귀 0건 |
| C. PREDEPLOY-SMOKE-EXT | ✅ 1460b9d (#7 db_compat compile) + 6ea1888 (#8 SQLModel Enum name==value) — 8/8 PASS, allowlist 17 mismatch 추적 |
| D. PG-AUDIT-OPTIONAL-NAMEERR | ✅ 옛 nohup 1회 단발, 현재 코드 정상 |
| E. PG-AUDIT-TABLE-STATUS | 🔴 **P0 시한폭탄 발견·해소 (58e9d2f)** |
| PWA-ICON-HIRES | 🟢 미진행 (선택) |

**E 의 P0 가 결정적 추가 발견**: 자이라가 「テーブル管理」/KDS 페이지 미진입이라 표면화 안 됐을 뿐 운영자 실사용 시 1초 안에 발견될 P0. PaymentOptions 와 동일 회귀 (9cd70de 의 자매). 운영 hotfix (18 rows) + 코드 fix (backend 8 + frontend 2 위치) + deploy 완료. 운영 PG verify: Table hydrated OK.

운영 마지막 PID 645221+ (TableStatus deploy 후), active/running, healthz 200.

## 🎯 다음 세션 후속 카드 (E 단계에서 갈라진 분리)

1. **PG-AUDIT-KITCHEN-SQUARE** (🟡) — KitchenMode.SQUARE("square") 도 동일 회귀 잠재. 매장이 Square 모드 활성화 시 발생. 현재 운영 데이터 0건.
2. **PG-AUDIT-ENUM-CONSISTENCY** (🟡) — PaymentMethodType / POSType / MenuGroupType / MessageSenderType 의 컬럼 type (str vs Enum) 일괄 점검. plain str 이면 안전, Enum 이면 회귀 잠재.
3. **PWA-ICON-HIRES** (🟢 선택) — 192/512 PNG 생성.

그 후 v1 잔여: PG-CAP-05b/c/d, DBM-13c/d, OPR-07/13/15, OPS-04.

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
6ea1888 test(predeploy): #8 — SQLModel Enum field name==value 회귀 차단           ← v2 정리 (C 보강)
4548533 docs(handoff): v2 정리 단계 B/C/D/E 처리 결과 + E 의 P0 발견 기록          ← v2 정리 (handoff)
58e9d2f fix(pg-audit): PG-AUDIT-TABLE-STATUS — TableStatus enum 대문자 통일       ← v2 정리 (E, P0)
1460b9d test(predeploy): PREDEPLOY-SMOKE-EXT — db_compat compile 회귀 자동 차단    ← v2 정리 (C)
d940622 docs(handoff): v2 갱신 — 자이라 smoke 사이클 8 fix 기록                    ← v2 정리 (A)
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
**v2 작성**: 2026-05-24 (자이라 smoke 사이클 8 fix + 4 deploy + 정리 단계 B/C/D/E 처리 — E 에서 P0 시한폭탄 추가 발견·해소)
**다음 세션 추정 작업**: E 분리 카드 (PG-AUDIT-KITCHEN-SQUARE → PG-AUDIT-ENUM-CONSISTENCY) → v1 잔여 (PG-CAP-05b/c/d, DBM-13c/d, OPR-07, OPR-13, OPR-15). 자이라 수동 smoke 확장 권장: 「テーブル管理」/KDS/register 페이지 진입 + 결제 사이클까지 (본 P0 가 KDS hit 안 해서 표면화 안 된 교훈).

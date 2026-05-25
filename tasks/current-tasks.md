# Current Tasks — stabilize/post-pg-cutover

> **STB 사이클 완료** (2026-05-21). 전체 결과는 [`archive/2026-05-stb-cycle.md`](./archive/2026-05-stb-cycle.md) 참조.
>
> **PG 컷오버 위험 감사** (2026-05-21~22): P0 6개 코드 수정 + 운영 VM 검증 완료. [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md) 참조.
>
> **2026-05-24 자이라 수동 smoke 사이클**: 8 회귀 발견·즉시 fix·deploy 완료 (work-log 2026-05-24). 본 브랜치는 main 머지 대기 중.

---

## 🔥 2026-05-24 자이라 수동 smoke 사이클 — 8 fix 완료

자이라가 브라우저 console error 보고 → claude 가 트레이스·root cause·fix·deploy 사이클 반복. 운영 즉시 hotfix + 4 deploy.

| # | Commit | 카드 | 상태 |
|---|---|---|---|
| 1 | 5fc4305 | **PG-AUDIT-PAYMENT-OPT** — admin login 500 fix | ✅ deploy + 검증 |
| 2 | 697adac | **PG-AUDIT-GROUPBY** — db_compat timezone literal | ✅ deploy + 운영 PG verify |
| 3 | 08cf920 | **PG-AUDIT-GROUPBY** follow-up — `+1` literal | ✅ deploy + 운영 PG verify |
| 4 | 92a4879 | **PG-AUDIT-MANIFEST** — SPA fallback 정적 자산 우선 | ✅ deploy + curl 검증 |
| 5 | 118db7a | **PG-AUDIT-DECIMAL** — `hour/year/month/day_of_week` Integer 캐스트 | ✅ deploy + 운영 PG verify |
| 6 | 5071572 | **PG-AUDIT-FAVICON** — manifest icon sizes 정합 | ✅ deploy + curl 검증 |
| 7 | b5bd322 | **PG-AUDIT-SW** — sw.js `res.clone()` 타이밍 + v2 | ✅ deploy |
| 8 | 54d2d06 | **PG-AUDIT-SW2** — `e.waitUntil` 제거, v3 | ✅ deploy + sw.js curl 검증 |

운영 즉시 hotfix:
- `UPDATE store SET payment_options = 'CASH_ONLY' WHERE = 'cash_only'` + `CARD_AND_CASH` (6 rows) — admin login 즉시 복구

상세: [`work-log.md` 2026-05-24](./work-log.md).

### 본 사이클에서 갈라진 후속 카드 — 정리 단계 처리 결과

| ID | 항목 | 상태 |
|---|---|---|
| **PG-AUDIT-SIBLING-GREP** | 자매 회귀 grep | ✅ 0건 확인 (db_compat 외 위험 패턴 없음) |
| **PREDEPLOY-SMOKE-EXT** | predeploy_smoke #7 db_compat compile + #8 SQLModel Enum name==value | ✅ 1460b9d + 6ea1888 (8/8 PASS) |
| **PG-AUDIT-OPTIONAL-NAMEERR** | NameError: Optional 단발 트레이스 | ✅ 옛 nohup 1회 단발, 현재 코드 정상 |
| **PG-AUDIT-TABLE-STATUS** | TableStatus 자매 mismatch | 🔴 **P0 시한폭탄 발견 → 즉시 hotfix + 코드 fix 완료 (58e9d2f)** |
| **PWA-ICON-HIRES** | 192/512 PNG 생성 | 🟢 선택 (미진행) |

상세: [`work-log.md` 2026-05-24 후속 카드 B/C/D/E 섹션](./work-log.md).

### 출시 전 잔여 작업

| ID | 항목 | 상태 |
|---|---|---|
| **PG-AUDIT-KITCHEN-SQUARE** | KitchenMode.SQUARE = "SQUARE" 통일 + backend/frontend sync | ✅ **f643f0c** (deploy 완료, allowlist 17→16) |
| **PG-CAP-05c** | translate_text strict mode + worker strict=True | ✅ **49b2f5f** (deploy 완료) |
| **🟡 자이라 수동 smoke 확장 (P5)** | KDS/register/테이블관리/결제 사이클까지 검증 — TableStatus P0 같은 폭탄 추가 발견 가능 | 사장님 작업 대기 |
| **🟢 main 머지 (P6)** | 모든 P0/P1 닫힌 후 GPT 최종 review → 머지 | smoke 확장 결과 보고 후 |

### 출시 후 (사후 처리)

| ID | 항목 | 상태 |
|---|---|---|
| **PG-AUDIT-ENUM-CONSISTENCY** | allowlist 16 mismatch 일괄 정리 (MessageSenderType / StoreCategory / POSType / PaymentMethodType / MenuGroupType) | ✅ **5/5 완료** — d468a13, 4a90049, ed027f1, 97888c0, 7b2a97b |
| **PG-CAP-05b** | translate task time_limit=60_000 운영 모니터링 (옵션 풍부 메뉴) | ✅ **1164187** |
| **DBM-13c/d** | docs/deployment.md (499줄) + docs/architecture.md (263줄) PG 재작성 | ✅ **0ec2a95** |
| **PWA-ICON-HIRES** | 192/512 PNG 생성 + manifest.json 등록 (PWA install icon 품질) | ✅ **본 사이클** — tools/generate_pwa_icons.py + icon-192.png + icon-512.png |
| **PG-CAP-05d** | translate_batch_with_gemini 활용 — 6× 성능 향상 (큰 변경) | 🟢 미진행 (후순위) |

### 운영자 직접 작업 (자이라 권한)

| ID | 항목 |
|---|---|
| **OPR-07** | Alembic baseline stamp — 운영 VM 1회 `alembic stamp head` |
| **OPR-13** | Cloud SQL `ilhae` 비번 로테이션 (채팅 노출 이력) |
| **OPR-15** | pg_stat_statements 활성화 (Cloud SQL flag + CREATE EXTENSION) |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 |
| **OPR-14** | 운영 VM 22 포트 방화벽 IP 재조정 (IAP 룰) |
| **OPR-17** | VAPID 키 생성 (Web Push) |
| **PWA-ICON-HIRES** | PWA install icon 품질 — 192/512 PNG 생성 | 🟢 선택 |

---

## ✅ Deploy 완료 (2026-05-22 12:30 JST)

모든 P0/P1 변경이 라이브 적용됨. backend.log + systemctl 검증 완료.

| 적용 항목 | 검증 결과 |
|---|---|
| systemd unit 갱신 (KillMode=mixed, on-failure, StartLimit, ExecStartPre 2단계) | ✅ `systemctl show qrorder` 로 확인 |
| restart_uvicorn.sh deprecation | ✅ 로컬 + VM `~/restart_uvicorn.sh` 둘 다 교체 |
| datetime 9시간 오프셋 3건 (menu_groups, menus, orders pickup) | ✅ 다음 점심 시간 (JST 11:00~14:00) 실 손님 검증 가능 |
| init_db advisory_xact_lock 단일 트랜잭션 | ✅ backend.log `✅ DB 테이블 초기화 완료` 1회 출력 |
| enum cast (`::text`) | ✅ stderr 노이즈 0건 (이전 매 부팅 7건) |
| db_compat.py JST 변환 | ✅ 운영 PG SQL 검증 통과 |
| WS dead connection cleanup | ✅ 적용 (실 동작은 send 실패 발생 시 가시) |
| pool_recycle=300 (async + sync) | ✅ 적용 |
| Dockerfile --reload 제거 | ✅ 적용 (production docker 미사용이라 무영향) |
| deploy.py SSH 키 경로 fix | ✅ 이번 커밋 — 다음 deploy 부터 worktree 에서 직접 실행 가능 |

배포 시 발견된 후속 버그 (수정 완료):
- deploy.py 의 `os.path.dirname(__file__) + "../qraku"` 가 worktree 환경에서 실패 → `~/.ssh/qraku` 우선 사용 패턴
- `.gitattributes` 적용에도 working tree CRLF 잔존 → VM 에서 `tr -d '\r'` 수동 변환 필요 (1회성)

---



---

## 🟡 DBM-13 후속 — codex_survey 항목 정리 (2026-05-22)

[`codex-survey-2026-05-21.md`](./codex-survey-2026-05-21.md) 의 8개 항목 처리 결과:

| # | 항목 | 상태 |
|---|---|---|
| 1 | `docker-compose.yml` PG 기본 | ✅ 이미 정리됨 (검증만) |
| 2 | `backend/.env.example` PG 기본 | ✅ 이미 정리됨 (검증만) |
| 3 | `docs/deployment.md` MySQL 절차 제거 | 🟡 **별도 카드** (499줄 재작성 필요) |
| 4 | `docs/architecture.md` DB 설명 갱신 | 🟡 **별도 카드** (263줄 재작성 필요) |
| 5 | `backend/claude.md` PG 갱신 | ✅ 이번 커밋 (3 곳 수정) |
| 6 | SQLite legacy migrate scripts | ✅ 이번 커밋 (`backend/legacy/` 14 파일 이동 + README) |
| 7 | DB URL 변환 helper 검증 | ✅ 기능 OK (utils/db.py to_sync_url) |
| 8 | E2E 산출물 gitignore | ✅ a25dbf4 |

신규 카드:
- **DBM-13c** docs/deployment.md PG 재작성 (~499줄)
- **DBM-13d** docs/architecture.md PG 재작성 (~263줄)

---

## 🟢 살아있는 카드 — 운영자 실행 필요

| ID | 항목 | 담당 | 기한 | 비고 |
|---|---|---|---|---|
| **DBM-13** | MySQL 의존 정리 (코드 + 운영) | 운영자 | 2026-05-26 `systemctl stop mysql` / 2026-06-02 purge | 코드 정리는 feature/qraku-specialize 에서 완료 |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 | 운영자 | — | GCP 콘솔 5분 |
| **OPR-14** | 운영 VM 22 포트 방화벽 IP 재조정 | 운영자 | — | IAP 룰 활용 |
| **OPR-15** | pg_stat_statements 활성화 (Cloud SQL flag + CREATE EXTENSION) | 운영자 | — | Cloud SQL 인스턴스 재시작 필요. 50매장 트래픽 분석 핵심 |
| **OPR-17** | VAPID 키 생성 (Web Push) | 운영자 | — | `npx web-push generate-vapid-keys` |
| **OPR-07** | Alembic baseline stamp (운영 VM 1회) | 운영자 | — | `alembic.ini` 운영 VM 배포 후 `alembic stamp head`. 현재 `script_location` 미설정 |
| **OPR-13** | Cloud SQL `ilhae` 비번 로테이션 | 운영자 | 우선 | 채팅 노출 이력 있음 |

---

## ✅ GPT-5.5 cross-review F + G 완료 + 반영

| ID | 항목 | GPT review | 코드 반영 |
|---|---|---|---|
| **세션 F** | PG-CAP-05 translate_menu | [`gpt-pg-cap05-review.md`](./gpt-pg-cap05-review.md) | 97713a7 — 3-Phase 분리 + update_menu re-enqueue + 7 must-fix |
| **세션 G** | PG-DT-MIGRATE-02 분석 | [`gpt-pg-dt-migrate-02-review.md`](./gpt-pg-dt-migrate-02-review.md) | 66bc7c0 — tzdata + JST fallback + 2 helpers + 누락 5건 분류 |

PG-DT-MIGRATE-02 코드 변환 완료:
- ✅ **PG-DT-MIGRATE-02b** (fa47244): Cat-2 rolling window + loyalty_analytics JST month 버그 수정
- ✅ **PG-DT-MIGRATE-02a** (eeab9e9): Cat-1/3/4/6 일괄 (95건 / 21 파일) + models.py default_factory 29건

## ✅ GPT-5.5 cross-review 세션 H 완료 + 반영

| 항목 | 결과 |
|---|---|
| 세션 H 응답 | [`gpt-pg-dt-migrate-02a-impl-review.md`](./gpt-pg-dt-migrate-02a-impl-review.md) (9b38125, GPT) |
| **02a deploy 가능 판정** | ✅ 승인 — naive UTC DB 계약 보존, schema 변경 없음 |
| **PG-CAP-05 + 02a 한 deploy** | ✅ 권고 (둘 다 독립적, schema 변경 없음) |
| 정정 — JWT 라이브러리 | python-jose (PyJWT 아님). 의미는 동일 |
| Cleanup — `ws_token.py` Z → +00:00 일관성 | 이번 커밋 |
| 운영 smoke 자동화 — `tools/predeploy_smoke.py` | 이번 커밋, local 6/6 PASS |

남은 후속 카드 (응답 무관 진행 가능):
- ✅ **PG-DT-MIGRATE-02c** (이번 커밋): Cat-5 seed/legacy 3건 cleanup — 실 코드 utcnow 100% 변환 (잔존 매치는 주석/docstring)
- ✅ **PG-DT-DG-04** (이번 커밋): 핫패스 4 위치 UTC range 전환 + `jst_day_range_as_utc_naive` helper. 분석 doc [`p1-dt-dg-04-hotpath-utc-range-analysis.md`](./p1-dt-dg-04-hotpath-utc-range-analysis.md). EXPLAIN 비교 + boundary smoke 완료.
- 🟢 **PG-DT-DG-05**: raw SQL date function grep + frontend target_date 검증
- 🟢 **PG-DT-DG-06**: hourly chart `int(row.hour)` 정규화
- 🟢 **PG-CAP-05b**: time_limit=60_000 모니터링 (옵션 풍부 메뉴 60s 초과)
- 🟢 **PG-CAP-05c**: translate_text strict mode (Gemini exception silent fail 차단)
- 🟢 **PG-CAP-05d**: translate_batch_with_gemini 활용 (6× 성능)

## 🔴 다음 deploy 사이클 (라이브 적용 대기)

stabilize/post-pg-cutover 누적 변경 라이브 발동:
- PG-CAP-05 IMPL (translate_menu 3-phase + update_menu re-enqueue)
- PG-DT-MIGRATE-02 prep + 02b + 02a (95건 + JST month 버그 + tzdata)
- db_compat JST 변환
- WS dead connection cleanup
- pool_recycle (async + sync)

권장 — 세션 H 응답 반영 후 deploy.

---

## ✅ GPT-5.5 cross-review 완료

| ID | 항목 | 결과 |
|---|---|---|
| **GPT-PG-REVIEW-2** | 운영 VM 검증 결과 2nd opinion | [`gpt-pg-verification-review.md`](./gpt-pg-verification-review.md) 신뢰도 82/100. 6개 보강 항목 적용 완료 |
| **세션 C** | P1 #7 datetime 전략 | [`gpt-p1-datetime-review.md`](./gpt-p1-datetime-review.md). date_only UTC day 신규 발견 → PG-DT-DG 별도 카드 분리 |
| **세션 D** | P1 #9 capacity 모델 | [`gpt-p1-capacity-review.md`](./gpt-p1-capacity-review.md). translate_menu DB session hold → PG-CAP-05 분리 |
| **세션 E** | PG-DT-DG (date_only JST 옵션 A) | [`gpt-p1-date-grouping-review.md`](./gpt-p1-date-grouping-review.md). 성능 우려 (인덱스 매칭) → PG-DT-DG-04 핫패스 range 전환 카드 분리 |

---

## 🔴 워커 증설 차단 (GPT 권고 — 선행조건 충족 전 보류)

`--workers > 1` 적용 전 다음 모두 충족 필요:

| 조건 | 상태 |
|---|---|
| P1 #8 advisory lock 또는 Alembic 이행 | 분석 완료 ([`p1-init-db-race-analysis.md`](./p1-init-db-race-analysis.md)), Strategy 2/3 미적용 |
| DB pool 총량 재계산 (`pool_size=10` × `max_overflow=20` × N workers ≤ Cloud SQL `max_connections`) | 현재 `max_connections=100`, 1 worker × 30 = 30 OK. workers=4 이면 120 > 100 → 차단 |
| Cloud SQL `max_connections` 상향 또는 pool 축소 | 미진행 |
| `tools/pg_query_audit.py` p95 기준 통과 | 미실행 |

---

## 🧪 STB 사이클 산출물 — 운영 환경 실행 필요

STB 코드 작업은 완료. 다음 항목은 라이브 환경에서 운영자가 실행해야 결과가 나옴.

| 항목 | 조건 | 명령 |
|---|---|---|
| Playwright 골든패스 20 tests | 백엔드 :8003 + Vite :5173 가동 | `cd frontend-react && npm run test:e2e` |
| Square 결제 테스트 | SQUARE_APP_ID / SQUARE_LOCATION_ID / SQUARE_ACCESS_TOKEN | 동상 |
| PG 쿼리 성능 감사 | PostgreSQL 연결 + 시드 데이터 | `python tools/pg_query_audit.py --store-id 1 --admin-token ...` |
| 데이터 일관성 감사 | DATABASE_URL 설정 | `DATABASE_URL=... python tools/data_consistency_audit.py` ✅ **2026-05-22 운영 VM 실행 — 5/5 PASS** |

---

## 참고

- STB 전체 결과: [`archive/2026-05-stb-cycle.md`](./archive/2026-05-stb-cycle.md)
- PG 컷오버 사이클: [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md)
- PG 위험 감사: [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) + [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md)
- SPC 사이클: `feature/qraku-specialize` 브랜치 `tasks/archive/2026-05-spc-cycle.md`

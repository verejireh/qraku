# Current Tasks — stabilize/post-pg-cutover

> **STB 사이클 완료** (2026-05-21). 전체 결과는 [`archive/2026-05-stb-cycle.md`](./archive/2026-05-stb-cycle.md) 참조.
>
> **PG 컷오버 위험 감사** (2026-05-21~22): P0 6개 코드 수정 + 운영 VM 검증 완료. [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md) 참조.
>
> 본 브랜치는 main 머지 대기 중. 아래 운영자 카드 + 라이브 unit 적용 후 병합.

---

## 🔴 다음 deploy 사이클에 적용 필요

| ID | 항목 | 변경 사항 | 검증 |
|---|---|---|---|
| **PG-AUDIT-FIX** | setup_server.sh + qrorder.service unit 갱신 | 72e3e50 — orphan 재발 방지 (ExecStartPre fuser, KillMode=mixed, TimeoutStopSec=10, nohup 제거) | 다음 deploy 시 자동 적용. 적용 후 `systemctl show qrorder` 로 `KillMode=mixed` 확인 |

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

## ✅ GPT-5.5 cross-review 완료

| ID | 항목 | 결과 |
|---|---|---|
| **GPT-PG-REVIEW-2** | 운영 VM 검증 결과 2nd opinion | [`gpt-pg-verification-review.md`](./gpt-pg-verification-review.md) 신뢰도 82/100. 6개 보강 항목 적용 완료 (`restart_uvicorn` deprecation, systemd `on-failure`+StartLimit, 2단계 KILL, Dockerfile `--reload` 제거, CHECK 4 실데이터 재검증, worker 증설 차단 카드 분리) |

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

# Current Tasks — stabilize/post-pg-cutover

> **STB 사이클 완료** (2026-05-21). 전체 결과는 [`archive/2026-05-stb-cycle.md`](./archive/2026-05-stb-cycle.md) 참조.
>
> 본 브랜치는 main 머지 대기 중. 아래 운영자 카드 처리 후 병합.

---

## 🟢 살아있는 카드 — 운영자 실행 필요

| ID | 항목 | 담당 | 기한 | 비고 |
|---|---|---|---|---|
| **DBM-13** | MySQL 의존 정리 (코드 + 운영) | 운영자 | 2026-05-26 `systemctl stop mysql` / 2026-06-02 purge | 코드 정리는 feature/qraku-specialize 에서 완료 |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 | 운영자 | — | GCP 콘솔 5분 |
| **OPR-14** | 운영 VM 22 포트 방화벽 IP 재조정 | 운영자 | — | IAP 룰 활용 |
| **OPR-17** | VAPID 키 생성 (Web Push) | 운영자 | — | `npx web-push generate-vapid-keys` |

---

## 🧪 STB 사이클 산출물 — 운영 환경 실행 필요

STB 코드 작업은 완료. 다음 항목은 라이브 환경에서 운영자가 실행해야 결과가 나옴.

| 항목 | 조건 | 명령 |
|---|---|---|
| Playwright 골든패스 20 tests | 백엔드 :8003 + Vite :5173 가동 | `cd frontend-react && npm run test:e2e` |
| Square 결제 테스트 | SQUARE_APP_ID / SQUARE_LOCATION_ID / SQUARE_ACCESS_TOKEN | 동상 |
| PG 쿼리 성능 감사 | PostgreSQL 연결 + 시드 데이터 | `python tools/pg_query_audit.py --store-id 1 --admin-token ...` |
| 데이터 일관성 감사 | DATABASE_URL 설정 | `DATABASE_URL=... python tools/data_consistency_audit.py` |

---

## 참고

- STB 전체 결과: [`archive/2026-05-stb-cycle.md`](./archive/2026-05-stb-cycle.md)
- PG 컷오버 사이클: [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md)
- SPC 사이클: `feature/qraku-specialize` 브랜치 `tasks/archive/2026-05-spc-cycle.md`

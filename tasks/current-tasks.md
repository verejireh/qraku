# Current Tasks

> **2026-05-20 SPC 사이클 종료**: qraku-specialize 기능 11개 카드 완료.
> 상세는 [`archive/2026-05-spc-cycle.md`](./archive/2026-05-spc-cycle.md) 참조.
> 본 파일은 **살아있는 카드** 만 보관.

---

## 작업 완료 시 필수 절차

각 카드 종료 시 **두 가지**:

1. **진행 보드 상태 갱신** — `TODO → ✅ DONE`
2. **`tasks/work-log.md` append** — 기존 템플릿 사용

사이클 종료 시: ✅ DONE 카드를 `archive/{YYYY-MM-cycle-name}.md` 로 압축 이전 → 본 파일은 다시 살아있는 카드만.

---

## 🟢 살아있는 카드

| ID | 항목 | 담당 | 기한 | 비고 |
|---|---|---|---|---|
| **DBM-13** | MySQL 의존 정리 + 최적화 | 운영자 + sonnet | 2026-05-26 (D+7) | `systemctl stop mysql`, D+14 (2026-06-02) purge |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 추가 | 운영자 | — | GCP 콘솔에서 5분 |

---

## 운영자 미완료 (코드 외)

| ID | 항목 | 비고 |
|---|---|---|
| ~~OPR-01~~ | ~~`ENCRYPTION_KEY`~~ | ✅ DONE (2026-05-20, 새 Fernet 키 발급 + `.env` 갱신 + `qrorder` restart. 이전 평문 fallback 종료) |
| OPR-02 | `VITE_LINE_LIFF_ID` | (이전 사이클 carry) |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` | (이전 사이클 carry) |
| OPR-04 | `VISION_API_KEY` (선택) | (이전 사이클 carry) |
| OPR-06 | PayPay 콘솔 webhook URL | (이전 사이클 carry) |
| OPR-07 | Alembic baseline stamp | (이전 사이클 carry) |
| OPR-08 | `PAYPAY_WEBHOOK_SECRET` | (이전 사이클 carry) |
| ~~OPR-13~~ | ~~Cloud SQL `ilhae` 비번 로테이션~~ | ✅ DONE (2026-05-20) |
| **OPR-14** | **운영 VM 22 포트 방화벽 IP 재조정** | IAP 룰 (`allow-iap-ssh-real`, `35.235.240.0/20`) 활용 권장 |
| ~~OPR-15~~ | ~~Google Maps API 키~~ | ❌ 제거 (SPC-04 v1.3 — 외부 링크 + Embed iframe, 0원) |
| ~~OPR-16~~ | ~~Cloud SQL PostGIS 활성화~~ | ✅ DONE (2026-05-20, PostGIS 3.6.0. 도쿄↔고텐바 86km 정확) |
| **OPR-17** | **VAPID 키 생성 (Web Push, SPC-06)** | `npx web-push generate-vapid-keys` → `.env` VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY |
| ~~OPR-18~~ | ~~운영 VM `.env` CRLF → LF~~ | ✅ DONE (2026-05-20) |
| ~~OPR-19~~ | ~~`ENCRYPTION_KEY` 회전 검토~~ | ✅ DONE (2026-05-20, OPR-01 과 동시) |

---

## 카드 정의

---

## 🟦 DBM-13 — MySQL 의존 코드 정리

**Owner**: 운영자 + sonnet
**Priority**: 🟡 P2
**Due**: 2026-05-26 (컷오버 D+7), purge 2026-06-02 (D+14)

### 배경

PostgreSQL 컷오버 (2026-05-19) 이후 MySQL 프로세스는 운영 VM 에서 여전히 실행 중. D+7~D+14 안에 완전 제거. 코드에도 `aiomysql`, MySQL 전용 문법 잔재가 남아있을 수 있음.

### 코드 작업 (sonnet)

1. `pyproject.toml` 에서 `aiomysql` / `PyMySQL` 의존 제거
2. `backend/database.py` — `mysql+aiomysql://` 분기 코드 제거, PostgreSQL 전용으로 단순화
3. `backend/database.py migration_sqls` — MySQL 전용 문법 잔재 확인 (백틱, `AUTO_INCREMENT`, `ENGINE=InnoDB` 등)
4. 기타 파일 MySQL 흔적 grep (`.env.example`, `docker-compose.yml`, `docs/` 등)

### 운영자 작업 (순서 중요)

```bash
# D+7 (2026-05-26) — 프로세스 중지
sudo systemctl stop mysql
sudo systemctl disable mysql

# D+14 (2026-06-02) — 패키지 제거
sudo apt-get purge mysql-server mysql-client -y
sudo apt-get autoremove -y
# MySQL 데이터 디렉터리 제거 전 최종 확인 후:
sudo rm -rf /var/lib/mysql
```

### 수용 기준

- [ ] `pyproject.toml` 에 `aiomysql` / `PyMySQL` 없음
- [ ] `database.py` MySQL 분기 코드 없음
- [ ] migration_sqls 모든 항목 PostgreSQL 호환
- [ ] 운영 VM MySQL 프로세스 중지 + D+14 제거

---

## 참고 (이전 사이클)

- SPC 사이클: [`archive/2026-05-spc-cycle.md`](./archive/2026-05-spc-cycle.md)
- DBM 사이클: [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md)
- SaaS 인프라: [`archive/2026-05-saas-infra-cycle.md`](./archive/2026-05-saas-infra-cycle.md)
- DBM 도구 (영구 유지): `tools/{pg_data_migrator,migration_check,rollback_resync,init_pg_schema,cloud-sql-proxy.service}`
- DBM 문서: `tasks/db-migration-audit.md`, `tasks/db-migration-runbook.md`, `docs/adr/006~008.md`
- 마케팅 프로젝트: `D:\myproject\qraku-marketing\` (별도 폴더)

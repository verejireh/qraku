# Archive — 2026-05 PostgreSQL Migration Cycle

> **사이클 기간**: 2026-05-11 ~ 2026-05-19 (계획 + 실행)
> **결과**: 운영 backend 가 MySQL `kiospad` → Cloud SQL PostgreSQL `qraku` 로 완전 이전 (2026-05-19 08:13 UTC 컷오버)
> **잔여**: DBM-13 (D+7 ~ D+14 MySQL 정리), OPS-04 모니터링 알람 (운영자 GCP 콘솔)

---

## 사이클 동기

- 차별화 기능 (qraku-specialize) 의 핵심인 **위경도 기반 "10분 도보 거리" 발견 페이지** 구현에 PostGIS 필요
- 그 외 부수 효과: MySQL 8 의 일부 제약 (auth plugin, replication 등) 회피, GCP 통합 강화

---

## 카드별 결과 요약

### Phase A — 감사 + 설계 (DBM-01~03, opus)

| 카드 | 결과 | 산출물 |
|---|---|---|
| **DBM-01** | MySQL → PG 호환성 감사 | `tasks/db-migration-audit.md` (985줄). 백틱 19+건, JSON, ENUM, MODIFY COLUMN 등 식별 |
| **DBM-02** | Cloud SQL 사양 + 도구 + 컷오버 전략 | audit §13 + `docs/deployment.md` §11. `db-custom-1-3840` (1 vCPU/3.75GB), asia-northeast1, pgloader 결정 (나중에 변경됨) |
| **DBM-03** | ADR 006/007/008 | PostgreSQL 이전 결정 + pgloader 선택 (superseded) + big-bang 컷오버 전략 |

### Phase B — 코드 호환화 (DBM-04~07, sonnet)

| 카드 | 결과 |
|---|---|
| **DBM-04** | `pyproject.toml` 에 `asyncpg`, `psycopg2-binary` 추가. `backend/utils/db.py` 의 `to_sync_url()` 헬퍼 (asyncpg → psycopg2 변환, alembic/dramatiq 용) |
| **DBM-05** | `backend/database.py` migration_sqls ANSI 호환화 — 백틱 → `"`, `IF NOT EXISTS` 추가, 트랜잭션 항목별 분리 |
| **DBM-05b** | `backend/routers/demo.py` 백틱 → 양 DB quote char 동적 결정 |
| **DBM-05c** | `backend/utils/db_compat.py` 신규 + `stats/register/super_admin` 26건 교체 (MySQL 날짜 함수 → PG 호환) |
| **DBM-06** | `alembic/env.py` + `backend/workers/db.py` 양 DB 지원 (to_sync_url 호출) |
| **DBM-07** | `docker-compose.yml` 에 postgres 서비스 추가 |

### Phase C — schema 검증 (DBM-08, DBM-08b)

| 카드 | 결과 |
|---|---|
| **DBM-08** | Cloud SQL `postgre-sql` (PG 16.13) 에 `init_pg_schema.py` 실행 → 30 테이블 생성 + 핵심 컬럼 10/10 OK |
| **DBM-08b** | PG 환경 backend 통합 부팅 검증. **SQLAlchemy URL string 파싱 버그 발견** — 특수문자 (`!`, `~`, `#`) 비번 인증 실패. `backend/database.py` 패치 — DB_USER/DB_PASS env 받으면 `URL.create()` 로 조립 (asyncpg + psycopg2 둘 다 영향) |

### Phase D — 데이터 이전 (DBM-09, DBM-10)

| 카드 | 결과 |
|---|---|
| **DBM-09** | **pgloader 3.6.7 (Ubuntu apt) MySQL 8 비호환 발견** (QMYND 라이브러리 caching_sha2_password 미지원). 대체: `tools/pg_data_migrator.py` 신규 (180 LOC, PyMySQL + psycopg2 + SQLAlchemy reflect). 리허설 결과: 28 테이블 / 466 행 / 3초 |
| **DBM-10** | `tools/migration_check.py` 7항목 검증 → 7/7 PASS (인덱스 보강 후). FK 인덱스 10건 추가 (`backend/database.py:migration_sqls` 끝) |

### Phase E — Auth Proxy 영구 설치 (DBM-11)

| 카드 | 결과 |
|---|---|
| **DBM-11** | `tools/cloud-sql-proxy.service` systemd unit 작성. 운영 VM SA scope `cloud-platform` 확장 (1-2분 다운타임) + `roles/cloudsql.client` IAM 부여. `/usr/local/bin/cloud-sql-proxy` 영구 설치, systemd active. health endpoints 200 |

### Phase F — 컷오버 (DBM-12)

| 카드 | 결과 |
|---|---|
| **DBM-12 F-1** | `tasks/db-migration-runbook.md` 컷오버 룬북 (~250 줄, T-30 ~ T+24h) |
| **DBM-12b** | `tools/rollback_resync.py` (200 LOC) — 롤백 시 PG → MySQL 신규 행 역동기화. self-loopback 검증 OK |
| **DBM-12 F-2** | **운영 컷오버 실행 (2026-05-19 08:13 UTC)** — backend stop → mysqldump 안전 백업 → pg_data_migrator (30 테이블/464 행/4초) → .env 에 DB_USER/DB_PASS 추가 → systemctl restart → healthz/readyz 200, 메뉴 API 실 데이터 응답 (`ロースカツ` ¥1650) |

### OPS 카드 (사이클 중 발견)

| 카드 | 결과 |
|---|---|
| **OPS-04** | 운영 VM `hajime` 디스크 full 사태 (`/var/log/journal`, snapd, playwright cache) → 디스크 10G→29G 확장 + cleanup (4.6G 회수) + logrotate 영구 cap (50M). GCP Monitoring 80% 알람만 운영자 남음 |
| **OPS-05** | 운영 VM 코드 미배포 + qrorder systemctl restart loop (2425회) + Redis 미설치 발견 → deploy.py 실행 + PID 정리 + Redis apt 설치 + REDIS_URL .env 추가 |

---

## 사이클의 주요 학습

### 잘 된 것

1. **Plan-first 접근** — 사전 감사 (DBM-01) 로 변환 작업 식별 → 큰 surprise 없었음
2. **Dual-DB 호환 기간** — migration_sqls 가 양 DB 동작하니까 컷오버까지 MySQL 운영 유지 가능
3. **pgloader 실패 빠른 pivot** — 30분 트러블슈팅 후 Python migrator 자체 작성. 결과적으로 더 단순.
4. **사이클 중 OPS 발견** — DBM-09 mysqldump 시도 → 디스크 full → OPS-04 spawn. 사이드 작업도 카드화해서 추적

### 놀라움 / 어려움

| 항목 | 영향 | 해결 |
|---|---|---|
| pgloader 3.6.7 의 MySQL 8 비호환 | DBM-09 30분 지연 | `pg_data_migrator.py` 자체 작성 |
| SQLAlchemy URL string 파서 버그 (특수문자 비번) | DBM-08b 1시간 지연 | URL.create() 사용 패치 |
| 운영 VM `qrorder.service` PID 충돌 (2425회 restart loop) | DBM-08b 발견 30분 | OPS-05 카드로 분리 → kill + clean start |
| 운영 VM 디스크 full | DBM-09 SSH 자체 차단 | OPS-04 spawn → 디스크 확장 + cleanup |
| PG 비번 채팅 노출 (5회 누적) | 보안 부채 | OPR-13 로 추적 (작업 후 로테이션) |

---

## 사이클 산출물 (영구 유지)

### 코드
- `backend/database.py` — DB_USER/DB_PASS env + URL.create() (DBM-08b 패치)
- `backend/utils/db.py` — `to_sync_url()` (DBM-04)
- `backend/utils/db_compat.py` — 양 DB SQL 함수 헬퍼 (DBM-05c)
- `alembic/env.py`, `backend/workers/db.py` — 양 DB 지원

### 도구 (`tools/`)
- `init_pg_schema.py` — PG 빈 인스턴스 schema 검증 (DBM-08)
- `pg_data_migrator.py` — MySQL → PG 데이터 이전 (DBM-09, DBM-12 F-2 재사용)
- `migration_check.py` — 7항목 정합성 검증 (DBM-10)
- `rollback_resync.py` — PG → MySQL 역동기화 (DBM-12b, 비상 롤백)
- `cloud-sql-proxy.service` — systemd unit (DBM-11)
- `pgloader/qraku.load` — (superseded by pg_data_migrator)

### 문서
- `docs/adr/006-postgresql-migration.md`
- `docs/adr/007-pgloader-choice.md` (superseded)
- `docs/adr/008-cutover-strategy.md`
- `docs/deployment.md` §11 (Cloud SQL Auth Proxy)
- `tasks/db-migration-audit.md` (참조 유지)
- `tasks/db-migration-runbook.md` (참조 유지)

### Cloud / 인프라
- Cloud SQL `postgre-sql` (asia-northeast1, PG 16.13)
- VM SA scope: `cloud-platform`, IAM role: `roles/cloudsql.client`
- cloud-sql-proxy systemd: `/etc/systemd/system/cloud-sql-proxy.service`
- 운영 VM `.env` 의 `DB_*` env vars 6개

---

## 잔여 작업 (DBM-13 + OPS)

| ID | 작업 | 시점 |
|---|---|---|
| **DBM-13** | `systemctl stop mysql` + 7일 모니터링 | D+7 (2026-05-26) |
| DBM-13 | MySQL 데이터 GCS 콜드 백업 → `apt purge mysql-server` | D+14 (2026-06-02) |
| OPS-04 | GCP Monitoring 디스크 > 80% 알람 정책 추가 | 운영자, 콘솔에서 5분 |
| OPR-13 | Cloud SQL `ilhae` 비번 영숫자+`-_` 만으로 로테이션 + `.env DB_PASS` 갱신 + restart | 즉시 (보안) |

---

## 사이클 종료 (2026-05-19)

DBM 사이클 기술적 완료. 운영 PG 안정성은 D+14 까지 24h 모니터링 (운영자) 으로 검증.

다음 사이클은 **SPC (qraku-Specialize)** — `current-tasks.md` 참조.

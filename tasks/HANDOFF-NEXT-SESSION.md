# 다음 세션 핸드오프 (2026-05-19, 컷오버 완료 시점)

> **다음 Claude 세션 시작 시 가장 먼저 이 파일을 읽어주세요.**

---

## 🎉 한 줄 요약

**MySQL → PostgreSQL 컷오버 (DBM-12 F-2) 완료** (2026-05-19 08:13 UTC). 운영 backend 가 Cloud SQL PostgreSQL 위에서 정상 동작 중. 사이클의 기술적 마이그레이션 종료. 남은 건 **24h 모니터링** + **D+7~D+14 MySQL 정리 (DBM-13)** + **보안 로테이션**.

---

## DBM 사이클 최종 상태 (2026-05-19 17:30 KST)

| 카드 | 상태 |
|---|---|
| DBM-01~07 | ✅ 코드 산출 (이전 세션) |
| DBM-08 | ✅ PG schema 30 테이블 |
| DBM-08b | ✅ database.py URL.create() 패치 |
| DBM-09 | ✅ 데이터 이전 (pg_data_migrator) |
| DBM-10 | ✅ 검증 7/7 (DBM-09 리허설), 컷오버는 행 수 검증으로 갈음 |
| DBM-11 | ✅ Cloud SQL Auth Proxy systemd active |
| DBM-12 F-1 | ✅ 룬북 (`tasks/db-migration-runbook.md`) |
| DBM-12 F-2 | ✅ **실 컷오버 완료** |
| DBM-12b | ✅ rollback_resync.py |
| **DBM-13** | TODO (D+7 ~ D+14) — MySQL 정리 |
| OPS-04 | 즉시 cleanup ✅ / GCP Monitoring 알람 TODO |
| OPS-05 | ✅ 코드 배포 + systemctl 정리 + Redis 설치 |

---

## 운영 환경 현재 상태

### 백엔드
- **`qrorder.service`** active (running), port 8003
- `/api/healthz` 200, `/api/readyz` `{"status":"ready"}`
- DB: **Cloud SQL PostgreSQL** via Auth Proxy (127.0.0.1:5432)
- Redis: localhost:6379/0 (INF-01 통합 완료)

### 데이터베이스
- **운영 DB**: Cloud SQL `postgre-sql` / DB `qraku` / user `ilhae`
  - 30 테이블 / 약 464 행 (마이그레이션 직후)
  - Auth Proxy 가 인증 처리, mTLS
- **MySQL `kiospad`** (운영 VM 의 로컬): 살아있지만 backend 가 더 이상 안 씀. 비상 롤백용 보존.

### 인증/네트워크
- 운영 VM (`hajime`) SA scope: `cloud-platform` (DBM-11 에서 확장)
- VM SA IAM: `roles/cloudsql.client` (DBM-11)
- Cloud SQL Auth Proxy systemd: active, listening on 127.0.0.1:5432 + 9090 (health)
- 운영 VM 22 포트 방화벽: 자이라 PC IP (217.178.236.201 또는 그 변경된 것) + IAP 범위 (35.235.240.0/20)
- Cloud SQL authorized networks: 비어있음 (Auth Proxy 쓰니까)

### 백업
- `~/cutover_kiospad_20260519_073230Z.sql.gz` (28K, 컷오버 직전 mysqldump)
- `~/qr-order-system/backend/.env.mysql_backup_20260519_075312Z` (컷오버 직전 .env)
- `~/qraku_*.sql.gz` (DBM-09 리허설 시점 dumps)

---

## 🔴 자이라가 다음에 해야 할 일

### 우선순위 1 — 24h 모니터링 (지금부터 ~ 내일)

GCP Monitoring 대시보드:
- Cloud SQL `postgre-sql`: CPU, RAM, 연결 수
- VM `hajime`: CPU, 메모리, 디스크
- Backend 로그 (`sudo journalctl -u qrorder -f`)
- 매장 측 피드백 (주문/결제 정상 여부)

장애 발생 시 룬북 §9 (롤백 절차) 참조. `tools/rollback_resync.py` 가 PG→MySQL 역동기화.

### 우선순위 2 — 보안 로테이션 (24h 안)

이번 세션 채팅에 노출된 비번 (작업 종료 후):

- [ ] **Cloud SQL `ilhae`** — `onlyJESUS3927~~` 폐기 → GCP 콘솔에서 영숫자+`-_`만 사용한 새 비번으로 변경
  - 변경 후 `~/qr-order-system/backend/.env` 의 `DB_PASS` 갱신 + `sudo systemctl restart qrorder`
- [ ] **MySQL `root`** — `DUZv54091` 그대로 두기 OK (MySQL 곧 retire)
- [ ] **운영 VM `/etc/cloud-sql-proxy/sa-key.json`** — 사용 안 함 (proxy 가 GCE metadata SA 사용), 제거 가능

### 우선순위 3 — DBM-13 MySQL 정리 (D+7 ~ D+14)

D+7 (2026-05-26): `sudo systemctl stop mysql` → 며칠 모니터링
D+14 (2026-06-02): MySQL 데이터 GCS 백업 → `sudo apt purge mysql-server` + `sudo rm -rf /var/lib/mysql`

### 우선순위 4 — OPS-04 모니터링 알람 (시간 날 때)

GCP Monitoring → Alerting Policy → 디스크 사용률 > 80% 알람. journald `SystemMaxUse=200M` 영구 설정 확인.

---

## 이번 세션 (2026-05-18~19) 커밋 (15개, 모두 push)

| Commit | 내용 |
|---|---|
| `15f4016` | Merge stoic-noyce (DBM-01~10 코드) |
| `0412a33` | 핸드오프 doc |
| `551e399` | DBM-08 schema 검증 |
| `d8b9ea0` | DBM-08b 카드 |
| `7714c03` | OPS-04 카드 |
| `6b61cda` | DBM-09/10 (pg_data_migrator + 검증) |
| `cba5096` | DBM-12 F-1 룬북 + DBM-12b 카드 |
| `c67b670` | DBM-12b rollback_resync.py |
| `000177b` | OPS-05 카드 (prod 정리) |
| `0c6eebf` | DBM-11 systemd unit + deployment.md §11.4 |
| `95d8f42` | HANDOFF doc refresh |
| `7c57a72` | DBM-11 + OPS-05 실행 완료 |
| `97961a4` | DBM-08b database.py URL.create() 패치 |
| `86f6893` | **DBM-12 F-2 컷오버 완료** 🎉 |

---

## 다음 세션 시작 시 인사말

```
이전 세션에서 PG 컷오버까지 끝났어. tasks/HANDOFF-NEXT-SESSION.md 읽고 24h 모니터링 / 보안 로테이션 / DBM-13 중 뭐 할지 안내해줘.
```

---

## 핵심 참고 문서

- `tasks/current-tasks.md` — 모든 카드 정의
- `tasks/work-log.md` — 시간순 실행 기록 (이번 세션 큰 비중)
- `tasks/db-migration-audit.md` — 호환성 감사 + DBM-08/09/10 실측 결과
- `tasks/db-migration-runbook.md` — 컷오버 + 롤백 절차서
- `tools/pg_data_migrator.py` — MySQL → PG 데이터 이전 (DBM-12 에서도 재사용)
- `tools/migration_check.py` — 정합성 검증 (이번 컷오버 시 스킵)
- `tools/rollback_resync.py` — PG → MySQL 역동기화 (비상 롤백용)
- `tools/cloud-sql-proxy.service` — Auth Proxy systemd unit
- `backend/database.py` — DB_USER/DB_PASS env 받아 URL.create() 조립 (DBM-08b 패치)
- `docs/deployment.md` §11.4 — Cloud SQL Auth Proxy 설치 절차

---

**작성**: 2026-05-19 17:30 KST, 컷오버 완료 직후
**다음 세션**: 모니터링 / 보안 로테이션 / DBM-13.

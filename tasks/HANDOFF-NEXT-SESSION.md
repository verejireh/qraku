# 다음 세션 핸드오프 (2026-05-19, PG 컷오버 + 정리 완료)

> **다음 Claude 세션 시작 시 가장 먼저 이 파일을 읽어주세요.**

---

## 🎉 한 줄 요약

**PG 컷오버 완료 + 다음 사이클 (SPC, qraku-Specialize) 카드 설계 완료**. 운영 backend 가 PostgreSQL 위에서 정상 동작. 마케팅 프로젝트 (`D:\myproject\qraku-marketing\`) 빌드 + SPC 작업 worktree 신설이 다음 액션.

---

## 진행 사이클

| 사이클 | 상태 | 위치 |
|---|---|---|
| **PG 마이그레이션** | ✅ 종료 | [`tasks/archive/2026-05-dbm-pg-cycle.md`](archive/2026-05-dbm-pg-cycle.md) |
| **SPC (qraku-Specialize)** | 🟢 카드 설계 완료, 실행 대기 | [`tasks/current-tasks.md`](current-tasks.md) |
| **마케팅 (별도 프로젝트)** | ⏸ 빌드 예정 | `D:\myproject\qraku-marketing\` (별도 폴더, Computer 2 용) |

---

## 운영 환경 현재 상태

### 백엔드
- **`qrorder.service`** active (running), port 8003
- `/api/healthz` 200, `/api/readyz` `{"status":"ready"}`
- DB: **Cloud SQL PostgreSQL** via Auth Proxy (127.0.0.1:5432, ilhae user)
- Redis: localhost:6379/0 (INF-01 통합 완료)

### 데이터베이스
- **운영 DB**: Cloud SQL `postgre-sql` / DB `qraku`
  - 30 테이블 / 약 464 행 (컷오버 직후)
  - Auth Proxy (mTLS, IAM-managed)
- **MySQL `kiospad`** (운영 VM 로컬): 살아있지만 사용 X. 비상 롤백용 보존 (D+14 까지).

### 인프라
- 운영 VM `hajime` (asia-northeast1-a, 35.213.6.149) SA scope: `cloud-platform`
- VM SA IAM: `roles/cloudsql.client`
- cloud-sql-proxy systemd: active, ports 5432 + 9090
- Cloud SQL authorized networks: 비어있음 (Auth Proxy 사용)
- 운영 VM 22 포트 방화벽: 자이라 PC IP + IAP 범위 (`35.235.240.0/20`)
- 디스크: 4.1G / 29G (15%), logrotate 영구 cap 적용

### 백업
- `~/cutover_kiospad_20260519_073230Z.sql.gz` (28K, 컷오버 직전 mysqldump)
- `~/qr-order-system/backend/.env.mysql_backup_20260519_075312Z`

---

## 🔴 자이라가 다음에 해야 할 일

### 우선순위 1 — 보안 (즉시)

- [ ] **OPR-13**: Cloud SQL `ilhae` 비번 영숫자+`-_` 만으로 로테이션 (현재 비번 채팅 5회 노출됨)
  - GCP 콘솔 → Cloud SQL → postgre-sql → 사용자 → ilhae → 비밀번호 변경
  - 변경 후: `ssh -i D:/myproject/qraku verejireh@35.213.6.149 → vi ~/qr-order-system/backend/.env → DB_PASS=새비번 → sudo systemctl restart qrorder`

### 우선순위 2 — 24h 모니터링 (지금 ~ 내일)

GCP Monitoring + 매장 측 피드백. 장애 발생 시 `tasks/db-migration-runbook.md` §9 (롤백 절차) 참조.

### 우선순위 3 — DBM-13 MySQL 정리

- **D+7 (2026-05-26)**: `sudo systemctl stop mysql` → 7일 모니터링
- **D+14 (2026-06-02)**: MySQL 데이터 GCS 백업 → `sudo apt purge mysql-server`

### 우선순위 4 — OPS-04 마지막 항목

GCP Monitoring → Alerting → Policy:
- 조건: `compute.googleapis.com/instance/disk/percent_used > 80`, instance hajime
- 알림: 이메일 verejireh@gmail.com

### 우선순위 5 — SPC 사이클 + 마케팅 프로젝트 시작

다음 Claude 세션에서:
1. 마케팅 프로젝트 빌드 (`D:\myproject\qraku-marketing\`) — Computer 2 용
2. Worktree 2개 신설 (`stabilize/post-pg-cutover`, `qraku-specialize`)
3. SPC-01 명세 작성 시작

---

## 환경 정보

### PC
- 메인 worktree (현재): `D:\myproject\orderservice\.claude\worktrees\infallible-brahmagupta-434ab6`
- SSH 키: `D:\myproject\qraku` (gitignore 됨)
- gcloud: 인증됨 (`verejireh@gmail.com`)

### GCP
- 프로젝트: `hotel-management-484115`
- VM: `hajime` (asia-northeast1-a, 35.213.6.149)
- Cloud SQL: `postgre-sql` (asia-northeast1, PG 16.13)

---

## 다음 세션 시작 시 인사말

```
이전 세션에서 PG 컷오버 완료, 다음 사이클 SPC 카드 설계까지 끝났어.
tasks/HANDOFF-NEXT-SESSION.md 읽고 이어서 진행. 마케팅 프로젝트 빌드부터.
```

---

## 핵심 참고 문서

| 파일 | 용도 |
|---|---|
| `tasks/current-tasks.md` | 살아있는 카드 (DBM-13 + OPS-04 + SPC-01~10) |
| `tasks/work-log.md` | 최근 작업 (오래된 것은 archive) |
| `tasks/archive/2026-05-dbm-pg-cycle.md` | DBM 사이클 압축 archive |
| `tasks/db-migration-audit.md` | DBM 호환성 감사 (참조용) |
| `tasks/db-migration-runbook.md` | 컷오버 / 롤백 절차서 (참조용) |
| `tools/pg_data_migrator.py` | MySQL → PG (DBM-13 재사용 가능) |
| `tools/rollback_resync.py` | PG → MySQL (비상 롤백) |
| `tools/cloud-sql-proxy.service` | Auth Proxy systemd unit |
| `backend/database.py` | DB_USER/DB_PASS env + URL.create() (DBM-08b 패치) |

---

## 이번 세션 (2026-05-18~19) 커밋 (17개, 모두 push)

| Commit | 내용 |
|---|---|
| `15f4016` | Merge stoic-noyce |
| `0412a33` | HANDOFF snapshot |
| `551e399` | DBM-08 |
| `d8b9ea0` | DBM-08b card |
| `7714c03` | OPS-04 card |
| `6b61cda` | DBM-09/10 + pg_data_migrator |
| `cba5096` | DBM-12 F-1 runbook |
| `c67b670` | DBM-12b rollback_resync |
| `000177b` | OPS-05 card |
| `0c6eebf` | DBM-11 systemd unit |
| `95d8f42` | HANDOFF refresh |
| `7c57a72` | DBM-11 + OPS-05 done |
| `97961a4` | DBM-08b database.py 패치 |
| `86f6893` | **DBM-12 F-2 컷오버 완료** 🎉 |
| `22385c6` | HANDOFF post-cutover |
| `2264cb3` | OPS-04 phase 2 cleanup |
| (이 커밋) | tasks/*.md 정리 + SPC 사이클 카드 + 핸드오프 refresh |

---

**작성**: 2026-05-19 (PG 컷오버 + 정리 완료)
**다음 세션 추정 작업**: 마케팅 프로젝트 빌드 + SPC worktree 신설 + SPC-01 시작.

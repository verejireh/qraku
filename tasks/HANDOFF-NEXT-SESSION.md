# 다음 세션 핸드오프 (2026-05-19, 갱신)

> **다음 Claude 세션 시작 시 가장 먼저 이 파일을 읽어주세요.**
> 자이라 (verejireh@gmail.com) 의 PG 마이그레이션 사이클 진행 상황 + 운영 현안.

---

## 한 줄 요약

PG 마이그레이션 코드 + 데이터 + 룬북 모두 완료. **남은 건 운영자 직접 실행 카드 (OPS-05, DBM-11 install, DBM-12 F-2)** 와 보안 부채 (비번 로테이션, 방화벽 조이기).

---

## 현재 상태 (2026-05-19 21:30 KST)

### 작업 브랜치

- **`claude/infallible-brahmagupta-434ab6`**, 원격 push 완료, 최신 커밋 `0c6eebf`
- 이번 세션 누적 10개 커밋 (DBM-08, DBM-09, DBM-10, DBM-12 F-1, DBM-12b, DBM-11 prep, OPS-04, OPS-05 등)
- PR 아직 안 만듦 — main 머지 시점은 자이라가 결정

### 카드 진척 (DBM 사이클)

| 카드 | 상태 | 비고 |
|---|---|---|
| DBM-01~07 | ✅ DONE | 이전 세션 (코드 산출) |
| **DBM-08** | ✅ DONE 2026-05-18 | PG schema 30 테이블, init_pg_schema.py |
| **DBM-08b** | ⏸️ BLOCKED | OPS-05 선행 필요 |
| **DBM-09** | ✅ DONE 2026-05-19 | 28 테이블 / 466 행 / 3초, pg_data_migrator |
| **DBM-10** | ✅ DONE 2026-05-19 | 7/7 PASS (인덱스 보강 후) |
| **DBM-11** | 🟡 자료 준비 DONE | 실 설치는 자이라 (VM 다운타임 1-2분) |
| **DBM-12 F-1** | ✅ DONE 2026-05-19 | 컷오버 룬북 (`tasks/db-migration-runbook.md`) |
| **DBM-12 F-2** | TODO | 실 컷오버 — OPS-05 + DBM-11 + 매장 합의 후 |
| **DBM-12b** | ✅ DONE 2026-05-19 | rollback_resync.py self-loopback 검증 |
| DBM-13 | TODO | 컷오버 후 MySQL 정리 |
| **OPS-04** | 즉시 cleanup ✅ / 모니터링 TODO | 디스크 4.6G 회수, journald cap |
| **OPS-05** | TODO | prod 코드 배포 + systemctl loop fix + Redis |

---

## 🔴 자이라가 다음에 해야 할 일 (우선순위 순)

### 0. (지금 당장) 보안 부채 정리

채팅에 노출된 secrets — 작업 끝났으니 즉시 로테이션 권장.

- [ ] **Cloud SQL `ilhae` 비번 로테이션** (채팅 2회 노출: `KEeLj8:E#HlfmSrk`, `z(o0VD0D2@ijYn&c`)
  - GCP 콘솔 → Cloud SQL → postgre-sql → 사용자 → ilhae → 비번 변경
  - 운영자 메모장 갱신
- [ ] **MySQL root 비번 로테이션** (1회 노출: `forthechrist!!`)
  - `ssh -i D:/myproject/qraku verejireh@35.213.6.149` → `mysql -u root -p` → `ALTER USER 'root'@'localhost' IDENTIFIED BY '새비번';`
- [ ] **운영 VM 22 포트 방화벽** 다시 조이기 (`0.0.0.0/0` → `217.178.232.124/32` 자이라 PC IP)
  - GCP 콘솔 → VPC 네트워크 → 방화벽 → SSH 룰 → 소스 IPv4 편집
  - 단 자이라 PC IP 가 또 바뀔 수 있음. 안정성 위해 `--tunnel-through-iap` 또는 IAP TCP forwarding 검토 가능 (별도)

### 1. (P0) OPS-05 실행 — 운영 VM 상태 정리

prod VM 이 어수선한 상태:

- 이번 사이클 코드 (DBM-04~10, INF-01~05, OPS-01~03, WS-01~04) **미배포**
- `qrorder.service` systemctl restart loop (2425+회) — PID 570 이 port 8003 점유
- Redis 미설치

**해결 절차** (자이라가 SSH 들어가서 실행):

```bash
# Phase 1: systemctl loop 정리 (30초 다운타임)
ssh -i D:/myproject/qraku verejireh@35.213.6.149 bash <<'REMOTE'
sudo systemctl stop qrorder
sudo kill 570
sleep 2; ps aux | grep uvicorn | grep -v grep || echo "uvicorn 정리됨"
sudo systemctl start qrorder
sleep 5; sudo systemctl status qrorder --no-pager | head -10
curl -s -o /dev/null -w "healthz: %{http_code}\n" http://localhost:8003/api/healthz
REMOTE

# Phase 2: 최신 코드 배포 (로컬에서 deploy.py)
# 다운타임 약 30초~1분
uv run python deploy.py

# Phase 3: Redis 설치
ssh -i D:/myproject/qraku verejireh@35.213.6.149 \
  "sudo apt-get install -y redis-server && sudo systemctl enable --now redis-server && redis-cli ping"
```

상세: `tasks/current-tasks.md` OPS-05 카드.

### 2. (P0) DBM-11 실행 — Cloud SQL Auth Proxy 영구 설치

VM SA scope 확장 (1-2분 다운타임) 후 systemd 서비스로 cloud-sql-proxy 등록.

상세: `tasks/current-tasks.md` DBM-11 카드 + `docs/deployment.md` §11.4. systemd unit 파일: `tools/cloud-sql-proxy.service`.

### 3. (P0) DBM-12 F-2 실행 — 실 컷오버

OPS-05 + DBM-11 완료 후. `tasks/db-migration-runbook.md` 그대로 따라감.

매장 사전 공지 + 비영업 시간대 (예: 새벽 2~5시) 권장.

### 4. (P1) OPS-04 모니터링 알람

GCP Monitoring 에 디스크 사용률 80% 알람 정책 추가. 별도 OPS-04 카드 §"장기 보강".

---

## 환경 정보 (다음 세션 참고)

### PC
- 메인 PC: `D:/myproject/orderservice/.claude/worktrees/infallible-brahmagupta-434ab6` (이 worktree)
- SSH 키: `D:/myproject/qraku` (project root 상위, gitignore 됨)

### GCP
- 프로젝트: `hotel-management-484115`
- VM: `hajime` (asia-northeast1-a, 35.213.6.149, qraku.com 도메인)
- Cloud SQL: `postgre-sql` (asia-northeast1, PG 16.13, qraku DB, ilhae user)
- 인증: 자이라의 `verejireh@gmail.com` 으로 gcloud auth 됨 (로컬 PC)

### 현재 인증 상태 (작업 후 정리됨)
- Cloud SQL authorized networks: 비어있음 (DBM-09 시 임시 추가했다가 제거)
- 운영 VM 22 포트 방화벽: 0.0.0.0/0 (자이라가 좁혀야 함)
- pgloader_temp MySQL 사용자: DROP 완료
- kios_user MySQL auth plugin: mysql_native_password (점검 시 이미 그 상태였음 — 우리가 안 바꿈)

### Backend 상태
- Port 8003 PID 570 (오늘 14:44 수동 기동) 이 서빙 중. systemctl 은 restart loop.
- 코드: 이번 사이클 미반영. healthz/readyz 라우터 부재. migration_sqls 도 MySQL 전용.

---

## 다음 세션 시작 시 자이라가 할 일

새 PC 의 로컬 작업 폴더 (`D:/myproject/orderservice` 또는 worktree) 에서:

```
이전 세션 핸드오프야. tasks/HANDOFF-NEXT-SESSION.md 읽고 현재 상황 + 다음에 뭘 해야 하는지 알려줘.
```

→ Claude 가 이 파일을 읽고 다음 우선순위 작업 안내.

---

## 이번 세션 (2026-05-18~19) 커밋 (10개, 모두 push)

| Commit | 내용 |
|---|---|
| `15f4016` | Merge claude/stoic-noyce-74945e (DBM-01~10 코드) |
| `0412a33` | HANDOFF-NEXT-SESSION snapshot |
| `551e399` | DBM-08 PG empty instance schema 검증 결과 |
| `d8b9ea0` | DBM-08b 카드 신설 (PG 통합 부팅) |
| `7714c03` | OPS-04 카드 (디스크 관리) |
| `6b61cda` | **DBM-09/10**: 28테이블/466행 마이그레이션 + pg_data_migrator + FK 인덱스 |
| `cba5096` | DBM-12 F-1 컷오버 룬북 + DBM-12b 카드 |
| `c67b670` | **DBM-12b**: rollback_resync.py + self-loopback 검증 |
| `000177b` | OPS-05 카드 (prod 상태 정리) + DBM-08b BLOCKED |
| `0c6eebf` | DBM-11 systemd unit + deployment.md §11.4 |

---

## 참고 문서

- `tasks/current-tasks.md` — 모든 카드 정의
- `tasks/work-log.md` — 시간순 작업 기록 (이번 세션 분 포함)
- `tasks/db-migration-audit.md` §8.4, §8.5 — DBM-08, DBM-09/10 실측 결과
- `tasks/db-migration-runbook.md` — 컷오버 절차서 (DBM-12 F-1)
- `tools/pg_data_migrator.py` — MySQL → PG 데이터 이전 스크립트
- `tools/migration_check.py` — 양 DB 정합성 7항목 검증
- `tools/rollback_resync.py` — PG → MySQL 역동기화 (롤백 시)
- `tools/cloud-sql-proxy.service` — Auth Proxy systemd unit
- `docs/deployment.md` §11.4 — Cloud SQL Auth Proxy 설치 절차

---

**작성**: 2026-05-19, 본 Claude 세션
**다음 세션 추정 작업**: 자이라가 OPS-05 / DBM-11 / DBM-12 F-2 실행 후 결과 보고 → 사후 분석 / 미세조정.

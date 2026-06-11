# Deployment — QRaku.com

> 운영 배포·환경 설정·서버 운영 가이드.
> 코드 변경은 [`architecture.md`](./architecture.md), 결제 규칙은 [`payment-rules.md`](./payment-rules.md) 참조.

---

## 1. 운영 환경 개요

| 항목 | 값 |
|---|---|
| 서버 (VM) | GCP VM `35.213.6.149` (`hajime`, asia-northeast1-a) |
| OS | Ubuntu 22.04 LTS |
| 도메인 | `qraku.com` → `35.213.6.149` (A 레코드) |
| SSH 사용자 | `verejireh` |
| SSH 키 | 프로젝트 상위 폴더의 `qraku` (서버 접근용) — GitHub 키와 다름 |
| 작업 디렉토리 | `~/qr-order-system` |
| 서비스 | `qrorder.service` (systemd) — port 8003 |
| 데이터베이스 | Cloud SQL **PostgreSQL 16** (asia-northeast1, REGIONAL HA) via Cloud SQL Auth Proxy (`127.0.0.1:5432`) |
| Redis | localhost:6379/0 (워커 큐 + WS pub/sub) |
| TLS | Cloudflare 또는 외부 리버스 프록시에서 종료 (서버는 평문 8003) |

> **GitHub 푸시용 SSH 키**: `qraku_ssh_github` (별도). 운영 서버 키와 분리.
> **데이터베이스 이력**: 2026-05-23 컷오버로 MySQL → Cloud SQL PostgreSQL 전환 완료. MySQL 절차 폐기됨.

---

## 2. 한 번만 하는 초기 설정

### 2.1 GCP VM 준비

1. `35.213.6.149` 인스턴스 생성 (Ubuntu 22.04, e2-small 이상).
2. 방화벽: `8003/tcp` (백엔드), `22/tcp` (SSH).
3. `qraku.com` DNS A 레코드 → 인스턴스 공인 IP.
4. VM service account 의 IAM 역할: `roles/cloudsql.client` 부여 (Auth Proxy 인증).
5. VM scope: `cloud-platform` 포함 (없으면 §2.2.2 절차 A 로 확장).

### 2.2 Cloud SQL PostgreSQL + Auth Proxy

#### 2.2.1 Cloud SQL 인스턴스 사양 (확정)

| 항목 | 값 |
|---|---|
| 인스턴스 ID | `postgre-sql` (project `hotel-management-484115`, asia-northeast1) |
| 인스턴스 타입 | `db-custom-1-3840` (1 vCPU, 3.75 GB) |
| HA | REGIONAL (zone failover) |
| 디스크 | 20 GB SSD, 자동 증가 ON |
| PostgreSQL 버전 | 16 |
| `max_connections` | 100 |
| `shared_buffers` | 1222 MB |
| TimeZone | UTC |
| 백업 | 매일 02:00 KST, 7일 보관 + PITR 활성 (WAL 7일) |
| Maintenance window | 일요일 03:00~04:00 KST |
| 데이터베이스 | `qraku` (앱) |
| 사용자 | `ilhae` (앱) — superuser 아님 |

> **scale up 검토 기준**: 식당 30+ 또는 동시 주문 폭증 시 `db-custom-2-7680` (2 vCPU / 7.5 GB) 로. online resize 5~10분.

#### 2.2.2 VM scope 확장 (필요 시)

VM SA 가 `cloud-platform` scope 없으면 1회 확장 (다운타임 1-2분):

```powershell
# 1. VM 정지
gcloud compute instances stop hajime --zone=asia-northeast1-a --project=hotel-management-484115

# 2. scope 확장
gcloud compute instances set-service-account hajime --zone=asia-northeast1-a --project=hotel-management-484115 `
  --scopes=cloud-platform,storage-ro,logging-write,monitoring-write,service-management,servicecontrol

# 3. SA 에 Cloud SQL Client 역할 부여
$SA_EMAIL = (gcloud compute instances describe hajime --zone=asia-northeast1-a --project=hotel-management-484115 --format="value(serviceAccounts[0].email)")
gcloud projects add-iam-policy-binding hotel-management-484115 `
  --member="serviceAccount:$SA_EMAIL" --role="roles/cloudsql.client"

# 4. VM 재시작
gcloud compute instances start hajime --zone=asia-northeast1-a --project=hotel-management-484115
```

#### 2.2.3 cloud-sql-proxy + systemd 설치

```bash
ssh -i qraku verejireh@35.213.6.149 bash <<'REMOTE'
# 바이너리 영구 설치
curl -sLo /tmp/cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64
sudo install -m 0755 /tmp/cloud-sql-proxy /usr/local/bin/cloud-sql-proxy

# systemd unit 설치 (tools/cloud-sql-proxy.service 미리 SCP)
sudo install -m 0644 ~/cloud-sql-proxy.service /etc/systemd/system/cloud-sql-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloud-sql-proxy.service
REMOTE
```

unit 핵심:
- `ExecStart`: `cloud-sql-proxy --port=5432 --address=127.0.0.1 --health-check --http-port=9090 --structured-logs hotel-management-484115:asia-northeast1:postgre-sql`
- `After=network-online.target`
- `Restart=always`

#### 2.2.4 검증

```bash
ssh -i qraku verejireh@35.213.6.149 bash -c "
PGPASSWORD='***' psql 'host=127.0.0.1 port=5432 dbname=qraku user=ilhae' -c 'SELECT version();'
curl -s http://127.0.0.1:9090/readiness && echo
"
```

기대: PostgreSQL 16.x + `ok`.

### 2.3 Redis

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # → PONG
```

### 2.4 운영자 액션 (코드 외 설정)

`tasks/current-tasks.md` 의 **OPR 표** 와 동일. 첫 배포 전 모두 처리.

| ID | 항목 | 명령 / 위치 |
|---|---|---|
| OPR-01 | `ENCRYPTION_KEY` 발급 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| OPR-02 | `VITE_LINE_LIFF_ID` 발급 | LINE Developers Console |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` | `backend/.env` |
| OPR-04 | `VISION_API_KEY` (선택) | GCP Vision API |
| OPR-05 | `REDIS_URL=redis://localhost:6379/0` | `backend/.env` |
| OPR-06 | PayPay 콘솔 webhook URL | `https://qraku.com/api/webhooks/paypay` |
| OPR-07 | Alembic baseline stamp | `cd ~/qr-order-system && uv run alembic stamp head` (첫 배포 시 1회) |
| OPR-08 | `PAYPAY_WEBHOOK_SECRET` | PayPay 콘솔에서 발급 후 `backend/.env` |
| OPR-13 | Cloud SQL `ilhae` 비번 로테이션 | 초기 설정 후 + 채팅 노출 시 |
| OPR-15 | `pg_stat_statements` 활성화 | Cloud SQL flag + `CREATE EXTENSION pg_stat_statements` |

> ⚠️ **`ENCRYPTION_KEY` 변경 시 주의**: 한 번 설정 후 키를 바꾸면 기존 암호화 데이터를 복호화할 수 없다. 키 로테이션 시 별도 마이그레이션 스크립트 필요.

### 2.5 `backend/.env` 예시 (운영)

```ini
# Cloud SQL PostgreSQL via Auth Proxy
DATABASE_URL=postgresql+asyncpg://ilhae:***@127.0.0.1:5432/qraku

# Redis (워커 큐 + WS pub/sub)
REDIS_URL=redis://localhost:6379/0
DRAMATIQ_BROKER_URL=redis://localhost:6379/0

# 보안
SECRET_KEY=<JWT 서명 키>
ENCRYPTION_KEY=<Fernet 키 — OPR-01>

# 호스팅
FRONTEND_BASE_URL=https://qraku.com
DEBUG=False

# 결제
PAYPAY_WEBHOOK_SECRET=<OPR-08>
SQUARE_APPLICATION_ID=...
SQUARE_LOCATION_ID=...
SQUARE_CLIENT_ID=...
SQUARE_CLIENT_SECRET=...
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_WEBHOOK_NOTIFICATION_URL=https://qraku.com/api/webhooks/square

# AI / LIFF (선택)
GEMINI_API_KEY=...
VITE_LINE_LIFF_ID=<OPR-02>
VISION_API_KEY=<OPR-04>

# WS / 멱등성 (옵션, 기본값 사용 가능)
WS_AUTH_TOKEN_TTL_SECONDS=300
IDEMPOTENCY_TTL_SECONDS=86400
```

- driver prefix `postgresql+asyncpg://` — async 라우터용.
- Alembic / dramatiq 워커는 `backend/utils/db.py:to_sync_url()` 가 자동으로 `postgresql+psycopg2://` 로 치환.
- 비밀번호는 16자 이상 random. secret manager 또는 `.env` (chmod 600) 에만 보관.
- SSL/sslmode 파라미터 불필요 — Auth Proxy 가 mTLS 처리.

---

## 3. 일반 배포 절차 (`deploy.py`)

로컬에서 실행:

```bash
uv run deploy.py
```

수행 단계:
1. `frontend-react/` 에서 `npm install && npm run build` (로컬 빌드).
2. `backend/`, `frontend-react/`, `pyproject.toml`, `uv.lock`, `setup_server.sh`, `tools/` 를 `deploy_package.zip` 으로 압축.
   - 제외: `.venv`, `node_modules`, `__pycache__`, `.git`, `.env`, `*.db*` 등.
3. paramiko 로 서버에 SCP 업로드.
4. 서버에서 `setup_server.sh` 실행:
   - `uv` 자동 설치 (없으면)
   - `uv sync --frozen` (`.venv` 재현)
   - `frontend-react/dist/` 자산 정리 (오래된 빌드 정리)
   - 기존 8003 프로세스 종료 (lsof TERM → KILL 2단계)
   - `qrorder.service` (systemd) 재시작
5. 포트 8003 살아있는지 확인.

> ⚠️ **컬럼 추가 마이그레이션은 자동 적용**: `backend/database.py` 의 `migration_sqls` 리스트가 부팅 시 실행 (멱등 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + 정규화 `UPDATE`).
>
> **Alembic 기반 변경 (예정)**: 운영자가 직접 실행:
> ```bash
> ssh -i qraku verejireh@35.213.6.149 "cd ~/qr-order-system && uv run alembic upgrade head"
> ```

---

## 4. systemd 서비스

`setup_server.sh` 가 자동으로 `/etc/systemd/system/qrorder.service` 를 생성/갱신:

```ini
[Unit]
Description=QRaku FastAPI Server
After=network.target cloud-sql-proxy.service
Wants=cloud-sql-proxy.service
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=verejireh
WorkingDirectory=/home/verejireh/qr-order-system
ExecStartPre=-/bin/bash -c 'PID=$(/usr/bin/lsof -ti :8003 -u verejireh 2>/dev/null); if [ -n "$PID" ]; then kill -TERM $PID 2>/dev/null; sleep 0.5; kill -KILL $PID 2>/dev/null || true; fi'
ExecStart=/home/verejireh/qr-order-system/.venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8003
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
KillMode=mixed
KillSignal=SIGTERM
Environment=PATH=/home/verejireh/qr-order-system/.venv/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=append:/home/verejireh/qr-order-system/backend.log
StandardError=append:/home/verejireh/qr-order-system/backend.log

[Install]
WantedBy=multi-user.target
```

핵심 설계 (2026-05-22 GPT cross-review 권고):
- `Restart=on-failure` — `Restart=always` 가 bind 실패에서 NRestarts 폭주 (이번 사고 413회) 야기 → `on-failure` 로 한정.
- `StartLimitIntervalSec=300 / StartLimitBurst=5` — 5분 안에 5회 실패하면 systemd 가 재시작 중단 (운영자 개입 신호).
- `ExecStartPre` 2단계 (lsof TERM → KILL) — orphan 프로세스 자동 정리.
- `After=cloud-sql-proxy.service` — proxy 준비 후 부팅.

### 4.1 운영 명령

```bash
# 상태
sudo systemctl status qrorder.service

# 재시작
sudo systemctl restart qrorder.service

# 로그
tail -f ~/qr-order-system/backend.log
sudo journalctl -u qrorder.service -f

# Cloud SQL Auth Proxy
sudo systemctl status cloud-sql-proxy
sudo journalctl -u cloud-sql-proxy -f
```

---

## 5. 워커 운영 (Dramatiq)

> 현재 운영에는 워커가 **상시 가동되어 있지 않다**. 메뉴 등록 시 `translate_menu.send()` 가 큐에 적재만 되고 실제 처리는 워커 프로세스가 떠 있을 때.

### 5.1 운영 서버에서 워커 구동

```bash
ssh -i qraku verejireh@35.213.6.149
cd ~/qr-order-system

# 포그라운드 (디버깅)
uv run dramatiq backend.workers.translate_tasks -p 2 -t 4

# 백그라운드 (운영) — systemd 권장
```

### 5.2 systemd 서비스 권장 (선택, 미적용)

`/etc/systemd/system/qrworker.service`:

```ini
[Unit]
Description=QRaku Dramatiq Worker
After=network.target redis-server.service cloud-sql-proxy.service

[Service]
User=verejireh
WorkingDirectory=/home/verejireh/qr-order-system
ExecStart=/home/verejireh/qr-order-system/.venv/bin/dramatiq backend.workers.translate_tasks -p 2 -t 4
Restart=always
EnvironmentFile=/home/verejireh/qr-order-system/backend/.env

[Install]
WantedBy=multi-user.target
```

- 운영 트래픽이 늘어 워커가 필수가 되면 위 서비스 추가.
- 워커는 sync DB(`psycopg2`, `utils/db.py:to_sync_url()` 로 자동 변환) + sync Redis publish 사용. WS 이벤트는 직접 `redis.publish("ws:store:{id}", envelope)` 형식으로 발행 (백엔드의 `_pubsub_listener` 가 fan-out).

---

## 6. 헬스체크 / 모니터링

| 엔드포인트 | 용도 | 정상 응답 |
|---|---|---|
| `GET /api/healthz` | 프로세스 살아있는지 | `200 {"status":"ok"}` |
| `GET /api/readyz` | DB·Redis 연결 OK 확인 | `200 {"status":"ready"}` 또는 `503` |
| `GET http://127.0.0.1:9090/readiness` | Cloud SQL Auth Proxy 준비 | `ok` |
| `GET http://127.0.0.1:9090/liveness` | Auth Proxy 살아있음 | `ok` |

GCP VM 의 health check 또는 외부 모니터링(UptimeRobot 등)에 `/api/readyz` 등록 권장.

### 6.1 로그

| 출처 | 위치 |
|---|---|
| FastAPI stdout/stderr | `~/qr-order-system/backend.log` (systemd append) |
| systemd unit logs | `sudo journalctl -u qrorder.service` |
| Cloud SQL Auth Proxy | `sudo journalctl -u cloud-sql-proxy` |
| PostgreSQL slow query | Cloud SQL Console > Query Insights (OPR-15 활성 후) |
| Redis | `journalctl -u redis-server` |
| Cloudflare | 외부 |

### 6.2 자주 보는 명령

```bash
# 최근 에러
grep -i "error\|exception" ~/qr-order-system/backend.log | tail -50

# 결제 관련
grep -i "paypay\|square\|refund" ~/qr-order-system/backend.log | tail -100

# WebSocket Pub/Sub 상태
grep "WS pubsub" ~/qr-order-system/backend.log

# 마이그레이션 적용 결과 (부팅 시)
grep -E "✅ Migration|❌ Migration" ~/qr-order-system/backend.log | tail -30
```

---

## 7. 개발 환경 (docker-compose)

운영과 별개로 로컬에서 멀티 인스턴스 / 워커 / Redis 검증 가능.

```bash
# repo 루트에서
docker compose up -d --build

# 서비스
# - postgres: localhost:5433 (qraku/qraku)
# - redis:    localhost:6380
# - backend1: localhost:8003 (INSTANCE_ID=dev-1)
# - backend2: localhost:8004 (INSTANCE_ID=dev-2)
# - frontend: localhost:5173
# - worker:   Dramatiq (포트 없음)
```

WS-02 fan-out 검증:
```bash
# backend1 에 WS 연결
wscat -c "ws://localhost:8003/ws/admin/1?token=..."

# backend2 에 HTTP POST → backend1 의 wscat 에 envelope 도착해야 함
curl -X POST "http://localhost:8004/api/orders/" -d '...'
```

자세한 docker-compose 구성은 [`../docker-compose.yml`](../docker-compose.yml) + 사이클 아카이브 [`../tasks/archive/2026-05-saas-infra-cycle.md`](../tasks/archive/2026-05-saas-infra-cycle.md) 참조.

---

## 8. 백업 / 복구

### 8.1 Cloud SQL 자동 백업 (활성)

- 매일 02:00 KST 자동 풀 백업, 7일 보관
- PITR (Point-in-Time Recovery) 활성 — WAL 7일 보관
- Cloud SQL Console > 인스턴스 > 백업 탭에서 확인

### 8.2 수동 덤프 (이벤트 전 보강용)

```bash
ssh -i qraku verejireh@35.213.6.149 bash -c "
PGPASSWORD='***' pg_dump 'host=127.0.0.1 port=5432 dbname=qraku user=ilhae' \
  --no-owner --no-acl > ~/backup_\$(date +%Y%m%d).sql
"
```

### 8.3 복구

**옵션 A — Cloud SQL Console**: PITR 또는 백업 시점 선택, 새 인스턴스로 복원 후 컷오버.

**옵션 B — 수동 SQL 복구**:
```bash
ssh -i qraku verejireh@35.213.6.149 bash -c "
PGPASSWORD='***' psql 'host=127.0.0.1 port=5432 dbname=qraku user=ilhae' \
  < ~/backup_YYYYMMDD.sql
sudo systemctl restart qrorder.service
"
```

---

## 9. 보안 체크리스트

- [ ] `backend/.env` 파일 권한 `600` (운영자만 읽기)
- [ ] `ENCRYPTION_KEY` 운영 vs dev 분리, 절대 공유 금지
- [ ] `SECRET_KEY` JWT 서명 키 별도 관리
- [ ] PayPay / Stripe / Square API 키 운영 vs sandbox 분리
- [ ] Cloud SQL `ilhae` 비번 16자 이상, 채팅/이메일 노출 시 즉시 로테이션 (OPR-13)
- [ ] Cloud SQL Public IP 비활성 또는 Authorized Networks 비워두기 (Auth Proxy 만 사용)
- [ ] Redis 외부 접근 차단 (`bind 127.0.0.1`, `protected-mode yes`)
- [ ] SSH 키 인증만 허용, password 로그인 비활성화
- [ ] HTTPS 강제 (Cloudflare 또는 nginx)
- [ ] 22 포트 IAP 룰로 한정 (OPR-14)

---

## 10. 트러블슈팅

### 10.1 서버 시작 실패 — `Redis connection failed`

```bash
sudo systemctl status redis-server
redis-cli ping   # PONG 안 나오면 redis 자체 문제
```

`backend/.env` 의 `REDIS_URL` 확인.

### 10.2 서버 시작 실패 — `KeyError: 'DATABASE_URL'`

`backend/.env` 누락. `setup_server.sh` 가 기본 `.env` 를 생성하지만 수정 후 재시작 필수.

### 10.3 서버 시작 실패 — DB 연결 거부 / timeout

```bash
# 1. Auth Proxy 상태
sudo systemctl status cloud-sql-proxy
curl http://127.0.0.1:9090/readiness   # ok 가 아니면 proxy 문제

# 2. proxy 로그
sudo journalctl -u cloud-sql-proxy -n 50

# 3. 직접 PG 접속 시도
PGPASSWORD='***' psql 'host=127.0.0.1 port=5432 dbname=qraku user=ilhae' -c 'SELECT 1'
```

| 증상 | 원인 | 해결 |
|---|---|---|
| `PERMISSION_DENIED` (proxy 로그) | VM SA 권한 부족 | `roles/cloudsql.client` 부여 (§2.2.2) |
| `error fetching default credentials` | VM scope 부재 | §2.2.2 절차 재실행 |
| `address already in use` (5432) | 다른 PG 클라이언트 5432 사용 중 | `--port=5433` 등 변경 + `.env` 도 동기화 |

### 10.4 Alembic 동작 이상

- `alembic current` 결과 확인. 빈 결과면 baseline stamp 미실행 → `uv run alembic stamp head` (OPR-07).
- autogenerate 결과에 노이즈 (Enum, JSON 컬럼) 가 매번 검출 → 정상. 수기 검토 후 제거.

### 10.5 WebSocket 메시지 손실

- 동일 인스턴스 — Pub/Sub listener 가 죽었는지 로그 확인 (`grep "pubsub" backend.log`).
- 다중 인스턴스 — `instance_id` 가 모두 같은 값이면 dedup 이 모든 메시지를 skip. 환경변수 또는 random 값 확인.

### 10.6 메뉴 번역이 안 됨

- 워커 프로세스가 떠 있는지 확인 (`ps aux | grep dramatiq`).
- 워커가 없어도 `Menu` 자체는 저장됨 (응답 정상). 번역만 미완료 상태.
- 워커 가동 후 `translate_menu.send(menu_id)` 를 수동으로 트리거하거나 메뉴 재저장.

### 10.7 Enum LookupError / hydration 폭발

PG 컷오버 후 등장한 패턴: `(str, Enum)` 의 멤버 `name != value` 일 때 SQLAlchemy 가 INSERT 시 `enum.name` (대문자) 으로 저장하지만 lookup 도 `name` 기준. raw `UPDATE` 로 소문자 정규화하면 hydration 실패.

- **자동 차단**: `tools/predeploy_smoke.py` #8 (SQLModel Enum field `name == value`) 가 deploy 전 새 mismatch 감지 시 FAIL.
- **운영 데이터 회복**: `backend/database.py` `migration_sqls` 에 방어 `UPDATE store SET col = 'UPPER' WHERE col::text = 'lower'` 패턴 다수 (부팅 시 자동 멱등 실행).

---

## 11. 참고

- [`architecture.md`](./architecture.md) — 전체 아키텍처
- [`coding-rules.md`](./coding-rules.md) — 코딩 규칙
- [`payment-rules.md`](./payment-rules.md) — 결제 멱등성·환불
- [`websocket-rules.md`](./websocket-rules.md) — WS 설계
- [`adr/`](./adr/) — 설계 결정 기록
- [`../setup_server.sh`](../setup_server.sh) — 서버 setup 스크립트
- [`../deploy.py`](../deploy.py) — 배포 스크립트
- [`../tools/cloud-sql-proxy.service`](../tools/cloud-sql-proxy.service) — Auth Proxy systemd unit
- [`../tools/predeploy_smoke.py`](../tools/predeploy_smoke.py) — deploy 전 자동 smoke (compile / utcnow grep / JWT / db_compat SQL / Enum allowlist)

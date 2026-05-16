# Deployment — QRaku.com

> 운영 배포·환경 설정·서버 운영 가이드.
> 코드 변경은 [`architecture.md`](./architecture.md), 결제 규칙은 [`payment-rules.md`](./payment-rules.md) 참조.

---

## 1. 운영 환경 개요

| 항목 | 값 |
|---|---|
| 서버 | GCP VM `35.213.6.149` (us-east1-b 권장) |
| OS | Ubuntu 22.04 LTS |
| 도메인 | `qraku.com` → `35.213.6.149` (A 레코드) |
| SSH 사용자 | `verejireh` |
| SSH 키 | 프로젝트 상위 폴더의 `qraku` (서버 접근용) — GitHub 키와 다름 |
| 작업 디렉토리 | `~/qr-order-system` |
| 서비스 | `qrorder.service` (systemd) — port 8003 |
| TLS | Cloudflare 또는 외부 리버스 프록시에서 종료 (서버는 평문 8003) |

> **GitHub 푸시용 SSH 키**: `qraku_ssh_github` (별도). 운영 서버 키와 분리.

---

## 2. 한 번만 하는 초기 설정

### 2.1 GCP VM 준비

1. `35.213.6.149` 인스턴스 생성 (Ubuntu 22.04, e2-small 이상).
2. 방화벽: `8003/tcp` (백엔드), `22/tcp` (SSH), `3306/tcp` (MySQL — 외부 접근 시).
3. `qraku.com` DNS A 레코드 → 인스턴스 공인 IP.

### 2.2 의존 서비스

```bash
# MySQL
sudo apt install mysql-server
sudo mysql -e "CREATE DATABASE kiospad;"
sudo mysql -e "CREATE USER 'kios_user'@'localhost' IDENTIFIED BY 'Kiospad1234!';"
sudo mysql -e "GRANT ALL ON kiospad.* TO 'kios_user'@'localhost';"

# Redis (이번 사이클부터 필수)
sudo apt install redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # → PONG
```

### 2.3 운영자 액션 (코드 외 설정)

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

> ⚠️ **`ENCRYPTION_KEY` 변경 시 주의**: 한 번 설정 후 키를 바꾸면 기존 암호화 데이터를 복호화할 수 없다. 키 로테이션 시 별도 마이그레이션 스크립트 필요.

### 2.4 `backend/.env` 예시 (운영)

```ini
# MySQL
DATABASE_URL=mysql+aiomysql://kios_user:Kiospad1234!@localhost:3306/kiospad

# Redis (이번 사이클부터 필수)
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

# AI / LIFF (선택)
GEMINI_API_KEY=...
VITE_LINE_LIFF_ID=<OPR-02>
VISION_API_KEY=<OPR-04>

# WS / 멱등성 (옵션, 기본값 사용 가능)
WS_AUTH_TOKEN_TTL_SECONDS=300
IDEMPOTENCY_TTL_SECONDS=86400
```

---

## 3. 일반 배포 절차 (`deploy.py`)

로컬에서 실행:

```bash
uv run deploy.py
```

수행 단계:
1. `frontend-react/` 에서 `npm install && npm run build` (로컬 빌드).
2. `backend/`, `frontend-react/`, `pyproject.toml`, `uv.lock`, `setup_server.sh` 를 `deploy_package.zip` 으로 압축.
   - 제외: `.venv`, `node_modules`, `__pycache__`, `.git`, `.env`, `*.db*` 등.
3. paramiko 로 서버에 SCP 업로드.
4. 서버에서 `setup_server.sh` 실행:
   - `uv` 자동 설치 (없으면)
   - `uv sync --frozen` (`.venv` 재현)
   - `frontend-react/dist/` 자산 정리 (오래된 빌드 정리)
   - 기존 5173 / 8003 프로세스 종료
   - `qrorder.service` (systemd) 재시작
5. 포트 8003 살아있는지 확인.

> ⚠️ **마이그레이션은 자동 실행 안 함**. 새 스키마 변경 배포 시 운영자가 직접:
> ```bash
> ssh -i qraku verejireh@35.213.6.149 "cd ~/qr-order-system && uv run alembic upgrade head"
> ```

---

## 4. systemd 서비스

`setup_server.sh` 가 자동으로 `/etc/systemd/system/qrorder.service` 를 생성/갱신:

```ini
[Unit]
Description=QRaku FastAPI Server
After=network.target

[Service]
User=verejireh
WorkingDirectory=/home/verejireh/qr-order-system/backend
ExecStart=/home/verejireh/qr-order-system/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8003
Restart=always
RestartSec=5
Environment=PATH=/home/verejireh/qr-order-system/.venv/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=append:/home/verejireh/qr-order-system/backend.log
StandardError=append:/home/verejireh/qr-order-system/backend.log

[Install]
WantedBy=multi-user.target
```

- `--host 127.0.0.1` — 외부 노출은 리버스 프록시(Nginx/Cloudflare) 가 담당 (현재는 직접 8003 노출이지만 의도적 — 향후 변경).
- 종속성: `redis-server.service`, `mysql.service` 가 먼저 떠 있어야 정상 동작.

### 4.1 운영 명령

```bash
# 상태
sudo systemctl status qrorder.service

# 재시작
sudo systemctl restart qrorder.service

# 로그
tail -f ~/qr-order-system/backend.log
journalctl -u qrorder.service -f
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
After=network.target redis-server.service

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
- 워커는 sync DB(`pymysql`) + sync Redis publish 사용. WS 이벤트는 직접 `redis.publish("ws:store:{id}", envelope)` 형식으로 발행 (백엔드의 `_pubsub_listener` 가 fan-out).

---

## 6. 헬스체크 / 모니터링

| 엔드포인트 | 용도 | 정상 응답 |
|---|---|---|
| `GET /api/healthz` | 프로세스 살아있는지 | `200 {"status":"ok"}` |
| `GET /api/readyz` | DB·Redis 연결 OK 확인 | `200 {"status":"ready"}` 또는 `503` |

GCP VM 의 health check 또는 외부 모니터링(UptimeRobot 등)에 `/api/readyz` 등록 권장.

### 6.1 로그

| 출처 | 위치 |
|---|---|
| FastAPI stdout/stderr | `~/qr-order-system/backend.log` (systemd append) |
| Nginx / Cloudflare | 외부 |
| MySQL slow query | `/var/log/mysql/mysql-slow.log` (활성화 시) |
| Redis | `journalctl -u redis-server` |

### 6.2 자주 보는 명령

```bash
# 최근 에러
grep -i "error\|exception" ~/qr-order-system/backend.log | tail -50

# 결제 관련
grep -i "paypay\|square\|refund" ~/qr-order-system/backend.log | tail -100

# WebSocket Pub/Sub 상태
grep "WS pubsub" ~/qr-order-system/backend.log
```

---

## 7. 개발 환경 (docker-compose)

운영과 별개로 로컬에서 멀티 인스턴스 / 워커 / Redis 검증 가능.

```bash
# repo 루트에서
docker compose up -d --build

# 서비스
# - mysql:    localhost:3307
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

### 8.1 MySQL 덤프 (수동)

```bash
ssh -i qraku verejireh@35.213.6.149 "mysqldump -u kios_user -p'Kiospad1234!' kiospad" > backup_$(date +%Y%m%d).sql
```

### 8.2 자동 백업 (권장, 미적용)

- GCP Cloud SQL 사용 시 자동 백업 활성화.
- 자체 호스팅 유지 시 cron 으로 매일 0시 mysqldump → GCS 업로드.

### 8.3 복구

```bash
mysql -u kios_user -p'Kiospad1234!' kiospad < backup_YYYYMMDD.sql
sudo systemctl restart qrorder.service
```

---

## 9. 보안 체크리스트

- [ ] `backend/.env` 파일 권한 `600` (운영자만 읽기)
- [ ] `ENCRYPTION_KEY` 운영 vs dev 분리, 절대 공유 금지
- [ ] `SECRET_KEY` JWT 서명 키 별도 관리
- [ ] PayPay / Stripe / Square API 키 운영 vs sandbox 분리
- [ ] MySQL `kios_user` 외부 접근 차단 (방화벽 + bind-address localhost)
- [ ] Redis 외부 접근 차단 (`bind 127.0.0.1`, `protected-mode yes`)
- [ ] SSH 키 인증만 허용, password 로그인 비활성화
- [ ] HTTPS 강제 (Cloudflare 또는 nginx)

---

## 10. 트러블슈팅

### 10.1 서버 시작 실패 — `Redis connection failed`

```bash
sudo systemctl status redis-server
redis-cli ping   # PONG 안 나오면 redis 자체 문제
```

`backend/.env` 의 `REDIS_URL` 확인.

### 10.2 서버 시작 실패 — `KeyError: 'DATABASE_URL'`

`backend/.env` 누락 또는 systemd `EnvironmentFile` 미설정. `setup_server.sh` 가 기본 `.env` 를 생성하지만 수정 후 재시작 필수.

### 10.3 Alembic 동작 이상

- `alembic current` 결과 확인. 빈 결과면 baseline stamp 미실행 → `uv run alembic stamp head`.
- autogenerate 결과에 노이즈 (Enum, JSON 컬럼) 가 매번 검출 → 정상. 수기 검토 후 제거.

### 10.4 WebSocket 메시지 손실

- 동일 인스턴스 — Pub/Sub listener 가 죽었는지 로그 확인 (`grep "pubsub" backend.log`).
- 다중 인스턴스 — `instance_id` 가 모두 같은 값이면 dedup 이 모든 메시지를 skip. 환경변수 또는 random 값 확인.

### 10.5 메뉴 번역이 안 됨

- 워커 프로세스가 떠 있는지 확인 (`ps aux | grep dramatiq`).
- 워커가 없어도 `Menu` 자체는 저장됨 (응답 정상). 번역만 미완료 상태.
- 워커 가동 후 `translate_menu.send(menu_id)` 를 수동으로 트리거하거나 메뉴 재저장.

---

## 11. Cloud SQL PostgreSQL (2026-05 이후)

> **상태**: DBM-02 (2026-05-11, db-migration-architect, opus) 산출 권장값 뼈대.
> **상세 결정 근거**: [`../tasks/db-migration-audit.md`](../tasks/db-migration-audit.md) §13.
> **콘솔 절차 / Auth Proxy systemd / 트러블슈팅 디테일은 DBM-11 카드에서 본 섹션을 보강한다** (현재는 권장 사양과 환경변수 형식만).

### 11.1 인스턴스 사양 (DBM-02 권장)

| 항목 | 권장값 |
|---|---|
| 인스턴스 타입 | `db-custom-1-3840` (1 vCPU, 3.75 GB) |
| 디스크 | 20 GB SSD, 자동 증가 ON |
| HA | zonal (단일 인스턴스) |
| 리전 / 존 | `asia-northeast1` / `asia-northeast1-b` (GCP VM 동일 존) |
| PostgreSQL 버전 | 16 |
| 백업 | 매일 02:00 KST, 7일 보관 |
| PITR | 활성화, WAL 7일 보관 |
| Maintenance window | 일요일 03:00~04:00 KST |
| 사용자 | `qraku` (superuser 아님) |
| 데이터베이스명 | `qraku` |

> **scale up 검토 기준**: 식당 30+ 또는 동시 주문 폭증 시 `db-custom-2-7680` (2 vCPU / 7.5 GB) 로. online resize 5~10분.

### 11.2 네트워크 (DBM-02 권장)

- **선택**: Cloud SQL Auth Proxy (Public IP)
- **이유**: 단일 GCP VM 운영. VPC Peering 비용 / 설정 복잡도 회피. IAM + TLS 자동.
- VM 에 `cloud-sql-proxy` binary 설치 + systemd 서비스로 `127.0.0.1:5432` listen.
- backend 의 `DATABASE_URL` 은 `127.0.0.1:5432` 만 알면 됨.

### 11.3 `backend/.env` 변경 (컷오버 후)

```ini
# 컷오버 전 (MySQL)
# DATABASE_URL=mysql+aiomysql://kios_user:Kiospad1234!@localhost:3306/kiospad

# 컷오버 후 (Cloud SQL PostgreSQL via Auth Proxy)
DATABASE_URL=postgresql+asyncpg://qraku:***@127.0.0.1:5432/qraku
```

- driver prefix `postgresql+asyncpg://` — async 라우터용.
- Alembic / dramatiq 워커는 `backend/utils/db.py:to_sync_url()` 가 자동으로 `postgresql+psycopg2://` 로 치환.
- 비밀번호는 16자 이상 random. secret manager 또는 `.env` (chmod 600) 에만 보관.

### 11.4 DBM-11 에서 보강될 항목 (TODO)

- [ ] GCP 콘솔에서 Cloud SQL PostgreSQL 인스턴스 생성 절차 (스크린샷 또는 단계별 캡션)
- [ ] `cloud-sql-proxy` binary 다운로드 + `/etc/systemd/system/cloud-sql-proxy.service` 설정 파일 예시
- [ ] IAM 권한 (Cloud SQL Client 역할) 부여 절차
- [ ] 트러블슈팅
  - 연결 실패 (`could not connect to server`)
  - IAM 권한 오류 (`PERMISSION_DENIED`)
  - 백업 / PITR 복구 절차
  - Auth Proxy 자동 재시작 안 됨
- [ ] PG 측 백업 / dump / 복구 명령 (8.1 / 8.3 의 PG 버전)
- [ ] `journalctl -u cloud-sql-proxy.service -f` 등 모니터링 명령

### 11.5 운영자 액션 (OPR-09 ~ OPR-12)

`tasks/current-tasks.md` 참조:

| OPR | 항목 | 시점 |
|---|---|---|
| OPR-09 | Cloud SQL 인스턴스 생성 (콘솔) | DBM-11 |
| OPR-10 | Auth Proxy 설치 (VM systemd) | DBM-11 |
| OPR-11 | 컷오버 시간 / 사전 공지 | DBM-12 |
| OPR-12 | `.env` `DATABASE_URL` 교체 | DBM-12 컷오버 룬북 T-5 |

---

## 12. 참고

- [`architecture.md`](./architecture.md) — 전체 아키텍처
- [`coding-rules.md`](./coding-rules.md) — 코딩 규칙
- [`payment-rules.md`](./payment-rules.md) — 결제 멱등성·환불
- [`websocket-rules.md`](./websocket-rules.md) — WS 설계
- [`adr/`](./adr/) — 설계 결정 기록
- [`../setup_server.sh`](../setup_server.sh) — 서버 setup 스크립트
- [`../deploy.py`](../deploy.py) — 배포 스크립트

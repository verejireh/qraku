#!/bin/bash

# --- GCP 서버용 배치 스크립트 (PostgreSQL via Cloud SQL Proxy, SPA 통합 서빙) ---
# Python 의존성 관리: uv (pyproject.toml + uv.lock)
# DB: Cloud SQL PostgreSQL (127.0.0.1:5432 via cloud-sql-proxy)

PROJECT_DIR=~/qr-order-system

echo "📂 프로젝트 폴더로 이동..."
cd $PROJECT_DIR

# 1. uv 설치 확인 / 자동 설치
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv &> /dev/null; then
    echo "📦 uv가 설치되어 있지 않습니다. 자동 설치 중..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    if ! command -v uv &> /dev/null; then
        echo "❌ uv 설치 실패"
        exit 1
    fi
fi
echo "✅ uv 버전: $(uv --version)"

# 2. .env 파일 확인 — 운영 환경은 수동 설정 필요 (자동 생성 금지)
if [ ! -f "backend/.env" ]; then
    echo "❌ backend/.env 파일이 없습니다!"
    echo "   운영 환경의 .env 는 Cloud SQL 접속 정보 + 시크릿을 포함하므로"
    echo "   자동 생성하지 않습니다. 다음 항목을 수동으로 설정하세요:"
    echo "     DB_USER, DB_PASS, DB_HOST=127.0.0.1, DB_PORT=5432, DB_NAME=qraku"
    echo "     DB_DRIVER=postgresql+asyncpg, SECRET_KEY, FRONTEND_BASE_URL, etc."
    echo "   템플릿: backend/.env.example"
    exit 1
fi

# 3. 의존성 동기화 (.venv 자동 생성, uv.lock 기반 재현)
echo "📦 Python 의존성 동기화 중 (uv sync)..."
uv sync --frozen
if [ $? -ne 0 ]; then
    echo "❌ uv sync 실패. uv.lock과 pyproject.toml을 확인하세요."
    exit 1
fi
echo "✅ .venv 동기화 완료"

# 4. React 프론트엔드 빌드는 deploy.py에서 로컬에서 미리 수행 후 dist/ 포함하여 배포
if [ -d "frontend-react/dist" ]; then
    echo "✅ 프론트엔드 dist/ 폴더 확인됨 (로컬 빌드 결과물 사용)"
    ASSET_COUNT=$(ls frontend-react/dist/assets/ 2>/dev/null | wc -l)
    if [ "$ASSET_COUNT" -gt 20 ]; then
        echo "🧹 오래된 빌드 파일 정리 중... ($ASSET_COUNT개 발견)"
        cd frontend-react/dist/assets
        ls -t | tail -n +15 | xargs rm -f 2>/dev/null
        cd $PROJECT_DIR
        echo "✅ 정리 완료"
    fi
else
    echo "⚠️  frontend-react/dist/ 폴더가 없습니다. deploy.py로 재배포해주세요."
fi

# 5. 기존 5173 Vite dev server 종료 (있다면)
FPIDS=$(lsof -t -i:5173 2>/dev/null)
if [ ! -z "$FPIDS" ]; then
    echo "🔄 기존 Vite 개발 서버 종료..."
    kill -9 $FPIDS 2>/dev/null || true
fi

# 6. 기존 FastAPI 프로세스 종료 (systemd 서비스 사용)
echo "🔄 기존 FastAPI 서버 종료..."
if systemctl is-active --quiet qrorder.service 2>/dev/null; then
    echo "  → systemd qrorder.service 중지..."
    sudo systemctl stop qrorder.service
    sleep 1
fi
REMAINING=$(lsof -t -i:8003 2>/dev/null)
if [ ! -z "$REMAINING" ]; then
    echo "⚠️  포트 8003에 잔존 프로세스 발견: $REMAINING — 강제 종료..."
    kill -9 $REMAINING 2>/dev/null || true
    sleep 1
fi

# 7. systemd 서비스 파일 생성/갱신 (매 deploy 마다 최신 정의로 덮어쓰기)
#
# 변경 이력:
#   2026-05-22 — orphan uvicorn restart loop 사고 대응:
#     - `if [ ! -f ]` 가드 제거 → 매 deploy 시 unit 정의 갱신
#     - ExecStartPre 로 포트 8003 점유 stale 프로세스 정리 (orphan 재발 방지)
#     - KillMode=mixed + TimeoutStopSec=10 으로 systemd-cgroup 정합성 강화
#     - nohup fallback 제거 (systemd 외부 orphan 생성의 직접 원인)
#     - After=cloud-sql-proxy.service (PG 컷오버 후 의존성 정정)
SERVICE_FILE="/etc/systemd/system/qrorder.service"
echo "📝 qrorder.service 정의 갱신 중..."
sudo bash -c "cat > $SERVICE_FILE" << 'SERVICE'
[Unit]
Description=QRaku FastAPI Server
After=network.target cloud-sql-proxy.service
Wants=cloud-sql-proxy.service

[Service]
Type=simple
User=verejireh
WorkingDirectory=/home/verejireh/qr-order-system
# 시작 전 포트 8003 점유 stale 프로세스 정리 (orphan 재발 방지)
# fuser 가 없을 수도 있으니 lsof 폴백 + 실패 무시 (-).
ExecStartPre=-/bin/bash -c '/usr/bin/fuser -k 8003/tcp 2>/dev/null || /usr/bin/lsof -ti :8003 | xargs -r kill -TERM 2>/dev/null || true'
ExecStart=/home/verejireh/qr-order-system/.venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8003
Restart=always
RestartSec=5
# graceful shutdown 타임아웃을 RestartSec 와 정합. 10초 내 종료 못 하면 SIGKILL.
TimeoutStopSec=10
# control-group 외부로 escape 한 child 도 함께 종료 (orphan 재발 방지).
KillMode=mixed
KillSignal=SIGTERM
Environment=PATH=/home/verejireh/qr-order-system/.venv/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=append:/home/verejireh/qr-order-system/backend.log
StandardError=append:/home/verejireh/qr-order-system/backend.log

[Install]
WantedBy=multi-user.target
SERVICE
sudo systemctl daemon-reload
sudo systemctl enable qrorder.service 2>/dev/null || true
echo "✅ qrorder.service 정의 갱신 완료"

# 8. FastAPI 서버 실행 (systemd 서비스 only — nohup fallback 제거됨)
echo "🚀 FastAPI 서버 실행 중 (Port: 8003)..."
sudo systemctl reset-failed qrorder.service 2>/dev/null || true
sudo systemctl restart qrorder.service
# 부팅 + DB 마이그레이션 시간 고려해서 7초 대기
sleep 7
if systemctl is-active --quiet qrorder.service 2>/dev/null; then
    # 추가로 healthz 응답 확인 — is-active 만으로는 부팅 중 false positive 가능
    if curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8003/api/healthz 2>/dev/null | grep -q 200; then
        echo "✅ 서버가 정상적으로 실행되었습니다! (systemd + healthz 200)"
        echo "🌐 접속 주소: https://qraku.com"
    else
        echo "⚠️  systemd 는 active 이지만 healthz 응답 없음. 부팅 진행 중일 수 있음."
        echo "   확인: tail -f ~/qr-order-system/backend.log"
    fi
else
    # 실패 시 진단 정보 출력 후 종료 — nohup orphan 생성하지 않음.
    echo "❌ systemd 서비스 시작 실패."
    sudo systemctl status qrorder.service --no-pager | tail -20
    echo ""
    echo "   조치: sudo journalctl -u qrorder --since '5 minutes ago' --no-pager"
    echo "         로그 확인 후 수동 디버깅 필요."
    exit 1
fi

echo ""
echo "📡 상태 확인: ps aux | grep uvicorn"
echo "📄 로그 확인: tail -f ~/qr-order-system/backend.log"

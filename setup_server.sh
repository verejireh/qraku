#!/bin/bash

# --- GCP 서버용 배치 스크립트 (MySQL 전용, SPA 통합 서빙) ---
# Python 의존성 관리: uv (pyproject.toml + uv.lock)

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

# 2. .env 파일 확인
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env 파일이 없습니다! MySQL 접속 정보를 설정해주세요."
    cat > backend/.env << 'ENV'
DATABASE_URL=mysql+aiomysql://kios_user:Kiospad1234!@localhost:3306/kiospad
DEBUG=True
SECRET_KEY=yoursecretkeyhere
FRONTEND_BASE_URL=http://35.213.6.149:8003
ENV
    echo "✅ backend/.env 파일이 생성되었습니다."
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

# 7. systemd 서비스 파일 생성 (없으면 자동 생성)
SERVICE_FILE="/etc/systemd/system/qrorder.service"
if [ ! -f "$SERVICE_FILE" ]; then
    echo "📝 qrorder.service 파일이 없습니다. 자동 생성 중..."
    sudo bash -c "cat > $SERVICE_FILE" << 'SERVICE'
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
SERVICE
    sudo systemctl daemon-reload
    sudo systemctl enable qrorder.service
    echo "✅ qrorder.service 생성 및 등록 완료"
fi

# 8. FastAPI 서버 실행 (systemd 서비스)
echo "🚀 FastAPI 서버 실행 중 (Port: 8003)..."
sudo systemctl daemon-reload 2>/dev/null || true
sudo systemctl reset-failed qrorder.service 2>/dev/null || true
sudo systemctl restart qrorder.service
sleep 3
if systemctl is-active --quiet qrorder.service 2>/dev/null; then
    echo "✅ 서버가 정상적으로 실행되었습니다! (systemd)"
    echo "🌐 접속 주소: https://qraku.com"
else
    echo "⚠️  systemd 실패. nohup으로 폴백 실행..."
    pkill -f uvicorn 2>/dev/null || true
    sleep 1
    cd $PROJECT_DIR/backend
    nohup /home/verejireh/qr-order-system/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8003 > $PROJECT_DIR/backend.log 2>&1 &
    sleep 3
    if lsof -i:8003 > /dev/null 2>&1; then
        echo "✅ 서버가 nohup으로 실행되었습니다!"
    else
        echo "❌ 서버 실행 실패. 로그를 확인하세요: tail -f ~/qr-order-system/backend.log"
    fi
fi

echo ""
echo "📡 상태 확인: ps aux | grep uvicorn"
echo "📄 로그 확인: tail -f ~/qr-order-system/backend.log"

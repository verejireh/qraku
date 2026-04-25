#!/bin/bash

# --- GCP 서버용 배치 스크립트 (MySQL 전용, SPA 통합 서빙) ---

PROJECT_DIR=~/qr-order-system

echo "📂 프로젝트 폴더로 이동..."
cd $PROJECT_DIR

# 1. Python 가상환경 설정
echo "🔍 가상환경 상태 점검 중..."
if [ ! -d ".venv" ]; then
    echo "🐍 가상환경이 없습니다. 새로 생성합니다..."
    sudo apt-get update -qq && sudo apt-get install -y python3-venv -qq
    python3 -m venv .venv
fi

VENV_PYTHON=$PROJECT_DIR/.venv/bin/python3
VENV_PIP=$PROJECT_DIR/.venv/bin/pip

echo "📦 Python 라이브러리 설치 중..."
$VENV_PIP install --upgrade pip -q
if [ -f "backend/requirements.txt" ]; then
    $VENV_PIP install -r backend/requirements.txt -q
fi
# MySQL 필수 패키지 (SQLite 계열 절대 설치 안 함)
$VENV_PIP install aiomysql pymysql stripe -q

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

# 3. React 프론트엔드 빌드는 deploy.py에서 로컬에서 미리 수행 후 dist/ 포함하여 배포
#    서버에서 재빌드하지 않음 (환경 차이로 인한 테마 깨짐 방지)
if [ -d "frontend-react/dist" ]; then
    echo "✅ 프론트엔드 dist/ 폴더 확인됨 (로컬 빌드 결과물 사용)"
    # dist/assets 내 오래된 빌드 파일 정리 (최신 파일만 유지)
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

# 4. 기존 5173 Vite dev server 종료 (있다면)
FPIDS=$(lsof -t -i:5173 2>/dev/null)
if [ ! -z "$FPIDS" ]; then
    echo "🔄 기존 Vite 개발 서버 종료..."
    kill -9 $FPIDS 2>/dev/null || true
fi

# 5. 기존 FastAPI 프로세스 종료 (systemd 서비스 사용)
echo "🔄 기존 FastAPI 서버 종료..."
if systemctl is-active --quiet qrorder.service 2>/dev/null; then
    echo "  → systemd qrorder.service 중지..."
    sudo systemctl stop qrorder.service
    sleep 1
fi
# Fallback: 포트 기반 강제 종료
REMAINING=$(lsof -t -i:8003 2>/dev/null)
if [ ! -z "$REMAINING" ]; then
    echo "⚠️  포트 8003에 잔존 프로세스 발견: $REMAINING — 강제 종료..."
    kill -9 $REMAINING 2>/dev/null || true
    sleep 1
fi

# 6. FastAPI 서버 실행 (systemd 서비스 — nohup 절대 사용 금지)
echo "🚀 FastAPI 서버 실행 중 (Port: 8003)..."
sudo systemctl daemon-reload 2>/dev/null || true
sudo systemctl reset-failed qrorder.service 2>/dev/null || true
sudo systemctl restart qrorder.service
sleep 3
if systemctl is-active --quiet qrorder.service 2>/dev/null; then
    echo "✅ 서버가 정상적으로 실행되었습니다! (systemd)"
    echo "🌐 접속 주소: http://35.213.6.149:8003/"
    echo "📋 관리자:   http://35.213.6.149:8003/1234567/admin"
    echo "🍽️  테이블:   http://35.213.6.149:8003/1234567/admin/tables"
else
    echo "❌ 서버 실행에 실패했습니다. 아래 로그를 확인해 보세요:"
    sudo journalctl -u qrorder.service -n 30 --no-pager
fi

echo ""
echo "📡 상태 확인: ps aux | grep uvicorn"
echo "📄 로그 확인: tail -f ~/qr-order-system/backend.log"

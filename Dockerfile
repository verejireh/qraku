FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen 2>/dev/null || uv sync

COPY backend ./backend

EXPOSE 8003

# [2026-05-22] --reload 제거 — production 부적절 (파일 변경 감지 + 자동 재시작이
# 운영 환경에서 의도치 않은 무한 reload 폭주 가능, GPT cross-review 권고).
# 개발 시 reload 가 필요하면: docker run ... uv run uvicorn backend.main:app --host 0.0.0.0 --port 8003 --app-dir . --reload
CMD ["uv","run","uvicorn","backend.main:app","--host","0.0.0.0","--port","8003","--app-dir","."]

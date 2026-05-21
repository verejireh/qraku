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

CMD ["uv","run","uvicorn","backend.main:app","--host","0.0.0.0","--port","8003","--app-dir",".","--reload"]

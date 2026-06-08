"""LINE webhook エンドポイント — 503(未設定) / 401(署名NG) 最小テスト."""
import os

# database.py が DATABASE_URL 未設定で sys.exit(1) するため、
# routers.line_bot の import より前に env を設定する。
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/x")

from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
import routers.line_bot as lb
from database import get_session


def _make_app() -> FastAPI:
    """テスト用ミニアプリ — get_session を DB 不要のダミーに差し替え。"""
    app = FastAPI()
    app.include_router(lb.router, prefix="/api")

    async def _fake_session():
        # 503/401 経路では DB コールは発生しないためダミーで十分。
        yield MagicMock()

    app.dependency_overrides[get_session] = _fake_session
    return app


def test_503_when_unconfigured(monkeypatch):
    """LINE_CHANNEL_SECRET / ACCESS_TOKEN 未設定 → 503."""
    monkeypatch.delenv("LINE_CHANNEL_SECRET", raising=False)
    monkeypatch.delenv("LINE_CHANNEL_ACCESS_TOKEN", raising=False)
    client = TestClient(_make_app(), raise_server_exceptions=False)
    r = client.post("/api/webhooks/line", content=b"{}", headers={"X-Line-Signature": "x"})
    assert r.status_code == 503


def test_401_on_bad_signature(monkeypatch):
    """署名が不正 → 401."""
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "s")
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", "t")
    client = TestClient(_make_app(), raise_server_exceptions=False)
    r = client.post(
        "/api/webhooks/line",
        content=b'{"events":[]}',
        headers={"X-Line-Signature": "wrong"},
    )
    assert r.status_code == 401

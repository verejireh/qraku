import os
import base64, hmac, hashlib
from utils.line_client import verify_line_signature, build_flex_carousel, build_location_request, _bubble


def _sign(body: bytes, secret: str) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def test_verify_signature_ok(monkeypatch):
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "s3cr3t")
    body = b'{"a":1}'
    assert verify_line_signature(body, _sign(body, "s3cr3t")) is True


def test_verify_signature_bad(monkeypatch):
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "s3cr3t")
    assert verify_line_signature(b'{"a":1}', "wrong") is False


def test_verify_signature_no_secret(monkeypatch):
    monkeypatch.delenv("LINE_CHANNEL_SECRET", raising=False)
    assert verify_line_signature(b'x', "sig") is False


def test_flex_empty_returns_text():
    msg = build_flex_carousel([])
    assert msg["type"] == "text"


def test_flex_carousel_structure():
    cards = [{"store_id": 1, "name": "A", "distance_label": "300m", "category": "cafe",
              "is_open": True, "can_accept_takeout": True, "food_rescue": False,
              "wait_minutes": 15, "slug": "a", "google_maps_url": "https://m/x"}]
    msg = build_flex_carousel(cards)
    assert msg["type"] == "flex"
    assert msg["contents"]["type"] == "carousel"
    assert len(msg["contents"]["contents"]) == 1


def test_bubble_order_button_only_when_takeout_and_slug(monkeypatch):
    monkeypatch.delenv("LINE_LIFF_ID", raising=False)
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://qraku.com")
    # 선결제 가능 + slug → 주문 버튼 존재
    b = _bubble({"name": "A", "distance_label": "1m", "can_accept_takeout": True, "slug": "a",
                 "is_open": True, "wait_minutes": 10, "google_maps_url": None})
    labels = [btn["action"]["label"] for btn in b["footer"]["contents"]]
    assert "テイクアウト注文" in labels
    # 선결제 불가 → 주문 버튼 없음
    b2 = _bubble({"name": "B", "distance_label": "1m", "can_accept_takeout": False, "slug": "b",
                  "is_open": True, "wait_minutes": 0, "google_maps_url": None})
    labels2 = [btn["action"]["label"] for btn in b2.get("footer", {"contents": []})["contents"]]
    assert "テイクアウト注文" not in labels2


def test_location_request_has_quick_reply():
    msg = build_location_request()
    assert msg["quickReply"]["items"][0]["action"]["type"] == "location"

"""LINE Messaging API 어댑터 — 서명검증·Flex 카드·reply 호출.
플랫폼 무관 핵심(find_nearby_stores / to_store_cards)을 LINE 포맷으로 변환하는 경계.
"""
import os
import hmac
import hashlib
import base64
import logging
import httpx

logger = logging.getLogger(__name__)

LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply"


def verify_line_signature(body: bytes, signature: str | None) -> bool:
    """X-Line-Signature 검증: base64(HMAC-SHA256(channel_secret, body))."""
    secret = os.getenv("LINE_CHANNEL_SECRET", "")
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


def _order_url(slug: str) -> str:
    """주문 URL — LIFF_ID 있으면 LINE 자동로그인 LIFF URL, 없으면 일반 https."""
    liff_id = os.getenv("LINE_LIFF_ID", "")
    if liff_id:
        return f"https://liff.line.me/{liff_id}/{slug}/takeout"
    base = os.getenv("FRONTEND_BASE_URL", "https://qraku.com").rstrip("/")
    return f"{base}/{slug}/takeout"


def _store_url(slug: str) -> str:
    base = os.getenv("FRONTEND_BASE_URL", "https://qraku.com").rstrip("/")
    return f"{base}/{slug}"


def build_location_request() -> dict:
    """위치 공유를 유도하는 quick-reply 텍스트 메시지."""
    return {
        "type": "text",
        "text": "近くのお店を探します。現在地を送ってください📍",
        "quickReply": {
            "items": [
                {"type": "action", "action": {"type": "location", "label": "📍 現在地を送る"}}
            ]
        },
    }


def _bubble(card: dict) -> dict:
    badges = []
    if card.get("is_open"):
        badges.append("営業中")
    if card.get("can_accept_takeout"):
        badges.append("事前決済OK")
    if card.get("food_rescue"):
        badges.append("⚡割引中")
    body_contents = [
        {"type": "text", "text": card["name"], "weight": "bold", "size": "lg", "wrap": True},
        {"type": "text", "text": "・".join([card["distance_label"]] + ([card["category"]] if card.get("category") else [])),
         "size": "sm", "color": "#888888", "margin": "sm"},
    ]
    if badges:
        body_contents.append({"type": "text", "text": " / ".join(badges), "size": "sm", "color": "#c21e2f", "margin": "sm", "wrap": True})
    if card.get("can_accept_takeout") and card.get("wait_minutes"):
        body_contents.append({"type": "text", "text": f"🕒 約{card['wait_minutes']}分で受取", "size": "sm", "color": "#c21e2f", "margin": "sm"})

    footer_buttons = []
    if card.get("can_accept_takeout") and card.get("slug"):
        footer_buttons.append({"type": "button", "style": "primary", "color": "#c21e2f",
                               "action": {"type": "uri", "label": "テイクアウト注文", "uri": _order_url(card["slug"])}})
    if card.get("slug"):
        footer_buttons.append({"type": "button", "style": "secondary",
                               "action": {"type": "uri", "label": "お店へ", "uri": _store_url(card["slug"])}})
    if card.get("google_maps_url"):
        footer_buttons.append({"type": "button", "style": "secondary",
                               "action": {"type": "uri", "label": "地図", "uri": card["google_maps_url"]}})

    bubble = {"type": "bubble", "body": {"type": "box", "layout": "vertical", "contents": body_contents}}
    if footer_buttons:
        bubble["footer"] = {"type": "box", "layout": "vertical", "spacing": "sm", "contents": footer_buttons}
    return bubble


def build_flex_carousel(cards: list[dict]) -> dict:
    """중립 카드 list → LINE Flex carousel. 0개면 안내 텍스트 메시지."""
    if not cards:
        return {"type": "text", "text": "近くに登録店舗が見つかりませんでした🙏"}
    bubbles = [_bubble(c) for c in cards[:10]]
    return {"type": "flex", "altText": "近くのお店", "contents": {"type": "carousel", "contents": bubbles}}


async def reply_message(reply_token: str, messages: list[dict]) -> None:
    """LINE reply API 호출. 토큰 미설정/오류 시 로그만(서버 안 죽음)."""
    token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
    if not token:
        logger.warning("[line] LINE_CHANNEL_ACCESS_TOKEN 미설정 — reply 생략")
        return
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"replyToken": reply_token, "messages": messages[:5]}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(LINE_REPLY_URL, headers=headers, json=payload)
            if res.status_code != 200:
                logger.warning("[line] reply 실패 %s: %s", res.status_code, res.text)
    except Exception:
        logger.exception("[line] reply 예외")

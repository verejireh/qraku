"""
utils/square_client.py – Square POS 연동 클라이언트 (동적 토큰 사용)

주문이 발생했을 때 매장(Store)의 square_access_token 값을 동적으로
활용해 Square API 와 통신합니다.

Two-track 아키텍처:
  - eat_in  : DB 주문 생성(unpaid) → Square POS 전송 (create_square_order)
  - take_out : 카드 선결제 (process_square_payment) → DB 주문 생성(paid) → Square POS 전송
"""

import os
import httpx
import uuid
from typing import Optional, List, Dict

from utils.crypto import decrypt_secret

SQUARE_ENVIRONMENT = os.getenv("SQUARE_ENVIRONMENT", "sandbox")


def _resolve_square_token(store) -> str:
    """
    Store 와 PaymentSettings 양쪽에서 Square Access Token 을 찾고 자동 복호화.
    PaymentSettings(신규) 우선 → Store 컬럼(레거시) 폴백.
    """
    ps = getattr(store, "payment_settings", None)
    raw = None
    if ps and getattr(ps, "square_access_token", None):
        raw = ps.square_access_token
    elif getattr(store, "square_access_token", None):
        raw = store.square_access_token
    return decrypt_secret(raw) or ""


def _resolve_square_location(store) -> str:
    ps = getattr(store, "payment_settings", None)
    if ps and getattr(ps, "square_location_id", None):
        return ps.square_location_id
    return getattr(store, "square_location_id", "") or ""


def get_square_api_base() -> str:
    if SQUARE_ENVIRONMENT == "production":
        return "https://connect.squareup.com"
    return "https://connect.squareupsandbox.com"


def _auth_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Square-Version": "2024-02-21",
    }


async def create_square_order(store, order, line_items: List[Dict]) -> dict:
    """
    Square POS / Kitchen Printer 에 주문 데이터를 전송합니다.

    Args:
        store:      Store 모델 인스턴스 (square_access_token, square_location_id 필수)
        order:      Order 모델 인스턴스
        line_items: [{"name": str, "quantity": int, "unit_price": int}, ...]
                    unit_price 는 JPY 정수 (セント換算 불필요)

    Returns:
        Square API 응답 dict  or  {"status": "error", "message": ...}
    """
    access_token = _resolve_square_token(store)
    if not access_token:
        print(f"[Square] Error: Store {store.id} has no square_access_token.")
        return {"status": "error", "message": "unauthorized"}

    location_id = _resolve_square_location(store)
    if not location_id:
        print(f"[Square] Error: Store {store.id} has no square_location_id.")
        return {"status": "error", "message": "square_location_id not configured"}

    sq_line_items = [
        {
            "name": item.get("name", "Item"),
            "quantity": str(item.get("quantity", 1)),
            "base_price_money": {
                "amount": int(item.get("unit_price", 0)),
                "currency": "JPY",
            },
        }
        for item in line_items
    ]

    payload = {
        "idempotency_key": str(uuid.uuid4()),
        "order": {
            "location_id": location_id,
            "line_items": sq_line_items,
            "metadata": {
                "qraku_order_id": str(order.id),
                "table_number": str(order.table_number),
                "order_type": str(getattr(order, "order_type", "eat_in")),
            },
        },
    }

    url = f"{get_square_api_base()}/v2/orders"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                url, headers=_auth_headers(access_token), json=payload
            )
            if res.status_code in (200, 201):
                data = res.json()
                print(f"[Square] Order {order.id} dispatched for store {store.id}")
                return data
            else:
                print(
                    f"[Square] Create order failed. Status: {res.status_code}, Body: {res.text}"
                )
                return {"status": "error", "message": res.text}
    except Exception as e:
        print(f"[Square] HTTP exception in create_square_order: {e}")
        return {"status": "error", "message": str(e)}


async def process_square_payment(
    store,
    source_id: str,
    amount: int,
    square_order_id: Optional[str] = None,
    note: str = "",
) -> dict:
    """
    Take-out 선결제: Square Web Payments SDK 에서 얻은 source_id(nonce)로
    실제 결제를 진행합니다.

    Args:
        store:           Store 모델 인스턴스
        source_id:       Square card nonce (프론트엔드 SDK 반환값)
        amount:          결제 금액 (JPY 정수)
        square_order_id: 연동할 Square Order ID (선택)
        note:            결제 메모

    Returns:
        {"status": "ok", "payment_id": str, "square_order_id": str | None}
        or {"status": "error", "message": str}
    """
    access_token = _resolve_square_token(store)
    if not access_token:
        return {"status": "error", "message": "unauthorized"}

    location_id = _resolve_square_location(store)
    if not location_id:
        return {"status": "error", "message": "square_location_id not configured"}

    payload: dict = {
        "idempotency_key": str(uuid.uuid4()),
        "source_id": source_id,
        "amount_money": {
            "amount": amount,
            "currency": "JPY",
        },
        "location_id": location_id,
        "autocomplete": True,
    }
    if square_order_id:
        payload["order_id"] = square_order_id
    if note:
        payload["note"] = note

    url = f"{get_square_api_base()}/v2/payments"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                url, headers=_auth_headers(access_token), json=payload
            )
            data = res.json()
            if res.status_code in (200, 201):
                payment = data.get("payment", {})
                print(
                    f"[Square] Payment OK: payment_id={payment.get('id')} for store {store.id}"
                )
                return {
                    "status": "ok",
                    "payment_id": payment.get("id"),
                    "square_order_id": payment.get("order_id"),
                }
            else:
                errors = data.get("errors", [{}])
                msg = errors[0].get("detail", res.text) if errors else res.text
                print(f"[Square] Payment failed. Status: {res.status_code}, msg: {msg}")
                return {"status": "error", "message": msg}
    except Exception as e:
        print(f"[Square] HTTP exception in process_square_payment: {e}")
        return {"status": "error", "message": str(e)}


async def refund_square_payment(store, payment_id: str, amount: int, idempotency_key: str, reason: str = "") -> dict:
    """Square 결제 환불 (POST /v2/refunds).

    idempotency_key 는 **주문 기준 고정값**이어야 한다 — 같은 키로 재호출하면 Square 가
    중복을 무시하므로 재시도 시 이중환불이 발생하지 않는다.
    Returns: {"status":"ok"|"error", "refund_id": str|None, "message": str|None}
    """
    access_token = _resolve_square_token(store)
    if not access_token:
        return {"status": "error", "message": "square access token not configured"}
    payload = {
        "idempotency_key": idempotency_key[:45],  # Square 제한 45자
        "payment_id": payment_id,
        "amount_money": {"amount": int(amount), "currency": "JPY"},
    }
    if reason:
        payload["reason"] = reason[:191]
    url = f"{get_square_api_base()}/v2/refunds"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=_auth_headers(access_token), json=payload)
            data = res.json()
        if res.status_code in (200, 201) and data.get("refund"):
            rf = data["refund"]
            # PENDING / COMPLETED 모두 환불 접수 성공으로 간주 (비동기 완료)
            return {"status": "ok", "refund_id": rf.get("id"), "square_status": rf.get("status")}
        errors = data.get("errors", [{}])
        msg = errors[0].get("detail", res.text) if errors else res.text
        print(f"[Square] Refund failed. Status: {res.status_code}, msg: {msg}")
        return {"status": "error", "message": msg}
    except Exception as e:
        print(f"[Square] HTTP exception in refund_square_payment: {e}")
        return {"status": "error", "message": str(e)}

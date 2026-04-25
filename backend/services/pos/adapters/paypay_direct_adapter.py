import uuid
import hashlib
import hmac
import base64
import time
import json
from typing import Optional

import httpx

from models import Store, PaymentSettings
from ..base import BasePaymentAdapter

# PayPay API endpoints
PAYPAY_API_PROD = "https://api.paypay.ne.jp"
PAYPAY_API_STAGING = "https://stg-api.paypay.ne.jp"


class PayPayDirectAdapter(BasePaymentAdapter):
    def __init__(self, store: Store, settings: PaymentSettings):
        super().__init__(store, settings)
        self.api_key = settings.paypay_api_key or ""
        self.api_secret = settings.paypay_api_secret or ""
        self.merchant_id = settings.paypay_merchant_id or ""
        # 本番 / ステージング判定
        self.base_url = PAYPAY_API_PROD if self.api_key and not self.api_key.startswith("stg_") else PAYPAY_API_STAGING

    def _generate_auth_header(self, method: str, path: str, body: str = "") -> dict:
        """PayPay HMAC-SHA256 認証ヘッダー生成"""
        nonce = uuid.uuid4().hex
        epoch = str(int(time.time()))
        content_type = "application/json" if body else "empty"
        body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest() if body else "empty"

        message = f"{path}\n{method}\n{nonce}\n{epoch}\n{content_type}\n{body_hash}"
        mac = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        mac_base64 = base64.b64encode(mac).decode("utf-8")

        return {
            "Authorization": f"hmac OPA-Auth:{self.api_key}:{mac_base64}:{nonce}:{epoch}:{content_type}",
            "Content-Type": "application/json",
            "X-ASSUME-MERCHANT": self.merchant_id,
        }

    async def create_qr_payment(
        self,
        amount: int,
        order_description: str,
        merchant_payment_id: str,
        redirect_url: str,
    ) -> dict:
        """
        PayPay QR コード決済を作成し、決済 URL を返却。
        成功時: {"status": "ok", "payment_url": str, "code_id": str, "merchant_payment_id": str}
        失敗時: {"status": "error", "message": str}
        """
        if not self.api_key or not self.api_secret:
            return {"status": "error", "message": "PayPay API credentials が未設定です。"}

        path = "/v2/codes"
        payload = {
            "merchantPaymentId": merchant_payment_id,
            "amount": {"amount": amount, "currency": "JPY"},
            "codeType": "ORDER_QR",
            "orderDescription": order_description,
            "redirectUrl": redirect_url,
            "redirectType": "WEB_LINK",
            "isAuthorization": False,
        }
        body_str = json.dumps(payload)

        try:
            headers = self._generate_auth_header("POST", path, body_str)
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.base_url}{path}",
                    headers=headers,
                    content=body_str,
                )
                data = resp.json()

            if resp.status_code == 200 and data.get("resultInfo", {}).get("code") == "SUCCESS":
                return {
                    "status": "ok",
                    "payment_url": data["data"]["url"],
                    "code_id": data["data"]["codeId"],
                    "merchant_payment_id": merchant_payment_id,
                }
            else:
                msg = data.get("resultInfo", {}).get("message", "PayPay API error")
                print(f"[PayPayDirect] Create QR failed: {data}")
                return {"status": "error", "message": msg}
        except Exception as e:
            print(f"[PayPayDirect] Exception: {e}")
            return {"status": "error", "message": str(e)}

    async def get_payment_details(self, merchant_payment_id: str) -> dict:
        """
        決済状況を照会。
        返却: {"status": "ok", "payment_status": str, "payment_id": str} or error
        PayPay statuses: COMPLETED, CREATED, EXPIRED, CANCELED
        """
        path = f"/v2/codes/payments/{merchant_payment_id}"
        try:
            headers = self._generate_auth_header("GET", path)
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.base_url}{path}",
                    headers=headers,
                )
                data = resp.json()

            if resp.status_code == 200 and data.get("resultInfo", {}).get("code") == "SUCCESS":
                payment_data = data.get("data", {})
                return {
                    "status": "ok",
                    "payment_status": payment_data.get("status", "UNKNOWN"),
                    "payment_id": payment_data.get("paymentId", ""),
                }
            else:
                msg = data.get("resultInfo", {}).get("message", "PayPay query error")
                return {"status": "error", "message": msg}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # ── BasePaymentAdapter 인터페이스 구현 ──

    async def process_payment(self, amount: float, source_id: str, note: str = "") -> dict:
        """
        PayPay 결제 상태 확인용.
        source_id = merchant_payment_id (프론트에서 PayPay 결제 완료 후 전달)
        """
        result = await self.get_payment_details(source_id)
        if result.get("status") != "ok":
            return result

        if result["payment_status"] == "COMPLETED":
            return {
                "status": "ok",
                "payment_id": result["payment_id"],
            }
        else:
            return {
                "status": "error",
                "message": f"PayPay 決済が完了していません (status: {result['payment_status']})",
            }

    async def refund_payment(self, payment_id: str, amount: float = None) -> dict:
        """PayPay 返金処理"""
        path = "/v1/refunds"
        refund_id = f"refund_{uuid.uuid4().hex[:12]}"
        payload = {
            "merchantRefundId": refund_id,
            "paymentId": payment_id,
            "amount": {"amount": int(amount), "currency": "JPY"} if amount else None,
            "reason": "Refund requested",
        }
        # amount가 None이면 전액 환불 — payload에서 제거
        if payload["amount"] is None:
            del payload["amount"]

        body_str = json.dumps(payload)
        try:
            headers = self._generate_auth_header("POST", path, body_str)
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.base_url}{path}",
                    headers=headers,
                    content=body_str,
                )
                data = resp.json()

            if resp.status_code == 200 and data.get("resultInfo", {}).get("code") == "SUCCESS":
                return {"status": "ok", "refund_id": refund_id}
            else:
                msg = data.get("resultInfo", {}).get("message", "Refund failed")
                return {"status": "error", "message": msg}
        except Exception as e:
            return {"status": "error", "message": str(e)}

import base64
import hashlib
import hmac

import pytest

from utils.square_terminal import (
    terminal_checkout_payload,
    verify_square_webhook_signature,
)


def test_terminal_checkout_payload_uses_jpy_and_device():
    payload = terminal_checkout_payload(
        amount=1234,
        device_id="device-1",
        reference_id="qraku-terminal-10",
        note="Table A1",
    )
    assert payload["amount_money"] == {"amount": 1234, "currency": "JPY"}
    assert payload["device_options"]["device_id"] == "device-1"
    assert payload["device_options"]["tip_settings"]["allow_tipping"] is False
    assert payload["reference_id"] == "qraku-terminal-10"


@pytest.mark.parametrize("amount", [0, -1])
def test_terminal_checkout_payload_rejects_non_positive_amount(amount):
    with pytest.raises(ValueError):
        terminal_checkout_payload(
            amount=amount,
            device_id="device-1",
            reference_id="ref",
            note="note",
        )


def test_square_webhook_signature_uses_url_plus_raw_body():
    body = b'{"event_id":"evt-1"}'
    key = "signature-key"
    url = "https://qraku.com/api/webhooks/square"
    expected = base64.b64encode(
        hmac.new(key.encode(), url.encode() + body, hashlib.sha256).digest()
    ).decode()

    assert verify_square_webhook_signature(body, expected, key, url) is True
    assert verify_square_webhook_signature(body + b" ", expected, key, url) is False
    assert verify_square_webhook_signature(body, "wrong", key, url) is False

"""
이메일 송신 유틸리티 (aiosmtplib)

환경변수:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
"""

import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@qraku.com")


async def send_email(to: str, subject: str, body_html: str) -> bool:
    """비동기 이메일 전송. SMTP 미설정 시 로그만 출력하고 True 반환."""
    if not SMTP_HOST or not SMTP_USER:
        logger.warning(f"[Email] SMTP not configured. Would send to {to}: {subject}")
        logger.info(f"[Email] Body: {body_html[:200]}")
        return True  # 개발 환경에서는 성공으로 처리

    try:
        import aiosmtplib

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            start_tls=True,
        )
        logger.info(f"[Email] Sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"[Email] Failed to send to {to}: {e}")
        return False

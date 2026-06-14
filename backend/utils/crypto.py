"""
대칭키 암호화 유틸 — PaymentSettings 의 PayPay/Square 시크릿 등 DB 저장 시 사용.

- ENCRYPTION_KEY 환경변수가 없으면 평문 그대로 처리 (개발 편의 + 무중단 마이그레이션)
- 암호화된 값은 "enc:v1:" 접두사로 식별
- Fernet (AES-128-CBC + HMAC-SHA256) 사용
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

ENC_PREFIX = "enc:v1:"
_fernet = None


def _get_fernet():
    """Fernet 인스턴스를 lazy 로드. 키 없으면 None 반환."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        logger.warning("ENCRYPTION_KEY 환경변수 없음 — 시크릿이 평문으로 저장됩니다 (출시 전 필수 설정)")
        return None

    try:
        from cryptography.fernet import Fernet
        # ENCRYPTION_KEY 는 base64 url-safe 32바이트 키여야 함
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as e:
        logger.error("ENCRYPTION_KEY 형식 오류: %s. `python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` 으로 새 키 생성", e)
        return None


def encrypt_secret(plaintext: Optional[str]) -> Optional[str]:
    """
    평문 시크릿을 암호화. 키 없으면 평문 그대로 반환 (호환성).
    None / 빈 문자열은 그대로 반환.
    이미 암호화된 값(접두사 있음)은 그대로 반환.
    """
    if not plaintext:
        return plaintext
    if plaintext.startswith(ENC_PREFIX):
        return plaintext  # 이미 암호화됨
    f = _get_fernet()
    if f is None:
        raise RuntimeError("ENCRYPTION_KEY is required before storing secrets")
    try:
        token = f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        return ENC_PREFIX + token
    except Exception as e:
        logger.error("encrypt_secret 실패: %s", e)
        raise RuntimeError("Secret encryption failed") from e


def decrypt_secret(value: Optional[str]) -> Optional[str]:
    """
    암호화된 값을 복호화. 평문이면 그대로 반환 (마이그레이션 호환).
    """
    if not value:
        return value
    if not value.startswith(ENC_PREFIX):
        return value  # 평문 (이전 데이터)
    f = _get_fernet()
    if f is None:
        logger.error("암호화된 값을 발견했지만 ENCRYPTION_KEY 가 없습니다 — 복호화 불가")
        return None
    try:
        token = value[len(ENC_PREFIX):]
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error("decrypt_secret 실패: %s", e)
        return None

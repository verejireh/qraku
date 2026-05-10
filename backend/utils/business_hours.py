"""
매장 영업시간 + is_open 토글 종합 판정 (백엔드 — 프론트와 동일 로직).
"""
from datetime import datetime
from typing import Optional


def is_store_open_now(store, now: Optional[datetime] = None) -> tuple[bool, str]:
    """
    Returns: (is_open, reason)
        reason ∈ {'manual_off', 'open', 'no_data'}
    """
    if not store:
        return False, 'no_data'

    # 오직 사장님이 수동으로 켠/끈 상태(is_open)로만 영업 여부를 판정합니다.
    if getattr(store, 'is_open', True) is False:
        return False, 'manual_off'

    return True, 'open'

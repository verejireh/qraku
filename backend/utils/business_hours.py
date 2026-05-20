"""
매장 영업시간 + is_open 토글 종합 판정 (백엔드 — 프론트와 동일 로직).
"""
import json
from datetime import datetime, timedelta
from typing import Optional

_DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


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


def get_close_time_today(store, now: datetime) -> Optional[datetime]:
    """영업시간 JSON에서 오늘 close_at datetime (JST 기준) 을 반환.

    business_hours 형식: {"mon":{"open":"11:00","close":"22:00"},...}
    - close < open → 자정 넘김으로 간주해 익일 close datetime 반환 (옵션 A, PR-04).
    - 오늘 요일이 business_hours에 없거나 JSON 파싱 실패 → None (스킵).
    """
    raw = getattr(store, "business_hours", None)
    if not raw:
        return None

    try:
        hours = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None

    day_key = _DAY_KEYS[now.weekday()]  # 0=mon … 6=sun
    day_data = hours.get(day_key)
    if not day_data:
        return None  # 휴무일

    close_str = day_data.get("close")
    open_str = day_data.get("open")
    if not close_str:
        return None

    try:
        close_h, close_m = (int(x) for x in close_str.split(":"))
    except (ValueError, AttributeError):
        return None

    close_dt = now.replace(hour=close_h, minute=close_m, second=0, microsecond=0)

    # 자정 넘김 판정: open_str 이 있고 close < open 이면 익일
    if open_str:
        try:
            open_h, open_m = (int(x) for x in open_str.split(":"))
            if (close_h, close_m) < (open_h, open_m):
                close_dt += timedelta(days=1)
        except (ValueError, AttributeError):
            pass

    return close_dt

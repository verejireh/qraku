"""Unit tests for get_close_time_today (SPC-02 수용 기준)."""
import json
from datetime import datetime, timezone, timedelta

import pytest

from utils.business_hours import get_close_time_today

JST = timezone(timedelta(hours=9))


class _Store:
    def __init__(self, business_hours):
        self.business_hours = (
            json.dumps(business_hours) if isinstance(business_hours, dict) else business_hours
        )


# ── helpers ──────────────────────────────────────────────────────────────────

def _jst(year, month, day, hour, minute):
    return datetime(year, month, day, hour, minute, tzinfo=JST)


# ── test cases ───────────────────────────────────────────────────────────────

def test_normal_weekday():
    """평일 close_at 정상 반환."""
    store = _Store({"mon": {"open": "11:00", "close": "22:00"}})
    now = _jst(2026, 5, 18, 20, 0)  # Monday 20:00 JST
    result = get_close_time_today(store, now)
    assert result == _jst(2026, 5, 18, 22, 0)


def test_midnight_crossing():
    """close < open 이면 익일 날짜로 반환 (居酒屋 패턴, PR-04 옵션 A)."""
    store = _Store({"fri": {"open": "17:00", "close": "01:00"}})
    now = _jst(2026, 5, 22, 23, 0)  # Friday 23:00 JST
    result = get_close_time_today(store, now)
    assert result is not None
    assert result.day == 23  # 익일 (Saturday)
    assert result.hour == 1
    assert result.minute == 0


def test_closed_day():
    """오늘 요일이 business_hours 에 없으면 None (휴무)."""
    store = _Store({"mon": {"open": "11:00", "close": "22:00"}})
    now = _jst(2026, 5, 19, 12, 0)  # Tuesday — 없는 요일
    assert get_close_time_today(store, now) is None


def test_malformed_json():
    """JSON 파싱 실패 시 None (에러 전파 금지)."""
    store = _Store("NOT_VALID_JSON{{")
    now = _jst(2026, 5, 18, 12, 0)
    assert get_close_time_today(store, now) is None


def test_missing_business_hours():
    """business_hours 가 None/빈값이면 None."""
    store = _Store(None)
    now = _jst(2026, 5, 18, 12, 0)
    assert get_close_time_today(store, now) is None


def test_should_be_active_within_window():
    """minutes_until_close <= food_rescue_auto_minutes 범위 내 → should_be_active=True."""
    store = _Store({"mon": {"open": "11:00", "close": "22:00"}})
    store.food_rescue_auto_minutes = 60
    now = _jst(2026, 5, 18, 21, 30)  # 30분 전
    close_dt = get_close_time_today(store, now)
    minutes_until_close = (close_dt - now).total_seconds() / 60
    assert 0 < minutes_until_close <= store.food_rescue_auto_minutes


def test_should_not_be_active_outside_window():
    """close_at 이후 (영업 종료) → minutes_until_close <= 0 → should_be_active=False."""
    store = _Store({"mon": {"open": "11:00", "close": "22:00"}})
    now = _jst(2026, 5, 18, 22, 30)  # 30분 지남
    close_dt = get_close_time_today(store, now)
    minutes_until_close = (close_dt - now).total_seconds() / 60
    assert minutes_until_close <= 0

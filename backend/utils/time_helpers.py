"""Timezone helpers — naive UTC 컨벤션 안에서 JST 비즈니스 시간 계산.

DB 컬럼은 모두 `TIMESTAMP without timezone` (naive). 따라서:
  - 저장/비교: naive UTC datetime (now_utc_naive)
  - 비즈니스 시간 판정 (영업시간, 메뉴 그룹 활성화, 일일 경계): JST aware datetime
    (now_jst, today_start_jst_as_utc_naive)

본 모듈은 P1 #7 분석 (tasks/p1-datetime-utc-migration-analysis.md) Strategy 1 의
산출물. datetime.utcnow() (Py 3.12+ deprecated) 와 datetime.now() (서버 로컬 = UTC on VM
이라 JST 비교 시 9시간 오프셋) 의 모범 대체.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def now_utc_naive() -> datetime:
    """현재 시각을 naive UTC datetime 으로 반환.

    DB 컬럼 (TIMESTAMP without timezone) 에 저장/비교용. Python 3.12+ 에서
    deprecated 된 datetime.utcnow() 의 모범 대체.

    Returns:
        datetime: tzinfo=None, value=UTC 현재 시각.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_jst() -> datetime:
    """현재 시각을 JST aware datetime 으로 반환.

    매장 영업시간 / 손님 노출 시각 비교 등 비즈니스 시간 판정용. JST 는 일광
    절약 시간이 없어 안전하게 고정 오프셋 +09:00.

    Returns:
        datetime: tzinfo=Asia/Tokyo, value=JST 현재 시각.
    """
    return datetime.now(JST)


def today_start_jst_as_utc_naive() -> datetime:
    """오늘 JST 자정 (00:00) 을 naive UTC datetime 으로 변환해 반환.

    DB 의 created_at (UTC naive) 같은 컬럼과 비교해 "오늘 매출", "오늘 픽업 코드"
    같은 일일 경계를 정확히 계산. JST 00:00 = UTC 전날 15:00.

    예시:
        JST 2026-05-22 14:00 시점 호출 → JST 2026-05-22 00:00 = UTC 2026-05-21 15:00
        반환값 = datetime(2026, 5, 21, 15, 0, 0)  # naive

    Returns:
        datetime: tzinfo=None, value=오늘 JST 자정의 UTC 표현.
    """
    n_jst = datetime.now(JST)
    start_jst = n_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_jst.astimezone(timezone.utc).replace(tzinfo=None)

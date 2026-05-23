"""Timezone helpers — naive UTC 컨벤션 안에서 JST 비즈니스 시간 계산.

DB 컬럼은 모두 `TIMESTAMP without timezone` (naive). 따라서:
  - 저장/비교: naive UTC datetime (now_utc_naive)
  - 비즈니스 시간 판정 (영업시간, 메뉴 그룹 활성화, 일일 경계): JST aware datetime
    (now_jst, today_start_jst_as_utc_naive)

본 모듈은 P1 #7 분석 (tasks/p1-datetime-utc-migration-analysis.md) Strategy 1 의
산출물. datetime.utcnow() (Py 3.12+ deprecated) 와 datetime.now() (서버 로컬 = UTC on VM
이라 JST 비교 시 9시간 오프셋) 의 모범 대체.
"""
from datetime import datetime, date, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# [2026-05-22] JST resolution with fallback — GPT review (gpt-pg-dt-migrate-02-review.md §C)
# 권고. Windows/Python 3.12 에선 tzdata 패키지 없으면 ZoneInfo("Asia/Tokyo") 가
# ZoneInfoNotFoundError. pyproject.toml 에 tzdata 추가했지만 부분 설치 환경 대비
# fixed-offset timezone(+09:00) fallback. JST 는 DST 없어 결과 동일.
try:
    JST = ZoneInfo("Asia/Tokyo")
except ZoneInfoNotFoundError:
    JST = timezone(timedelta(hours=9), name="JST")


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


def days_ago_jst_as_utc_naive(days: int, now: Optional[datetime] = None) -> datetime:
    """N JST calendar days 전 자정 (00:00 JST) 의 naive UTC 표현.

    [2026-05-22] PG-DT-MIGRATE-02 Cat-2 — GPT review (gpt-pg-dt-migrate-02-review.md §B)
    권고. stats/insights/super_admin 의 "최근 N일 매출/주문" 같은 JST calendar-day
    rolling 쿼리에 사용. 기존 `datetime.utcnow() - timedelta(days=N)` 패턴은
    JST 09:00 시점에 경계 이동 (사장님이 보는 "오늘 매출" 과 일관성 깨짐).

    Args:
        days: 며칠 전 (양수). days=7 이면 7일 전 JST 자정.
        now: 기준 시각 (test 용). None 이면 현재.

    Returns:
        datetime: naive UTC, value=(today JST 00:00 - N days) 의 UTC instant.
    """
    base = today_start_jst_as_utc_naive(now=now)
    return base - timedelta(days=days)


def months_ago_jst_month_start_as_utc_naive(
    months: int, now: Optional[datetime] = None
) -> datetime:
    """N JST calendar months 전 1일 00:00 JST 의 naive UTC 표현.

    [2026-05-22] PG-DT-MIGRATE-02 Cat-2 — GPT review (gpt-pg-dt-migrate-02-review.md §B)
    권고. stats.py /monthly 의 기존 `days * 31` 근사를 month-boundary 로 정밀화.

    예: now = JST 2026-05-22 14:00, months=2
        → JST 2026-03-01 00:00 = UTC 2026-02-28 15:00

    Args:
        months: 몇 개월 전 (양수). months=2 이면 2개월 전 JST 월초.
        now: 기준 시각 (test 용). None 이면 현재.

    Returns:
        datetime: naive UTC, value=(N months ago JST month start) 의 UTC instant.
    """
    n_jst = (now.astimezone(JST) if now and now.tzinfo
             else now.replace(tzinfo=JST) if now
             else datetime.now(JST))
    # 현재 JST 월의 1일 00:00
    cur_month_start_jst = n_jst.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # N 개월 전 — 연/월 산술 (timedelta 는 month 단위 없음)
    target_year = cur_month_start_jst.year
    target_month = cur_month_start_jst.month - months
    while target_month <= 0:
        target_month += 12
        target_year -= 1
    start_jst = cur_month_start_jst.replace(year=target_year, month=target_month)
    return start_jst.astimezone(timezone.utc).replace(tzinfo=None)


def jst_day_range_as_utc_naive(
    day: Optional[date] = None,
) -> tuple[datetime, datetime]:
    """JST 특정 날짜의 [00:00, 다음날 00:00) range 를 naive UTC tuple 로 반환.

    핫패스 쿼리용 — `date_only(Order.created_at) == d` 패턴을 인덱스 사용 가능한
    `created_at >= start AND < end` range predicate 로 변환할 때 사용.

    [2026-05-22] PG-DT-DG-04 — GPT 세션 E review (gpt-p1-date-grouping-review.md §A)
    권고. db_compat.date_only 가 함수형 변환이라 일반 B-tree 인덱스 사용 불가 →
    핫패스는 range 로 전환해 created_at index (models.py:627 `index=True`) 활용.

    Args:
        day: JST 기준 날짜 (date 객체). None 이면 today_jst().

    Returns:
        (start_utc_naive, end_utc_naive): [start, end) 반열린 구간.
            start = JST day 00:00 의 UTC 표현
            end = JST (day+1) 00:00 의 UTC 표현
    """
    if day is None:
        day = datetime.now(JST).date()
    # JST aware datetime [day 00:00, (day+1) 00:00) → UTC naive
    start_jst = datetime.combine(day, datetime.min.time()).replace(tzinfo=JST)
    end_jst = start_jst + timedelta(days=1)
    start_utc = start_jst.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_jst.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def today_jst() -> date:
    """매장 운영일 (JST) 기준 오늘 date 반환.

    `backend.utils.db_compat.date_only(Order.created_at)` (JST 변환된 date) 와
    비교용. 서버 로컬 timezone (운영 VM 은 UTC) 에 의존하는 `date.today()` 의
    대체. RegisterView / SuperAdmin / Stats / Insights 의 "오늘 매출" 필터에 사용.

    [2026-05-22] PG-DT-DG-01 — tasks/p1-date-grouping-utc-day-analysis.md 참조.

    Returns:
        date: JST 자정 기준 오늘 날짜.
    """
    return datetime.now(JST).date()


def today_start_jst_as_utc_naive(now: Optional[datetime] = None) -> datetime:
    """오늘 JST 자정 (00:00) 을 naive UTC datetime 으로 변환해 반환.

    DB 의 created_at (UTC naive) 같은 컬럼과 비교해 "오늘 매출", "오늘 픽업 코드"
    같은 일일 경계를 정확히 계산. JST 00:00 = UTC 전날 15:00.

    예시:
        JST 2026-05-22 14:00 시점 호출 → JST 2026-05-22 00:00 = UTC 2026-05-21 15:00
        반환값 = datetime(2026, 5, 21, 15, 0, 0)  # naive

    [2026-05-22] GPT datetime review (gpt-p1-datetime-review.md §A) 권고:
    unit test 용이성을 위해 `now` 인자 추가. 미지정 시 현재 시각 사용.

    Args:
        now: 기준 시각. None 이면 datetime.now(JST). naive 면 JST 로 가정 후 변환.

    Returns:
        datetime: tzinfo=None, value=오늘 JST 자정의 UTC 표현.
    """
    if now is None:
        n_jst = datetime.now(JST)
    elif now.tzinfo is None:
        # naive 면 JST 로 가정
        n_jst = now.replace(tzinfo=JST)
    else:
        n_jst = now.astimezone(JST)
    start_jst = n_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_jst.astimezone(timezone.utc).replace(tzinfo=None)

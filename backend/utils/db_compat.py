"""PostgreSQL용 SQLAlchemy 날짜/시간 함수 래퍼 — 매장 timezone (JST) 기준.

ANSI ``EXTRACT(... FROM ...)`` / ``CAST(... AS DATE)`` 래핑.
DBM-05c 도입, DBM-13 MySQL 지원 종료.

[2026-05-22] PG-DT-DG-01 (tasks/p1-date-grouping-utc-day-analysis.md):
DB 컬럼은 naive UTC 저장 컨벤션. 일본 매장 기준 "오늘 매출", "시간별 분포"
표시는 JST 자정/시간 경계로 계산해야 함. 본 모듈의 모든 helper 는 column 을
먼저 매장 timezone (Asia/Tokyo) 으로 변환한 뒤 EXTRACT/CAST 적용.

주의: ``day_of_week`` 는 역사적 호환을 위해 1=Sun..7=Sat 의미 유지
(PG DOW 0=Sun..6=Sat 에 +1 보정).
"""
from sqlalchemy import func, cast, Date

# 매장 운영 timezone. 다국가 운영 시점에 store 별로 분기 가능 (현재 일본 only).
STORE_TZ = "Asia/Tokyo"


def _to_store_tz(col):
    """naive UTC timestamp 를 매장 timezone (JST) 으로 변환.

    PG: ``(col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo'``
        먼저 naive 를 UTC instant 로 해석한 뒤 매장 zone 으로 변환.
    """
    return func.timezone(STORE_TZ, func.timezone("UTC", col))


def hour(col):
    """시간 컴포넌트 추출 (0~23) — **매장 timezone (JST) 기준**.

    예: 점심 피크 JST 12:00 = UTC 03:00 → hour 값 = 12 (JST) 반환.
    """
    return func.extract("hour", _to_store_tz(col))


def year(col):
    """연도 추출 — 매장 timezone 기준."""
    return func.extract("year", _to_store_tz(col))


def month(col):
    """월 추출 (1~12) — 매장 timezone 기준."""
    return func.extract("month", _to_store_tz(col))


def day_of_week(col):
    """요일 추출 — **MySQL 의미** (1=Sun .. 7=Sat) + 매장 timezone 기준.

    MySQL DAYOFWEEK 는 1=Sun..7=Sat, PG EXTRACT(DOW) 는 0=Sun..6=Sat 으로
    의미가 다르다. 본 헬퍼는 PG 측에 +1 보정하여 양 DB 가 모두 **MySQL 의미**
    를 반환하도록 통일 — 기존 클라이언트 (요일별 통계 표시) 호환 보존.
    """
    return func.extract("dow", _to_store_tz(col)) + 1


def date_only(col):
    """타임스탬프에서 날짜 부분 추출 — **매장 timezone (JST) 기준**.

    naive UTC `Order.created_at` 등에 대해 일본 매장 기준 "오늘" / "어제" /
    일별 그룹화를 정확히 계산. caller 의 today 비교는 ``today_jst()`` 사용.
    """
    return cast(_to_store_tz(col), Date)

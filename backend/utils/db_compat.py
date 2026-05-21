"""PostgreSQL용 SQLAlchemy 날짜/시간 함수 래퍼.

ANSI ``EXTRACT(... FROM ...)`` / ``CAST(... AS DATE)`` 래핑.
DBM-05c 도입, DBM-13 MySQL 지원 종료.

주의: ``day_of_week`` 는 역사적 호환을 위해 1=Sun..7=Sat 의미 유지
(PG DOW 0=Sun..6=Sat 에 +1 보정).
"""
from sqlalchemy import func, cast, Date


def hour(col):
    """시간 컴포넌트 추출 (0~23). MySQL HOUR(x) / PG EXTRACT(HOUR FROM x)."""
    return func.extract("hour", col)


def year(col):
    """연도 추출. MySQL YEAR(x) / PG EXTRACT(YEAR FROM x)."""
    return func.extract("year", col)


def month(col):
    """월 추출 (1~12). MySQL MONTH(x) / PG EXTRACT(MONTH FROM x)."""
    return func.extract("month", col)


def day_of_week(col):
    """요일 추출 — **MySQL 의미** (1=Sun .. 7=Sat) 로 통일.

    MySQL DAYOFWEEK 는 1=Sun..7=Sat, PG EXTRACT(DOW) 는 0=Sun..6=Sat 으로
    의미가 다르다. 본 헬퍼는 PG 측에 +1 보정하여 양 DB 가 모두 **MySQL 의미**
    를 반환하도록 통일 — 기존 클라이언트 (요일별 통계 표시) 호환 보존.
    """
    return func.extract("dow", col) + 1


def date_only(col):
    """타임스탬프에서 날짜 부분만 추출. MySQL DATE(x) / PG x::date.

    SQLAlchemy ``cast(col, Date)`` 는 양 DB 에서 동일하게 동작 — MySQL 은
    ``CAST(x AS DATE)``, PG 는 ``CAST(x AS DATE)`` (둘 다 ANSI 표준).
    """
    return cast(col, Date)

# GPT P1 Datetime Review

**작성일**: 2026-05-22  
**대상**: `stabilize/post-pg-cutover`  
**검토 문서**: `tasks/p1-datetime-utc-migration-analysis.md`  
**관련 코드**:
- `backend/utils/time_helpers.py`
- `backend/utils/business_hours.py`
- `backend/routers/menu_groups.py`
- `backend/routers/menus.py`
- `backend/routers/orders.py`
- `backend/utils/db_compat.py`

## 총평

Claude의 3단계 전략은 방향이 맞습니다. Strategy 1은 지금 운영에 바로 넣어도 되는 범위입니다. 핵심은 현재 DB가 `TIMESTAMP without time zone`이고 코드 관례가 "naive UTC"라는 점을 깨지 않으면서, 사용자/매장 기준 시간이 필요한 곳만 JST aware로 분리하는 것입니다.

판정:
- Strategy 1: **진행 적합**
- Strategy 2: **진행 적합, 단 기계적 치환 전 import/semantics review 필요**
- Strategy 3: **장기 정답이지만 anomaly detection + Alembic baseline 해결 후 진행**

## A. `today_start_jst_as_utc_naive()` 체인 패턴

현재 패턴은 안전합니다.

```python
n_jst = datetime.now(JST)
start_jst = n_jst.replace(hour=0, minute=0, second=0, microsecond=0)
return start_jst.astimezone(timezone.utc).replace(tzinfo=None)
```

이 함수는 "JST 기준 오늘 00:00"을 만든 뒤, DB의 naive UTC `created_at`과 비교할 수 있도록 UTC naive 값으로 변환합니다. 일본은 DST가 없기 때문에 `replace(hour=0...)`가 DST gap/fold를 밟을 가능성도 없습니다. `ZoneInfo("Asia/Tokyo")` 선택도 적절합니다.

주의점:
- 이 helper는 "JST business day" 전용이어야 합니다. 사용자 로컬 timezone이나 다국가 매장별 timezone까지 일반화하면 안 됩니다.
- 함수명에 `jst`와 `utc_naive`가 모두 들어가 있어 의미가 잘 드러납니다. 유지 권장.
- 테스트는 반드시 JST 00:00~09:00 구간을 고정 time으로 넣어야 합니다. 현재 함수는 `datetime.now(JST)`를 직접 호출하므로, unit test를 쉽게 하려면 선택 인자 `now: datetime | None = None`을 받게 하는 것도 좋습니다.

권장 개선:

```python
def today_start_jst_as_utc_naive(now: datetime | None = None) -> datetime:
    n_jst = now.astimezone(JST) if now else datetime.now(JST)
    start_jst = n_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_jst.astimezone(timezone.utc).replace(tzinfo=None)
```

외부 라이브러리(`pendulum`, `arrow`)는 필요 없습니다. 표준 `datetime` + `zoneinfo`로 충분합니다.

## B. TIMESTAMPTZ 마이그레이션과 기존 naive 값 해석

`ALTER COLUMN ... TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`는 현재 관례가 naive UTC라면 올바른 변환입니다. 문제는 일부 row가 실수로 JST wall-clock 값으로 저장됐을 가능성입니다.

이번 조사 기준으로 실제 user-facing 버그 3개 중:
- menu TIME_WINDOW 버그는 DB datetime 저장이 아니라 runtime `datetime.now()` 사용 문제입니다.
- pickup code bug는 `created_at` 자체가 잘못 저장된 것이 아니라 "오늘 시작 기준" 계산 문제입니다.
- `business_hours.py`도 DB 저장보다 caller timezone 계약 문제입니다.

따라서 대량으로 JST wall-clock row가 섞였다는 강한 증거는 없습니다. 그래도 TIMESTAMPTZ 전환 전 anomaly detection은 해야 합니다. 이유는 이전 SQLite/MySQL 시절 seed/migration script나 수동 운영 작업이 섞였을 수 있기 때문입니다.

권장 detection:

1. 미래값/비현실 과거값:

```sql
SELECT 'order' tbl, COUNT(*)
FROM "order"
WHERE created_at > (now() AT TIME ZONE 'UTC') + interval '5 minutes'
   OR created_at < timestamp '2020-01-01';
```

2. `created_at`과 비즈니스 이벤트 순서 역전:

```sql
SELECT COUNT(*)
FROM "order"
WHERE settled_at IS NOT NULL AND settled_at < created_at;
```

3. 시간대 군집 이상:
주문 데이터가 충분하다면 `EXTRACT(hour FROM created_at)` 분포를 보고 운영시간과 9시간 밀린 분포가 있는지 확인합니다. 단, UTC 기준 분포는 JST 운영시간에서 9시간 빠져 보이는 것이 정상입니다.

4. 테이블별 샘플:
`store.created_at`, `order.created_at`, `rewardcoupon.expires_at`, `tabehoudaisession.expires_at`, `staffattendance.clock_in/out`는 대표 샘플을 사람이 확인해야 합니다.

전환 SQL 원칙:

```sql
ALTER TABLE some_table
ALTER COLUMN created_at TYPE timestamptz
USING created_at AT TIME ZONE 'UTC';
```

JST로 저장된 row가 확인되면 일괄 전환 전에 해당 row만 보정해야 합니다.

```sql
-- JST wall-clock으로 잘못 저장된 row를 UTC instant로 해석하려는 경우 예시
-- 실제로는 WHERE로 anomaly row를 정확히 한정해야 함.
UPDATE some_table
SET created_at = created_at - interval '9 hours'
WHERE ...;
```

## C. Pydantic + aware datetime serialization

FastAPI/Pydantic의 aware datetime 직렬화는 브라우저 `new Date()`와 호환됩니다. 예:

```text
2026-05-22T15:00:00+00:00
```

브라우저에서 `new Date(iso)`는 instant로 파싱하고, `toLocaleString()`은 클라이언트 로컬 timezone으로 표시합니다. 이 동작은 admin/super-admin 같은 일반 timestamp 표시에는 좋습니다.

하지만 이 프로젝트에는 두 종류의 시간이 있습니다.

1. Instant time:
   주문 생성, 결제 완료, 쿠폰 만료, 출근/퇴근, 세션 만료.  
   UTC aware datetime으로 전달하고 브라우저에서 표시 timezone을 선택해도 됩니다.

2. Store business wall time:
   영업시간 11:00~22:00, 메뉴 시간대, pickup_time 문자열.  
   이것은 instant가 아니라 매장 기준 wall-clock입니다. `Date`로 파싱하면 안 됩니다. `"11:00"` 같은 문자열 또는 `{hour, minute, timezone: "Asia/Tokyo"}` 형태로 유지해야 합니다.

권장 UI 정책:
- API에서 instant datetime은 ISO8601 with offset으로 반환.
- 프론트에서 일본 매장 운영 화면은 `toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })`처럼 명시.
- 고객 브라우저 로컬 시간으로 보여야 하는 경우만 default locale timezone 사용.
- `business_hours`, `active_from/to`, `pickup_time`은 `Date`로 변환하지 말고 문자열로 처리.

Pydantic 자체는 큰 문제가 없습니다. 위험은 프론트가 ISO 문자열을 날짜 객체로 자동 변환한 뒤 "매장 시간"과 "사용자 로컬 시간"을 섞는 것입니다.

## D. `business_hours.py` guard: warn to raise timeline

현재 `warnings.warn(..., DeprecationWarning)` 후 `now.replace(tzinfo=JST)`로 backward compatibility를 유지하는 방식은 적절합니다. 바로 `raise ValueError`로 바꾸면 아직 발견되지 않은 caller에서 production 기능이 깨질 수 있습니다.

권장 타임라인:

### Phase 1: 지금

- `DeprecationWarning` 유지.
- `stacklevel=2` 유지.
- `now.replace(tzinfo=JST)` fallback 유지.
- 테스트에서는 warning을 failure로 잡는 케이스 추가.

### Phase 2: D+7

- `warnings.warn`를 `logger.warning`도 같이 남기도록 변경. 운영 로그에서 naive caller가 실제로 남아 있는지 확인하기 위함입니다.
- `PYTHONWARNINGS=default` 또는 테스트 설정으로 DeprecationWarning 노출.
- `rg "get_close_time_today\\(" backend`로 caller 전수 확인.

### Phase 3: D+14 또는 caller 0건 확인 후

- 환경변수로 strict mode 도입:

```python
STRICT_TIMEZONE_GUARD = os.getenv("STRICT_TIMEZONE_GUARD") == "1"
if now.tzinfo is None:
    if STRICT_TIMEZONE_GUARD:
        raise ValueError(...)
    warnings.warn(...)
```

운영에는 처음엔 off, CI에는 on.

### Phase 4: D+30 / TIMESTAMPTZ 이행 시점

- fallback 제거.
- `raise ValueError` 기본 동작.

즉, warn to raise는 즉시가 아니라 CI strict mode를 거쳐 전환하는 것이 안전합니다.

## E. 누락된 datetime 위험

### 1. `date_only()` 기반 통계/목록의 UTC day 문제

`register.py`, `stats.py`, `insights.py`, `super_admin.py`에서 `date_only(Order.created_at) == date.today()` 또는 `group_by(date_only(...))`가 보입니다. DB가 naive UTC면 `DATE(created_at)`은 UTC 날짜입니다. 일본 매장 기준 일 매출/일 주문을 보여야 한다면 JST day로 변환해야 합니다.

이건 이번 3개 즉시 버그와 같은 계열이며, P1 #7 후속으로 별도 분류할 가치가 큽니다.

PostgreSQL에서 naive UTC timestamp를 JST date로 그룹화하려면:

```sql
DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')
```

또는 TIMESTAMPTZ 전환 후:

```sql
DATE(created_at AT TIME ZONE 'Asia/Tokyo')
```

### 2. `hour(created_at)` 통계도 UTC hour

`stats.py`의 hourly chart는 현재 UTC hour일 가능성이 큽니다. 일본 매장 운영 분석이면 JST hour로 변환해야 합니다.

### 3. `date.today()`는 서버 로컬 timezone 의존

운영 VM timezone이 UTC면 `date.today()`는 UTC date입니다. 일본 영업일 기준이면 `now_jst().date()`를 써야 합니다.

### 4. cron timezone

`food_rescue_scheduler.py` 내부 계산은 `datetime.now(JST)`라 좋습니다. 하지만 cron 자체가 UTC로 실행되어도 5분마다 실행이라 큰 문제는 없습니다. 다만 "매일 00:00" 류 job이 추가되면 cron timezone을 명시해야 합니다.

권장:
- systemd timer면 `OnCalendar=*-*-* 00:00:00 Asia/Tokyo` 또는 명시 문서화.
- cron이면 `CRON_TZ=Asia/Tokyo` 사용.

### 5. Cloud SQL timezone

Cloud SQL/PostgreSQL의 `TimeZone` 설정은 `now()`, `CURRENT_TIMESTAMP`, `DATE(timestamptz)`에 영향을 줍니다. 애플리케이션이 Python에서 시간을 넣는 현재 구조에서는 영향이 제한적이지만, DB default나 SQL function을 쓰기 시작하면 중요해집니다.

확인 명령:

```sql
SHOW timezone;
SELECT now(), current_timestamp, localtimestamp;
```

권장:
- DB session timezone은 UTC로 유지.
- 매장 기준 변환은 명시적으로 `AT TIME ZONE 'Asia/Tokyo'`.

### 6. `timezone(timedelta(hours=9))` vs `ZoneInfo("Asia/Tokyo")`

일본은 DST가 없어서 현재 둘 다 실무상 같은 결과입니다. 그래도 코드 표준은 `ZoneInfo("Asia/Tokyo")`로 통일하는 편이 낫습니다. `food_rescue_scheduler.py`와 `admin.py`의 fixed offset JST는 추후 정리 대상입니다.

### 7. JWT exp와 aware datetime

PyJWT는 aware UTC datetime을 처리할 수 있습니다. Strategy 2에서 `datetime.utcnow()`를 모두 `now_utc_naive()`로 바꾸면 기존 semantic은 유지됩니다. Strategy 3에서 aware UTC로 바꿀 때 JWT 쪽은 별도 smoke가 필요합니다.

### 8. naive/aware 비교 예외

TIMESTAMPTZ 이행 도중 일부 필드만 aware datetime으로 바뀌면 Python에서 naive-aware 비교가 `TypeError`를 냅니다. Strategy 3은 필드 단위 partial migration보다 "helpers + model + DB column + comparison code"를 묶어서 해야 합니다.

## Strategy 별 권고

### Strategy 1

진행 적합. 이미 반영된 구현 방향은 맞습니다.

추가 권장:
- `today_start_jst_as_utc_naive(now=None)` 테스트 가능하게 인자 추가.
- `business_hours.py` guard는 지금처럼 warning fallback 유지.
- 메뉴 TIME_WINDOW와 pickup code에 최소 unit test 추가.

### Strategy 2

진행 적합. 다만 단순 sed는 피해야 합니다.

분류:
- DB 저장/비교용 `datetime.utcnow()` → `now_utc_naive()`
- 이벤트 payload `"Z"` 문자열 → `datetime.now(timezone.utc).isoformat()` 또는 helper 별도
- JWT exp → 우선 `now_utc_naive()`로 semantic 유지, Strategy 3에서 aware 전환
- seed/migration scripts → 낮은 우선순위

### Strategy 3

진행 전 조건:
- Alembic baseline 정상화.
- anomaly detection 실행.
- date/hour grouping의 JST 변환 정책 확정.
- Pydantic/프론트 표시 정책 문서화.

## 최종 답변

A. `today_start_jst_as_utc_naive()` 패턴은 안전합니다. 표준 `zoneinfo`면 충분하고 외부 time library는 필요 없습니다.

B. TIMESTAMPTZ 전환은 `AT TIME ZONE 'UTC'`가 맞습니다. 다만 row-level anomaly detection은 필요합니다. 특히 수동/seed/legacy 경로에서 JST wall-clock 저장 가능성을 배제하면 안 됩니다.

C. aware datetime serialization은 Pydantic/브라우저와 호환됩니다. 단, instant time과 business wall time을 API/프론트에서 분리해야 합니다.

D. `business_hours.py`는 바로 raise하지 말고 warning → CI strict mode → 운영 strict mode → fallback 제거 순서가 안전합니다.

E. 누락 위험 중 가장 큰 것은 `date_only()`/`hour()` 통계가 UTC day/hour로 계산되는 문제입니다. 그다음은 cron timezone, Cloud SQL timezone, fixed-offset JST 혼용, naive-aware partial migration입니다.

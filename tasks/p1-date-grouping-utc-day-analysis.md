# PG-DT-DATE-GROUPING — `date_only()` UTC day 문제 분석

**작성일**: 2026-05-22
**근거**: [`gpt-p1-datetime-review.md`](./gpt-p1-datetime-review.md) §E1 (GPT 신규 발견)
**상위 카드**: P1 #7 후속 (`p1-datetime-utc-migration-analysis.md`)

---

## 문제 정의

`backend/utils/db_compat.py:date_only(col)` 와 `hour(col)` 가 PostgreSQL **naive UTC** 컬럼에 대해 동작:

```python
def date_only(col):
    return cast(col, Date)              # → UTC date

def hour(col):
    return func.extract("hour", col)    # → UTC hour
```

`Order.created_at` 같은 컬럼은 컨벤션상 **naive UTC** 저장. 일본 매장 기준 "오늘 매출", "시간별 분포" 를 표시하려면 **JST date/hour** 로 변환해야 함. 현재는 UTC 그대로.

### 결과 — 사장님 백오피스 표시 오차

| 화면 | 현재 동작 | 의도된 동작 |
|---|---|---|
| RegisterView "오늘 매출" | UTC 자정~자정 (= JST 09:00~익일 09:00) | JST 자정~자정 |
| AdminView 일별 매출 차트 | UTC 일자 기준 그룹화 | JST 일자 기준 |
| InsightsView 일별 분석 | 동상 | 동상 |
| SuperAdmin 일별 매출 | 동상 | 동상 |
| 시간별 분포 (stats) | UTC 시간 (피크 02:00 UTC = 11:00 JST) | JST 시간 (피크 11:00 JST 직접 표시) |

**고객 경험**: 사장님이 JST 00:00 ~ 09:00 사이에 주문받은 건이 "오늘 매출" 에 안 보이고 "어제 매출" 에 들어있음. JST 09:00 정각에 "오늘 매출" 카운터가 리셋. 사장님 컴플레인 + 신뢰도 손상.

심각도: **🟡 P1** — 데이터 무결성은 OK, 표시만 어긋남. 단, 사장님이 매출 합계를 의심하면 시스템 신뢰 전체에 영향.

---

## 영향 범위 (12 호출 × 4 파일)

```
backend/utils/db_compat.py:37    date_only 정의 (UTC 기준)
backend/utils/db_compat.py:12    hour 정의 (UTC 기준)

backend/routers/insights.py:36,40,41   대시보드 일별 분석
backend/routers/stats.py:72,79,81      매출 일별 차트
backend/routers/stats.py:108           "오늘 매출" 필터
backend/routers/stats.py:268           특정 날짜 매출
backend/routers/register.py:422        "오늘 주문 목록" (사장님이 매일 보는 화면)
backend/routers/register.py:485        오늘 매출 합계
backend/routers/super_admin.py:148,154,396,400,401   super admin 일별 분석

caller 의 today 비교:
  register.py:417   today = date.today()  ← 서버 로컬 (UTC on VM)
  register.py:476   today = date.today()
  stats.py:101      today = date.today()
  stats.py:261      d = date.fromisoformat(target_date) if target_date else date.today()
```

→ 양쪽 다 UTC → 비교는 일관 (둘 다 9시간 오프셋). 표시값만 어긋남.

---

## 해결 전략

### 옵션 A — `db_compat.py` 중앙화 (권장)

`date_only(col)` / `hour(col)` 가 PG `AT TIME ZONE` 변환을 내장. 모든 caller 자동 영향.

**구현**:
```python
# backend/utils/db_compat.py
from sqlalchemy import func, cast, Date

# 매장 운영 timezone — 향후 다국가 운영 시 store 별로 분기 가능
STORE_TZ = "Asia/Tokyo"


def _to_store_tz(col):
    """naive UTC timestamp 를 매장 timezone 으로 변환.
    
    PG: `(col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo'`
        — naive 를 먼저 UTC 로 해석한 뒤 매장 zone 으로 변환.
    """
    return func.timezone(STORE_TZ, func.timezone("UTC", col))


def date_only(col):
    """타임스탬프에서 날짜 부분 추출 — **매장 timezone (JST) 기준**."""
    return cast(_to_store_tz(col), Date)


def hour(col):
    """시간 컴포넌트 추출 (0~23) — **매장 timezone (JST) 기준**."""
    return func.extract("hour", _to_store_tz(col))


def year(col):
    return func.extract("year", _to_store_tz(col))


def month(col):
    return func.extract("month", _to_store_tz(col))


def day_of_week(col):
    """요일 추출 — MySQL 의미 (1=Sun..7=Sat) — 매장 timezone 기준."""
    return func.extract("dow", _to_store_tz(col)) + 1
```

**caller `date.today()` 도 JST 로 보정**:

신규 헬퍼 `backend/utils/time_helpers.py`:
```python
def today_jst() -> date:
    """매장 운영일 (JST) 기준 오늘 date 반환.
    
    `date_only(Order.created_at)` (JST 변환된 date) 와 비교용. 서버 로컬
    timezone (운영 VM 은 UTC) 에 의존하지 않음.
    """
    return datetime.now(JST).date()
```

caller 4 곳 변경:
```python
# register.py:417, 476 / stats.py:101, 261
- from datetime import date
- today = date.today()
+ from utils.time_helpers import today_jst
+ today = today_jst()
```

**리스크**:
- db_compat.py 변경은 모든 caller 에 영향. 단, 모든 caller 가 같은 의도 (일본 매장 기준) 이므로 회귀 없음.
- 함수 시그니처 그대로 → import / 호출부 변경 없음.

**검증**:
- JST 02:00 (= UTC 17:00 전일) 에 register API 호출 → "오늘 매출" 이 진짜 "오늘 (JST)" 의 매출만 포함 확인
- AdminView 일별 차트 일자 라벨이 JST 일자로 정확히 정렬 확인

### 옵션 B — caller 마다 명시적 변환

각 caller 가 `date_only(timezone("Asia/Tokyo", Order.created_at))` 직접 작성. 더 명시적이지만 12 곳 코드 변경 + 가독성 ↓.

→ **옵션 A 권장**.

### 옵션 C — TIMESTAMPTZ 전환 후 자연 해결

P1 #7 Strategy 3 (TIMESTAMPTZ 이행) 완료 시 PG 가 timezone-aware 자동 처리. 단, Strategy 3 은 D+30 이후이므로 그 사이 옵션 A 로 즉시 처리 필요.

---

## 구현 액션

- [ ] **PG-DT-DG-01** (즉시): 옵션 A 적용
    - `db_compat.py`: `date_only`, `hour`, `year`, `month`, `day_of_week` 모두 `_to_store_tz` 거치도록 변경
    - `time_helpers.py`: `today_jst()` 헬퍼 추가
    - `register.py`, `stats.py`: `date.today()` → `today_jst()` 4 곳
- [ ] **PG-DT-DG-02**: 운영 환경 검증
    - JST 자정 직전/직후 (00:00 ~ 01:00 JST) 시점에 register "오늘 매출" 호출 → 정확한 reset 확인
    - super_admin 일별 차트의 일자 라벨 검증
- [ ] **PG-DT-DG-03**: 프론트엔드 검증
    - `RegisterView` 에서 "오늘" 표시가 JST 자정 기준인지 확인
    - 일별 차트의 x축 라벨이 JST 일자로 표시되는지 확인 (`new Date(iso).toLocaleDateString("ja-JP", {timeZone: "Asia/Tokyo"})` 필요할 수 있음)

---

## GPT 교차 검증 (선택)

옵션 A 구현 후 GPT 에 다음 질문:

```
Claude 가 db_compat.py 의 date_only / hour 등 모든 helper 에 `AT TIME ZONE 'UTC' AT
TIME ZONE 'Asia/Tokyo'` 를 내장하는 전략 (옵션 A) 을 적용했습니다.

검증 요청:

1. `cast(func.timezone('Asia/Tokyo', func.timezone('UTC', col)), Date)` 패턴이
   PostgreSQL plan 에서 인덱스 사용을 방해하는가? (현재 Order.created_at 에
   인덱스가 있다면 expression index 가 필요한지)
2. caller `date_only(Order.created_at) == today_jst()` 에서 `today_jst()` 가 Python
   date 객체로 반환되어 SQL 에 literal 로 들어가는데, asyncpg 가 이를 정확히
   bind 하는가?
3. `func.extract("hour", _to_store_tz(col))` 가 매장 운영시간 통계로 적합한가
   (피크 11:00 JST = 02:00 UTC, hour=11 표시 보장)?
4. 누락된 caller — 본 분석이 놓친 date/hour 관련 위치가 있는가?
```

응답 저장: `tasks/gpt-p1-date-grouping-review.md`

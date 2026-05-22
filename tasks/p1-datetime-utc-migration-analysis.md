# P1 #7 — datetime UTC 통일 마이그레이션 전략 분석

**작성일**: 2026-05-22
**근거**: [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) §P1 #7
**범위**: backend/ 88 occurrences × 31 파일

---

## 현황 정밀 매핑

### 패턴 분포 (88건)

| 패턴 | 건수 | 평가 |
|---|---|---|
| `datetime.utcnow()` | 80 | 일관 (naive UTC) — Python 3.12+ deprecated |
| `datetime.now()` | 2 | 🔴 **버그** — 서버 로컬 timezone |
| `datetime.now(timezone.utc)` | 1 | ✅ 모범 사례 |
| `datetime.now(JST)` | 1 | ✅ 명시적 JST |
| `datetime.datetime.utcnow()` | 2 | seed 스크립트, 동일 의미 |
| `.replace(hour=0,...)` 로 today 계산 | 1 | 🔴 **버그** — UTC midnight 사용 |

→ 큰 그림: **naive UTC 컨벤션은 일관되게 지켜졌으나, 3건의 실제 버그 + Python 3.12 호환성 부채**.

### DB 컬럼 타입 (CHECK 2 검증 결과)

운영 DB 의 모든 datetime 컬럼은 **`timestamp without time zone`** (TIMESTAMP). asyncpg 는 이걸 Python naive datetime 으로 read/write. 즉:
- 저장: 코드가 `datetime.utcnow()` 를 INSERT → DB 가 그대로 보관 (naive)
- 조회: DB → asyncpg → Python naive datetime
- 비교: `datetime.utcnow() > stored_dt` — 둘 다 naive UTC 라 OK

이 컨벤션은 **caller 와 DB 양쪽이 UTC 라고 가정** 함. 어긋나면 9시간 오차.

---

## 🔴 실제 버그 (즉시 수정 필요)

### Bug 1 — `routers/menu_groups.py:266` (TIME_WINDOW 메뉴 그룹)

```python
@router.get("/{store_id}/active")  # 손님이 메뉴 페이지 진입 시 호출
async def list_active_groups(store_id: str, ...):
    now = datetime.now()  # 🔴 서버 로컬 = UTC on VM
    for g in groups:
        if g.group_type == MenuGroupType.TIME_WINDOW:
            if _is_time_window_active(g, now):  # active_from/to 는 "11:00" JST 문자열
                active_groups.append(g)
```

**`_is_time_window_active(group, now)`** (`menu_groups.py:101-117`) 이 `now.time()` 을 `group.active_from`/`active_to` (예: `"11:00"`, `"14:00"`) 와 비교.

**증상**: 점심 메뉴 그룹이 JST 11:00-14:00 의도라면 — VM 이 UTC 라서 실제로는 **JST 20:00-23:00 에 활성**. 9시간 오프셋.

**고객 영향**: 손님이 점심 시간에 메뉴 페이지 열어도 "런치 세트" 그룹이 안 보임. **현재 production 발생 중**.

### Bug 2 — `routers/menus.py:251` (메뉴 필터)

```python
now = datetime.now()  # 🔴 동일 버그
... _is_time_window_active(g, now) ...
```

`/api/menus/{store_id}` 응답에서 TIME_WINDOW 그룹 기반 메뉴 노출/숨김 판정. Bug 1 과 같은 9 시간 오프셋. 사실상 같은 버그가 두 라우터에 중복.

### Bug 3 — `routers/orders.py:440` (테이크아웃 픽업 코드)

```python
if is_take_out:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    # 위 = "오늘 자정 UTC" = JST 09:00
    codes_res = await session.execute(
        select(Order.pickup_code).where(
            ...
            Order.created_at >= today_start  # naive UTC vs naive UTC OK
        )
    )
```

**증상**: 픽업 코드는 "당일 101번부터 순차 발급" 의도. 그러나 `today_start` 가 JST 09:00 시점이라:
- JST 00:00-09:00 사이의 테이크아웃 주문은 **전날 카운트로 합산** → 코드 충돌 또는 어색한 번호
- JST 09:00 정각에 카운트가 101 로 reset → 자정이 아니라 아침 9 시에 reset

**고객 영향**: 새벽 영업 (居酒屋 등) 매장에서 픽업 코드 혼란.

### Bug 4 (잠재) — `business_hours.py:get_close_time_today` 의 caller 가정

```python
def get_close_time_today(store, now: datetime) -> Optional[datetime]:
    """영업시간 JSON에서 오늘 close_at datetime (JST 기준) 을 반환."""
    day_key = _DAY_KEYS[now.weekday()]
    ...
    close_dt = now.replace(hour=close_h, minute=close_m, ...)
```

함수는 docstring 에 "JST 기준" 명시. 그러나 `now: datetime` 파라미터의 timezone 을 강제하지 않음.

**현재 사용처** — `workers/food_rescue_scheduler.py:61`:
```python
now_jst = datetime.now(JST)  # ✅ 올바른 JST aware
```

다행히 단일 caller 가 JST 를 명시함. 그러나 향후 다른 caller 가 `datetime.utcnow()` 를 넘기면 영업시간 판정 9 시간 오차 → 식당이 일찍 닫힘으로 판정 → food rescue cron 오작동.

**예방**: 함수 시그니처에 `assert now.tzinfo` 추가 + JST 변환 로직 내장.

---

## 🟡 Python 3.12+ 호환성 부채

`datetime.utcnow()` 는 Python 3.12 에서 deprecated. 3.13 에서 제거 가능성. 운영 VM 의 Python 버전을 확인하면:

| Python 버전 | utcnow() 상태 |
|---|---|
| 3.11 (현재 추정) | OK (silent) |
| 3.12 | DeprecationWarning 출력 |
| 3.13+ | 제거 예정 |

80+ 호출을 `datetime.now(timezone.utc).replace(tzinfo=None)` 으로 일괄 교체하면 3.12 호환. 또는 컬럼을 TIMESTAMPTZ 로 마이그하면 aware datetime 그대로 사용 가능.

---

## 🟢 무해한 패턴 (변경 불필요)

대부분의 utcnow 사용은 **DB 저장 + 비교** 라서 naive UTC convention 안에서 일관:
- JWT exp: `"exp": datetime.utcnow() + timedelta(...)` — PyJWT 가 UTC timestamp 로 인식 OK
- DB 비교: `if expires_at and datetime.utcnow() > expires_at` — 둘 다 naive UTC OK
- 통계 since: `since = datetime.utcnow() - timedelta(days=days)` — created_at UTC 와 비교 OK
- 이벤트 로그 ts: `.isoformat() + "Z"` — RFC3339 호환

이들 81 건은 **Strategy 3 (TIMESTAMPTZ 이행) 전까지는 그대로 유지**.

---

## 마이그레이션 전략 (3 단계)

### Strategy 1 — 즉시 (출시 전 필수, 30분)

**목적**: 3개 user-facing 버그 차단.

**변경 사항**:

1. **`utils/time_helpers.py`** (신규 30 LOC):
```python
"""Timezone helpers — naive UTC 컨벤션 안에서 JST 비즈니스 시간 계산.

DB 저장은 naive UTC 유지. JST 비교/표시 시점에만 변환.
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def now_utc_naive() -> datetime:
    """현재 시각을 naive UTC datetime 으로 반환.
    
    DB 컬럼 (TIMESTAMP without timezone) 에 저장/비교용. Python 3.12+ 에서
    deprecated 된 datetime.utcnow() 의 대체.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_jst() -> datetime:
    """현재 시각을 JST aware datetime 으로 반환.
    
    매장 영업시간 / 손님 노출 시각 비교 등 비즈니스 시간 판정용.
    """
    return datetime.now(JST)


def today_start_jst_as_utc_naive() -> datetime:
    """오늘 JST 자정 (00:00) 을 naive UTC datetime 으로 변환해 반환.
    
    DB 의 created_at (UTC naive) 컬럼과 비교해 "오늘 매출", "오늘 픽업 코드"
    같은 일일 경계를 정확히 계산. JST 00:00 = UTC 전날 15:00.
    """
    n = datetime.now(JST)
    start_jst = n.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_jst.astimezone(timezone.utc).replace(tzinfo=None)
```

2. **`routers/menu_groups.py:266`** + **`routers/menus.py:251`**:
```python
# 변경 전
now = datetime.now()
# 변경 후
from utils.time_helpers import now_jst
now = now_jst()
```

3. **`routers/orders.py:440`**:
```python
# 변경 전
today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
# 변경 후
from utils.time_helpers import today_start_jst_as_utc_naive
today_start = today_start_jst_as_utc_naive()
```

4. **`utils/business_hours.py:get_close_time_today`** 가드 강화:
```python
def get_close_time_today(store, now: datetime) -> Optional[datetime]:
    """..."""
    # tz-aware datetime 만 허용 (JST 또는 다른 zone)
    if now.tzinfo is None:
        raise ValueError("get_close_time_today: now must be timezone-aware (use now_jst())")
    # 이미 JST aware 면 그대로, UTC aware 면 JST 변환
    if now.tzinfo != JST:
        now = now.astimezone(JST)
    ...
```

**리스크**: 0. 모든 변경이 잘못된 코드 → 올바른 코드. 기존 데이터 영향 없음.

**검증**: 
- `python -c "from utils.time_helpers import now_jst, now_utc_naive, today_start_jst_as_utc_naive; print(now_jst(), now_utc_naive(), today_start_jst_as_utc_naive())"`
- Manual: JST 02:00 (= UTC 17:00 전날) 에 `_is_time_window_active(group_with_active_from='11:00', now=now_jst())` 호출 → False (점심 메뉴 아님) 정확히 판정

### Strategy 2 — D+7 (Python 3.12 호환성 + 일관성)

**목적**: `datetime.utcnow()` 80 곳을 `now_utc_naive()` 헬퍼로 교체.

**자동화 가능** (semantic equivalent):

```bash
# backend/ 전체에서 일괄 교체. import 추가 필요.
grep -rln "datetime.utcnow()" backend/ | while read f; do
    sed -i 's/datetime\.utcnow()/now_utc_naive()/g' "$f"
    # 첫 import 라인 뒤에 추가 (수동 검토 필요)
done
```

→ 실제로는 `ruff --fix` 또는 IDE refactoring 으로 안전하게 진행. 80 곳이지만 같은 패턴이라 1 시간 이내.

**부가 효과**:
- Python 3.12 업그레이드 시 DeprecationWarning 0 건
- 향후 timezone 정책 변경 (예: JST 운영 → 다국 운영) 시 헬퍼 1 군데만 수정

**리스크**: 낮음. 모든 변경이 semantic equivalent.

### Strategy 3 — D+30 (Full TIMESTAMPTZ 이행)

**목적**: naive UTC 컨벤션의 함정 (caller 가정 어긋남) 영구 차단.

**변경 사항**:

1. **Alembic revision** — 30+ datetime 컬럼을 `TIMESTAMP WITHOUT TIME ZONE` → `TIMESTAMP WITH TIME ZONE`
2. **Models** — `Optional[datetime]` 컬럼들에 `sa_column=Column(TIMESTAMP(timezone=True))` 추가
3. **Code** — `now_utc_naive()` → `datetime.now(timezone.utc)` (aware) 로 교체
4. **Pydantic schemas** — `datetime_field: datetime` 가 aware datetime 을 ISO 8601 with tz 로 serialize 확인
5. **Frontend** — `new Date(iso_string)` 가 tz 인식 (대부분 OK)

**리스크**: 중간.
- DB 마이그레이션 시 기존 naive 값들을 UTC 로 해석 (`AT TIME ZONE 'UTC'`). 의도와 일치하지만 검증 필요
- JWT lib 와 같은 외부 의존성이 aware datetime 처리 OK 인지 점검
- E2E 테스트 실행 권장

**전제 조건**: P1 #8 Strategy 3 (Alembic 이행) 선행 — schema 변경 절차 필요.

---

## 우선순위 매트릭스

| 전략 | 노력 | 위험 | 효과 | 권장 시점 |
|---|---|---|---|---|
| 1 — 3 버그 + 헬퍼 | 30분 | 0 | user-facing 버그 차단 | 출시 전 즉시 |
| 2 — 80곳 utcnow 교체 | 1~2h | 낮음 | Py 3.12 준비 | 출시 D+7 |
| 3 — TIMESTAMPTZ 이행 | 2~3일 | 중간 | 영구 안전 | 출시 D+30, P1 #8 Strategy 3 이후 |

---

## GPT-5.5 교차 검증 요청 항목

```
Claude 가 P1 #7 (datetime UTC 통일) 에 대해 다음을 분석 + 제안했습니다:

발견된 user-facing 버그 3 건:
  1. routers/menu_groups.py:266 — datetime.now() (서버 로컬) 로 TIME_WINDOW 메뉴
     그룹 활성화 판정 → UTC VM 에서 9 시간 오프셋
  2. routers/menus.py:251 — 동일 패턴
  3. routers/orders.py:440 — datetime.utcnow().replace(hour=0,...) 로 "오늘"
     경계 계산 → JST 자정이 아닌 JST 09:00 에 픽업 코드 reset

3 단계 전략:
  1. utils/time_helpers.py (now_utc_naive, now_jst, today_start_jst_as_utc_naive)
     + 3 버그 수정 + business_hours.py 의 caller tz 강제 (30분)
  2. 80 곳 datetime.utcnow() → now_utc_naive() 일괄 교체 (Py 3.12 준비, 1~2h)
  3. 30+ 컬럼 TIMESTAMPTZ 이행 + 모든 aware datetime (2~3일, P1 #8 후)

검증 요청:

A. **헬퍼 함수 설계 안전성**:
   `today_start_jst_as_utc_naive()` 가 `now.replace(...).astimezone(utc).replace(tzinfo=None)`
   체인을 사용. 일광 절약 시간 없는 JST 라 안전하지만, 일반적인 패턴인가? 더 깔끔한
   대안 (예: `pendulum`, `arrow` 같은 라이브러리)?

B. **DB 컬럼 마이그레이션 시 naive → aware 값 해석**:
   `ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'` 가
   기존 naive 값을 UTC 로 해석. 만약 일부 컬럼에 JST 로 저장된 값이 있었다면 (예:
   datetime.now() 버그로) 그 row 는 9시간 빠른 timestamp 가 됨. 마이그레이션 전에
   anomaly detection 쿼리가 필요한가?

C. **Pydantic + aware datetime serialization**:
   FastAPI 의 default Pydantic serializer 가 aware datetime 을 `"2026-05-22T15:00:00+00:00"`
   로 ISO 출력. 프론트의 `new Date()` 가 이를 정확히 parse 하지만 `Date.toLocaleString()`
   호출 시 브라우저 timezone 으로 표시. 매장 직원 (JST) / 손님 (JST 또는 외국 여행객)
   양쪽에서 의도된 동작인가?

D. **business_hours.py 강제 가드의 backward compatibility**:
   `if now.tzinfo is None: raise ValueError(...)` 가 갑작스러운 production 실패를
   만들 수 있음. `warnings.warn(...)` 로 시작해서 다음 사이클에 raise 로 강화하는
   점진적 전환이 안전한가?

E. **누락된 위험**:
   본 분석이 놓친 datetime 관련 위험 (예: cron 잡의 timezone, Cloud SQL 의 시스템
   시간 vs Application 시간, daylight saving 영향 없는 JST 라 무시한 항목)?
```

응답 저장: `tasks/gpt-p1-datetime-review.md`

---

## 액션 아이템

- [ ] **PG-DT-FIX-01** (즉시): Strategy 1 적용 — 헬퍼 + 3 버그 수정 + business_hours guard (~30분)
- [ ] **GPT-PG-DT-REVIEW**: Strategy 1~3 GPT cross-review (위 5 질문)
- [ ] **PG-DT-MIGRATE-02** (D+7): Strategy 2 — 80곳 일괄 교체 (이후 GPT 응답 반영)
- [ ] **PG-DT-MIGRATE-03** (D+30): Strategy 3 — TIMESTAMPTZ 이행 (P1 #8 Strategy 3 의존)

---

## 부록 — 88 호출 분류 표

| 카테고리 | 건수 | 예시 파일 | 패턴 |
|---|---|---|---|
| DB INSERT (created_at, updated_at, etc.) | 25 | `routers/orders.py`, `routers/register.py` | `obj.field = datetime.utcnow()` |
| DB 비교 (since filter) | 18 | `routers/stats.py`, `routers/insights.py` | `since = datetime.utcnow() - timedelta(days=N)` |
| 만료 시각 계산 | 12 | `routers/billing.py`, `routers/oauth.py`, `utils/jwt.py` | `expires_at = datetime.utcnow() + timedelta(...)` |
| 만료 검증 | 8 | `routers/orders.py`, `routers/billing.py` | `if expires_at < datetime.utcnow()` |
| 시드/마이그레이션 | 3 | `seed_samples.py`, `migrate_subscriptions.py` | 일회성 |
| 이벤트 로그 ts | 3 | `utils/events.py`, `workers/translate_tasks.py` | `"ts": .isoformat()+"Z"` |
| 비즈니스 시간 판정 | 3 | `workers/food_rescue_scheduler.py`, `utils/business_hours.py` (간접) | tz-aware 필요 |
| 🔴 버그 | 3 | `menu_groups.py:266`, `menus.py:251`, `orders.py:440` | `datetime.now()` 또는 UTC midnight |
| 기타 | 13 | 다양 | 다양 |
| **합계** | **88** | | |

# PG-DT-MIGRATE-02 — `datetime.utcnow()` 일괄 교체 분류 분석

**작성일**: 2026-05-22
**상위 카드**: P1 #7 Strategy 2 ([`p1-datetime-utc-migration-analysis.md`](./p1-datetime-utc-migration-analysis.md))
**선행 GPT review**: [`gpt-p1-datetime-review.md`](./gpt-p1-datetime-review.md) §"Strategy 2" — "단순 sed 금지, 분류별 review 필요"
**병렬 handoff**: [`claude-parallel-handoff-pg-cap05-dt-migrate02.md`](./claude-parallel-handoff-pg-cap05-dt-migrate02.md)

---

## 작업 범위 재측정 (P1 #7 Strategy 1 적용 후)

```
backend/ 전체 datetime.utcnow() 호출: 113건
backend/ 전체 datetime.now() 호출 (서버 로컬): 3건 — 전부 주석 (P1 #7 Bug 설명)
                                                  → 실 코드 변경 0건
```

기존 P1 #7 분석은 88건 추정이었으나 정확 측정 시 **113건** — `models.py:default_factory=datetime.utcnow` 패턴이 29건 누락됐었음.

## 파일별 분포 (Top 10)

| 파일 | 건수 | 주 카테고리 |
|---|---|---|
| `backend/models.py` | 29 | DB default_factory |
| `backend/routers/super_admin.py` | 11 | DB 비교 + rolling window |
| `backend/routers/orders.py` | 11 | DB INSERT + 쿠폰/스탬프 만료 |
| `backend/routers/stats.py` | 7 | rolling window since |
| `backend/utils/jwt.py` | 4 | JWT exp |
| `backend/routers/tables.py` | 4 | join_window 만료 |
| `backend/routers/tabehoudai.py` | 4 | 세션 만료 |
| `backend/routers/stores.py` | 4 | DB INSERT |
| `backend/routers/insights.py` | 4 | rolling window since |
| `backend/routers/billing.py` | 4 | 구독 만료 비교 |
| (이하 30+ 파일에 1~3건씩) | ~30 | 혼합 |

---

## 6 카테고리 분류 + 변환 패턴

### Cat-1 — DB naive UTC writes/comparisons (~70건, 안전 일괄 교체)

**파일**:
- `models.py` × 29 (`default_factory=datetime.utcnow`)
- `routers/orders.py` × 8 (stamp/coupon `used_at`, `last_visit` 등)
- `routers/super_admin.py` × 6 (`updated_at`, 비교)
- `routers/stores.py` × 2 (now = utcnow + INSERT)
- `routers/tabehoudai.py` × 4 (`settled_at`, `now = utcnow`)
- `routers/tables.py` × 4 (`join_window_end`)
- `routers/takeout.py` × 3 (`created_at`, `ready_dt`)
- `routers/register.py` × 3 (`settled_at`, `updated_at`)
- `routers/pos.py` × 2 (`checkout_requested_at`, `updated_at`)
- `routers/billing.py` × 2 (`now = utcnow` for 비교/INSERT)
- `routers/referrals.py` × 2 (`expires_at`, `now`)
- `routers/oauth.py` × 1 (`now`)
- `routers/reviews.py` × 1 (`updated_at`)
- `routers/guests.py` × 2 (`now`, GuestProfile 신규)
- `routers/admin.py` × 2 (`threshold`, `now_utc`)
- `routers/ws_token.py` × 1 (`exp` for WS token)
- 기타 ~3

**변환 패턴**:
```python
# 전: from datetime import datetime
expires_at = datetime.utcnow() + timedelta(days=30)
if expires_at < datetime.utcnow():
    ...

# 후: from utils.time_helpers import now_utc_naive
expires_at = now_utc_naive() + timedelta(days=30)
if expires_at < now_utc_naive():
    ...
```

**`models.py default_factory` 특수 케이스**:
```python
# 전:
created_at: datetime = Field(default_factory=datetime.utcnow)
trial_start_date: Optional[datetime] = Field(default_factory=datetime.utcnow)
# (29개 컬럼)

# 후:
from utils.time_helpers import now_utc_naive
created_at: datetime = Field(default_factory=now_utc_naive)
```

```python
# 전 (lambda):
subscription_expires_at: Optional[datetime] = Field(
    default_factory=lambda: datetime.utcnow() + timedelta(days=60)
)

# 후:
subscription_expires_at: Optional[datetime] = Field(
    default_factory=lambda: now_utc_naive() + timedelta(days=60)
)
```

**리스크**: 0. semantic 완전 동일 (`datetime.utcnow()` = `datetime.now(timezone.utc).replace(tzinfo=None)`).

---

### Cat-2 — Rolling UTC windows (~12건, **의미 분석 필요**)

GPT 권고 (§B): "last N × 24 hours" 의미면 OK, "last N JST calendar days" 의미면 JST boundary helper 로 변환 필요.

**파일 + 의도 분석**:

| 위치 | 코드 | 의도 추정 | 권장 변환 |
|---|---|---|---|
| `routers/stats.py:38,70,137,187,219,291,324` × 7 | `since = utcnow() - timedelta(days=days)` | 사장님 백오피스 매출/주문 통계 → **JST calendar days 의도** | UTC range + JST boundary |
| `routers/insights.py:32,63,111,156` × 4 | 동상 | 동상 (사장님 대시보드) | 동상 |
| `routers/super_admin.py:64,73,130,145,393,414` × 6 | `week_ago`, `month_ago`, `since` | super admin 대시보드 → **JST calendar days 의도** | 동상 |
| `routers/discover.py:30,107` × 2 | `since = utcnow() - timedelta(days=days)` | 손님 매장 검색 "최근 30일 인기" → **rolling 24h × N OK** | `now_utc_naive()` 만 |
| `routers/beta.py:76` | `recent_cut = utcnow() - timedelta(days=7)` | beta signup 카운트 → rolling 24h OK | `now_utc_naive()` 만 |

→ **stats/insights/super_admin 의 17건은 JST calendar 의도** — 정확한 변환 시 별도 helper 필요:

```python
# utils/time_helpers.py 신규 헬퍼
def days_ago_jst_as_utc_naive(days: int, now: Optional[datetime] = None) -> datetime:
    """N JST calendar days 전 자정 (00:00 JST) 의 naive UTC 표현.
    
    사장님 백오피스 "최근 7일 매출" 같은 calendar-day 쿼리에 사용.
    """
    base = today_start_jst_as_utc_naive(now=now)
    return base - timedelta(days=days)
```

```python
# 전: since = datetime.utcnow() - timedelta(days=days)
# 후: since = days_ago_jst_as_utc_naive(days)
```

**리스크**: 낮음. 비교 대상 `Order.created_at` 도 naive UTC 라 일관.

**discover/beta 의 4건은 rolling 의도라 `now_utc_naive()` 직접 교체 OK** — calendar day 변환 불필요.

---

### Cat-3 — Event timestamps with `"Z"` suffix (~3건, format 통일 권장)

**파일**:
- `backend/utils/events.py:33` — `"ts": datetime.utcnow().isoformat() + "Z"`
- `backend/workers/translate_tasks.py:36` — 동상
- `backend/workers/food_rescue_scheduler.py:38` — **이미** `datetime.now(timezone.utc).isoformat()` (모범 사례)

**문제**: 두 패턴 혼재 — 같은 시각 같은 의미인데 ISO 형식 다름:
- `2026-05-22T03:00:00Z` (naive + `+ "Z"` 트릭)
- `2026-05-22T03:00:00+00:00` (aware ISO)

JSON 소비자가 `Z` 만 인식하면 후자에서 깨짐. 또는 `+00:00` 만 인식하면 전자에서 깨짐. 통일 필요.

**변환 패턴** (GPT §C 합의):
```python
# 전: "ts": datetime.utcnow().isoformat() + "Z"
# 후: "ts": datetime.now(timezone.utc).isoformat()
#     → 결과: "2026-05-22T03:00:00+00:00"
```

**리스크**: 낮음 — 브라우저 `new Date()` 는 둘 다 파싱 OK. 단, 프론트가 정규식 등으로 `Z` 만 매칭하는 코드 있으면 깨짐. **사전 grep 필요**:

```bash
grep -rn "endsWith.*Z\|/Z\\$/\|substring.*Z" frontend-react/src
```

→ 없으면 안전.

---

### Cat-4 — JWT expiration (4건, **Strategy 2 에선 유지**)

**파일**:
- `backend/utils/jwt.py:34` — admin token exp
- `backend/utils/jwt.py:66` — subscription 비교
- `backend/utils/jwt.py:109` — super admin exp
- `backend/utils/jwt.py:139` — staff exp
- `backend/routers/oauth.py:68` — OAuth token exp

**변환 패턴** (GPT §A 합의 — Strategy 2 단계에선 semantic 유지):
```python
# 전: "exp": datetime.utcnow() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)
# 후: "exp": now_utc_naive() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)
```

PyJWT 의 `exp` 처리: 
- naive datetime → 내부적으로 `datetime.timestamp()` 호출 → POSIX 초로 변환 → JWT 표준 `exp` claim
- aware datetime → 동일
- **두 패턴 결과 동일**. semantic 보존.

**Strategy 3 (TIMESTAMPTZ 이행) 시점**: `now_utc_naive()` → `datetime.now(timezone.utc)` (aware) 로 추가 변환. 그때는 PyJWT smoke 1 회 필요 (GPT §A 권고).

**리스크**: 0 (Strategy 2 단계).

---

### Cat-5 — Seed/migration scripts (3건, **낮은 우선순위**)

**파일**:
- `backend/migrate_subscriptions.py:30` — `trial_end = (datetime.utcnow() + timedelta(days=30)).isoformat()`
- `backend/seed_table_1234567.py:32` — `subscription_expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=365)`
- `backend/seed_samples.py:28` — 동상

**처리**: 동일 패턴으로 변환 OK이지만 운영 영향 0 (개발용 일회성 스크립트). **Strategy 2 마지막 단계** 또는 Strategy 3 와 함께.

---

### Cat-6 — Fixed-offset JST (2건, **`ZoneInfo` 통일**)

**파일**:
- `backend/workers/food_rescue_scheduler.py` — `JST = timezone(timedelta(hours=9))`
- `backend/test_business_hours.py` (테스트) — 동상

**변환 패턴** (GPT §E6):
```python
# 전: from datetime import timezone, timedelta
#     JST = timezone(timedelta(hours=9))
# 후: from utils.time_helpers import JST
#     # 또는: from zoneinfo import ZoneInfo
#     # JST = ZoneInfo("Asia/Tokyo")
```

JST 는 DST 없어 양자 동일 결과 — 단, 코드 표준 통일 + named zone 가 디버깅 친화적.

**리스크**: 0. 의미 동일.

---

## 변환 우선순위 + 단계

### Phase 2a — 안전 일괄 변환 (즉시 가능, 위험 0)

Cat-1, Cat-3, Cat-4 — **~80건**.

```bash
# 자동화 가능 (sed/IDE refactor):
# datetime.utcnow() → now_utc_naive()  (Cat-1, Cat-4)
# datetime.utcnow().isoformat() + "Z" → datetime.now(timezone.utc).isoformat()  (Cat-3)
```

**필수 작업**:
1. 각 파일에 `from utils.time_helpers import now_utc_naive` 추가 (또는 적절히)
2. Cat-3 의 경우 `from datetime import timezone` import 확인
3. `from datetime import datetime` 가 다른 용도로도 쓰이는 경우 (예: type hint) 유지

### Phase 2b — 의미 분석 + 변환 (Cat-2 rolling window)

**~12건** — 의도 분석 후:
- stats/insights/super_admin × 17건 → `days_ago_jst_as_utc_naive(days)` helper 신규 + 교체
- discover/beta × 4건 → `now_utc_naive()` 직접 교체

**시간**: ~1 시간 (helper 작성 + caller 교체).

### Phase 2c — 낮은 우선순위 (Cat-5, Cat-6)

**~5건** — seed scripts + fixed-offset JST 정리. Strategy 3 와 함께 또는 별도 housekeeping.

---

## 안전 검증 절차

GPT §E 권고 + Claude 보강:

```bash
# 1. 변환 후 utcnow 0건 확인
grep -rn "datetime\.utcnow\(\)" backend --include="*.py"
# 기대 결과: 0 (Cat-5 seed 제외 시)

# 2. import 정합성 확인
grep -rn "from utils.time_helpers import" backend --include="*.py"
# 각 utcnow 변환 파일이 now_utc_naive (또는 days_ago_jst_as_utc_naive) 를 import 하는지

# 3. JWT smoke test
# admin login → token 발급 → /api/admin/* 호출 → 401 안 나오는지

# 4. 이벤트 ts 형식 확인
# DB eventlog 테이블의 ts 컬럼 / Redis WS payload 의 ts 필드 grep
# "+00:00" 형식 일관 확인

# 5. 만료 비교 smoke
# subscription_expires_at, coupon.expires_at, tabehoudaisession.expires_at 등
# 만료 직전/직후 경계 케이스 1회 수동 검증

# 6. 프론트 'Z' suffix 의존 코드 grep (Cat-3 위험)
grep -rn "endsWith.*Z\|/Z\\$/\|\\.includes.*Z" frontend-react/src
# 기대 결과: 0 또는 무관한 매치
```

---

## 호출자 import 변경 매트릭스

**Phase 2a 적용 시 추가 import 필요한 파일 (~25개)**:

| 파일 | 추가 import |
|---|---|
| `models.py` | `from utils.time_helpers import now_utc_naive` (단, models 가 utils.time_helpers 와 import cycle 만들지 않는지 확인) |
| `routers/*.py` × ~20 | 동상 |
| `utils/jwt.py` | `from utils.time_helpers import now_utc_naive` |
| `utils/events.py` | `from datetime import timezone` (Cat-3 변환용) |
| `workers/translate_tasks.py` | 동상 |

**🟡 Import cycle 위험** (GPT §C 권고):
- `models.py` 가 `utils.time_helpers` import 시 cycle 가능
- `utils.time_helpers` 가 `models` 를 import 안 하므로 OK이지만 확인 필요
- 검증: `python -c "from backend.models import Store"` 가 import error 없이 성공

---

## 변경 범위 + 위험도

| 변경 | 건수 | 위험도 | 자동화 |
|---|---|---|---|
| Cat-1 DB writes/comparisons | ~70 | 0 | 가능 (sed) |
| Cat-2 rolling window — discover/beta | 4 | 0 | 가능 (sed) |
| Cat-2 rolling window — stats/insights/super_admin | 17 | 낮음 | 수동 (helper 적용) |
| Cat-3 event ts | 3 | 낮음 | 가능 (sed + grep 검증) |
| Cat-4 JWT exp | 4 | 0 | 가능 (sed) |
| Cat-5 seed scripts | 3 | 0 | 후순위 |
| Cat-6 fixed-offset JST | 2 | 0 | 가능 |
| **합계** | **~103** | | |

**총 113건 - 10건 (변경 안 함: 주석 안의 reference + helper 자신)** = 103건 실 변경.

---

## GPT cross-review 요청 항목

본 doc 작성 후 자이라가 GPT 에 보낼 프롬프트는 [`claude-parallel-handoff-pg-cap05-dt-migrate02.md`](./claude-parallel-handoff-pg-cap05-dt-migrate02.md) §"GPT Review Prompt: PG-DT-MIGRATE-02" 그대로 사용.

핵심 검토 요청 5 항목:
- A. 분류 6 카테고리 + 변환 패턴 정확성 (Cat-1~6)
- B. Rolling window 중 JST calendar day 의도 식별 — stats/insights/super_admin 의 17건 모두 JST 의도가 맞나? discover/beta 의 4건은 rolling 의도가 맞나?
- C. Import-cycle 위험 (특히 `models.py` ← `utils.time_helpers`)
- D. `models.py default_factory` 변경을 Strategy 2 에서 진행 vs Strategy 3 TIMESTAMPTZ 이행 시점으로 연기?
- E. 필수 smoke/test (JWT / event ts / expiry 비교 / stats rolling window)

응답 저장: `tasks/gpt-pg-dt-migrate-02-review.md`

---

## 액션 아이템

- [x] **PG-DT-MIGRATE-02-ANALYSIS** (이번 doc): 113건 분류 + 변환 패턴 + helper 설계
- [x] **GPT-PG-DT-MIGRATE-02-REVIEW** (fa01c1e): GPT cross-review 응답 수신 + 본 doc 갱신
- [x] **PG-DT-MIGRATE-02-prep** (66bc7c0): tzdata dep 추가 + JST fallback + 신규 helper 2개 (`days_ago_jst_as_utc_naive`, `months_ago_jst_month_start_as_utc_naive`)
- [x] **PG-DT-MIGRATE-02b** (fa47244): Cat-2 rolling window 변환 + loyalty_analytics JST month 버그 수정
- [x] **PG-DT-MIGRATE-02a** (eeab9e9): Cat-1/3/4/6 일괄 변환 (95건 / 21 파일) + models.py default_factory 29건 + Cat-3 wire format Z→+00:00 + 운영 VM compileall + models import smoke
- [x] **PG-DT-MIGRATE-02a 검증** (이번 커밋): GPT 세션 H review 반영 + ws_token.py 일관성 정리 + `tools/predeploy_smoke.py` 6 단계 자동화. local 6/6 PASS
- [ ] **PG-DT-MIGRATE-02c**: Cat-5 seed scripts 정리 (낮은 우선순위)
- [ ] **PG-DT-MIGRATE-02-VERIFY**: `rg "datetime\.utcnow"` 0건 (괄호 없이!) + JWT smoke + 만료 비교 경계 + 프론트 Z suffix grep + reporting regression smoke

---

## GPT cross-review 반영 (2026-05-22, [`gpt-pg-dt-migrate-02-review.md`](./gpt-pg-dt-migrate-02-review.md))

### 합의 사항

- ✅ 6 카테고리 분류 정확. Strategy 2 진행 가능.
- ✅ `Field(default_factory=now_utc_naive)` 가 SQLModel/Pydantic 정상 패턴. models.py 변경은 Strategy 2 에서 처리.
- ✅ JWT exp 는 Strategy 2 에선 `now_utc_naive()` (naive UTC) 유지. Strategy 3 시점에 aware UTC 전환.

### Must-Fix 3개 (이번 커밋)

| # | 항목 | 적용 |
|---|---|---|
| 1 | 🔴 **tzdata Windows 환경** — `ZoneInfo("Asia/Tokyo")` 실패 시 `ZoneInfoNotFoundError`. models.py 가 time_helpers import 하면 모델 import 자체 깨짐 | ✅ `pyproject.toml` 에 `tzdata>=2024.1` 추가 + `time_helpers.py` 에 `timezone(timedelta(hours=9))` fallback |
| 2 | 🔴 **grep 패턴 수정** — `datetime\.utcnow\(\)` 만 grep 시 `default_factory=datetime.utcnow` (괄호 없는 callable) 못 잡음 | ✅ 본 doc 의 검증 절차 + 부록 매핑을 `datetime\.utcnow` 패턴으로 재측정 — 결과 113건 동일 |
| 3 | 🔴 **rolling window 정밀화** — `stats.py /monthly` 의 `days * 31` 근사 + `loyalty_analytics.py:22` current month 가 UTC 기준 | ✅ `months_ago_jst_month_start_as_utc_naive(months, now=None)` helper 신규 — Cat-2b 에서 활용 |

### 누락 항목 추가 (GPT §B "Additional Items To Classify")

기존 분석에서 빠진 5건을 카테고리에 매핑:

| 위치 | 코드 | 분류 |
|---|---|---|
| `routers/stores.py:116` | `now = datetime.utcnow()` (운영시간 판정) | Cat-1 |
| `routers/stores.py:157` | 동상 | Cat-1 |
| `routers/stores.py:578` | `recent_cut = datetime.utcnow() - _td(days=30)` photo contest coupon | Cat-2 (rolling 30d × 24h OK — public discovery 유사) |
| `routers/stores.py:599` | `expires_at = datetime.utcnow() + timedelta(days=90)` | Cat-1 (DB INSERT 만료 시각) |
| `routers/demo.py:42, 94` | demo cleanup `now = datetime.utcnow()` | Cat-1 (rolling/expiry — `now_utc_naive()` OK) |
| `routers/loyalty_analytics.py:22` | `now = datetime.utcnow(); month_start = datetime(now.year, now.month, 1)` | **Cat-2 JST month** (사장님 "이번 달 포인트 ROI" — 매월 1일 09:00 JST 에 reset 되는 버그) |

→ `loyalty_analytics.py:22` 가 **새 must-fix 버그** 발견. 사장님이 보는 "이번 달 ROI" 가 JST 1일 00:00 기준이 아닌 UTC 1일 00:00 (= JST 1일 09:00) 기준으로 9시간 어긋남. Cat-2b 변환 시 `months_ago_jst_month_start_as_utc_naive(0)` 또는 `today_start_jst_as_utc_naive().replace(day=1)` 사용.

### `models.py` default factory 타이밍 (GPT §D 합의)

Strategy 2 에서 처리 권장 — `now_utc_naive` 가 naive UTC 보존, 기존 DB contract (TIMESTAMP without timezone) 유지, partial aware 마이그 아님. 단, 변경 후 import smoke 필수:

```bash
uv run python -c "from backend.models import Store, Order, EventLog; print('models import ok')"
uv run python -c "from backend.utils.time_helpers import now_utc_naive, today_jst; print(now_utc_naive(), today_jst())"
```

### Cat-3 wire format 결정 (GPT §A.3)

`utcnow().isoformat() + "Z"` → `now(timezone.utc).isoformat()` 으로 변환 시 wire format 이 `...Z` → `...+00:00` 로 바뀜. 브라우저 `Date()` 는 둘 다 파싱 OK 이지만 프론트 문자열 의존 위험.

**선택지**:
- (a) `+00:00` 으로 통일 (Python 표준, GPT 권고 첫 번째 안)
- (b) `Z` 유지: `.isoformat().replace("+00:00", "Z")` (wire format 안정)

→ **(a) +00:00 으로 통일** 잠정 권장. 단, **PG-DT-MIGRATE-02a 전 프론트 grep 필수**:

```bash
grep -rnE "endsWith\(.Z.\)|/Z\\\$/|\\\.includes\(.Z.\)" frontend-react/src
```

매치 0건이면 안전. 매치 있으면 (b) 선택.

### 신규 helper 2개 (이번 커밋, `backend/utils/time_helpers.py`)

```python
def days_ago_jst_as_utc_naive(days: int, now: Optional[datetime] = None) -> datetime:
    """N JST calendar days 전 자정 (00:00 JST) 의 naive UTC."""

def months_ago_jst_month_start_as_utc_naive(months: int, now: Optional[datetime] = None) -> datetime:
    """N JST calendar months 전 1일 00:00 JST 의 naive UTC."""
```

운영 VM smoke 검증:
- `days_ago_jst_as_utc_naive(7)` → `2026-05-15 15:00:00` (JST 2026-05-16 00:00 의 UTC) ✅
- `months_ago_jst_month_start_as_utc_naive(2)` → `2026-02-28 15:00:00` (JST 2026-03-01 00:00) ✅
- `months_ago_jst_month_start_as_utc_naive(13)` → `2025-03-31 15:00:00` (연도 넘김 정확) ✅

---

## 02a 구현 GPT cross-review 반영 (2026-05-24, [`gpt-pg-dt-migrate-02a-impl-review.md`](./gpt-pg-dt-migrate-02a-impl-review.md))

### 합의 사항

- ✅ 02a 구현 deploy 가능 — naive UTC DB 계약 보존, schema 변경 없음.
- ✅ SQLModel `Field(default_factory=now_utc_naive)` 29건 안전 (Optional/lambda/Relationship 모두).
- ✅ Event ts `Z` → `+00:00` 브라우저 호환 (frontend grep 1건 `endsWith('Z')` 발견했지만 `!since.includes('+')` 가드 있어 호환).
- ✅ PG-CAP-05 + PG-DT-MIGRATE-02 한 deploy 묶기 가능 (둘 다 schema 변경 없고 독립).

### 정정 사항

- **JWT 라이브러리는 PyJWT 가 아니라 `python-jose`** — 본 분석 doc 의 "PyJWT" 표기는 잘못된 가정. naive UTC `exp` 동작은 양쪽 모두 동일.

### 추가 cleanup (이번 커밋)

- `backend/routers/ws_token.py:64-79` — `exp.isoformat() + "Z"` → aware UTC ISO (+00:00). `events.py` / `translate_tasks.py` 의 ts 형식과 일관.

### 운영 smoke 자동화 (`tools/predeploy_smoke.py`)

6 단계 — GPT §D Smoke Priority 그대로:

```
1. compile      backend 전체 py_compile
2. import       app-dir 컨텍스트 (PYTHONPATH=backend) + models + time_helpers
3. grep         datetime.utcnow 0건 (legacy/seed 제외)
4. JWT          create_admin/super/staff_token + decode_admin (python-jose)
5. event_ts     +00:00 wire format
6. helpers      모든 신규 helper 동작 (days_ago / months_ago / day_range)
```

local 6/6 PASS 확인. 종료 코드: 0 = OK / 1 = warning / 2 = critical.

운영 VM 실행은 deploy 후. 사용:
```bash
cd ~/qr-order-system && ./.venv/bin/python tools/predeploy_smoke.py
```

### Top 3 Regression Risk (GPT §D)

1. PYTHONPATH / app-dir 컨텍스트 — `from backend.models` vs `from models` 분기. `predeploy_smoke.py` 가 PYTHONPATH=backend 로 실행해 해결.
2. Event ts wire format un-grepped consumer — 운영 변경 후 KDS/admin WS 실 동작 확인 필요 (수동 smoke).
3. 향후 Strategy 3 partial aware leak — 02a 는 안 함. 미래 작업 가드 필요.

### Deploy 일정 권고 (GPT §E)

**단일 deploy 권장**:
- PG-CAP-05 + PG-DT-MIGRATE-02 둘 다 schema 변경 없음, 독립적.
- predeploy_smoke 통과 후 deploy + 즉시 수동 smoke (admin login / KDS / stats).
- 분리 시: PG-CAP-05 먼저 (translation worker capacity) → 02a 두번째.

### Cat-5 처리 일정

GPT 권고: legacy/seed `datetime.utcnow` 잔존을 명시 수용 또는 cleanup 전 PG-DT-MIGRATE-02 전체 close 하지 말 것. 본 카드의 후속 PG-DT-MIGRATE-02c 가 처리.

---

## 부록 — 카테고리별 라인 매핑 (full)

GPT review 후 실 변환 단계에서 참조용. 전체 113건의 정확한 (file:line) 매핑.

```
─── Cat-1 (DB naive UTC, ~70건) ───
models.py:61,62,178,244,254,258,259,268,277,289,(...총 29)
routers/orders.py:146,188,292,296,305,309,324,331,344,440,534,538
routers/super_admin.py:308,309,310,331,462
routers/stores.py:116,157,599
routers/tabehoudai.py:78,168,204,232
routers/tables.py:52,87,107,449
routers/takeout.py:55,146,152
routers/register.py:245,322,359
routers/pos.py:71,124
routers/billing.py:80,84,229,277
routers/referrals.py:30,123
routers/oauth.py:249
routers/reviews.py:50
routers/guests.py:38,109
routers/admin.py:145,326
routers/ws_token.py:63
routers/loyalty_analytics.py:22
routers/menus.py:251 (← P1 #7 Strategy 1 에서 now_jst() 로 이미 변경됨, skip)

─── Cat-2 (Rolling window, ~21건) ───
[JST calendar day 의도]:
  routers/stats.py:38,70,137,187,219,291,324
  routers/insights.py:32,63,111,156
  routers/super_admin.py:64,73,130,145,393,414
[Rolling 24h × N 의도]:
  routers/discover.py:30,107
  routers/beta.py:76
  routers/stats.py:185 (since = utcnow() - timedelta(days=months*31)) - 근사값, 별도 정밀화 검토

─── Cat-3 (Event ts "Z", 2건) ───
backend/utils/events.py:33
backend/workers/translate_tasks.py:36
[이미 aware 사용, 변경 불필요]:
  backend/workers/food_rescue_scheduler.py:38

─── Cat-4 (JWT exp, 5건) ───
backend/utils/jwt.py:34,66,109,139
backend/routers/oauth.py:68

─── Cat-5 (Seed scripts, 3건) ───
backend/migrate_subscriptions.py:30
backend/seed_table_1234567.py:32
backend/seed_samples.py:28

─── Cat-6 (Fixed-offset JST, 2건) ───
backend/workers/food_rescue_scheduler.py (JST 정의부)
backend/test_business_hours.py

─── Cat-7 (Misc, ~10건) ───
[demo/admin/혼합 routine]:
  routers/demo.py:42,94 (DB 비교)
  routers/admin.py:145,326 (이미 Cat-1 에 포함)
  utils/time_helpers.py:28 (← 헬퍼 자신, datetime.now(timezone.utc) 사용 — 변경 불필요)
  ...
```

**주석에 포함된 datetime.now() reference 3건** — 모두 P1 #7 Bug 설명 주석. 실 코드 변경 불요.

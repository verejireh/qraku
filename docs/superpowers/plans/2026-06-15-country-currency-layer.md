# 국가 설정 레이어 + 통화 정확성 + 구독료 다통화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매장이 속한 국가가 통화·가능 결제사를 강제하고 세율·언어 기본값을 제공하도록 만들고, JPY 하드코딩을 제거하며, 점주 구독료를 국가별 통화로 받는다.

**Architecture:** 국가 설정은 코드 상수(`backend/config/countries.py`)로 정의(접근 1). 통화는 `Store.country_code`에서 항상 파생(드리프트 차단), 금액은 통화 최소단위 정수로 저장. 세율·언어는 가입 시 국가 기본값으로 시드되는 매장 override 값. 구독료는 `country_code → env prefix → Stripe Price ID`로 해석.

**Tech Stack:** FastAPI + SQLModel(PostgreSQL/SQLite 테스트) · pytest(asyncio_mode=auto) · React/Vite · Stripe.

**테스트 실행 (공통):** 저장소 루트에서 `uv run pytest backend/tests/<file> -v`

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `backend/utils/currency.py` | 통화 최소단위·반올림·포맷 (도메인 무지식 순수 함수) | 신규 |
| `backend/config/__init__.py` | config 패키지 | 신규 |
| `backend/config/countries.py` | 국가별 설정 카탈로그 + 접근자 | 신규 |
| `backend/models.py` | `Store.country_code` 추가 | 수정 (append) |
| `backend/database.py` | `country_code` 마이그레이션 | 수정 (리스트 끝) |
| `backend/routers/stores.py` | GET 응답 통화 메타 + signup country_code/시드 | 수정 |
| `backend/routers/billing.py` | 국가별 Price ID 해석 | 수정 |
| `frontend-react/src/components/magnolia/MagnoliaCartModal.jsx` | 통화화 (currencyCode/¥ 제거) | 수정 |
| `frontend-react/src/views/AdminPaymentView.jsx` | allowed_payment_methods 필터 | 수정 |
| `frontend-react/src/views/OwnerSignupView.jsx` (또는 가입 폼) | 국가 선택 드롭다운 | 수정 |
| `backend/tests/test_currency.py`, `test_countries.py`, `test_country_store.py`, `test_billing_country.py` | 테스트 | 신규 |

---

## Task 1: 통화 유틸리티 `utils/currency.py`

**Files:**
- Create: `backend/utils/currency.py`
- Test: `backend/tests/test_currency.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_currency.py
from decimal import Decimal
from utils.currency import decimals_for, symbol_for, to_minor_units, from_minor_units, format_amount


def test_decimals_for():
    assert decimals_for("JPY") == 0
    assert decimals_for("GBP") == 2
    assert decimals_for("eur") == 2          # 대소문자 무관
    assert decimals_for("XYZ") == 2          # 미지 통화 → 2 폴백


def test_symbol_for():
    assert symbol_for("JPY") == "¥"
    assert symbol_for("GBP") == "£"
    assert symbol_for("EUR") == "€"
    assert symbol_for("XYZ") == "XYZ "       # 미지 통화 → 코드+공백


def test_to_minor_units():
    assert to_minor_units("1000", "JPY") == 1000     # 엔: 최소단위=엔
    assert to_minor_units("10.00", "GBP") == 1000    # 파운드: 펜스
    assert to_minor_units("10.005", "GBP") == 1001   # 반올림 HALF_UP
    assert to_minor_units(10, "GBP") == 1000          # int 입력


def test_from_minor_units():
    assert from_minor_units(1000, "GBP") == Decimal("10.00")
    assert from_minor_units(1000, "JPY") == Decimal("1000")


def test_format_amount():
    assert format_amount(1000, "JPY") == "¥1,000"
    assert format_amount(1000, "GBP") == "£10.00"
    assert format_amount(123456, "GBP") == "£1,234.56"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_currency.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'utils.currency'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/utils/currency.py
"""통화 최소단위·반올림·포맷 — 도메인 무지식 순수 함수.

금액은 통화의 '최소단위 정수'로 저장한다 (JPY=엔, GBP=펜스).
기존 엔화 데이터는 이미 최소단위이므로 그대로 유효하다.
"""
from decimal import Decimal, ROUND_HALF_UP

CURRENCY_DECIMALS = {"JPY": 0, "GBP": 2, "EUR": 2, "USD": 2}
CURRENCY_SYMBOLS = {"JPY": "¥", "GBP": "£", "EUR": "€", "USD": "$"}


def decimals_for(currency: str) -> int:
    return CURRENCY_DECIMALS.get((currency or "").upper(), 2)


def symbol_for(currency: str) -> str:
    code = (currency or "").upper()
    return CURRENCY_SYMBOLS.get(code, f"{code} ")


def to_minor_units(amount, currency: str) -> int:
    """표시 금액(소수)을 최소단위 정수로 변환 (통화별 자리수, HALF_UP 반올림)."""
    d = decimals_for(currency)
    quantum = Decimal(1).scaleb(-d)                       # d=0 → 1, d=2 → 0.01
    q = Decimal(str(amount)).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(q.scaleb(d))


def from_minor_units(minor: int, currency: str) -> Decimal:
    d = decimals_for(currency)
    return Decimal(int(minor)) / (Decimal(10) ** d)


def format_amount(minor: int, currency: str) -> str:
    d = decimals_for(currency)
    value = from_minor_units(minor, currency)
    return f"{symbol_for(currency)}{value:,.{d}f}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_currency.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/utils/currency.py backend/tests/test_currency.py
git commit -m "feat(currency): 통화 최소단위·포맷 유틸 (Task 1)"
```

**⏸ GPT 5.5 리뷰 체크포인트 — diff 제시 후 대기.**

---

## Task 2: 국가 카탈로그 `config/countries.py`

**Files:**
- Create: `backend/config/__init__.py` (빈 파일)
- Create: `backend/config/countries.py`
- Test: `backend/tests/test_countries.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_countries.py
from config.countries import (
    get_country, currency_of, decimals_of, symbol_of,
    allowed_methods, default_tax, default_languages, stripe_prefix, DEFAULT_COUNTRY,
)


def test_default_country_is_jp():
    assert DEFAULT_COUNTRY == "JP"


def test_currency_of():
    assert currency_of("JP") == "JPY"
    assert currency_of("GB") == "GBP"
    assert currency_of("gb") == "GBP"          # 대소문자 무관


def test_unknown_code_falls_back_to_jp():
    assert currency_of("ZZ") == "JPY"
    assert currency_of(None) == "JPY"
    assert get_country("ZZ")["currency"] == "JPY"


def test_decimals_and_symbol():
    assert decimals_of("JP") == 0
    assert decimals_of("GB") == 2
    assert symbol_of("GB") == "£"


def test_allowed_methods():
    assert "PAYPAY_DIRECT" in allowed_methods("JP")
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")   # 영국은 PayPay 없음
    assert "SQUARE_INTEGRATED" in allowed_methods("GB")


def test_default_tax_and_languages():
    assert default_tax("JP") == (10.0, True)
    assert default_tax("GB") == (20.0, True)
    assert default_languages("GB") == ["en"]
    assert "ja" in default_languages("JP")


def test_stripe_prefix():
    assert stripe_prefix("JP") == "JP"
    assert stripe_prefix("GB") == "GB"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_countries.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: Write minimal implementation**

Create empty `backend/config/__init__.py`:
```python
```

Create `backend/config/countries.py`:
```python
"""국가별 설정 카탈로그 (접근 1 — 코드 설정).

국가는 거의 바뀌지 않고 플랫폼 팀이 PR 로 관리한다. Stripe Price ID 등
민감/환경별 값은 여기 두지 않고 `stripe_price_env_prefix` 로 .env 키를 조회한다.
미지 코드는 JP 로 폴백하여 기존(일본) 동작을 보존한다.
"""
from utils.currency import decimals_for, symbol_for

DEFAULT_COUNTRY = "JP"

COUNTRIES = {
    "JP": {
        "currency": "JPY",
        "default_tax_rate": 10.0,
        "default_tax_included": True,
        "default_languages": ["ja", "en", "ko", "zh"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAYPAY_DIRECT", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "JP",
    },
    "GB": {
        "currency": "GBP",
        "default_tax_rate": 20.0,
        "default_tax_included": True,
        "default_languages": ["en"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "GB",
    },
}


def get_country(code: str) -> dict:
    return COUNTRIES.get((code or "").upper(), COUNTRIES[DEFAULT_COUNTRY])


def currency_of(code: str) -> str:
    return get_country(code)["currency"]


def decimals_of(code: str) -> int:
    return decimals_for(currency_of(code))


def symbol_of(code: str) -> str:
    return symbol_for(currency_of(code))


def allowed_methods(code: str) -> list:
    return list(get_country(code)["allowed_payment_methods"])


def default_tax(code: str) -> tuple:
    c = get_country(code)
    return (c["default_tax_rate"], c["default_tax_included"])


def default_languages(code: str) -> list:
    return list(get_country(code)["default_languages"])


def stripe_prefix(code: str) -> str:
    return get_country(code)["stripe_price_env_prefix"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_countries.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/config/__init__.py backend/config/countries.py backend/tests/test_countries.py
git commit -m "feat(countries): 국가별 설정 카탈로그 (Task 2)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Task 3: `Store.country_code` 모델 + 마이그레이션

**Files:**
- Modify: `backend/models.py` (Store 클래스 — Language Settings 근처에 append)
- Modify: `backend/database.py` (migration_sqls 리스트 끝, 현재 line 325 `]` 직전)
- Test: `backend/tests/test_country_store.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_country_store.py
import pytest
from models import Store


@pytest.mark.asyncio
async def test_new_store_defaults_to_jp(db):
    store = Store(name="t", owner_id="a@b.c")
    db.add(store)
    await db.commit()
    await db.refresh(store)
    assert store.country_code == "JP"      # 기존 매장 백필과 동일한 기본값
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_country_store.py -v`
Expected: FAIL — `AttributeError`/`TypeError`: Store has no `country_code`

- [ ] **Step 3: Write minimal implementation**

In `backend/models.py`, find (around line 115-116):
```python
    # Language Settings
    supported_languages: str = Field(default="ja,en,ko,zh") # Comma separated: ja,en,ko,zh,vi,etc
```
Add immediately after it:
```python

    # Country (가입 시 선택, 이후 잠김 — 통화·가능 결제사를 강제)
    country_code: str = Field(default="JP", max_length=2, index=True)
```

In `backend/database.py`, find the migration list end (line 324-326):
```python
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tabehoudai_active_table "
        "ON tabehoudaisession(table_id) WHERE status = 'active'",
    ]
```
Insert before the closing `]`:
```python
        # [2026-06-15] 국가 레이어: Store.country_code (기존 전 매장 JP 백필)
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'JP'",
```

**(GPT 2차 리뷰 #3) `country_code` 를 일반 PATCH 에서 보호** — `update_store`
(`backend/routers/stores.py:327-329`) 는 `hasattr` 인 모든 필드를 setattr 한다.
가입 후 country_code 가 바뀌면 통화가 재해석되므로(¥1,000 → £10.00) 차단한다.
테스트 추가(test_country_store.py):
```python
@pytest.mark.asyncio
async def test_update_store_cannot_change_country_code(db):
    from routers.stores import _PROTECTED_UPDATE_FIELDS
    assert "country_code" in _PROTECTED_UPDATE_FIELDS
```
구현 — stores.py 상단에 상수 추가 + 루프에서 스킵:
```python
_PROTECTED_UPDATE_FIELDS = {"id", "owner_id", "slug", "country_code",
                            "password_hash", "master_pin", "stripe_customer_id",
                            "stripe_subscription_id", "subscription_status",
                            "subscription_type", "subscription_expires_at"}
```
```python
    for key, value in store_update.items():
        if key in _PROTECTED_UPDATE_FIELDS:
            continue
        if hasattr(store, key):
            setattr(store, key, value)
```
> 주의: 이 변경은 기존 PATCH 의 자유로운 필드 쓰기를 좁힌다. 보호 목록은 통화·인증·구독
> 관련 필드로 한정하고, 기존에 정상적으로 수정하던 운영 필드(tax_rate 등)는 제외한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_country_store.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/database.py backend/tests/test_country_store.py
git commit -m "feat(model): Store.country_code + 마이그레이션 (Task 3)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Task 4: store API 통화 메타 + signup 국가 선택/시드

**Files:**
- Modify: `backend/routers/stores.py` (`read_store` GET 응답 + `SignupRequest`/`signup_with_password`)
- Test: `backend/tests/test_country_store.py` (append)

- [ ] **Step 1: Write the failing test (append to test_country_store.py)**

```python
@pytest.mark.asyncio
async def test_signup_seeds_country_defaults(db):
    # signup 헬퍼가 country_code 와 국가 기본값(세율/언어)을 시드하는지 검증
    from routers.stores import _build_store_from_signup_fields  # Task 4에서 추가
    store = _build_store_from_signup_fields(
        name="UK Cafe", owner_id="uk@x.com", owner_name="O",
        password_hash="h", category="cafe", slug="ukcafe",
        address=None, phone=None, country_code="GB",
    )
    assert store.country_code == "GB"
    assert store.tax_rate == 20.0
    assert store.tax_included is True
    assert store.supported_languages == "en"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_country_store.py::test_signup_seeds_country_defaults -v`
Expected: FAIL — `ImportError: cannot import name '_build_store_from_signup_fields'`

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/stores.py`, add import near top (with other imports):
```python
from config.countries import default_tax, default_languages, currency_of, decimals_of, symbol_of
```

Add `country_code` to `SignupRequest` (find the class with `slug: str` ~line 130-141), add field:
```python
    country_code: str = "JP"
```

Add a builder helper above `signup_with_password` (after the `SignupRequest` class):
```python
def _build_store_from_signup_fields(*, name, owner_id, owner_name, password_hash,
                                    category, slug, address, phone, country_code):
    """가입 입력 → Store. 국가 기본값(세율/언어)을 시드한다 (이후 매장이 override)."""
    from utils.time_helpers import now_utc_naive
    from datetime import timedelta
    tax_rate, tax_included = default_tax(country_code)
    now = now_utc_naive()
    return Store(
        name=name, owner_id=owner_id, owner_name=owner_name,
        password_hash=password_hash, category=category, slug=slug,
        address=address or None, phone=phone or None,
        country_code=(country_code or "JP").upper(),
        tax_rate=tax_rate, tax_included=tax_included,
        supported_languages=",".join(default_languages(country_code)),
        subscription_status="TRIAL", subscription_type="FREE",
        trial_start_date=now, subscription_expires_at=now + timedelta(days=60),
    )
```

Replace the inline `store = Store(...)` block in `signup_with_password` (lines ~161-175) with:
```python
    store = _build_store_from_signup_fields(
        name=body.store_name, owner_id=body.email, owner_name=body.owner_name,
        password_hash=get_password_hash(body.password), category=body.category,
        slug=slug_input, address=body.address, phone=body.phone,
        country_code=body.country_code,
    )
```

In `read_store` GET (before `return JSONResponse(content=data)`, ~line 241), add currency meta:
```python
    # ── 통화 메타 (프론트 포맷용; country_code 에서 파생 — 드리프트 차단) ──
    data["currency"] = currency_of(store.country_code)
    data["currency_decimals"] = decimals_of(store.country_code)
    data["currency_symbol"] = symbol_of(store.country_code)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_country_store.py -v`
Expected: PASS (all in file)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/stores.py backend/tests/test_country_store.py
git commit -m "feat(stores): signup 국가 시드 + GET 통화 메타 (Task 4)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Task 5: 구독료 국가별 Price ID 해석 (`billing.py`)

**Files:**
- Modify: `backend/routers/billing.py` (`_resolve_price_id`, `create_checkout_session` 호출부)
- Modify: `backend/CLAUDE.md` (환경변수 표에 GB Price ID 기재)
- Test: `backend/tests/test_billing_country.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_billing_country.py
import importlib


def test_resolve_price_id_jp_backcompat(monkeypatch):
    monkeypatch.setenv("STRIPE_MONTHLY_PRICE_ID", "price_jp_m")
    monkeypatch.setenv("STRIPE_YEARLY_OPEN_PRICE_ID", "price_jp_yo")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "JP") == "price_jp_m"
    assert billing._resolve_price_id("yearly", True, "JP") == "price_jp_yo"


def test_resolve_price_id_gb_prefixed(monkeypatch):
    monkeypatch.setenv("STRIPE_GB_MONTHLY_PRICE_ID", "price_gb_m")
    monkeypatch.setenv("STRIPE_GB_SIXMONTH_OPEN_PRICE_ID", "price_gb_so")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "GB") == "price_gb_m"
    assert billing._resolve_price_id("sixmonth", True, "GB") == "price_gb_so"


def test_resolve_price_id_unknown_country_falls_back_jp(monkeypatch):
    monkeypatch.setenv("STRIPE_MONTHLY_PRICE_ID", "price_jp_m")
    billing = importlib.import_module("routers.billing")
    assert billing._resolve_price_id("monthly", False, "ZZ") == "price_jp_m"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_billing_country.py -v`
Expected: FAIL — `_resolve_price_id()` takes 2 args, not 3

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/billing.py`, replace `_resolve_price_id` (lines 33-45) with a country-aware, env-dynamic version (read env at call time so per-country vars resolve):
```python
def _resolve_price_id(plan: str, data_open: bool, country_code: str = "JP") -> str:
    """plan + data_open + country_code 조합으로 Stripe price_id 반환.

    JP 는 기존 변수명(STRIPE_<PLAN>[_OPEN]_PRICE_ID) 하위호환,
    그 외 국가는 prefix 적용(STRIPE_<PREFIX>_<PLAN>[_OPEN]_PRICE_ID).
    """
    from config.countries import stripe_prefix
    prefix = stripe_prefix(country_code)          # JP → "JP", GB → "GB"
    plan_key = plan.upper()
    open_seg = "_OPEN" if data_open else ""
    if prefix == "JP":
        var = f"STRIPE_{plan_key}{open_seg}_PRICE_ID"        # 기존 변수명 유지
    else:
        var = f"STRIPE_{prefix}_{plan_key}{open_seg}_PRICE_ID"
    return os.getenv(var, "")
```

Delete the now-unused module-level constants (lines 22-30, the six `STRIPE_*_PRICE_ID = os.getenv(...)`), since resolution is now dynamic.

Update the call site in `create_checkout_session` (line 125):
```python
    price_id = _resolve_price_id(plan, data_open, store.country_code)
```

In `backend/CLAUDE.md`, under the `.env` 표, add rows:
```
STRIPE_GB_MONTHLY_PRICE_ID=...     # GBP 월 구독 (영국)
STRIPE_GB_SIXMONTH_PRICE_ID=...    # GBP 6개월
STRIPE_GB_YEARLY_PRICE_ID=...      # GBP 연
STRIPE_GB_MONTHLY_OPEN_PRICE_ID=...   # GBP 월 (data-open)
STRIPE_GB_SIXMONTH_OPEN_PRICE_ID=...
STRIPE_GB_YEARLY_OPEN_PRICE_ID=...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_billing_country.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/billing.py backend/CLAUDE.md backend/tests/test_billing_country.py
git commit -m "feat(billing): 국가별 Stripe Price ID 해석 (Task 5)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Task 6: 프론트 통화화 — `MagnoliaCartModal.jsx`

**Files:**
- Modify: `frontend-react/src/components/magnolia/MagnoliaCartModal.jsx`

> 프론트 단위테스트 인프라 없음 → `npm run lint` + 수동 확인.

- [ ] **Step 1: 통화 메타를 store 데이터에서 받기**

컴포넌트가 store 객체를 받는 지점에서 통화 메타를 분해. props/조회된 store 응답에 추가된 `currency`, `currency_decimals`, `currency_symbol` 를 사용. 폴백 포함:
```jsx
const currency = storeData?.currency || 'JPY'
const currencySymbol = storeData?.currency_symbol || '¥'
const currencyDecimals = storeData?.currency_decimals ?? 0
const fmt = (minor) =>
    `${currencySymbol}${(minor / Math.pow(10, currencyDecimals)).toLocaleString(undefined, {
        minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}`
```

- [ ] **Step 2: Square SDK 통화 하드코딩 제거**

`MagnoliaCartModal.jsx:123` `currencyCode: 'JPY'` → `currencyCode: currency`.

- [ ] **Step 3: `¥` 하드코딩을 `fmt(...)` 로 치환**

라인 363, 417, 450, 462, 470, 480, 488 의 `¥{...}` 표시를 `fmt(...)` 로 교체 (금액이 이미 최소단위 정수라는 전제). 0원 검증 메시지(`'決済金額が0円...'`)는 통화 무관 일반 문구로 유지하거나 영어 폴백 병기.

- [ ] **Step 4: 검증**

Run: `cd frontend-react && npm run lint`
Expected: 통화 관련 변경부에 신규 lint 에러 없음.
수동: JPY 매장은 `¥1,000`, GBP 매장은 `£10.00` 표시 확인 (개발 서버).

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/magnolia/MagnoliaCartModal.jsx
git commit -m "feat(cart): 통화 인식 표시 + Square currencyCode 동적화 (Task 6)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Task 7: 프론트 — AdminPaymentView 결제수단 필터 + 가입 국가 선택

**Files:**
- Modify: `frontend-react/src/views/AdminPaymentView.jsx`
- Modify: 가입 폼 뷰 (`OwnerSignupView.jsx` 또는 signup 폼; `grep -rl "/api/stores/signup" frontend-react/src` 로 확정)

- [ ] **Step 1: AdminPaymentView 트랙 필터**

store 응답의 `allowed_payment_methods`(Task 4에서 노출되거나, `country_code` 로 프론트 매핑) 기준으로 `tracks` 배열을 필터. 영국(GB) → `SQUARE_INTEGRATED` + `PAY_AT_COUNTER` 만 노출.
> Task 4 에서 store GET 응답에 `allowed_payment_methods` 도 함께 내려주도록 추가하면(권장) 프론트는 그대로 필터만. 한 줄 추가:
> `data["allowed_payment_methods"] = allowed_methods(store.country_code)` (stores.py, `from config.countries import allowed_methods` 임포트).

```jsx
const allowed = storeData?.allowed_payment_methods || ['SQUARE_INTEGRATED','PAYPAY_DIRECT','PAY_AT_COUNTER']
const visibleTracks = tracks.filter(t => allowed.includes(t.key))
// 렌더에서 tracks → visibleTracks 사용
```

- [ ] **Step 2: 가입 폼 국가 선택 드롭다운**

가입 폼에 국가 select 추가 (현재 카탈로그: 日本/JP, United Kingdom/GB), state 에 `country_code` 보관, signup POST body 에 `country_code` 포함.
```jsx
<select value={countryCode} onChange={e => setCountryCode(e.target.value)}>
  <option value="JP">日本 (JPY)</option>
  <option value="GB">United Kingdom (GBP)</option>
</select>
```
signup 요청 body 에 `country_code: countryCode` 추가.

- [ ] **Step 3: 검증**

Run: `cd frontend-react && npm run lint`
수동: GB 선택 가입 → AdminPaymentView 에 PayPay 트랙 미노출 확인.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/views/AdminPaymentView.jsx frontend-react/src/views/OwnerSignupView.jsx
git commit -m "feat(admin): 국가별 결제수단 필터 + 가입 국가 선택 (Task 7)"
```

**⏸ GPT 5.5 리뷰 체크포인트 — 최종.**

---

## Task 8: 결제수단 국가 강제 (백엔드 쓰기 경계) — `admin.py`

> **(GPT 2차 리뷰 #2)** UI 숨김(Task 7)만으로는 강제가 아니다. 결제수단 저장
> 엔드포인트가 매장 국가의 `allowed_methods` 를 실제로 검증해야 한다.
> GB 매장이 API 로 직접 `PAYPAY_DIRECT` 를 설정하지 못하게 한다.

**Files:**
- Modify: `backend/routers/admin.py` (payment-settings PATCH, line 492-493)
- Test: `backend/tests/test_payment_method_country.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_payment_method_country.py
import pytest
from config.countries import allowed_methods


def test_gb_disallows_paypay_in_catalog():
    assert "PAYPAY_DIRECT" not in allowed_methods("GB")


def test_validate_method_helper_rejects_disallowed():
    from routers.admin import _assert_method_allowed  # Task 8 에서 추가
    # GB 에서 PAYPAY_DIRECT → 거부
    with pytest.raises(Exception):
        _assert_method_allowed("PAYPAY_DIRECT", "GB")
    # GB 에서 SQUARE_INTEGRATED → 통과 (예외 없음)
    _assert_method_allowed("SQUARE_INTEGRATED", "GB")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_payment_method_country.py -v`
Expected: FAIL — `ImportError: cannot import name '_assert_method_allowed'`

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/admin.py`, add helper + import:
```python
from config.countries import allowed_methods

def _assert_method_allowed(method_value: str, country_code: str) -> None:
    if method_value not in allowed_methods(country_code):
        raise HTTPException(
            status_code=422,
            detail=f"{method_value} is not available in {country_code}",
        )
```
Update the payment-method write (line 492-493) to validate against the store's country:
```python
    if body.payment_method_type:
        _assert_method_allowed(body.payment_method_type, admin_store.country_code)
        ps.payment_method_type = PaymentMethodType(body.payment_method_type)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_payment_method_country.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/admin.py backend/tests/test_payment_method_country.py
git commit -m "feat(payment): 결제수단 국가 강제 (백엔드 쓰기 경계, Task 8)"
```

**⏸ GPT 5.5 리뷰 체크포인트.**

---

## Self-Review 결과 (작성자 점검)

- **Spec 커버리지**: §1 카탈로그→T2 · §2 모델/마이그레이션→T3 · §3 통화 유틸·하드코딩 제거→T1+T6 · §4 구독료→T5 · §5 Admin/UI→T4(시드)+T6+T7. 전 항목 매핑됨.
- **플레이스홀더**: 백엔드 전 스텝 실제 코드 포함. 프론트는 라인 지정 + 코드 스니펫. `.env` GB Price ID 는 운영자 입력값(의도된 빈값).
- **타입/이름 일관성**: `_resolve_price_id(plan, data_open, country_code)` · `currency_of/decimals_of/symbol_of/allowed_methods/default_tax/default_languages/stripe_prefix` · `_build_store_from_signup_fields` — 정의/사용 일치 확인.
- **범위**: A+E 한정. B(SumUp/Stripe)·C(번역)·D(GDPR) 제외 — 별도 spec.

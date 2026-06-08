# S1 — 발견→선결제 동선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디스커버리(`/discover`)에서 온라인 선결제 가능 가게에 한해 한 번의 탭으로 그 가게의 테이크아웃 선결제 페이지로 직행하게 한다.

**Architecture:** `can_accept_takeout` 판정을 순수함수 헬퍼(`backend/utils/takeout.py`) 하나로 모아 `stores.py`·`discover.py`가 공유한다. discover 3개 엔드포인트가 `can_accept_takeout`·`slug`를 응답에 추가하고(공간쿼리는 토큰 원문 대신 `IS NOT NULL` 불린만 노출), `DiscoverView.jsx`가 그 값으로 테이크아웃 CTA/뱃지를 조건부 렌더한다. 결제 로직은 기존 `/{slug}/takeout` 플로우로 딥링크만 한다.

**Tech Stack:** FastAPI + SQLModel(PostgreSQL/PostGIS), React + Vite, pytest(신규 도입), uv.

> 상위 문서: [WORKPLAN.md](./WORKPLAN.md) · [S1-design.md](./S1-design.md)
> 하네스: R2(File Fence)·R3(결제 불가침)·R6(공개 API 보안)·R7(Green Gate) 준수.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `backend/utils/takeout.py` | 테이크아웃/온라인결제 판정 단일 진실 공급원 (순수함수) | **신규** |
| `backend/tests/conftest.py` | pytest가 `from utils...` 를 import하도록 backend를 sys.path에 추가 | **신규** |
| `backend/tests/test_takeout.py` | 헬퍼 단위 테스트 | **신규** |
| `backend/routers/stores.py` | 인라인 판정 → 헬퍼 호출로 치환 (응답 키 불변) | 수정 |
| `backend/routers/discover.py` | `/nearby`·`/stores`·`/menus`에 `can_accept_takeout`·`slug` 추가 + `/nearby` `takeout_only` | 수정 |
| `frontend-react/src/views/DiscoverView.jsx` | 카드 테이크아웃 CTA/뱃지/필터 | 수정 |

**불가침(수정 금지):** `MagnoliaCartModal.jsx`, `OrderView.jsx`(props), `orders.py`(결제), `models.py`, DB 마이그레이션.

---

## Task 1: 판정 헬퍼 + 단위 테스트 (TDD)

**Files:**
- Create: `backend/utils/takeout.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_takeout.py`

- [ ] **Step 1: conftest 작성 (import 경로 보장)**

`backend/tests/conftest.py`:
```python
import os
import sys

# 앱 코드가 'from utils...', 'from models...' 형태로 import하므로
# backend/ 디렉토리를 import 경로 맨 앞에 추가한다.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_takeout.py`:
```python
from types import SimpleNamespace
from utils.takeout import (
    can_accept_takeout,
    can_accept_takeout_from_store,
    has_online_payment_from_store,
)


def _ps(method="SQUARE_INTEGRATED", sq_tok=None, sq_loc=None, paypay=None):
    return SimpleNamespace(
        payment_method_type=method,
        square_access_token=sq_tok,
        square_location_id=sq_loc,
        paypay_api_key=paypay,
    )


def test_store_level_square_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=True,
        ps_method_type=None, has_ps_square=False, has_ps_paypay=False,
    ) is True


def test_ps_square_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="SQUARE_INTEGRATED", has_ps_square=True, has_ps_paypay=False,
    ) is True


def test_ps_paypay_enables():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="PAYPAY_DIRECT", has_ps_square=False, has_ps_paypay=True,
    ) is True


def test_counter_pay_blocks_even_with_creds():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="PAY_AT_COUNTER", has_ps_square=True, has_ps_paypay=True,
    ) is False


def test_no_online_payment_disabled():
    assert can_accept_takeout(
        takeout_enabled=True, has_store_square=False,
        ps_method_type="SQUARE_INTEGRATED", has_ps_square=False, has_ps_paypay=False,
    ) is False


def test_takeout_off_disabled():
    assert can_accept_takeout(
        takeout_enabled=False, has_store_square=True,
        ps_method_type=None, has_ps_square=False, has_ps_paypay=False,
    ) is False


def test_from_store_square_only():
    store = SimpleNamespace(
        takeout_enabled=True, square_access_token="t", square_location_id="l",
        payment_settings=None,
    )
    assert can_accept_takeout_from_store(store) is True
    assert has_online_payment_from_store(store) is True


def test_from_store_counter_blocked():
    store = SimpleNamespace(
        takeout_enabled=True, square_access_token=None, square_location_id=None,
        payment_settings=_ps(method="PAY_AT_COUNTER", sq_tok="t", sq_loc="l"),
    )
    assert can_accept_takeout_from_store(store) is False


def test_has_online_payment_independent_of_takeout_flag():
    # 온라인결제는 되지만 takeout이 꺼진 경우: has_online_payment=True, can_accept=False
    store = SimpleNamespace(
        takeout_enabled=False, square_access_token="t", square_location_id="l",
        payment_settings=None,
    )
    assert has_online_payment_from_store(store) is True
    assert can_accept_takeout_from_store(store) is False
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `uv run --with pytest pytest backend/tests/test_takeout.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'utils.takeout'` (또는 import error)

- [ ] **Step 4: 헬퍼 구현**

`backend/utils/takeout.py`:
```python
"""테이크아웃 선결제 가능 여부 판정 — 단일 진실 공급원.

discover / stores 등 여러 라우터가 동일 기준을 공유하도록 한 곳에 모은다.
토큰 '원문'이 아니라 '존재 여부 불린'만 받아 판정하므로, 공개 API(discover)
공간쿼리에서 암호화 토큰을 SELECT하지 않아도 된다(보안 R6).
"""
from typing import Any, Optional


def _method_value(v: Any) -> Optional[str]:
    """PaymentMethodType enum 또는 문자열 → 문자열 값. None은 그대로 반환."""
    if v is None:
        return None
    return getattr(v, "value", v)


def has_online_payment(
    *,
    has_store_square: bool,
    ps_method_type: Optional[str],
    has_ps_square: bool,
    has_ps_paypay: bool,
) -> bool:
    """온라인 결제수단이 연동되어 있는가.

    = Store 레벨 Square  OR  PaymentSettings(非 PAY_AT_COUNTER, Square 또는 PayPay).
    """
    method = _method_value(ps_method_type)
    has_ps = (
        method is not None
        and method != "PAY_AT_COUNTER"
        and (has_ps_square or has_ps_paypay)
    )
    return bool(has_store_square or has_ps)


def can_accept_takeout(
    *,
    takeout_enabled: bool,
    has_store_square: bool,
    ps_method_type: Optional[str],
    has_ps_square: bool,
    has_ps_paypay: bool,
) -> bool:
    """테이크아웃 ON + 온라인 결제수단 연동 → 선결제 주문 수신 가능."""
    return bool(
        takeout_enabled
        and has_online_payment(
            has_store_square=has_store_square,
            ps_method_type=ps_method_type,
            has_ps_square=has_ps_square,
            has_ps_paypay=has_ps_paypay,
        )
    )


def _store_flags(store: Any) -> dict:
    """ORM Store(+ payment_settings 로딩됨)에서 판정용 불린 플래그를 뽑는다."""
    ps = getattr(store, "payment_settings", None)
    return dict(
        has_store_square=bool(
            getattr(store, "square_access_token", None)
            and getattr(store, "square_location_id", None)
        ),
        ps_method_type=getattr(ps, "payment_method_type", None) if ps else None,
        has_ps_square=bool(ps and ps.square_access_token and ps.square_location_id),
        has_ps_paypay=bool(ps and ps.paypay_api_key),
    )


def can_accept_takeout_from_store(store: Any) -> bool:
    return can_accept_takeout(
        takeout_enabled=bool(getattr(store, "takeout_enabled", False)),
        **_store_flags(store),
    )


def has_online_payment_from_store(store: Any) -> bool:
    return has_online_payment(**_store_flags(store))
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `uv run --with pytest pytest backend/tests/test_takeout.py -v`
Expected: PASS (9 passed)

- [ ] **Step 6: 커밋**

```bash
git add backend/utils/takeout.py backend/tests/conftest.py backend/tests/test_takeout.py
git commit -m "feat(takeout): 선결제 가능 판정 공통 헬퍼 + 단위 테스트 (S1 T1)"
```

---

## Task 2: stores.py 를 헬퍼로 치환 (응답 불변)

**Files:**
- Modify: `backend/routers/stores.py:234-244`

> ⚠️ 기존 코드는 `str(ps_obj.payment_method_type)`를 비교했는데 enum mixin의 `__str__`가
> `"PaymentMethodType.PAY_AT_COUNTER"`를 돌려줄 수 있어 PAY_AT_COUNTER 제외가 어긋날 수 있다.
> 헬퍼는 `.value`로 정규화하므로 이 엣지가 **정정**된다 (의도된 개선). 응답 키는 동일하다.

- [ ] **Step 1: 인라인 블록 치환**

`backend/routers/stores.py` 의 아래 블록 (234~244):
```python
    # ── can_accept_takeout: 프론트에서 테이크아웃 가능 여부 판단용 ──
    # 조건: (1) Admin이 takeout_enabled=true로 켜두었고, (2) 온라인 결제수단이 설정되어 있어야 함
    has_square = bool(store.square_access_token and store.square_location_id)
    ps_obj = store.payment_settings
    has_payment_ps = ps_obj and str(ps_obj.payment_method_type) != "PAY_AT_COUNTER" and (
        (ps_obj.square_access_token and ps_obj.square_location_id) or
        ps_obj.paypay_api_key
    )
    has_online_payment = bool(has_square or has_payment_ps)
    data["has_online_payment"] = has_online_payment
    data["can_accept_takeout"] = bool(store.takeout_enabled and has_online_payment)
```
를 다음으로 교체:
```python
    # ── can_accept_takeout: 프론트에서 테이크아웃 가능 여부 판단용 ──
    # 단일 진실 공급원: utils.takeout (discover 라우터와 동일 로직 공유)
    from utils.takeout import can_accept_takeout_from_store, has_online_payment_from_store
    data["has_online_payment"] = has_online_payment_from_store(store)
    data["can_accept_takeout"] = can_accept_takeout_from_store(store)
```

- [ ] **Step 2: import 회귀 스모크**

Run: `uv run python -c "import ast,sys; ast.parse(open('backend/routers/stores.py',encoding='utf-8').read()); print('stores.py OK')"`
Expected: `stores.py OK` (구문 오류 없음)

- [ ] **Step 3: 헬퍼 테스트 재실행 (회귀 없음 확인)**

Run: `uv run --with pytest pytest backend/tests/ -v`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/routers/stores.py
git commit -m "refactor(stores): can_accept_takeout 판정을 공통 헬퍼로 치환 (S1 T2)"
```

---

## Task 3: discover `/nearby` — 필드 추가 + takeout_only 필터

**Files:**
- Modify: `backend/routers/discover.py` (`discover_nearby` 함수, 약 227-323)

- [ ] **Step 1: 임포트 추가**

`discover.py` 상단 import 블록에 추가:
```python
from utils.takeout import can_accept_takeout
```

- [ ] **Step 2: 함수 시그니처에 takeout_only 파라미터 추가**

`discover_nearby(...)` 파라미터 목록에서 `food_rescue_only` 다음 줄에 추가:
```python
    takeout_only: bool = Query(False, description="온라인 선결제 가능 매장만"),
```

- [ ] **Step 3: SQL에 LEFT JOIN + 불린 플래그 추가**

`sql = text(f"""...""")` 안에서 SELECT 절의 `s.business_hours,` 다음에 아래 5줄을 추가:
```sql
            s.takeout_enabled,
            (s.square_access_token IS NOT NULL AND s.square_location_id IS NOT NULL) AS has_store_square,
            ps.payment_method_type AS ps_method_type,
            (ps.square_access_token IS NOT NULL AND ps.square_location_id IS NOT NULL) AS has_ps_square,
            (ps.paypay_api_key IS NOT NULL) AS has_ps_paypay,
```
그리고 `FROM store s` 줄을 다음으로 교체:
```sql
        FROM store s
        LEFT JOIN paymentsettings ps ON ps.store_id = s.id
```

- [ ] **Step 4: 결과 매핑에 can_accept_takeout 추가 + 필터**

`for r in rows:` 루프의 `items.append({...})` 에서 `"google_maps_url": ...` 다음 줄에 추가:
```python
            "can_accept_takeout": can_accept_takeout(
                takeout_enabled=bool(r["takeout_enabled"]),
                has_store_square=bool(r["has_store_square"]),
                ps_method_type=r["ps_method_type"],
                has_ps_square=bool(r["has_ps_square"]),
                has_ps_paypay=bool(r["has_ps_paypay"]),
            ),
```
그리고 루프 종료 후 `return {...}` 직전에 takeout_only 필터 추가:
```python
    if takeout_only:
        # 참고: SQL LIMIT 20 이후의 파이썬 필터이므로, 밀집 지역에선 20개 미만이 나올 수 있음(v1 허용).
        items = [it for it in items if it["can_accept_takeout"]]
```

- [ ] **Step 5: 구문 검증**

Run: `uv run python -c "import ast; ast.parse(open('backend/routers/discover.py',encoding='utf-8').read()); print('discover.py OK')"`
Expected: `discover.py OK`

- [ ] **Step 6: 커밋**

```bash
git add backend/routers/discover.py
git commit -m "feat(discover): /nearby 에 can_accept_takeout + takeout_only 필터 (S1 T3)"
```

---

## Task 4: discover `/stores` + `/menus` — 필드 추가

**Files:**
- Modify: `backend/routers/discover.py` (`discover_menus` 약 62-175, `discover_stores` 약 178-224)

- [ ] **Step 1: 임포트 보강**

Task 3에서 추가한 import 줄을 다음으로 확장:
```python
from utils.takeout import can_accept_takeout, can_accept_takeout_from_store
```
(`selectinload` 는 discover.py 상단에 이미 import되어 있음 — 확인만.)

- [ ] **Step 2: `/menus` — payment_settings 즉시로딩 + 가게별 판정 맵**

`discover_menus` 의 `store_query = select(Store).where(Store.allow_public_listing == True)` 를:
```python
    store_query = (
        select(Store)
        .where(Store.allow_public_listing == True)
        .options(selectinload(Store.payment_settings))
    )
```
그리고 `store_map = {s.id: s for s in stores}` 다음 줄에 추가:
```python
    store_takeout = {s.id: can_accept_takeout_from_store(s) for s in stores}
```
이어서 메뉴 항목을 만드는 `items.append({...})` 의 `"created_at": ...` 다음 줄에 추가:
```python
            "slug": s.slug,
            "can_accept_takeout": store_takeout.get(s.id, False),
```

- [ ] **Step 3: `/stores` — 즉시로딩 + 필드 추가**

`discover_stores` 의 `query = select(Store).where(Store.allow_public_listing == True)` 를:
```python
    query = (
        select(Store)
        .where(Store.allow_public_listing == True)
        .options(selectinload(Store.payment_settings))
    )
```
그리고 `items.append({...})` 의 `"orders_per_table": ...` 다음 줄에 추가:
```python
            "slug": s.slug,
            "can_accept_takeout": can_accept_takeout_from_store(s),
```

- [ ] **Step 4: 구문 검증**

Run: `uv run python -c "import ast; ast.parse(open('backend/routers/discover.py',encoding='utf-8').read()); print('discover.py OK')"`
Expected: `discover.py OK`

- [ ] **Step 5: 커밋**

```bash
git add backend/routers/discover.py
git commit -m "feat(discover): /stores·/menus 에 slug + can_accept_takeout 추가 (S1 T4)"
```

---

## Task 5: DiscoverView 근처 카드 — 테이크아웃 CTA·뱃지·필터

**Files:**
- Modify: `frontend-react/src/views/DiscoverView.jsx` (`StoreCard` 23-95, `NearbyPanel` 필터바·검색)

- [ ] **Step 1: StoreCard 우측 뱃지 컬럼에 "事前決済OK" 뱃지 추가**

`StoreCard` 의 거리 뱃지 컬럼(`<div className="flex flex-col items-end gap-1 flex-shrink-0">`) 안,
food_rescue 뱃지 블록 다음에 추가:
```jsx
            {store.can_accept_takeout && (
              <span className="text-[10px] font-black bg-[#c21e2f] text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
                🛍 事前決済OK
              </span>
            )}
```

- [ ] **Step 2: 액션 영역을 테이크아웃 우선 2버튼 구조로 교체**

`StoreCard` 의 아래 블록:
```jsx
        {/* アクション */}
        <div className="flex gap-2 pt-1">
          <a
            href={store.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
          >
            <MSI name="map" className="text-base" />
            地図で見る
          </a>
          {miniUrl && (
            <a
              href={miniUrl}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#c21e2f] hover:bg-[#a01828] text-white font-bold text-xs transition-colors"
            >
              <MSI name="storefront" className="text-base" />
              お店へ
            </a>
          )}
        </div>
```
를 다음으로 교체:
```jsx
        {/* アクション */}
        <div className="space-y-2 pt-1">
          {store.can_accept_takeout && store.slug && (
            <a
              href={`/${store.slug}/takeout`}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#c21e2f] hover:bg-[#a01828] text-white font-black text-xs transition-colors"
            >
              <MSI name="shopping_bag" className="text-base" />
              テイクアウト注文（事前決済）
            </a>
          )}
          <div className="flex gap-2">
            <a
              href={store.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
            >
              <MSI name="map" className="text-base" />
              地図で見る
            </a>
            {miniUrl && (
              <a
                href={miniUrl}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <MSI name="storefront" className="text-base" />
                お店へ
              </a>
            )}
          </div>
        </div>
```

- [ ] **Step 3: NearbyPanel 에 takeoutOnly 상태 추가**

`NearbyPanel` 의 `const [foodRescueOnly, setFoodRescueOnly] = useState(false)` 다음 줄에 추가:
```jsx
  const [takeoutOnly, setTakeoutOnly] = useState(false)
```

- [ ] **Step 4: 검색 호출 params + deps 에 takeout_only 반영**

`searchNearby` 의 axios params 객체를:
```jsx
        params: { lat: coords.lat, lng: coords.lng, radius, food_rescue_only: foodRescueOnly, takeout_only: takeoutOnly },
```
로 바꾸고, 같은 `useCallback` 의 deps 배열을 `[coords, radius, foodRescueOnly, takeoutOnly]` 로,
자동 재검색 `useEffect` 의 deps 배열도 `[coords, radius, foodRescueOnly, takeoutOnly]` 로 변경.

- [ ] **Step 5: 필터바에 "テイクアウト可のみ" 토글 추가**

`foodRescueOnly` 토글 버튼(`割引中のみ`) 다음에 추가:
```jsx
        {/* テイクアウト可フィルター */}
        <button
          onClick={() => setTakeoutOnly(v => !v)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
            takeoutOnly
              ? 'bg-[#c21e2f] text-white border-[#c21e2f] shadow-md'
              : 'bg-white text-slate-600 border-slate-200 hover:border-[#c21e2f]'
          }`}
        >
          <span>🛍</span>
          事前決済可のみ
        </button>
```

- [ ] **Step 6: 커밋**

```bash
git add frontend-react/src/views/DiscoverView.jsx
git commit -m "feat(discover-ui): 근처 카드 테이크아웃 CTA·뱃지·事前決済可 필터 (S1 T5)"
```

---

## Task 6: DiscoverView 랭킹 모드 — 선택 가게 테이크아웃 버튼

**Files:**
- Modify: `frontend-react/src/views/DiscoverView.jsx` (선택 가게 플로팅 바 493-503)

- [ ] **Step 1: 플로팅 바에 테이크아웃 버튼 추가**

아래 블록:
```jsx
            {selectedStore && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                <div className="flex items-center gap-2 bg-[#1b1b1d] text-white px-5 py-3 rounded-full shadow-xl text-sm font-bold">
                  <MSI name="store" className="text-base" />
                  このお店のメニューを表示中
                  <button onClick={() => setSelectedStore(null)} className="ml-1 opacity-70 hover:opacity-100">
                    <MSI name="close" className="text-base" />
                  </button>
                </div>
              </div>
            )}
```
를 다음으로 교체:
```jsx
            {selectedStore && (() => {
              const sel = items.find(it => it.store_id === selectedStore)
              return (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-[#1b1b1d] text-white px-5 py-3 rounded-full shadow-xl text-sm font-bold">
                    <MSI name="store" className="text-base" />
                    このお店のメニューを表示中
                    <button onClick={() => setSelectedStore(null)} className="ml-1 opacity-70 hover:opacity-100">
                      <MSI name="close" className="text-base" />
                    </button>
                  </div>
                  {sel?.can_accept_takeout && sel?.slug && (
                    <a
                      href={`/${sel.slug}/takeout`}
                      className="flex items-center gap-1.5 bg-[#c21e2f] hover:bg-[#a01828] text-white px-5 py-3 rounded-full shadow-xl text-sm font-black"
                    >
                      <MSI name="shopping_bag" className="text-base" />
                      テイクアウト注文
                    </a>
                  )}
                </div>
              )
            })()}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend-react/src/views/DiscoverView.jsx
git commit -m "feat(discover-ui): 랭킹 선택 가게에 테이크아웃 직행 버튼 (S1 T6)"
```

---

## Task 7: Green Gate + 동작 확인 + 보고

**Files:** (검증 전용 — 코드 변경 없음, 발견 시 해당 Task로 복귀)

- [ ] **Step 1: 백엔드 헬퍼 테스트**

Run: `uv run --with pytest pytest backend/tests/ -v`
Expected: PASS (9 passed)

- [ ] **Step 2: 프론트 lint**

Run: `npm --prefix frontend-react run lint`
Expected: 신규 에러 없음 (기존 경고는 무관)

- [ ] **Step 3: 프론트 build**

Run: `npm --prefix frontend-react run build`
Expected: 빌드 성공, `frontend-react/dist/` 생성

- [ ] **Step 4: (DB 가용 시) 엔드포인트 스모크**

백엔드 기동 후:
```bash
curl -s "http://localhost:8003/api/public/discover/stores?limit=3" | python -m json.tool
```
확인: 응답 항목에 `can_accept_takeout`·`slug` 존재, `square_access_token`/`paypay_api_key` 등 토큰 키 **부재**.
(로컬 DB 미가용 시: 헬퍼 단위테스트 + 코드리뷰로 갈음하고 보고서에 명시.)

- [ ] **Step 5: /security-review 1회** (공개 API 노출 점검)

- [ ] **Step 6: 최종 커밋 (필요 시 잔여 변경)**

```bash
git add -A
git commit -m "chore(discover): S1 Green Gate 통과 (테스트/lint/build) (S1 T7)"
```

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지**: 헬퍼(§3)=T1, stores 재사용=T2, /nearby(§4.1)=T3, /stores·/menus(§4.2)=T4, 카드 CTA·뱃지·필터(§5)=T5·T6, 보안(§8)=T3(불린만)·T7-S5, 테스트(§9)=T1·T7. ✅ 누락 없음.
- **플레이스홀더**: 없음 (모든 코드 스텝에 실제 코드 포함).
- **타입/이름 일관성**: `can_accept_takeout`·`has_online_payment`·`*_from_store`·`_method_value`·`_store_flags` 전 Task 일치. 응답 필드 `can_accept_takeout`·`slug` 프론트(`store.can_accept_takeout`,`store.slug`,`item.can_accept_takeout`,`item.slug`,`sel.slug`)와 일치.
- **주의**: `paymentsettings` 테이블명·`payment_method_type` 저장문자열은 구현 중 1회 확인(설계 §4.3). 불일치 시 T3 SQL/T1 비교문자열 조정.

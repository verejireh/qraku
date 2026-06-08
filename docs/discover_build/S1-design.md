# S1 설계 스펙 — 발견 → 선결제 동선 완성

> 브랜치: `discover_build` · 작성일: 2026-06-08 · 스테이지: **S1**
> 상위 문서: [WORKPLAN.md](./WORKPLAN.md)

---

## 1. 개요 / 목표

디스커버리(`/discover`)에서 가게를 발견한 손님이 **온라인 선결제 가능 가게**에 한해
한 번의 탭으로 그 가게의 테이크아웃 주문 페이지로 직행하여, **기존** Square/PayPay 선결제
플로우로 결제까지 끊김 없이 도달하게 한다.

- **손님 가치**: "근처 가게 발견 → 줄 안 서고 폰으로 미리 결제 → 픽업"이 한 흐름으로 연결.
- **핵심 원칙**: 결제 로직은 **새로 만들지 않는다**. 기존 `/{slug}/takeout` 플로우로 **딥링크**만 한다.

### Non-Goals (S1 범위 밖)
- 현장결제(PAY_AT_COUNTER) 테이크아웃 및 노쇼 게이팅 → **전면 보류** (별도 스테이지).
- 사장님 Square 연동 온보딩 가이드 → **S1.5**로 분리.
- 지도 UI / 실시간 대기시간 / LINE 봇 → S2~S4.

---

## 2. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 카드 진입 | **버튼 2개** — `[お店へ]`(가게소개) + `[テイクアウト注文]`(선결제 직행) |
| 노출 대상 | **온라인 선결제 가능 가게만** 테이크아웃 버튼/뱃지 노출 |
| 현장결제 가게 | 테이크아웃 버튼 미노출 (`[お店へ]`만) |
| 목록 정책 | **(A)** 모든 공개 가게는 그대로 노출, 테이크아웃 버튼만 조건부 + "テイクアウト可のみ" 필터 제공 |

---

## 3. 단일 진실 판정 — `can_accept_takeout`

기존 [stores.py:234](../../backend/routers/stores.py) 로직을 **공통 헬퍼로 추출**하여 재사용한다.

```
can_accept_takeout = takeout_enabled
                     AND has_online_payment

has_online_payment =
    (Store.square_access_token AND Store.square_location_id)            # 레거시 Store 레벨
    OR (PaymentSettings.payment_method_type != 'PAY_AT_COUNTER' AND
         ( (PaymentSettings.square_access_token AND PaymentSettings.square_location_id)
           OR PaymentSettings.paypay_api_key ))
```

### 3.1 헬퍼 설계 — `backend/utils/takeout.py` (신규)

토큰 **원문이 아니라 "존재 여부 불린"만** 받아 판정한다. → discover 공간쿼리에서
암호화 토큰을 SELECT하지 않아도 되어 민감정보 노출이 없다(R6).

```python
def can_accept_takeout(
    *, takeout_enabled: bool,
    has_store_square: bool,                 # Store.square_access_token & square_location_id 둘 다 존재
    ps_method_type: str | None,             # PaymentSettings.payment_method_type (없으면 None)
    has_ps_square: bool,                    # PS.square_access_token & square_location_id 둘 다 존재
    has_ps_paypay: bool,                    # PS.paypay_api_key 존재
) -> bool:
    has_ps = (ps_method_type is not None
              and ps_method_type != "PAY_AT_COUNTER"
              and (has_ps_square or has_ps_paypay))
    return bool(takeout_enabled and (has_store_square or has_ps))
```

- `stores.py`는 이 헬퍼를 호출하도록 **내부 치환만** 한다 (GET 응답 구조 불변, R3).
- ORM 경로용 편의 래퍼 `can_accept_takeout_from_store(store)` 추가 (Store + payment_settings → bool).

---

## 4. 백엔드 변경 — `backend/routers/discover.py`

세 엔드포인트 응답 항목에 **`can_accept_takeout`(bool)** 과 **`slug`** 를 추가한다.

### 4.1 `/nearby` (공간쿼리 — raw SQL 유지)
- 기존 `ST_DWithin` SQL에 `LEFT JOIN paymentsettings ps ON ps.store_id = s.id` 추가.
- SELECT에 **불린 플래그만** 추가 (토큰 원문 금지):
  ```sql
  s.takeout_enabled,
  (s.square_access_token IS NOT NULL AND s.square_location_id IS NOT NULL) AS has_store_square,
  ps.payment_method_type AS ps_method_type,
  (ps.square_access_token IS NOT NULL AND ps.square_location_id IS NOT NULL) AS has_ps_square,
  (ps.paypay_api_key IS NOT NULL) AS has_ps_paypay
  ```
- 행마다 `utils.takeout.can_accept_takeout(...)` 호출 → 응답 dict에 `can_accept_takeout` 추가.
- (선택) 쿼리 파라미터 `takeout_only: bool = False` → true면 판정 결과 false 가게 제외.
  ※ 페이지네이션/LIMIT 20 영향 최소화를 위해 SQL 단계가 아니라 판정 후 파이썬 필터로 처리(구현 시 결정).

### 4.2 `/stores`, `/menus` (ORM)
- `select(Store)`에 `.options(selectinload(Store.payment_settings))` 추가.
- 각 store에 `can_accept_takeout_from_store(store)` 적용 → 항목에 `can_accept_takeout`, `slug` 추가.
  (`/menus`는 메뉴 항목에 store의 값을 함께 실어 보냄.)

### 4.3 테이블/필드 확인 (구현 시)
- PaymentSettings 테이블명(SQLModel 기본 소문자: `paymentsettings`) 실제 확인.
- `payment_method_type` DB 저장 문자열이 `'PAY_AT_COUNTER'`와 정확히 매칭되는지 TDD로 검증.

---

## 5. 프론트 변경 — `frontend-react/src/views/DiscoverView.jsx`

### 5.1 `StoreCard` (근처 가게 카드)
- `store.can_accept_takeout === true` 일 때:
  - 가게명 옆 🛍 "テイクアウト可" 뱃지.
  - 액션 영역: `[お店へ]`(기존) + **`[テイクアウト注文]`** → `href = /{slug}/takeout`.
- `false` 일 때: 기존처럼 `[お店へ]`만 (지도 링크는 유지).
- `slug` 없으면 테이크아웃 버튼 미표시(이동 대상 불명).

### 5.2 랭킹 카드 (/stores·/menus 결과)
- 동일 규칙으로 테이크아웃 CTA/뱃지 적용.

### 5.3 (선택) 필터
- 근처 패널 필터바에 "テイクアウト可のみ" 토글 → `/nearby?takeout_only=true`.

---

## 6. 데이터 흐름

```
/discover (카드: can_accept_takeout=true)
   └ [テイクアウト注文] → /{slug}/takeout
        └ OrderView(orderType=take_out)  [기존, 무수정]
             └ MagnoliaCartModal → Square/PayPay 선결제  [기존, 무수정]
                  └ 결제 완료 → 영수증/픽업 안내
```

---

## 7. 에러 / 엣지

| 상황 | 처리 |
|---|---|
| `slug` 없음 | 테이크아웃 버튼 미표시 |
| 연동 해제로 도중에 false 전환 | 카드 버튼 미표시(서버 응답 기준) + takeout 페이지 자체 `takeoutEnabled` 가드(이중 안전) |
| 비공개 가게 | `allow_public_listing=true` 만 노출 (기존 유지, R6) |
| PaymentSettings 없음(None) | `ps_method_type=None` → has_ps=false 처리 |

---

## 8. 보안 (R6)

- discover 공개 API는 인증 없음 → `allow_public_listing=true` 가게만 (기존).
- `/nearby` SQL은 **암호화 토큰 원문을 SELECT하지 않고** `IS NOT NULL` 불린만 사용 → 민감정보 비노출.
- 응답 신규 필드는 `can_accept_takeout`(bool), `slug`(이미 공개값) 뿐 — 추가 노출 위험 없음.
- 구현 후 `/security-review` 1회.

---

## 9. 테스트 계획 (TDD)

> ⚠️ **현실**: 이 저장소에는 **기존 테스트 스위트가 없다**(CLAUDE.md 명시). 따라서 S1에서
> 백엔드에 **최소 pytest 부트스트랩**(`backend/tests/conftest.py` + 헬퍼 테스트 1파일)을
> 함께 도입한다. 프론트는 별도 러너(vitest) 도입을 **하지 않고**(스코프 확대 방지)
> build/lint + 수동/Playwright 동작 확인으로 대체한다.

### 백엔드 (pytest — TDD 대상)
- `utils/takeout.py` 순수함수 단위 테스트(테스트하기 가장 쉬운 핵심):
  - Square(Store레벨)만 + takeout_on → true
  - PaymentSettings Square만 → true / PayPay만 → true
  - PAY_AT_COUNTER → false
  - 미연동 → false / takeout_off → false
- 엔드포인트(`/nearby`·`/stores`·`/menus`)는 **스모크 스크립트/수동**으로:
  응답에 `can_accept_takeout`·`slug` 존재 + **토큰류 키 부재** 확인.
  (DB 픽스처 기반 통합테스트는 인프라 비용이 커서 S1 범위 밖.)
- `takeout_only=true` 필터(구현 시): false 가게 제외 확인(스모크).

### 프론트 (수동 / 동작 확인)
- 카드 렌더: true → 2버튼 + 뱃지, false → 1버튼.
- 테이크아웃 버튼 href = `/{slug}/takeout`.

---

## 10. File Fence (R2)

| 파일 | 변경 |
|---|---|
| `backend/utils/takeout.py` | 신규 — 공통 판정 헬퍼 |
| `backend/routers/discover.py` | 응답 필드 추가(`can_accept_takeout`, `slug`), 선택 필터 |
| `backend/routers/stores.py` | 인라인 판정 → 헬퍼 호출로 치환만(응답 불변) |
| `frontend-react/src/views/DiscoverView.jsx` | 카드 CTA/뱃지/필터 |
| `backend/tests/conftest.py`, `backend/tests/test_takeout.py` | 신규 — 최소 pytest 부트스트랩 + 헬퍼 테스트 |
| `backend/pyproject.toml` 또는 `pytest.ini` | 필요 시 pytest 설정 추가만 |

**불가침**: `MagnoliaCartModal.jsx`, `OrderView.jsx`(props), `orders.py`(결제 경로), `models.py`, DB 마이그레이션.

---

## 11. 완료 기준 (DoD)

- [ ] `/discover` 카드(근처·랭킹)에서 선결제 가능 가게에 `[テイクアウト注文]` 노출 + `/{slug}/takeout` 직행
- [ ] 선결제 불가/현장결제 가게는 테이크아웃 버튼 미노출
- [ ] 직행 후 기존 Square/PayPay 선결제로 결제 완료 가능
- [ ] discover 응답에 토큰 원문 미노출 (보안)
- [ ] `allow_public_listing=true` 가게만 노출
- [ ] Green Gate: `npm run build` + `npm run lint` + 백엔드 스모크 통과

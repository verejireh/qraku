# 통화 표시 스윕 + 세율 로직 Implementation Plan (후속)

> **For agentic workers:** 이 플랜은 `feat/country-currency-layer`(main 머지 완료)의 **후속**이다.
> 인프라(국가 레이어·통화 유틸·결제/구독 경로)는 이미 main 에 있다. 이 플랜은 앱 전반의 잔존
> `¥` 하드코딩 표시와 영수증 하드코딩 세율을 통화/국가 인식으로 바꾼다.
> 작업 방식: 한 배치(태스크)마다 구현 → `npm run lint` + `npm run build` → **GPT 리뷰 체크포인트** → 커밋.

**브랜치:** `feat/currency-display-sweep` (origin/main 기준 생성)

**Goal:** GB(및 향후 EUR) 매장이 손님·스태프·admin 전 화면에서 올바른 통화/세율로 보이도록 한다. 현재는 결제 경로만 통화 정확하고, 메뉴/영수증/정산/대시보드 표시는 ¥ 하드코딩 + 영수증 세율 8% 하드코딩 상태.

---

## 이미 완료된 기반 (main 에 있음 — 재구현 금지)

- `backend/config/countries.py` — 국가 카탈로그(`currency_of`, `symbol_of`, `decimals_of`, `allowed_methods`, `default_tax`, `normalize_country`, `stripe_prefix`). 미지 코드 JP 폴백(읽기), `normalize_country`(쓰기 거부).
- `backend/utils/currency.py` — 최소단위/포맷 순수함수(`to_minor_units`, `round_to_minor_units`, `from_minor_units`, `format_amount`).
- `backend/routers/stores.py` GET `/stores/{id}` 응답에 `currency`, `currency_decimals`, `currency_symbol`, `allowed_payment_methods` 포함.
- **프론트 `src/config/currency.js`** — `currencyHelpers(meta)` → `{ symbol, decimals, fmt, toMajorString, toMinorUnits }`.
- **프론트 `src/context/CurrencyContext.jsx`** — `CurrencyProvider`(StoreLayout 이 storeData 로 제공) + `useCurrency()`.
- 이미 통화화된 곳: `MagnoliaCartModal`, `MagnoliaMenuCard`, `AdminMenuRegisterView`(가격 입력 minor 변환), 백엔드 `square_client._amount_money`.

## 핵심 규약 (반드시 지킬 것)

- **금액은 최소단위 정수로 저장/전달** (JP=엔, GB=펜스). 표시 시 `fmt(minor)`, 입력 시 `toMinorUnits(major)`.
- **손님/스태프 뷰**(StoreLayout 하위)는 `const { fmt } = useCurrency()` 사용.
- **admin 뷰**(독립적으로 storeData fetch)는 `const cur = currencyHelpers(storeData)` 사용.
- 기계적 치환: `¥{X.toLocaleString()}` → `{fmt(X)}`, `+¥{X}` → `+{fmt(X)}`.
- **세율은 하드코딩 금지** — `storeData.tax_rate` / 매장 설정 사용(영수증의 `* 0.08` 류 전부 교체).

---

## Task A — 손님 영수증 뷰 (세율 포함, 최우선)

**Files (7):** `src/views/themes/{Sakura,Cosmos,Sunflower,Lavender,Ajisai,Camellia,Bamboo}ReceiptView.jsx` + `src/views/ReceiptView.jsx`

- [ ] `useCurrency()` 도입, 모든 `¥{...}` → `{fmt(...)}`
- [ ] **하드코딩 세율 제거**: `Math.round(order.total_price * 0.08)` 류 → 매장 `tax_rate` 기반. 税込/税別(`tax_included`) 분기 확인. (예: SakuraReceiptView.jsx:87)
- [ ] 영수증은 손님 대면 + 금액 정확성 핵심 → 세율/합계 계산을 특히 신중히
- [ ] `npm run lint` + `npm run build` → ⏸ GPT 리뷰 → 커밋

## Task B — 손님 테마뷰 (메뉴/카트 표시)

**Files (8):** `src/views/themes/{Sakura,...,Bamboo}ThemeView.jsx` + `TsubakiThemeView.jsx`

- [ ] `useCurrency()` 도입, 잔존 `¥{item.price}`, `¥{totalAmount}` 류 → `{fmt(...)}` (메뉴카드 가격은 이미 MagnoliaMenuCard 처리됨 — 테마뷰 자체의 합계/배지 등만)
- [ ] lint + build → ⏸ GPT 리뷰 → 커밋

## Task C — 스태프/정산 뷰

**Files:** `src/views/RegisterView.jsx`(14곳), `StaffView.jsx`(14곳), `KitchenView.jsx`, `CheckoutView.jsx`

- [ ] StoreLayout 하위이므로 `useCurrency()`. 모든 `¥` → `fmt`. 정산 합계·소계 계산이 인라인 세율을 쓰면 매장 tax_rate 로 교체
- [ ] CheckoutView 결제 금액 표시 통화화
- [ ] lint + build → ⏸ GPT 리뷰 → 커밋

## Task D — Admin 표시 뷰

**Files:** `src/views/AdminHomePageView.jsx`(5), `AdminAnalyticsView.jsx`(2), `AdminView.jsx`(6), `MenuManagementView.jsx`(5), `OrdersHistoryView.jsx`(2), `SubscriptionView.jsx`(6), `src/components/MenuGroupsSection.jsx`(4)

- [ ] admin 뷰는 `currencyHelpers(storeData)`(자체 fetch). 매출/분석/주문 합계 `¥` → `fmt`
- [ ] `MenuGroupsSection`(食べ放題 코스 가격): 입력/표시 통화화 — **가격 입력은 minor 변환** 필요(AdminMenuRegisterView 패턴 참조)
- [ ] `SubscriptionView`: 구독 플랜 가격 표시(국가 통화) — 단, 플랜 가격 문구는 i18n/하드코딩일 수 있어 확인
- [ ] lint + build → ⏸ GPT 리뷰 → 커밋

## Task E — 메뉴 편집 가격 입력 점검 (정확성)

- [ ] `AdminMenuRegisterView`(신규)는 처리됨. **기존 메뉴 편집** 경로가 가격을 로드/저장하는지 확인:
  - 편집 시 stored minor → 입력칸 major 로 표시(`toMajorString`), 저장 시 major → minor(`toMinorUnits`)
  - 이중 변환(로드+저장 양쪽 변환) 버그 주의
- [ ] `MenuManagementView` 가 인라인 편집/복제 시 가격 처리하는지 확인
- [ ] 백엔드 `orders.py` 주문 재계산이 minor 정수 일관 유지하는지 회귀 확인 (`uv run pytest backend/tests`)

---

## 검증

- 프론트: 변경 파일 `npx eslint <files>` (사전 존재 에러 제외) + `npm run build`(exit 0).
- 백엔드(세율/주문 관련 변경 시): `uv run pytest backend/tests -q`.
- 수동: JP 매장 = `¥1,000`, GB 매장 = `£10.00` 표시 + 영수증 세율 = 매장 tax_rate.

## 범위 밖 (또 다른 후속 spec)

- B. SumUp / Stripe Terminal 어댑터 (영국 밖 EU)
- C. 다국어 콘텐츠 (독·불·이태리어)
- D. GDPR / UK-GDPR (동의·삭제·방침)
- 마이그레이션 실패 부팅 차단 (작업 칩 task_db8e66e9)
- slug "변경 가능" UI 문구 정정 (Task 3 리뷰 지적)
- 운영(코드 아님): STRIPE_GB_* env, Square 영국 계정, GCP 리전, VAT/법무

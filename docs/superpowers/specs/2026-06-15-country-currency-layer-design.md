# 국가 설정 레이어 + 통화 정확성 + 구독료 다통화 (Spec A+E)

- **작성일**: 2026-06-15
- **브랜치**: `feat/country-currency-layer`
- **목적**: qraku를 유럽(1순위 영국)으로 확장하기 위한 기반. 매장이 속한 **국가**가 통화·가능 결제사를 강제하고, 세율·언어는 국가 기본값을 매장이 조정한다. JPY 하드코딩을 제거하고, 점주 구독료를 통화별로 받는다.
- **비즈니스 모델 전제**: qraku는 **돈에 손대지 않는 pass-through SaaS**. 손님 결제는 매장 자기 결제사 계정으로 직접 들어감 → 결제 라이선스/자금이동 규제 불필요. qraku가 받는 것은 **점주 구독료**뿐.

---

## 결정 사항 (확정)

| # | 결정 | 값 |
|---|---|---|
| 1 | 권한 모델 | **국가 기본값 + 매장 일부 override**. 통화·가능 결제사는 국가가 강제(매장 변경 불가), 세율·언어는 국가 기본값을 매장이 조정 가능 |
| 2 | 첫 spec 범위 | **A (국가 레이어 + 통화) + E (구독료 다통화)**. B(SumUp/Stripe 어댑터)·C(다국어 번역)·D(GDPR)는 별도 spec |
| 3 | 국가 할당 | **가입 시 선택, 이후 잠김**. 변경은 슈퍼어드민 수동 이전만 |
| 4 | 구독료 구조 | **국가별 Stripe Price ID 셋** (국가마다 의도적 가격 책정 가능) |
| 5 | 국가 카탈로그 저장 | **접근 1 — 코드 설정** (`backend/config/countries.py`). DB 테이블/CRUD UI 불필요 (YAGNI) |

---

## 1. 국가 카탈로그 — `backend/config/countries.py` (신규)

ISO 3166-1 alpha-2 코드별 설정 상수.

```python
COUNTRIES = {
    "JP": {
        "currency": "JPY",
        "currency_decimals": 0,
        "default_tax_rate": 10.0,
        "default_tax_included": True,
        "default_languages": ["ja", "en", "ko", "zh"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAYPAY_DIRECT", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "JP",   # 기존 ¥ Price ID (하위호환)
    },
    "GB": {
        "currency": "GBP",
        "currency_decimals": 2,
        "default_tax_rate": 20.0,
        "default_tax_included": True,
        "default_languages": ["en"],
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAY_AT_COUNTER"],
        "stripe_price_env_prefix": "GB",
    },
}
```

- Stripe Price ID 등 민감/환경별 값은 코드에 직접 넣지 않고 `stripe_price_env_prefix`로 `.env` 키를 조회.
- 접근자 헬퍼: `get_country(code)`, `currency_of(code)`, `decimals_of(code)`, `allowed_methods(code)`, `default_tax(code)`, `default_languages(code)`.
- 알 수 없는 코드 → `JP` 폴백 (기존 동작 보존) 또는 명시적 에러 — **구현 시 JP 폴백 채택** (기존 데이터 안전).

---

## 2. Store 모델 변경 — `models.py` (append) + 마이그레이션

- 추가: `country_code: str = Field(default="JP", max_length=2, index=True)`
- **가입 시 선택 → 이후 잠김** (수정 엔드포인트에서 변경 거부; 슈퍼어드민만 이전).
- **통화는 Store에 저장하지 않음** — 항상 `country_code` → `currency_of()` 파생 (드리프트 차단). `SquareTerminalCheckout.currency`도 매장 통화에서 채움(기본값 `"JPY"`는 폴백으로만 유지).
- 기존 `tax_rate` / `tax_included` / `supported_languages` = **매장 override 값**. 가입 시 국가 기본값으로 시드, 점주가 조정 가능.

### 마이그레이션 (`database.py` `migration_sqls` 끝에 추가)
```sql
-- [2026-06-15] 국가 레이어: Store.country_code (기존 전 매장 JP 백필)
ALTER TABLE store ADD COLUMN country_code VARCHAR(2) NOT NULL DEFAULT 'JP'
```
- 기존 전 매장은 default `'JP'`로 백필 → **기존 일본 동작 100% 보존**.

---

## 3. 통화 처리 — `backend/utils/currency.py` (신규)

- 금액은 **해당 통화의 최소단위 정수**로 저장 (JPY=엔, GBP=펜스). 기존 엔화 데이터는 이미 최소단위이므로 그대로 유효.
- 유틸:
  - `decimals_for(currency) -> int`
  - `to_minor_units(amount_decimal, currency) -> int` (통화별 반올림)
  - `from_minor_units(minor, currency) -> Decimal`
  - `format_amount(minor, currency) -> str` (기호/소수 자리 적용)
- **JPY 하드코딩 제거 지점**:
  - `frontend-react/src/components/magnolia/MagnoliaCartModal.jsx`: `currencyCode:'JPY'` → API가 내려준 매장 통화. `¥` 하드코딩 표시 → 통화 인식 포맷터 (통화/기호/소수자리를 store API 응답에서 받음).
  - `SquareTerminalCheckout.currency` 기본값 → 매장 통화에서 설정.
  - Square 결제 금액: Square는 최소단위(BigInt)로 받음 → 저장된 최소단위 값 그대로 전달 (JPY ×1, GBP는 이미 펜스이므로 변환 불필요).
- **store 조회 API 응답에 통화 메타 추가**: `currency`, `currency_decimals`, `currency_symbol` (프론트가 포맷에 사용).

---

## 4. 구독료 다통화 (E) — `backend/routers/billing.py`

- `billing.py`가 `store.country_code` → `countries.py`의 `stripe_price_env_prefix` → `.env`에서 Price ID 해석.
- 예: prefix `GB` + plan `monthly` → `STRIPE_GB_MONTHLY_PRICE_ID`.
- 기존 JP Price ID 환경변수는 `JP` prefix로 매핑(하위호환). 기존 변수명 유지하되 prefix 해석 계층을 추가.
- `.env`에 GB Price ID 항목 추가 (플레이스홀더 — 운영자가 Stripe에서 GBP 가격 생성 후 채움). `backend/CLAUDE.md` 환경변수 표에 항목 기재.

---

## 5. Admin / UI

- **가입 화면**: 국가 선택 드롭다운(카탈로그 기반) → `country_code` 설정 + 세율/언어를 국가 기본값으로 시드.
- **`AdminPaymentView.jsx`**: 결제수단 트랙 목록을 국가의 `allowed_payment_methods`로 필터 (영국 → Square + 현장결제만). 기존 `tracks` 배열을 국가 기반으로 필터.
- **가격/세율 입력 (메뉴·세금 설정)**: 통화 인식 — GBP는 소수점 2자리 입력, JPY는 정수. 기호도 국가에서.
- **손님뷰**: 통화/기호/소수자리를 store API 응답에서 받아 표시.

---

## 6. 테스트 (TDD)

- `currency.py` 유닛: `decimals_for`, `to_minor_units`(반올림/통화별), `from_minor_units`, `format_amount` (JPY·GBP 각각).
- `countries.py` 유닛: 코드 해석, 미지 코드 JP 폴백, allowed_methods/통화/세율 기본값.
- billing Price ID 해석 유닛: country_code → prefix → env 변수 매핑 (JP 하위호환 포함).
- 마이그레이션 백필: 기존 매장 `country_code == "JP"`.

---

## 범위 밖 (별도 spec)

| 구성요소 | 비고 |
|---|---|
| B. SumUp / Stripe Terminal 어댑터 | EU 전역(영국 외) 확장 시. 기존 `BasePaymentAdapter` + `factory.py` 어댑터 패턴에 추가 |
| C. 다국어 콘텐츠 (독·불·이태리어) | i18n 인프라 존재, 번역 콘텐츠 점진 추가 |
| D. GDPR / UK-GDPR 기능 | 동의·데이터 삭제·처리방침 |

---

## 하네스 준수 (CLAUDE.md 규칙)

- 신규 도메인 → 신규 파일 (`config/countries.py`, `utils/currency.py`).
- 모델 추가 → `models.py` append.
- 마이그레이션 → `database.py` `migration_sqls` 끝 + 날짜/목적 주석.
- 기존 함수 시그니처/응답 구조는 **확장만**(필드 추가), 변경 금지.
- 7개 테마뷰·`OrderView.jsx` props 시그니처 불변. `MagnoliaCartModal.jsx`는 결제 핵심이므로 **통화 관련 변경만**.

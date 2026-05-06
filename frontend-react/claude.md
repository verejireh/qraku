# Frontend CLAUDE.md

프론트엔드(React + Vite) 개발 가이드.

> 📁 프로젝트 전반 규칙은 [루트 claude.md](../claude.md) 참조

---

## 아키텍처

### 디렉토리 구조 (`frontend-react/src/`)

| 경로 | 역할 |
|---|---|
| `App.jsx` | React Router 라우트 정의. 전체 store 스코프 라우트는 `/:shop_id/` 하위 |
| `views/` | 페이지 레벨 컴포넌트 (`*View.jsx`) |
| `views/themes/` | 7개 테마별 뷰 컴포넌트 |
| `components/` | 재사용 컴포넌트 |
| `components/magnolia/MagnoliaCartModal.jsx` | 장바구니/결제 모달 — Square Web Payments SDK 초기화 포함 |
| `context/` | `LanguageContext`, `SessionContext`, `ThemeContext` |
| `hooks/` | 커스텀 훅 |

---

## 멀티 테마 시스템

Store의 테마는 `Store.theme`에 저장. **8개 테마**: Cosmos, Sunflower, Lavender, Ajisai, Camellia, Bamboo, Sakura, Tsubaki.

### 테마뷰 병렬 구조 규칙

| 규칙 | 내용 |
|---|---|
| 특정 테마만 지정 | 해당 파일만 수정 |
| 전체 적용 | "모든 테마에 적용" 명시 요청 시에만 |
| `OrderView.jsx` | 공통 데이터 레이어 — props 시그니처 변경 금지 |
| `MagnoliaCartModal.jsx` | 결제 핵심 — 결제 관련 요청 외 건드리지 않음 |

**7개 테마뷰 파일**: `SakuraThemeView`, `CosmosThemeView`, `SunflowerThemeView`, `LavenderThemeView`, `AjisaiThemeView`, `CamelliaThemeView`, `BambooThemeView`

---

## 결제 플로우 (Frontend)

### Square Web Payments (테이크아웃 선결제)
- `MagnoliaCartModal.jsx`에서 Square Web Payments SDK 완전 구현
- `orderType === 'take_out'` + `squareAppId`/`squareLocationId` 존재 시에만 활성화

### PayPay Direct
- `MagnoliaCartModal.jsx`: PayPay 결제 버튼 구현
- `PayPayCompleteView.jsx`: PayPay 콜백 페이지 (결제 상태 확인 후 주문 생성)

**PayPay 결제 플로우**:
1. 고객이 "PayPay で決済する" 클릭 → `POST /api/paypay/create-payment` → PayPay QR 결제 URL 반환
2. 고객이 PayPay 앱에서 결제 승인
3. PayPay가 `/:shop_id/paypay-complete` 으로 리다이렉트
4. `PayPayCompleteView`에서 결제 상태 확인 (`GET /api/paypay/payment-status/:mid`) → 주문 생성

---

## Admin Page Display Toggles

- `StoreDisplaySettings` 모델: `use_kitchen_page`, `use_register_page`, `use_staff_page` (bool)
- AdminView에서 토글 스위치로 ON/OFF 가능
- **규칙**: 외부 POS 미연동(`pos_type === 'none'`) 시 3개 모두 OFF 불가 — 최소 1개는 ON이어야 주문 확인 가능
- ⚠️ **Known Issue**: 토글은 AdminView UI에서만 숨김 처리됨. 직접 URL 접속은 아직 차단하지 않음

---

## Two-track Ordering (kitchen_mode)

- **`KDS` mode** (기본): 주문이 인앱 `KitchenView` (WebSocket 실시간) + `StaffTableView`/`RegisterView`로 흐름
- **`square` mode**: 주문이 Square POS/프린터로 전달; `KitchenView`와 Register 네비 링크가 AdminView에서 숨겨짐
- `Store.kitchen_mode` + `Store.pos_mode` 필드로 제어; `AdminView.jsx`에서 토글

---

## QR 코드

- `AdminQrBuilderView.jsx`: EatIn QR (테이블별 URL `/:shop_id/table/:tableNum`) + TakeOut QR (단일 URL `/:shop_id/takeout`), A4 가로 인쇄

---

## 食べ放題 관련 구현 완료 컴포넌트

### 손님 측 (메뉴 페이지)
- **`OrderView.jsx`** — 활성 세션을 한 곳에서 30초 폴링
  - `?filter_groups=true`로 메뉴 fetch (시간대 자동 필터링)
  - `tabehoudaiMenuIds` (Set) 계산 → 모든 테마뷰에 prop 전달
- **`TabehoudaiBanner.jsx`** — sticky 상단 배너
  - prop으로 받은 session 기반 1초 카운트다운
  - ラストオーダー(잔여 ≤ last_order_minutes×60초) 시 amber 색 + "ラストオーダー" 라벨로 자동 전환
  - 만료 시 회색 "終了しました" 배너
- **7개 테마뷰**: 메뉴 카드에 `tabehoudaiMenuIds.has(item.id)` 체크하여 분홍색 `🍴 食べ放題対象` 뱃지 표시

### Admin 측
- **`MenuGroupsSection.jsx`** — `MenuManagementView`에 삽입되는 접이식 섹션
  - 3가지 타입(TIME_WINDOW / COURSE / MANUAL) 단일 모달 생성/편집
  - 사용 axios 인스턴스: `adminApi` (JWT 자동 첨부)
  - ⚠️ Portal 방식 사용 (`createPortal`) — `overflow-hidden` + `backdrop-blur-xl` 중첩 모달 잘림 문제 해결

### 스태프 측
- **`SettingView.jsx`** — `食べ放題` 탭 추가 (3번째 탭)
  - 매장 전체 테이블 그리드 + 진행 중 세션 카운트다운
  - 빈 테이블 클릭 → 코스 + 인원수 선택 모달
  - 1초마다 클라이언트 카운트다운, 30초마다 서버 동기화

### Register 측
- **`RegisterView.jsx`** — 정산 라인 표시
  - 상품 명세 아래 분홍색 섹션에 `食べ放題` 라인
  - 각 라인: 코스명 + `¥가격 × N명 = 합계` + (만료 시) "時間終了" 뱃지
  - `合計金額`: 상품 + 코스 합산값 자동 표시

---

## 프론트엔드 개발 명령

```bash
cd frontend-react
npm install        # 최초 1회
npm run dev        # 개발 서버 (port 5173)
npm run build      # 프로덕션 빌드 → frontend-react/dist/
npm run lint       # ESLint
```

---

## 남은 프론트엔드 작업

| 항목 | 내용 |
|---|---|
| Display Toggle URL 가드 | `use_kitchen_page` 등 false 시 직접 URL 접속 차단 (현재 UI만 숨김) |
| 보류: ラストオーダー 푸시 알림 | WebSocket 기반 실시간 알림 (현재 30초 폴링 + 1초 클라이언트 카운트다운으로 충분) |
| 보류: 食べ放題 세션 인원 변경 / 시간 연장 | 현재 미구현 |
| 보류: 飲み放題 + 食べ放題 동시 진행 | 현재는 단일 active 세션만 허용 |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI)
```bash
# Activate venv and run (from repo root)
.venv\Scripts\activate
cd backend
uvicorn main:app --reload --port 8003
```

### Frontend (React + Vite)
```bash
cd frontend-react
npm install        # first time
npm run dev        # dev server on port 5173
npm run build      # production build → frontend-react/dist/
npm run lint       # ESLint
```

### One-click start (Windows)
```
start_all.bat      # starts both backend and frontend in separate cmd windows
run_backend.bat    # backend only
run_frontend_react.bat  # frontend only
```

## Architecture

This is a QR-based restaurant ordering system. In production, the FastAPI backend serves both the API **and** the compiled React SPA — `npm run build` output goes to `frontend-react/dist/`, and `backend/main.py` serves it via a catch-all SPA route. During development, Vite proxies `/api` and `/ws` to the backend.

### Backend (`backend/`)
- **`main.py`** — FastAPI entry point. All API routers are mounted under `/api`. Everything else serves the React SPA from `frontend-react/dist/`.
- **`models.py`** — Single source of truth for all SQLModel/MySQL models: `Store`, `Table`, `Menu`, `Order`, `OrderItem`, `Customer`, `CustomerPoint`, `PointHistory`, `SystemConfig`, etc.
- **`database.py`** — MySQL-only (SQLite forbidden at runtime). Uses `aiomysql` async engine. Schema migrations are run inline at startup via `ALTER TABLE` statements; no separate migration tool is used.
- **`routers/`** — One file per feature domain. Key routers:
  - `orders.py` — order creation, Square take-out pre-payment flow
  - `pos.py` — staff-facing payment summary / checkout / complete payment (EatIn)
  - `square_oauth.py` — Square OAuth 2.0 connect/disconnect
  - `ws.py` — WebSocket manager for real-time kitchen updates
  - `billing.py` — Stripe subscription management
  - `admin.py`, `super_admin.py` — owner/admin API
  - `qr.py` — QR code image generation (themed, batch)
  - `tables.py` — table management + QR PDF generation
- **`utils/square_client.py`** — Two functions: `create_square_order` (sends eat-in order to Square POS/printer) and `process_square_payment` (charges card for take-out pre-payment using Square Web Payments nonce).

### Frontend (`frontend-react/src/`)
- **`App.jsx`** — React Router routes. All store-scoped routes are under `/:shop_id/`.
- **`views/`** — Page-level components. Named `*View.jsx`.
- **`components/magnolia/MagnoliaCartModal.jsx`** — The cart/checkout modal used by `OrderView`. Contains Square Web Payments SDK initialization for take-out card payment.
- **`context/`** — `LanguageContext`, `SessionContext`, `ThemeContext` — shared state used across views.

### Payment System (Two-Track + PayPay Direct)

The payment system has three tiers:

1. **Square 결제 가능 식당**: Square Web Payments를 통한 카드/PayPay 결제 + Square POS 연동
2. **Square 없는 식당**: 주문 기능만 제공 (pay_at_counter)
3. **PayPay Direct 옵션**: Admin 決済設定에서 PayPay API 인증정보를 설정한 매장은 낮은 수수료로 PayPay 결제 가능

**Backend adapter pattern** (`services/pos/`):
- `base.py` — `BasePaymentAdapter`, `BasePOSAdapter` 추상 클래스
- `adapters/square_adapter.py` — ✅ 동작함 (legacy `square_client.py` 위임)
- `adapters/paypay_direct_adapter.py` — ✅ 구현됨 (PayPay QR코드 결제 생성/확인/환불 API)
- `adapters/smaregi_adapter.py`, `airregi_adapter.py` — ❌ placeholder
- `factory.py` — `get_payment_adapter()`, `get_pos_adapter()` 동적 라우팅. 3가지 결제 방식(PAY_AT_COUNTER/SQUARE/PAYPAY_DIRECT) 정상 분기

**Frontend**: Square Web Payments SDK는 `MagnoliaCartModal.jsx`에서 완전 구현됨. PayPay Direct는 `MagnoliaCartModal.jsx`에서 PayPay 결제 버튼 + `PayPayCompleteView.jsx` 콜백 페이지로 구현됨.

**PayPay 결제 플로우**:
1. 고객이 "PayPay で決済する" 클릭 → `POST /api/paypay/create-payment` → PayPay QR 결제 URL 반환
2. 고객이 PayPay 앱에서 결제 승인
3. PayPay가 `/:shop_id/paypay-complete` 으로 리다이렉트
4. `PayPayCompleteView`에서 결제 상태 확인 (`GET /api/paypay/payment-status/:mid`) → 주문 생성

**Models**: `PaymentSettings` (결제 설정), `PaymentMethodType` enum (`PAY_AT_COUNTER`, `SQUARE_INTEGRATED`, `PAYPAY_DIRECT`), `POSType` enum (`SQUARE`, `SMAREGI`, `AIRREGI`, `NONE`), `StoreDisplaySettings` (페이지 토글)

### Admin Page Display Toggles

- `StoreDisplaySettings` 모델: `use_kitchen_page`, `use_register_page`, `use_staff_page` (bool)
- AdminView에서 토글 스위치로 ON/OFF 가능
- **규칙: 외부 POS 미연동(`pos_type === 'none'`) 시 3개 모두 OFF 불가** — 최소 1개는 ON이어야 주문 상황 확인 가능
- 토글은 AdminView UI에서만 숨김 처리됨. 직접 URL 접속은 아직 차단하지 않음 (Known Issue)

### Key Design Patterns

**Two-track ordering (kitchen_mode)**
- `KDS` mode (default): orders flow through the in-app `KitchenView` (WebSocket real-time) and `StaffTableView`/`RegisterView`.
- `square` mode: orders are forwarded to Square POS/printer via `create_square_order`; `KitchenView` and `Register` nav links are hidden in AdminView.
- Controlled by `Store.kitchen_mode` + `Store.pos_mode` fields; toggled in `AdminView.jsx`.

**Square pre-payment (take-out only)**
- Frontend: Square Web Payments SDK loaded in `MagnoliaCartModal.jsx`; only active when `orderType === 'take_out'` and `squareAppId`/`squareLocationId` are present.
- Backend: `orders.py` calls `process_square_payment()` before creating the DB order; on success `payment_status = "paid"` is set immediately.

**Schema migrations**
- New columns are added by appending `ALTER TABLE` statements to the `migration_sqls` list in `database.py:init_db()`. Duplicate-column errors are silently ignored so the server can restart safely.

**Multi-theme**
- Store theme is stored in `Store.theme`. 8 themes: Cosmos, Sunflower, Lavender, Ajisai, Camellia, Bamboo, Sakura, Tsubaki.
- Theme-specific receipt views exist in `views/themes/`. The admin can switch themes from `AdminView`.

**QR codes**
- `AdminQrBuilderView.jsx` generates EatIn QR (per-table URL `/:shop_id/table/:tableNum`) and TakeOut QR (single URL `/:shop_id/takeout`), printable A4 landscape.

## Required Environment Variables (`backend/.env`)
```
DATABASE_URL=mysql+aiomysql://user:pass@host/dbname
SECRET_KEY=...                  # JWT signing key
SQUARE_APPLICATION_ID=...       # Square public app ID (injected into store API response)
SQUARE_ACCESS_TOKEN=...         # Square server-side access token (used in square_client.py for Orders/Payments API)
SQUARE_ENVIRONMENT=sandbox|production
DEEPL_API_KEY=...               # Auto-translation for menu items
STRIPE_SECRET_KEY=...           # Subscription billing
STRIPE_WEBHOOK_SECRET=...
STRIPE_MONTHLY_PRICE_ID=...     # Standard ¥3,480/mo
STRIPE_SIXMONTH_PRICE_ID=...    # Standard ¥17,880/6mo
STRIPE_YEARLY_PRICE_ID=...      # Standard ¥29,800/yr
STRIPE_MONTHLY_OPEN_PRICE_ID=...   # Data-open ¥2,480/mo
STRIPE_SIXMONTH_OPEN_PRICE_ID=...  # Data-open ¥11,880/6mo
STRIPE_YEARLY_OPEN_PRICE_ID=...    # Data-open ¥17,800/yr
```

## Page Route Map

### Customer-facing (`/:shop_id/`)
- `/home`, `/menu`, `/orders`, `/checkout` — 일반 메뉴/주문/결제
- `/takeout` — 테이크아웃 전용 주문
- `/table/:tableNumber/menu` — QR 스캔 후 테이블 주문
- `/receipt/:orderId` — 테마별 영수증

### Staff-facing (`/:shop_id/`)
- `/kitchen` — KitchenView (WebSocket 실시간 주문 현황)
- `/staff` — StaffView (주문 관리)
- `/register` — RegisterView (결제/정산)

### Admin (`/:shop_id/admin/`) — 4탭 네비
- `/` — AdminView (매출 대시보드 + 영업시간 + ポイント + 基本情報 + 掲載 + QR + 表示設定)
- `/menu`, `/menu/new` — 메뉴 관리
- `/operation` — 운영관리 (테이블 CRUD, 주문확인방식, 세금, 테이크아웃, 영수증, 언어)
- `/staff-manage` — スタッフ管理 (マスターPIN + スタッフ CRUD)
- `/payment` — 決済設定 (3-Track 결제 + Square OAuth)
- `/tables`, `/tables/print` — 테이블 관리 + QR 인쇄
- `/qr-builder` — QR 코드 빌더
- `/orders`, `/analytics` — 주문/분석

### Other
- `/login`, `/owner/signup` — 인증
- `/super-admin` — 슈퍼어드민
- `/demo`, `/demo/showcase` — 데모

## Deployment

- **Server**: GCP VM `35.213.6.149`, user `verejireh`
- **Domain**: `qraku.com` → 위 IP로 포워딩
- **SSH key**: `qraku` (프로젝트 루트)
- **Deploy**: `python deploy.py` — 로컬 빌드 → zip → SCP → `setup_server.sh` 실행
- **Logs**: `ssh -i qraku verejireh@35.213.6.149 "tail -f ~/qr-order-system/backend.log"`

## Known Issues / Incomplete Implementation
- Display toggles (`use_kitchen_page`, `use_register_page`, `use_staff_page`)는 AdminView UI에서만 숨김. 직접 URL 접속은 차단하지 않음.
- Smaregi/AirRegi adapters: placeholder only
- No test suite exists.

## TODO / 보류 항목
- ~~**[HIGH] Admin 인증 백엔드 강화**~~ ✅ **완료** — `require_admin` (JWT Bearer 토큰 검증 + store_id 교차 접근 방지)가 admin, stores(PATCH), menus(쓰기), stats, billing, square_oauth(disconnect), translate, qr(쓰기) 라우트에 적용됨. super_admin은 별도 인증 체계 필요 (미적용).
- PayPay Direct: 실 결제 테스트 필요 (PayPay sandbox 계정으로 E2E 검증)

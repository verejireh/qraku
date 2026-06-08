# Backend CLAUDE.md

백엔드(FastAPI) + 데이터베이스(PostgreSQL/SQLModel) 개발 가이드.

> 📁 프로젝트 전반 규칙은 [루트 claude.md](../claude.md) 참조
>
> ⚠️ **DB**: 2026-05-19 PostgreSQL 컷오버 완료 (DBM-12). MySQL/SQLite 런타임 모두 금지.
> 운영은 Cloud SQL PostgreSQL via Auth Proxy (127.0.0.1:5432). 인라인 ALTER 마이그레이션은
> 2026-05-22 부터 `pg_advisory_xact_lock` 단일 트랜잭션 + SAVEPOINT 패턴 (ad19215).

---

## 백엔드 아키텍처

### 디렉토리 구조 (`backend/`)

| 파일/폴더 | 역할 |
|---|---|
| `main.py` | FastAPI 엔트리포인트. 모든 API 라우터는 `/api` 하위 마운트. 나머지는 React SPA(`frontend-react/dist/`) 서빙 |
| `models.py` | 모든 SQLModel/PostgreSQL 모델의 단일 진실 공급원 |
| `database.py` | PostgreSQL 전용 (`asyncpg` async + `psycopg2` sync via `to_sync_url`). SQLite/MySQL 런타임 금지. 서버 시작 시 `pg_advisory_xact_lock` 으로 보호된 단일 트랜잭션 안에서 `ALTER TABLE` 인라인 마이그레이션 + SAVEPOINT 격리 |
| `routers/` | 피처 도메인별 1파일 |
| `services/pos/` | 결제 어댑터 패턴 |
| `utils/` | 헬퍼 유틸리티 |

### 라우터 파일별 담당

| 파일 | 담당 |
|---|---|
| `orders.py` | 주문 생성, Square 테이크아웃 선결제 |
| `pos.py` | 스태프용 정산/결제 (EatIn) |
| `admin.py` | 매장 설정, 스태프 CRUD, 출퇴근 토글, 근태 통계 |
| `staff_auth.py` | 마스터PIN/스태프 로그인 인증만 |
| `menu_groups.py` | 메뉴 그룹 CRUD |
| `tabehoudai.py` | 食べ放題 세션 관리 |
| `billing.py` | Stripe 구독 관리 |
| `square_oauth.py` | Square OAuth 연동 |
| `ws.py` | WebSocket 매니저 (실시간 주방 업데이트) |
| `qr.py` | QR 코드 이미지 생성 (테마별, 배치) |
| `tables.py` | 테이블 관리 + QR PDF 생성 |

### Utils

- **`utils/square_client.py`** — `create_square_order()` (EatIn 주문 → Square POS/프린터), `process_square_payment()` (테이크아웃 카드 선결제)
- **`utils/crypto.py`** — Fernet 대칭키 암호화/복호화 (`enc:v1:` 접두사)
- **`utils/refunds.py`** — `perform_refund()` 환불 실행 + 자동 `RefundLog` 기록

---

## 결제 시스템 (3-Track)

### 결제 방식

| 트랙 | 설명 |
|---|---|
| **Square 결제** | Square Web Payments 카드/PayPay 결제 + Square POS 연동 |
| **PAY_AT_COUNTER** | 주문 기능만 제공 (계산대 직접 결제) |
| **PayPay Direct** | Admin 決済設定에서 PayPay API 인증정보 설정 시 낮은 수수료로 PayPay 결제 |

### Backend Adapter Pattern (`services/pos/`)

| 파일 | 상태 |
|---|---|
| `base.py` | `BasePaymentAdapter`, `BasePOSAdapter` 추상 클래스 |
| `adapters/square_adapter.py` | ✅ 동작 (legacy `square_client.py` 위임) |
| `adapters/paypay_direct_adapter.py` | ✅ 구현됨 (PayPay QR코드 결제 생성/확인/환불 API) |
| `adapters/smaregi_adapter.py` | ❌ placeholder |
| `adapters/airregi_adapter.py` | ❌ placeholder |
| `factory.py` | `get_payment_adapter()`, `get_pos_adapter()` 동적 라우팅 |

### Square 선결제 플로우 (테이크아웃)
1. Frontend: Square Web Payments SDK로 카드 nonce 생성
2. Backend (`orders.py`): `process_square_payment()` 호출 → 성공 시 `payment_status = "paid"` 즉시 설정
3. `Order.square_payment_id`에 UNIQUE INDEX → 중복 결제/주문 방지 (멱등성)

### PayPay Direct 플로우
1. `POST /api/paypay/create-payment` → PayPay QR 결제 URL 반환
2. 고객이 PayPay 앱에서 결제 승인
3. PayPay → `/:shop_id/paypay-complete` 리다이렉트
4. `GET /api/paypay/payment-status/:mid` → 상태 확인 후 주문 생성

---

## 인증 구조

```
staff API  (/api/staff/*)   → 마스터PIN 세션 또는 require_admin 검증
register   (/api/register/*) → 마스터PIN 세션 또는 require_admin 검증
orders     (/api/orders/*)   → 공개 생성만 허용, 수정/삭제는 인증 필수
admin      (/api/admin/*)    → require_admin (JWT) + store_id 교차 검증
```

**소유 검증 패턴 (모든 수정 엔드포인트에 적용):**
```python
entity = await session.get(Model, entity_id)
if not entity or entity.store_id != resolved_store.id:
    raise HTTPException(status_code=404, detail="Not found")
```

---

## 보안 현황

### 완료된 보안 작업

| 항목 | 완료 내용 |
|---|---|
| SECRET_KEY 교체 | 기본값 `yoursecretkeyhere` → 강력한 랜덤 키. 폴백값 제거 |
| 인증 추가 | `register.py`, `orders.py`, `pos.py`, `tables.py` 전 엔드포인트 인증 + store 소유 검증 |
| IDOR 방어 | `menus.py` `menu.store_id == admin_store.id` 교차 검증 |
| PayPay 금액 서버 재계산 | 클라이언트 `amount` 신뢰 금지 → 서버에서 주문 기준 재계산 |
| CORS 제한 | `allow_origins=["*"]` → `["https://qraku.com"]` |
| 수량 음수 검증 | `orders.py` `quantity <= 0` 서버 측 검증 |
| 민감 필드 제거 | `stores.py` GET 응답에서 `password_hash`, `master_pin` 등 제거 |
| 보안 헤더 | X-Frame-Options, CSP, HSTS, X-Content-Type-Options (`SecurityHeadersMiddleware`) |
| API Key 암호화 | Fernet으로 `paypay_api_key/secret` 암호화 저장 (`enc:v1:` 접두사) |
| Square Token 암호화 | 저장 시 `encrypt_secret()`, 사용 시 `_resolve_square_token()` 자동 복호화 |
| 멱등성 | `Order.square_payment_id` UNIQUE INDEX. 중복 결제 ID → 기존 주문 반환 |
| 환불 감사 로그 | `RefundLog` 모델 + `perform_refund()` 헬퍼 — 환불 자동 기록 |
| merchant_payment_id 무작위화 | `secrets.token_urlsafe(24)` (32자 base64url) |

### 미완료 보안 작업

| 우선순위 | 항목 | 내용 |
|---|---|---|
| 🔴 P0 | PayPay Webhook | `POST /api/paypay/webhook` 신설. PayPay 서명 검증 후 자동 Order 생성. PayPay 콘솔에 URL 등록 필요 |
| 🔴 P0 | 환불 라우터 | `POST /api/admin/orders/{order_id}/refund` 신설. `require_admin` + `perform_refund()` |
| 🟡 P2 | 에러 메시지 정제 | `str(e)` 직접 반환 → 일반화된 메시지 |

---

## 데이터베이스

### 주요 모델 (`models.py`)

**핵심 모델**:
- `Store`, `Table`, `Menu`, `Order`, `OrderItem`
- `Customer`, `CustomerPoint`, `PointHistory`, `SystemConfig`
- `PaymentSettings` — 결제 설정 (3-Track)
- `PaymentMethodType` enum: `PAY_AT_COUNTER`, `SQUARE_INTEGRATED`, `PAYPAY_DIRECT`
- `POSType` enum: `SQUARE`, `SMAREGI`, `AIRREGI`, `NONE`
- `StoreDisplaySettings` — 페이지 표시 토글 (`use_kitchen_page`, `use_register_page`, `use_staff_page`)
- `StaffMember`, `StaffAttendance` — 스태프 + 출퇴근 기록
- `RefundLog` — 환불 감사 로그

**食べ放題 관련 모델**:
- `MenuGroup` — `id`, `store_id`, `name`, `group_type` (`time_window` | `course` | `manual`), TIME_WINDOW 전용(`active_from`, `active_to`, `weekdays`), COURSE 전용(`price_per_person`, `duration_minutes`, `last_order_minutes`, `course_type`)
- `MenuGroupItem` (m:n) — `id`, `group_id`, `menu_id`
- `TabehoudaiSession` — `id`, `table_id`, `group_id`, `num_people`, `started_at`, `expires_at`, `status`
- `OrderItem` 추가 필드: `is_tabehoudai`, `tabehoudai_session_id`

### 마이그레이션 규칙

```python
# [날짜] 목적 주석 필수
"ALTER TABLE staffmember ADD COLUMN clock_in_at DATETIME NULL",
```

- 새 **테이블**: `SQLModel.metadata.create_all`이 자동 생성 → `ALTER TABLE` 불필요
- 기존 테이블 **컬럼 추가**: `migration_sqls` 리스트 끝에 append
- 중복 컬럼 에러: 자동 무시 (서버 안전 재시작 보장)
- **중복 추가 금지**: 추가 전 기존 항목 확인 필수

### 환경 변수 (`backend/.env`)

```
# 로컬 개발 (단일 URL):
DATABASE_URL=postgresql+asyncpg://qraku:qraku@localhost:5432/qraku
# 운영 (개별 변수 — 특수문자 비번 안전): DB_USER/DB_PASS/DB_HOST/DB_PORT/DB_NAME 우선
SECRET_KEY=...                  # JWT 서명 키
ENCRYPTION_KEY=...              # Fernet 암호화 키 (PayPay/Square API 키 암호화)
SQUARE_APPLICATION_ID=...       # Square 공개 앱 ID
SQUARE_ACCESS_TOKEN=...         # Square 서버 사이드 액세스 토큰
SQUARE_ENVIRONMENT=sandbox|production
GEMINI_API_KEY=...              # 메뉴 자동 번역 (Gemini API)
STRIPE_SECRET_KEY=...           # 구독 과금
STRIPE_WEBHOOK_SECRET=...
STRIPE_MONTHLY_PRICE_ID=...     # Standard ¥3,480/mo
STRIPE_SIXMONTH_PRICE_ID=...    # Standard ¥17,880/6mo
STRIPE_YEARLY_PRICE_ID=...      # Standard ¥29,800/yr
STRIPE_MONTHLY_OPEN_PRICE_ID=...   # Data-open ¥2,480/mo
STRIPE_SIXMONTH_OPEN_PRICE_ID=...  # Data-open ¥11,880/6mo
STRIPE_YEARLY_OPEN_PRICE_ID=...    # Data-open ¥17,800/yr
FRONTEND_BASE_URL=https://qraku.com  # PayPay 콜백용
VISION_API_KEY=...              # GCP Vision API (사진 NSFW 자동 차단, 선택)
# LINE 위치봇 (S4) — 플랫폼 LINE 공식계정/Messaging API
LINE_CHANNEL_ACCESS_TOKEN=...   # LINE 봇 reply 호출 (없으면 봇 비활성)
LINE_CHANNEL_SECRET=...         # LINE 웹훅 서명검증 (/api/webhooks/line)
LINE_LIFF_ID=...                # 봇 카드 주문버튼 LIFF 자동로그인 URL용 (없으면 일반 https 폴백)
```

---

## 食べ放題 API 엔드포인트 (구현 완료)

### menu_groups.py
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/menu-groups/{store_id}` | admin | 그룹 목록 |
| POST | `/api/menu-groups/{store_id}` | admin | 그룹 생성 |
| PATCH | `/api/menu-groups/{store_id}/{group_id}` | admin | 그룹 수정 |
| DELETE | `/api/menu-groups/{store_id}/{group_id}` | admin | 그룹 삭제 |
| PUT | `/api/menu-groups/{store_id}/{group_id}/menus` | admin | 그룹 내 메뉴 일괄 설정 |
| GET | `/api/menu-groups/{store_id}/public/active` | 공개 | 현재 활성 TIME_WINDOW + MANUAL 그룹 |

### tabehoudai.py
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/tabehoudai/courses/{store_id}` | admin | COURSE 타입 그룹 목록 |
| POST | `/api/tabehoudai/sessions/{store_id}` | admin | 테이블에서 세션 시작 |
| POST | `/api/tabehoudai/sessions/{store_id}/{session_id}/end` | admin | 정산 완료 처리 |
| GET | `/api/tabehoudai/sessions/active/by-table/{table_id}` | 공개 | 손님용 본인 테이블 세션 |
| GET | `/api/tabehoudai/sessions/active/{store_id}` | admin | 매장 전체 활성 세션 |

### 기존 라우터 수정 사항
- **`menus.py`** `GET /api/menus/{store_id}`: `?filter_groups=true` — 손님용 시간대 필터링
- **`orders.py`** `create_order`: 活성 食べ放題 세션 대상 메뉴 → `unit_price=0`, `is_tabehoudai=true`
- **`register.py`** `GET /api/register/table/{table_id}`: `items_subtotal`, `tabehoudai_total`, `tabehoudai_lines[]` 추가

### 메뉴 필터링 로직 (손님용)
1. 메뉴가 어떤 TIME_WINDOW/MANUAL 그룹에도 속하지 않음 → 항상 표시
2. 그룹에 속함 + 그룹 중 하나라도 현재 활성 → 표시
3. 그룹에 속함 + 모든 그룹 비활성 → 숨김
4. COURSE 그룹은 별도 처리 (테이블 세션 기반)

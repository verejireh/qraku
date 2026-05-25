# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 📁 **세부 내용은 분리된 파일 참조**
> - 프론트엔드: [`frontend-react/claude.md`](frontend-react/claude.md)
> - 백엔드 + DB: [`backend/claude.md`](backend/claude.md)

---

## 🛡️ AI 하네스 엔지니어링 규칙 (Harness Engineering)

> **핵심 원칙**: AI는 범위를 최대화하려 하고, 하네스는 범위를 최소화한다.
> 요청된 파일만 수정하고, 요청된 기능만 구현하며, "더 잘하려는" 시도는 하지 않는다.

---

### 규칙 1 — 변경 허용 파일 (File Fence)

작업 요청 시 **지정된 파일 외에는 절대 수정하지 않는다.**

| 작업 종류 | 허용 파일 |
|---|---|
| 새 API 엔드포인트 | 해당 도메인 라우터 파일만 |
| 새 모델 추가 | `models.py` 하단에 append만 |
| 스키마 마이그레이션 | `database.py`의 `migration_sqls` 리스트 끝에만 추가 |
| 프론트 컴포넌트 수정 | 지정된 컴포넌트 파일만 |
| 새 라우터 추가 | 새 파일 생성 + `main.py`에 router 등록만 |

**금지 사항:**
- 기존 함수 시그니처 변경 (특히 라우터 함수, API 응답 구조)
- 요청하지 않은 파일을 "일관성을 위해" 수정하는 행위
- 기존 패턴을 "더 나은 방식"으로 리팩토링하는 행위

---

### 규칙 2 — 마이그레이션 태그 규칙

`database.py`의 `migration_sqls`에 항목 추가 시 **반드시 날짜와 목적 주석**을 붙인다.

```python
# [2026-05-01] StaffAttendance 출퇴근 기록 기능
"ALTER TABLE staffmember ADD COLUMN clock_in_at DATETIME NULL",
```

- 이미 존재하는 컬럼 추가는 중복 에러가 자동 무시되므로 안전
- 새 **테이블**은 `SQLModel.metadata.create_all`이 자동 생성 → `ALTER TABLE` 불필요
- 같은 마이그레이션을 중복 추가하지 않도록 추가 전 기존 항목 확인 필수

---

### 규칙 3 — 라우터 책임 경계

각 라우터 파일의 담당 도메인을 엄격히 지킨다. **도메인 경계를 넘는 코드는 끼워넣지 않는다.**

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

**새 도메인 기능은 반드시 새 파일로 생성한다.** 기존 파일에 끼워넣기 금지.

---

### 규칙 4 — 테마뷰 수정 규칙

7개 테마뷰(`SakuraThemeView`, `CosmosThemeView`, `SunflowerThemeView`, `LavenderThemeView`, `AjisaiThemeView`, `CamelliaThemeView`, `BambooThemeView`)는 병렬 구조로 존재한다.

- **특정 테마만 지정된 경우**: 해당 파일만 수정
- **7개 전체 적용**: 명시적으로 "모든 테마에 적용" 요청 시에만
- **`OrderView.jsx`는 공통 데이터 레이어** — props 시그니처(`tabehoudaiMenuIds`, `session` 등) 변경 금지
- **`MagnoliaCartModal.jsx`는 결제 핵심 파일** — 결제 관련 요청 외에는 건드리지 않는다

---

### 규칙 5 — 세션 간 컨텍스트 (이미 완료된 작업)

아래 항목은 이미 구현 완료된 기능이다. **재구현하거나 다른 방식으로 교체하지 않는다.**

| 날짜 | 완료 내용 | 주요 파일 |
|---|---|---|
| 2026-04-30 | Admin 인증 강화 (`require_admin`) | `admin.py`, `routers/*.py` |
| 2026-04-30 | MenuGroupsSection Portal 방식 수정 (backdrop-blur overflow 문제 해결) | `MenuGroupsSection.jsx` |
| 2026-05-01 | StaffAttendance 모델 + 출퇴근 기록 API | `models.py`, `admin.py` |
| 2026-05-01 | AdminStaffManageView 근태 통계 탭 | `AdminStaffManageView.jsx` |
| 2026-05-01~05 | 食べ放題/飲み放題 전 기능 (모델·API·Admin UI·손님뷰·스태프뷰·RegisterView) | 여러 파일 |
| 2026-05-04 | 보안 강화 (암호화, 멱등성, CORS, 인증) | 여러 파일 |

**기억할 것**: `overflow-hidden` + `backdrop-blur-xl` 조합에서 `position: fixed` 모달이 잘리는 문제는 `createPortal`로 해결됨. 같은 문제 발생 시 동일 패턴 적용.

---

## 프로젝트 전반 아키텍처 요약

QR 기반 레스토랑 주문 시스템. FastAPI 백엔드가 API **와** 컴파일된 React SPA를 동시 서빙.

- **프로덕션**: `npm run build` → `frontend-react/dist/` → `backend/main.py` catch-all SPA 라우트로 서빙
- **개발**: Vite가 `/api`, `/ws`를 백엔드로 프록시

### 기술 스택
| 레이어 | 기술 |
|---|---|
| 백엔드 | FastAPI + SQLModel + MySQL (aiomysql) |
| 프론트엔드 | React + Vite + React Router |
| 결제 | Square Web Payments, PayPay Direct, Stripe (구독) |
| 실시간 | WebSocket (KDS 주문 현황) |
| 배포 | GCP VM (`35.213.6.149`), `deploy.py` 원클릭 배포 |

---

## Commands

### Backend (FastAPI) — uv 관리
```bash
# 의존성 동기화 (최초 1회 + pyproject.toml 변경 시)
uv sync

# 서버 실행 (venv 활성화 불필요)
uv run uvicorn backend.main:app --reload --port 8003 --app-dir .
# 또는 venv 활성화 후
.venv\Scripts\activate
cd backend && uvicorn main:app --reload --port 8003
```

### 배포 스크립트
```bash
uv run deploy.py    # paramiko 포함 자동 의존성 해결
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

---

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

---

## Deployment

- **Server**: GCP VM `35.213.6.149`, user `verejireh`
- **Domain**: `qraku.com` → 위 IP로 포워딩
- **SSH key**: `qraku` (프로젝트 루트)
- **Deploy**: `python deploy.py` — 로컬 빌드 → zip → SCP → `setup_server.sh` 실행
- **Logs**: `ssh -i qraku verejireh@35.213.6.149 "tail -f ~/qr-order-system/backend.log"`

---

## Known Issues / 남은 작업

### Known Issues
- Display toggles (`use_kitchen_page`, `use_register_page`, `use_staff_page`)는 AdminView UI에서만 숨김. 직접 URL 접속은 차단하지 않음.
- Smaregi/AirRegi adapters: placeholder only
- No test suite exists.

### 미완료 작업

| 우선순위 | 항목 | 내용 |
|---|---|---|
| 🟡 P1 | PayPay Webhook 자동 Order 생성 | 기본 webhook (`/api/webhooks/paypay`) 은 구현 완료 (서명 검증 + 멱등성 + Order update). 손님이 콜백 페이지 닫고 폴링 안 한 케이스에서 자동 Order 생성은 미구현 — 현재 `payment.completed.order_missing` 로그만 (수동 처리). PendingPayPayOrder 모델 + create-payment 시점 cart snapshot 저장 필요. |
| 🟡 낮음 | PayPay Direct E2E 테스트 | PayPay sandbox 계정으로 실 결제 흐름 검증 |

### 이미 완료된 작업 (참고)

| 항목 | 위치 |
|---|---|
| PayPay Webhook (기본) | [backend/routers/webhooks.py:106](backend/routers/webhooks.py:106) — 서명 검증 + WebhookEvent 멱등성 + Order update |
| 환불 라우터 | [backend/routers/admin.py:499](backend/routers/admin.py:499) — require_admin + Idempotency-Key + perform_refund + event log + WS emit |

### .env 설정 (운영자가 직접 해야 할 항목)

| 변수 | 생성 방법 | 필수도 |
|---|---|---|
| `ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | 🔴 출시 전 필수 |
| `VITE_LINE_LIFF_ID` | LINE Developers Console → LIFF 앱 생성 | 🔴 스탬프/포토리뷰 기능 필수 |
| `FRONTEND_BASE_URL` | `https://qraku.com` | 🔴 PayPay 콜백용 필수 |
| `VISION_API_KEY` | GCP Vision API 활성화 후 키 발급 | 🟡 선택 (사진 NSFW 자동 차단) |

> ⚠️ **ENCRYPTION_KEY 변경 시 주의**: 한 번 설정 후 키를 바꾸면 기존 암호화 데이터를 복호화할 수 없습니다. 키 로테이션 시 마이그레이션 스크립트로 재암호화 작업 필요.

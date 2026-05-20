# E2E 테스트 — Playwright (STB-02~05)

## 실행 조건

| 항목 | 방법 |
|---|---|
| Vite 개발 서버 | `npm run dev` (:5173) — Playwright 가 자동 기동 |
| 백엔드 uvicorn | `uv run uvicorn backend.main:app --reload --port 8003 --app-dir .` (수동) |
| Redis + Dramatiq | `redis-server` + `uv run dramatiq backend.workers.*` (수동) |
| Square Sandbox 환경변수 | 아래 참조 |

## 환경변수

```env
# Square Sandbox (미설정 시 관련 테스트 자동 skip)
SQUARE_APP_ID=sandbox-sq0idb-...
SQUARE_LOCATION_ID=...
SQUARE_ACCESS_TOKEN=EAAAl...

# 선택 — 기본값: http://localhost:8003
E2E_API_BASE=http://localhost:8003

# 선택 — 기본값: http://localhost:5173
E2E_BASE_URL=http://localhost:5173
```

## 실행

```bash
# 전체 실행 (chromium + webkit)
npm run test:e2e

# chromium 만 빠르게
npm run test:e2e -- --project chromium

# 특정 시나리오
npm run test:e2e -- --grep "Golden Path #1"

# UI 모드 (단계별 시각화)
npm run test:e2e:ui

# 리포트 열기 (마지막 실행 결과)
npm run test:e2e:report
```

## 테스트 목록

| 파일 | 시나리오 | STB 카드 | Skip 조건 |
|---|---|---|---|
| `golden-customer-order.spec.js` | 손님 QR→주문→Square결제→영수증→KDS | STB-02 | Square env 미설정 |
| `golden-admin-crud.spec.js` | 사장님 admin 메뉴 CRUD + 토글 | STB-03 | 백엔드 미가동 |
| `golden-staff-takeout-kds.spec.js` | 스태프 register→테이크아웃→KDS WS | STB-04 | 백엔드 미가동 |
| `golden-spc-integration.spec.js` | nearby→미니홈피→다국어 | STB-05 | 백엔드 미가동 |

## 시드 격리

각 테스트가 `beforeAll` 에서 `helpers/seed.js` 로 고유 slug 매장을 생성합니다 (`stb-test-{timestamp}`). 테스트 간 데이터 충돌 없음.

## 주의

- `fullyParallel: false` — WebSocket KDS broadcast 테스트의 타이밍 간섭 방지
- Square 카드 입력은 `iframe[title*="Card number"]` 등 iframe 별도 frameLocator 사용
- KDS WebSocket 미수신 시 테스트 실패가 아닌 경고 출력 (HTTP poll 허용)

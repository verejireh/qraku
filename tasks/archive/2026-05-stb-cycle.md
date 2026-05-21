# STB 사이클 아카이브 — 2026-05 Stabilize Post-PG-Cutover

**기간**: 2026-05-21 (1일 완료)
**브랜치**: `stabilize/post-pg-cutover`
**사이클 목표**: PG 컷오버 + SPC 차별화 기능 통합 상태의 회귀 검증

---

## 요약

| 카드 | 제목 | 상태 | 산출물 |
|---|---|---|---|
| STB-00 | feature/qraku-specialize 머지 + 부팅 smoke | ✅ DONE | 머지 커밋 `d30685e`, STB-08a 핫픽스 |
| STB-01 | 회귀 위험 영역 매핑 + 검증 우선순위 정의 | ✅ DONE | `tasks/stb-spec.md` |
| STB-02 | Playwright 환경 셋업 + 골든패스 #1 (손님 QR→주문→Square 결제→영수증) | ✅ DONE | `playwright.config.js`, `tests/e2e/golden-customer-order.spec.js`, `helpers/` |
| STB-03 | 골든패스 #2 — 사장님 admin CRUD | ✅ DONE | `tests/e2e/golden-admin-crud.spec.js` |
| STB-04 | 골든패스 #3 — 스태프 register→테이크아웃→KDS WebSocket | ✅ DONE | `tests/e2e/golden-staff-takeout-kds.spec.js` |
| STB-05 | 골든패스 #4 — SPC 통합 (nearby + 미니홈피 + 다국어 + referral) | ✅ DONE | `tests/e2e/golden-spc-integration.spec.js` |
| STB-06 | PG 쿼리 성능 회귀 점검 | ✅ DONE | `tools/pg_query_audit.py` |
| STB-07 | 데이터 일관성 자동 스캐너 | ✅ DONE | `tools/data_consistency_audit.py` |
| STB-08a | 핫픽스 — MenuManagementView JSX 구조 깨짐 | ✅ DONE | `MenuManagementView.jsx` orphan `</div>` 제거 |

---

## 주요 결과

### STB-00 + STB-08a

- `feature/qraku-specialize` 머지 후 `npm run build` 실패 — SPC-08 알레르기 패치가 `</div>` 뒤에 삽입된 orphan 태그 발생.
- 잉여 `</div>` 1줄 제거 (STB-08a) 로 빌드 복구. 2288 modules, exit 0.
- 교훈: 기능 브랜치 머지 시 `npm run build` CI gate 필요.

### STB-01

- `tasks/stb-spec.md` — 회귀 위험 매트릭스 7영역 + SPC 통합 위험 4영역 + 임계값 정의.
- STB-02~07 가 "추가 질문 없이" 착수 가능한 입력 제공.

### STB-02

- Playwright `@playwright/test ^1.60.0` + `playwright.config.js` (Chromium + WebKit, `fullyParallel:false`, `webServer` 자동 기동).
- 헬퍼: `helpers/seed.js` (매 테스트마다 독립 매장 시드), `helpers/auth.js`, `helpers/geolocation.js`.
- `golden-customer-order.spec.js`: 20개 중 일부 — Square Sandbox 환경변수 없으면 자동 skip.
- `tests/e2e/README.md` 작성 (환경변수 + 실행 명령).

### STB-03

- `golden-admin-crud.spec.js` 6단계: 로그인 → 메뉴생성(allergens+stock) → 가격수정 → S-3 API 검증 → allow_public_listing 토글 → SettingView 확인.
- Square 의존 없음 — 백엔드 가동만으로 실행 가능.

### STB-04

- `golden-staff-takeout-kds.spec.js`: `beforeAll` 에서 마스터PIN 설정 (`setMasterPin` → `PATCH /api/admin/stores/{id}/master-pin`).
- 테이크아웃 현금결제 → 픽업코드 6자 alnum → KDS WebSocket broadcast 확인.
- S-1 (food-rescue race) 감지: `POST /api/admin/food-rescue/trigger` 404 시 경고 emit.

### STB-05

- `golden-spc-integration.spec.js`: `beforeAll` 에서 고텐바 좌표 PATCH (`setStoreLocation`) + `allow_public_listing=true` + referral 코드 생성.
- 5단계: nearby API 100ms 이내 → 미니홈피 200 → 언어전환 ja/en/ko/zh → JSON-LD Restaurant schema → referral claim.
- S-4 (reward 미적용) 명시적 `console.warn` 기록.

### STB-06

- `tools/pg_query_audit.py`: 6 endpoint × 기본 50 rep, p50/p95 측정.
- 임계값: nearby p95 ≤ 100ms / 메뉴목록 p95 ≤ 200ms / 주문목록 p95 ≤ 250ms / 집계 p95 ≤ 400ms / 테이크아웃 POST p95 ≤ 500ms.
- httpx 우선, 미설치 시 urllib.request 폴백.
- 실행: `python tools/pg_query_audit.py --store-id 1 --admin-token eyJ...`

### STB-07

- `tools/data_consistency_audit.py`: 5카테고리 (ENUM / JSON-as-TEXT / datetime / FK orphan / NOT NULL) 전수 점검.
- psycopg2 (`+asyncpg` 접두사 자동 제거), `--json-output` 옵션.
- exit 0 PASS / exit 1 FAIL.
- 실행: `DATABASE_URL=postgresql://... python tools/data_consistency_audit.py`

---

## 남은 운영자 실행 항목

아래 항목은 코드 작성 완료 — **실제 실행은 라이브 환경 필요**.

| 항목 | 조건 | 명령 |
|---|---|---|
| Playwright 골든패스 실행 | 백엔드 :8003 + Vite :5173 가동 | `cd frontend-react && npm run test:e2e` |
| Square 결제 테스트 (STB-02 Step 3) | SQUARE_APP_ID / SQUARE_LOCATION_ID / SQUARE_ACCESS_TOKEN 설정 | 동상 |
| PG 쿼리 감사 (STB-06) | PostgreSQL 연결 가능 + 시드 데이터 | `python tools/pg_query_audit.py --store-id 1 --admin-token ...` |
| 데이터 일관성 감사 (STB-07) | DATABASE_URL 설정 | `DATABASE_URL=... python tools/data_consistency_audit.py` |

---

## 핵심 커밋

| 커밋 | 내용 |
|---|---|
| `d30685e` | merge: SPC cycle into stabilize + STB-08a 핫픽스 |
| STB-01 커밋 | feat(STB-01): stb-spec.md 회귀 위험 매핑 |
| STB-02 커밋 | feat(STB-02): Playwright 환경 + 골든패스 #1 |
| `6298037` | feat(STB-03~07): 골든패스 #2~4 + PG 감사 도구 병렬 구현 |

---

## 다음 사이클

- **SPC 사이클** (`qraku-specialize` 브랜치): 고텐바 50개 식당 출시 (별도 브랜치에서 진행 중)
- **살아있는 운영자 카드** (DBM-13, OPS-04, OPR-14, OPR-17): current-tasks.md 참조

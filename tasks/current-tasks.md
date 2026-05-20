# Current Tasks — stabilize/post-pg-cutover

> **2026-05-19 PG 컷오버 완료** + **2026-05-20 SPC 사이클 완료** (feature/qraku-specialize 브랜치).
> 본 워크트리 (`stabilize/post-pg-cutover`) 의 임무: **두 사이클 결과를 통합 검증** + 회귀 핫픽스.
>
> 검증 대상 = `feature/qraku-specialize` 머지 후 상태. STB-01 시작 직전에 머지 선행.

---

## 작업 완료 시 필수 절차

각 카드 종료 시 **두 가지**:

1. **진행 보드 상태 갱신** — `TODO → ✅ DONE`
2. **`tasks/work-log.md` append** — 기존 템플릿 사용

사이클 종료 시: ✅ DONE 카드를 `archive/{YYYY-MM-cycle-name}.md` 로 압축 이전.

---

## 🟢 살아있는 카드 (이전 사이클 잔여)

| ID | 항목 | 담당 | 기한 | 비고 |
|---|---|---|---|---|
| **DBM-13** | MySQL 의존 정리 (코드 + 운영) | 운영자 + sonnet (코드는 feature/qraku-specialize 에서 완료) | 운영자 2026-05-26 `systemctl stop mysql` / 2026-06-02 purge | — |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 | 운영자 | — | GCP 콘솔 5분 |
| **OPR-14** | 운영 VM 22 포트 방화벽 IP 재조정 | 운영자 | — | IAP 룰 활용 |
| **OPR-17** | VAPID 키 생성 (Web Push) | 운영자 | — | `npx web-push generate-vapid-keys` |

`OPR-01/13/16/18/19` 는 SPC 사이클 중 해소 완료. `OPR-15` 는 제거 (Maps SDK 0원 솔루션). 상세는 [feature/qraku-specialize 의 archive/2026-05-spc-cycle.md](../../qraku-specialize/tasks/archive/2026-05-spc-cycle.md).

---

# 신규 사이클 — STB (Stabilize Post-PG-Cutover)

> **사이클 목표**: PG 컷오버 + SPC 차별화 기능 통합 상태가 출시 가능한지 회귀 검증.
> **출시 베치헤드**: 고텐바 50개 식당 (qraku-specialize 와 동일 타임라인).
>
> **이 사이클이 답해야 할 질문**:
> 1. PG 위에서 핵심 사용자 흐름 (주문/결제/KDS/admin) 이 깨지지 않았는가?
> 2. SPC 신규 기능 (nearby API, 마감할인 cron, allergens, stock, referral) 이 기존 흐름과 충돌하지 않는가?
> 3. 50개 식당 동시 운영 가정에서 성능 회귀가 없는가?

## STB 진행 보드

| ID | 제목 | Phase | P | 모델 | 상태 |
|---|---|---|---|---|---|
| STB-00 | feature/qraku-specialize 머지 + 부팅 smoke | — | 🔴 P0 | 운영자/claude | ✅ DONE (2026-05-21, STB-08a 핫픽스 1건) |
| STB-01 | 회귀 위험 영역 매핑 + 검증 우선순위 정의 | A | 🔴 P0 | **opus** | TODO |
| STB-02 | Playwright 환경 셋업 + 골든패스 #1 (손님 QR→주문→Square 결제→영수증) | B | 🔴 P0 | **sonnet** | TODO |
| STB-03 | 골든패스 #2 — 사장님 admin (로그인→메뉴 CRUD→Settings 토글) | B | 🔴 P0 | **sonnet** | TODO |
| STB-04 | 골든패스 #3 — 스태프 register→테이크아웃→KDS WebSocket | B | 🔴 P0 | **sonnet** | TODO |
| STB-05 | 골든패스 #4 — SPC 통합 (nearby API → 미니홈피 → 다국어 ja/en/ko/zh) | C | 🟠 P1 | **sonnet** | TODO |
| STB-06 | PG 쿼리 성능 회귀 점검 (slow query + EXPLAIN ANALYZE 핵심 엔드포인트) | C | 🟠 P1 | **postgres-specialist** | TODO |
| STB-07 | 데이터 일관성 자동 스캐너 (ENUM/JSON/datetime invalid 값 검출) | D | 🟡 P2 | **sonnet** | TODO |
| STB-08 | 핫픽스 슬롯 (STB-02~07 진행 중 발견된 버그 동적 추가) | — | 동적 | sonnet | OPEN — 1건 발견 (STB-08a ✅) |

### Phase 분할 + 시간

| Phase | 카드 | 시간 | 의미 |
|---|---|---|---|
| **A**: 매핑 | STB-00, STB-01 | 0.5d | 머지 + 무엇을 어느 우선순위로 테스트할지 결정 |
| **B**: P0 골든패스 | STB-02, 03, 04 | 2d | "이게 깨지면 매장 운영 불가" 3개 흐름 자동화 |
| **C**: P1 통합/성능 | STB-05, 06 | 1d | SPC 신규 흐름 통합 검증 + 성능 회귀 검출 |
| **D**: P2 데이터 위생 | STB-07 | 0.5d | 컷오버 후 데이터 부패 잠재 발견 도구 |

**총 ≈ 4일** (STB-08 핫픽스 변동). MVP 출시 직전 게이트.

### 모델 사용 규칙

(SPC 사이클과 동일)

| 작업 유형 | 플랜 | 코딩 | 리뷰 |
|---|---|---|---|
| 사소 (오타, 1줄) | Sonnet 인라인 | Sonnet | Opus 1회 |
| 중간 (기능 1개) | **Opus 단독** | Sonnet | Opus + GPT-5.5 (옵션) |
| 큰 결정 (아키텍처/보안/결제) | **Opus + GPT-5.5 교차** | Sonnet | Opus + GPT + 자이라 |

---

# 카드 정의

> 각 카드 끝에 **사용자 지시 프롬프트**. 그대로 복사해서 Claude 에 붙여넣으면 실행.

---

## 🟦 STB-00 — feature/qraku-specialize 머지 + 부팅 smoke

**Owner**: claude (머지) + 운영자 (smoke 확인)
**Priority**: 🔴 P0
**Depends on**: SPC 사이클 종료 (완료됨, 2026-05-20)

### 배경

stabilize 브랜치가 `47ca47b` (2026-05-19 컷오버 직후) 상태로 정지. SPC-01~11 작업 결과 (`feature/qraku-specialize`, 마지막 커밋 `9c13aa7`) 가 본 브랜치 위에 머지되어야 통합 검증 가능.

### 절차

1. **로컬 머지**:
   ```bash
   cd D:/myproject/orderservice/.claude/worktrees/stabilize-post-pg-cutover
   git fetch
   git merge feature/qraku-specialize --no-ff -m "merge: SPC cycle into stabilize for integration testing"
   ```
2. **충돌 해소**: tasks/current-tasks.md, work-log.md 는 stabilize 본인 것 우선 (이 파일 보존)
3. **로컬 부팅 smoke**:
   ```bash
   uv sync
   uv run uvicorn backend.main:app --reload --port 8003 --app-dir .
   curl http://localhost:8003/api/healthz
   curl http://localhost:8003/api/readyz
   ```
4. **frontend smoke**: `cd frontend-react && npm install && npm run build` (빌드 깨지면 → 즉시 핫픽스)

### 수용 기준

- [ ] 머지 충돌 0건 또는 의도된 해소
- [ ] `uv run` backend 부팅 성공
- [ ] `/api/healthz` 200, `/api/readyz` 200
- [ ] `npm run build` 성공
- [ ] 마이그레이션 로그 ⚠️ 또는 에러 0건 (또는 명시된 무시 패턴)

### 사용자 지시 프롬프트

```
STB-00. stabilize 워크트리에서 feature/qraku-specialize 머지.
충돌 시 stabilize 측 tasks/* 보존 + 코드 충돌은 manual 결정.
부팅 + npm build smoke 후 결과 보고.
```

---

## 🟦 STB-01 — 회귀 위험 영역 매핑 + 검증 우선순위 정의

**Owner**: qraku-architect (opus)
**Priority**: 🔴 P0
**Depends on**: STB-00

### 배경

STB-02~07 카드 들이 "무엇을 어느 순서로" 검증할지 결정하는 명세 카드. 코드 한 줄도 안 만짐.

### 산출물 — `tasks/stb-spec.md`

1. **컷오버 회귀 위험 매트릭스** (5~7 영역)
   - 각 영역: 위험 가설 / 발견 방법 / 우선순위 / 담당 STB 카드
   - 예시 영역: 결제 상태 머신, KDS WebSocket, 다국어 fallback, 인증/세션, 출퇴근 timezone, ENUM/JSON 데이터, N+1 쿼리
2. **SPC 통합 위험** (3~4 영역)
   - nearby API + 기존 discover endpoint 공존
   - 마감할인 cron 이 영업시간 토글 동시 변경 시 race
   - allergens/stock 새 컬럼이 기존 메뉴 CRUD 깨지는지
   - referral claim 이 결제 흐름과 분리되는지
3. **Playwright 시나리오 우선순위** — STB-02/03/04/05 의 시나리오 한 줄 요약 + 통과 기준
4. **성능 회귀 임계값** — STB-06 의 핵심 endpoint 응답시간 기준 (p95)
5. **OUT-OF-SCOPE 명시** — 본 사이클이 안 다루는 것 (예: 로드 테스트, 보안 펜테스트)

### 허용 파일

- `tasks/stb-spec.md` (신규)
- 참고만: feature/qraku-specialize 의 spc-spec.md, work-log.md, backend/routers/*

### 수용 기준

- [ ] 회귀 위험 매트릭스 5~7 영역
- [ ] SPC 통합 위험 3~4 영역
- [ ] STB-02~07 가 "추가 질문 없이" 착수 가능한 입력
- [ ] OUT-OF-SCOPE 명시 (사이클 폭주 방지)

### 사용자 지시 프롬프트

```
STB-01 명세. opus. tasks/stb-spec.md 신규.
회귀 위험 영역 매핑 + STB-02~07 입력 정밀화.
```

---

## 🟦 STB-02 — Playwright 환경 + 골든패스 #1 (손님 주문→결제→영수증)

**Owner**: sonnet
**Priority**: 🔴 P0
**Depends on**: STB-01

### 배경

매출 직결 P0 흐름. 컷오버 + SPC 머지 후 가장 먼저 깨지면 안 되는 흐름. 자동화 1개 만들어두면 매번 30초 회귀 검출 가능.

### 환경 셋업

- `frontend-react` 에 `@playwright/test` 추가 (devDependency)
- `frontend-react/playwright.config.js` 신규
- `tests/e2e/` 폴더 신규 (frontend-react 또는 프로젝트 루트 — STB-01 에서 결정)
- npm script: `npm run test:e2e`
- backend + vite preview 또는 dev server 자동 기동 (Playwright `webServer` 옵션)
- 테스트용 시드 데이터: STB-02 안에서 `tools/seed_test_store.py` 신규 또는 기존 demo 매장 활용

### 시나리오 #1 단계

1. `/{shop_id}/table/1/menu` 접속
2. 메뉴 카드 1개 클릭 → 옵션 선택 → 카트 담기
3. 카트 모달 → 결제 진행 → **Square Sandbox** 카드 입력 (테스트 카드 `4111 1111 1111 1111`)
4. 결제 성공 → 영수증 페이지 (`/{shop_id}/receipt/{order_id}`) 표시 확인
5. `payment_status='paid'` 확인 (DB 직접 또는 API 호출)
6. KDS WebSocket 으로 주문 broadcast 도착 확인 (별도 브라우저 컨텍스트로 `/kitchen` 열어서 새 주문 카드 등장)

### 허용 파일

- `frontend-react/package.json` (devDep + script)
- `frontend-react/playwright.config.js` (신규)
- `frontend-react/tests/e2e/golden-customer-order.spec.js` (신규)
- `frontend-react/tests/e2e/helpers/` (신규, 시드/유틸)
- `tools/seed_test_store.py` (필요 시)

### 수용 기준

- [ ] `npm run test:e2e` 실행 시 Chromium + WebKit 둘 다 PASS
- [ ] 시나리오 #1 1회 30초 이내
- [ ] CI 친화 (headless 모드 동작)
- [ ] README 또는 tests/e2e/README.md 에 실행법 1 페이지
- [ ] Square Sandbox 환경변수 명시 (없으면 skip 자동)

### 사용자 지시 프롬프트

```
STB-02. sonnet.
Playwright 환경 셋업 + 손님 주문→Square Sandbox 결제→영수증→KDS WebSocket 골든패스.
STB-01 spec §3 시나리오 #1 따름. 단일 매장 시드 필수.
```

---

## 🟦 STB-03 — 골든패스 #2 (사장님 admin CRUD)

**Owner**: sonnet
**Priority**: 🔴 P0
**Depends on**: STB-02 (Playwright 환경 재사용)

### 시나리오 단계

1. `/login` → 사장님 이메일/비번 입력 → admin 진입
2. `/{shop_id}/admin/menu/new` → 메뉴 등록 (이름/가격/카테고리/옵션 1개/allergens 1개/stock_today_total 5)
3. `/{shop_id}/admin/menu` → 방금 만든 메뉴 가격 수정
4. `/{shop_id}/admin` → AdminHomePageView → `allow_public_listing` 토글 ON
5. `/{shop_id}/admin/operation` → 테이블 1개 추가
6. (옵션) `/{shop_id}/setting` → 毎日運営 탭 → 매장 ON/OFF + 마감할인 토글 확인

### 허용 파일

- `frontend-react/tests/e2e/golden-admin-crud.spec.js` (신규)
- `frontend-react/tests/e2e/helpers/auth.js` (사장님 로그인 헬퍼)

### 수용 기준

- [ ] 메뉴 CRUD 전 라이프사이클 PASS (생성→읽기→수정→allergens/stock 반영)
- [ ] allow_public_listing 토글 후 즉시 `/{shop_id}` 미니홈피 200
- [ ] SettingView 毎日運営 탭 두 토글 분리 동작 확인

---

## 🟦 STB-04 — 골든패스 #3 (스태프 register→테이크아웃→KDS)

**Owner**: sonnet
**Priority**: 🔴 P0
**Depends on**: STB-02

### 시나리오 단계

1. `/{shop_id}/staff` 마스터 PIN 입력 → 스태프 로그인
2. `/{shop_id}/register` → 테이크아웃 주문 만들기 (메뉴 2개)
3. 현금 결제 처리 → `payment_status='paid'`, `order_type='takeout'`
4. KDS (`/{shop_id}/kitchen`) 별도 컨텍스트에서 → 주문 카드 등장 확인 (WebSocket)
5. 주문 아이템 상태 변경 (pending → cooking_complete → served) 모두 KDS broadcast
6. 픽업코드 (6자리) 화면 표시 확인

### 허용 파일

- `frontend-react/tests/e2e/golden-staff-takeout-kds.spec.js`

### 수용 기준

- [ ] WebSocket 연결 + broadcast 안정성 확인 (2+ 컨텍스트)
- [ ] 픽업코드 표시
- [ ] 주문 아이템 status 변경 KDS 반영

---

## 🟦 STB-05 — 골든패스 #4 (SPC 통합 — nearby + 미니홈피 + 다국어)

**Owner**: sonnet
**Priority**: 🟠 P1
**Depends on**: STB-02

### 시나리오 단계

1. `/discover` 진입 → "近くのお店" 버튼 → geolocation mock (시드 매장 근처 좌표)
2. nearby API 응답 → 시드 매장 카드 등장 → 거리 표시 확인
3. 카드 클릭 → `/{shop_id}` 미니홈피 진입
4. 언어 전환 ja → en → ko → zh (각 전환마다 메뉴/카테고리/푸터 텍스트 변경 확인)
5. (옵션) referral 코드 입력 → claim 성공 메시지
6. 미니홈피 JSON-LD `<script type="application/ld+json">` 존재 확인

### 허용 파일

- `frontend-react/tests/e2e/golden-spc-integration.spec.js`
- `frontend-react/tests/e2e/helpers/geolocation.js` (geolocation mock)

### 수용 기준

- [ ] nearby API 응답 < 200ms (시드 매장 5개 기준)
- [ ] 4개 언어 텍스트 변경 확인
- [ ] JSON-LD Restaurant schema 존재
- [ ] referral claim 1회 성공

---

## 🟦 STB-06 — PG 쿼리 성능 회귀 점검

**Owner**: postgres-specialist / sonnet
**Priority**: 🟠 P1
**Depends on**: STB-00

### 배경

MySQL → PG 컷오버 후 query planner 가 다르므로 N+1, 인덱스 미사용, sequential scan 등 회귀 가능. SPC-03 nearby 도 PostGIS 신규 쿼리 → 성능 검증 필요.

### 산출물

1. `tools/pg_query_audit.py` 신규 — 핵심 endpoint 50회 호출 후 p50/p95 측정
2. EXPLAIN ANALYZE 출력 — 시드 데이터 (50 매장 / 500 메뉴 / 1000 주문) 기준
3. Slow query 임계값 초과 항목 보고 (p95 > 200ms)
4. `pg_stat_statements` 활성화 확인 + Top 10 쿼리 보고

### 핵심 점검 endpoint

- `GET /api/menus/{store_id}` (메뉴 목록 + 옵션 JSON)
- `GET /api/orders/{store_id}` (주문 목록 + items join)
- `GET /api/public/discover/nearby` (PostGIS 신규)
- `GET /api/admin/insights/visitors` (집계 쿼리)
- `GET /api/stats/*` (대시보드)

### 허용 파일

- `tools/pg_query_audit.py` (신규)
- `backend/database.py` (필요 시 인덱스 추가 — migration_sqls 끝)

### 수용 기준

- [ ] 5개 endpoint p95 < 200ms
- [ ] Sequential scan 발견 시 인덱스 추가
- [ ] N+1 발견 시 selectinload/joinedload 추가

---

## 🟦 STB-07 — 데이터 일관성 자동 스캐너

**Owner**: sonnet
**Priority**: 🟡 P2
**Depends on**: STB-00

### 배경

컷오버 후 MySQL ENUM 값이 PG VARCHAR 로 그대로 옮겨졌는데 모든 값이 SQLModel 정의 enum 안에 있는지 보장 없음. JSON-as-TEXT 필드 (`options`, `allergens`, `business_hours`) 도 invalid JSON 가능. datetime 필드 timezone 일관성도 의심.

### 산출물

`tools/data_consistency_audit.py` — 다음 점검 + 리포트:

1. ENUM 컬럼별 invalid 값 (`store.kitchen_mode`, `store.payment_options`, `order.order_type`, `table.status`, `orderitem.status` 등)
2. JSON-as-TEXT 컬럼 parse 실패 (`menu.options`, `menu.allergens`, `store.business_hours`, `store.interior_photos`, `store.exterior_photos` 등)
3. datetime 컬럼 NULL/이상값 (`order.created_at`, `staffmember.clock_in_at`)
4. FK 무결성 (orphan row 검출)
5. NULL 허용 안 되는 필드의 NULL (모델 정의 vs 실제 DB)

### 허용 파일

- `tools/data_consistency_audit.py` (신규)

### 수용 기준

- [ ] 5개 점검 모두 통과 또는 발견 항목 핫픽스 (STB-08 으로)
- [ ] 운영 VM 에서 1회 실행 + 보고
- [ ] cron 후보 (월 1회) 권고

---

## 🟦 STB-08 — 핫픽스 슬롯 (동적)

**Owner**: sonnet
**Priority**: 동적 (발견 즉시 P0 우선)
**Depends on**: STB-02~07

### 운영 방식

STB-02~07 진행 중 발견된 회귀/버그를 본 카드 아래에 **하위 카드 (STB-08a, 08b, ...)** 로 추가. 각 핫픽스는 별도 commit + work-log entry.

### 슬롯

- **STB-08a** ✅ DONE (2026-05-21) — `MenuManagementView.jsx` JSX 구조 깨짐 핫픽스. SPC-08 알레르기 패치가 `<div className="p-6 space-y-4">` 의 `</div>` 뒤에 삽입되어 orphan 발생. 잉여 `</div>` 1줄 제거로 해소. STB-00 머지 후 `npm run build` 실패에서 검출.

### 종료 조건

- 사이클 종료 시점에 추가된 모든 STB-08x 가 ✅ DONE
- 또는 별도 사이클로 이전 (출시 후 fix)

---

## 사이클 종료 절차

본 STB 사이클 종료 시:
- 모든 ✅ DONE 카드를 `archive/2026-05-stb-cycle.md` 로 요약
- `current-tasks.md` 살아있는 카드만 유지 (출시 후 사이클 준비)

---

## 참고

- 전 사이클 SPC: `feature/qraku-specialize` 브랜치의 [`tasks/archive/2026-05-spc-cycle.md`](../../qraku-specialize/tasks/archive/2026-05-spc-cycle.md)
- 전 사이클 DBM: [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md)
- 마케팅 프로젝트: `D:\myproject\qraku-marketing\`

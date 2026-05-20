# STB-01 — Stabilize Post-PG-Cutover 검증 명세

> **작성**: 2026-05-21 (opus)
> **대상 코드**: stabilize 브랜치 `aadb4d6` (= feature/qraku-specialize 머지 + STB-08a 핫픽스)
> **임무**: STB-02 ~ STB-07 카드가 "무엇을 어느 우선순위로 검증할지" 한 번에 결정. SPC-01 의 stabilize 판본.
>
> **이 문서는 코드를 한 줄도 안 만진다**. 산출물 = 본 문서뿐.

---

## 1. 이 사이클이 답해야 할 3가지 질문

1. **PG 컷오버가 핵심 사용자 흐름을 깨뜨렸는가?** — MySQL → PostgreSQL 전환 후 데이터 타입/쿼리 planner 차이로 인한 회귀
2. **SPC 신규 기능 (SPC-02~10) 이 기존 흐름과 충돌하는가?** — 11개 카드 1주일 만에 머지된 코드의 통합 리스크
3. **50개 식당 동시 운영 가정에서 성능이 충분한가?** — 베치헤드 (고텐바) 출시 직전 게이트

---

## 2. 컷오버 회귀 위험 매트릭스 (7 영역)

> 각 행: 영역 / 위험 가설 / 발견 방법 / P / 담당 카드

| # | 영역 | 위험 가설 (구체적) | 발견 방법 | P | 담당 |
|---|---|---|---|---|---|
| C-1 | **결제 상태 머신** | `order.payment_status` ('unpaid'/'paid'), `order_status`, `square_payment_id` 의 idempotency UNIQUE 인덱스 (`uq_order_square_payment_id`) 가 PG 에서 NULL multiple 허용 동작 검증 안 됨. PG 의 partial unique index 가 동작 보장 안 함 → 중복 주문 가능성 | Playwright 골든패스 #1 (STB-02) + 동일 idempotency-key 로 2회 POST 직접 호출 | 🔴 P0 | STB-02 + STB-07 |
| C-2 | **WebSocket KDS broadcast** | `/ws/kitchen/{store_id}`, `/ws/admin/{store_id}`, `/ws/customer/{store_id}/{table_number}` 3채널이 PG 컷오버와 무관하지만, dramatiq + Redis pub/sub 가 신규 → 메시지 손실/지연 가능. 특히 SPC-02 `food_rescue_check` actor 가 broadcast 추가 | STB-04 골든패스 2개 브라우저 컨텍스트 (register / kitchen) 동시 + actor 동작 중 메시지 카운트 | 🔴 P0 | STB-04 |
| C-3 | **ENUM 데이터 일관성** | MySQL ENUM 컬럼이 PG VARCHAR 로 옮겨졌으나 모든 값이 SQLModel enum 클래스 (KitchenMode/OrderType/TableStatus/PaymentMethodType/PointTransactionType/MenuGroupType/MessageSenderType/StoreCategory/SubscriptionType/SubscriptionStatus/PointAccrualType/PaymentOptions/POSType 13개) 안에 있는지 보장 없음. invalid 값이 row 에 있으면 read 시점에 ValidationError | `tools/data_consistency_audit.py` (STB-07) 가 13 ENUM 컬럼 전수 검사 | 🟠 P1 | STB-07 |
| C-4 | **JSON-as-TEXT 필드 무결성** | `menu.options`, `menu.allergens`, `store.business_hours`, `store.interior_photos`, `store.exterior_photos`, `store.nearby_attractions`, `orderitem.option_details`, `store.extra_translations` 등 9개 JSON-as-TEXT 컬럼 parse 실패 가능 (특히 한자/이모지 인코딩) | STB-07 의 JSON.loads 전수 시도 + 실패 row id 보고 | 🟠 P1 | STB-07 |
| C-5 | **DATETIME vs TIMESTAMP** | `migration_sqls` 에 `DATETIME NULL` 6행 잔존 (PG 에는 DATETIME 타입 없음). `IF NOT EXISTS` + `create_all` 선행 덕에 무해하나, 신규 PG 인스턴스에서 column 부재 + DATETIME 타입 시 syntax error 무시 (ignored_errors 미매칭) → 로그 ⚠️ 가 정상으로 오해될 수 있음 | STB-00 부팅 로그 grep `⚠️ Migration skipped` — 현재 결과 보고 | 🟡 P2 | STB-07 보고서 |
| C-6 | **N+1 쿼리 / sequential scan** | PG query planner 가 MySQL 과 다르므로 (특히 small table 에서 index 무시 경향) `/api/menus/{store_id}` (옵션 JSON 별도 SELECT 없는지), `/api/orders/{store_id}` (items join lazy load), `/api/admin/insights/*` (집계) 가 회귀 가능 | STB-06 의 `pg_stat_statements` Top 10 + EXPLAIN ANALYZE seq scan 검출 | 🟠 P1 | STB-06 |
| C-7 | **timezone 일관성** | 컷오버 시 `datetime.utcnow()` 와 `datetime.now(JST)` 혼재. `staffmember.clock_in_at`, `order.created_at`, `food_rescue_scheduler` (JST 기준) 간 TZ 불일치 가능 | STB-07 의 datetime 컬럼 TZ-aware/naive 혼재 검출 + STB-04 가 출퇴근 자동화 | 🟠 P1 | STB-07 + STB-03 |

---

## 3. SPC 통합 위험 (4 영역)

> 11개 카드 1주일 만에 머지. 카드별 단독 테스트는 있어도 **상호작용 검증 부재**.

| # | 위험 | 시나리오 | 발견 방법 | P | 담당 |
|---|---|---|---|---|---|
| S-1 | **food_rescue cron ↔ SettingView 토글 race** | SPC-02 cron `*/5 * * * *` 가 `food_rescue_manual_active` write, 동시에 SPC-11 SettingView 의 사장님이 같은 컬럼 toggle. SELECT-UPDATE 비원자 → lost update | STB-04 골든패스 중간에 cron 강제 trigger + UI 토글 (수동 race) | 🔴 P0 | STB-04 분기 |
| S-2 | **nearby API ↔ 기존 discover endpoint 공존** | `/api/public/discover/nearby` (SPC-03) 가 PostGIS 사용, `/api/discover/*` (기존) 는 prefecture/city 필터. 두 endpoint 의 응답 shape 일관성 (특히 store_id vs id, latitude vs lat) 검증 부재 | STB-05 시나리오 + 응답 schema 대조 | 🟠 P1 | STB-05 |
| S-3 | **allergens/stock 컬럼이 기존 menu CRUD 깨뜨림** | SPC-08/09 가 `menu.allergens` (JSON), `menu.stock_today_total/sold` 추가. 기존 admin UI (`AdminMenuRegisterView`) 는 신규 컬럼 무지 — PUT payload 에 누락 시 default 적용은 OK, 단 `update_menu` allowed_fields 화이트리스트 누락 가능 | STB-03 골든패스 #2 가 allergens 1개 + stock 5 설정 + 가격 수정 후 allergens/stock 보존 확인 | 🟠 P1 | STB-03 |
| S-4 | **referral claim 이 결제 흐름과 분리** | SPC-10 `POST /api/referrals/claim` 가 reward_message 만 반환 (실제 할인 자동 적용 X). 손님이 claim 후 결제 시점에 reward 가 어디서도 read 되지 않음 → "코드 입력했는데 할인 안 됨" 클레임 가능. **이는 의도된 P2 미구현이지만 명시 필요** | STB-05 시나리오에 claim 후 결제 흐름 1회 (reward 미적용 사실 확인) | 🟡 P2 | STB-05 비고 |

---

## 4. Playwright 골든패스 시나리오 우선순위

> STB-02~05 가 자동화할 사용자 흐름. 각 카드 = 1 시나리오. 모두 Chromium + WebKit dual 실행.

### 시나리오 #1 — 손님 QR → 주문 → Square Sandbox 결제 → 영수증 → KDS broadcast (STB-02)

| Step | 행동 | 통과 기준 |
|---|---|---|
| 1 | `/{shop_id}/table/1/menu` 진입 | 200, 메뉴 카드 1+ 렌더 |
| 2 | 카테고리 1개 선택 → 메뉴 카드 클릭 → 옵션 1개 선택 → 카트 추가 | 카트 카운트 +1 |
| 3 | 카트 모달 → 합계 표시 → 결제 진행 | 결제 UI 로드 |
| 4 | Square Sandbox 카드 입력 (`4111 1111 1111 1111` / 12/29 / 123) | 결제 성공 응답 |
| 5 | `/{shop_id}/receipt/{order_id}` 리디렉트 | `payment_status='paid'` (API 또는 DB) |
| 6 | 별도 컨텍스트 `/{shop_id}/kitchen` (사전 열림) | 새 주문 카드 등장 (WebSocket) |

**의존**: Square SANDBOX 환경변수 (`SQUARE_APP_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN`). 없으면 skip 자동.

### 시나리오 #2 — 사장님 admin 메뉴 CRUD + Setting 토글 (STB-03)

| Step | 행동 | 통과 기준 |
|---|---|---|
| 1 | `/login` → 사장님 로그인 | JWT 쿠키 set |
| 2 | `/{shop_id}/admin/menu/new` → 메뉴 생성 (`name_jp`, `price=500`, `category=テスト`, `allergens=['wheat']`, `stock_today_total=5`) | 201, 메뉴 목록에 반영 |
| 3 | `/{shop_id}/admin/menu` → 방금 만든 메뉴 가격 800 으로 수정 | 200, 가격 + allergens + stock 보존 확인 (S-3 검증) |
| 4 | `/{shop_id}/admin` → AdminHomePageView → `allow_public_listing` ON | `/{shop_id}` 미니홈피 200 즉시 |
| 5 | `/{shop_id}/setting` → 毎日運営 탭 → 매장 ON/OFF + 마감할인 토글 분리 동작 | 두 토글 독립 동작 확인 |
| 6 | (옵션) 출퇴근 clock-in 1회 | `staffmember.clock_in_at` write + TZ 확인 (C-7) |

### 시나리오 #3 — 스태프 register → 테이크아웃 → KDS WebSocket (STB-04)

| Step | 행동 | 통과 기준 |
|---|---|---|
| 1 | `/{shop_id}/staff` 마스터 PIN 입력 | 인증 성공 |
| 2 | `/{shop_id}/register` 테이크아웃 모드 → 메뉴 2개 추가 → 현금 결제 | `order_type='takeout'`, `payment_status='paid'` |
| 3 | 픽업코드 (6자리) 화면 표시 | `pickup_code` 6자리 alnum |
| 4 | 별도 컨텍스트 KDS → 새 주문 카드 등장 | WebSocket message 수신 |
| 5 | 주문 아이템 상태 변경 (pending → cooking_complete → served) | KDS broadcast 3회 |
| 6 | (분기) `food_rescue_check` actor 강제 trigger → 매장 토글 즉시 변경 (S-1 race) | UI 갱신 또는 race log |

### 시나리오 #4 — SPC 통합 (nearby + 미니홈피 + 다국어) (STB-05)

| Step | 행동 | 통과 기준 |
|---|---|---|
| 1 | `/discover` → "近くのお店" → geolocation mock (시드 매장 근처 좌표) | nearby API 200, 응답 < 100ms (성능 §5) |
| 2 | 카드 클릭 → `/{shop_id}` 미니홈피 진입 | 200 |
| 3 | 언어 전환 ja → en → ko → zh | 4개 언어 메뉴 텍스트 변경 |
| 4 | `<script type="application/ld+json">` 존재 + Restaurant schema 파싱 | JSON-LD valid |
| 5 | referral 코드 입력 → claim 성공 | 200, reward_message 표시, **결제 시 reward 미적용 사실 명시** (S-4) |

---

## 5. 성능 회귀 임계값 (STB-06)

> 시드: 50 매장 / 500 메뉴 / 1000 주문. 단일 요청 50회 반복 측정.

| Endpoint | p50 목표 | p95 목표 | 측정 방법 |
|---|---|---|---|
| `GET /api/menus/{store_id}` | < 80ms | < 200ms | `tools/pg_query_audit.py` curl loop |
| `GET /api/orders/{store_id}` | < 100ms | < 250ms | 동상 + EXPLAIN ANALYZE |
| `GET /api/public/discover/nearby?lat=...&lng=...&radius=800` | < 50ms | < 100ms | PostGIS ST_DWithin (이미 OPR-16 확인: 도쿄↔고텐바 86km 정확) |
| `GET /api/admin/insights/visitors` | < 150ms | < 400ms | 집계 무거움 |
| `GET /api/stats/dashboard` | < 150ms | < 400ms | 동상 |
| `POST /api/orders/` (테이크아웃) | < 200ms | < 500ms | step 6.5 stock 차감 포함 |

**도구**:
- `pg_stat_statements` Top 10 (EXPLAIN ANALYZE 후속)
- `EXPLAIN (ANALYZE, BUFFERS)` 으로 seq scan 검출
- 인덱스 미사용 발견 시 `migration_sqls` 끝에 `CREATE INDEX IF NOT EXISTS ...` 추가

**Fail 시 분기**: 단일 endpoint p95 임계 초과 → STB-08 핫픽스 카드 추가 (인덱스 + selectinload).

---

## 6. 데이터 일관성 자동 스캐너 (STB-07) 점검 매트릭스

> `tools/data_consistency_audit.py` 가 5 카테고리 전수 스캔.

| 카테고리 | 점검 대상 | 위험 매트릭스 |
|---|---|---|
| **ENUM 컬럼** | 13개 ENUM (KitchenMode/OrderType/TableStatus/PaymentMethodType/PointTransactionType/MenuGroupType/MessageSenderType/StoreCategory/SubscriptionType/SubscriptionStatus/PointAccrualType/PaymentOptions/POSType) | C-3 |
| **JSON-as-TEXT** | 9 컬럼 (`menu.options`, `menu.allergens`, `store.business_hours`, `store.interior_photos`, `store.exterior_photos`, `store.nearby_attractions`, `orderitem.option_details`, `store.extra_translations`, `webhookevent.payload`) | C-4 |
| **datetime NULL/이상** | `order.created_at`, `staffmember.clock_in_at`, `guestprofile.prev_last_visit`, `rewardcoupon.used_at/expires_at`, `referralcode.expires_at` | C-7 |
| **FK orphan** | `orderitem.order_id`, `menu.store_id`, `staffmember.store_id` 등 (PG cascade 동작 확인) | 추가 |
| **NOT NULL 위반** | 모델 정의 vs 실제 DB (예전 MySQL 에 NULL 있던 컬럼) | 추가 |

**산출**: 카테고리별 통과/실패 + 실패 row id 리스트. 실패 → STB-08 핫픽스 후보.

---

## 7. OUT-OF-SCOPE (본 사이클 비대상)

> 사이클 폭주 방지. 다음 항목은 별도 사이클 또는 출시 후.

| 항목 | 이유 |
|---|---|
| **로드 테스트** (50+ 동시 사용자) | 본 사이클은 회귀 검출 목적. 부하는 별도 LOAD 사이클 (출시 후) |
| **보안 펜테스트** | sec-audit-report.md 이미 존재. 추가는 별도 사이클 |
| **실 카드 결제** | Square Sandbox 만. 실 카드는 운영자 OPR 작업 |
| **PayPay sandbox E2E** | mock 처리 (CLAUDE.md 미완 P0 항목, 별도 카드) |
| **모바일 네이티브 앱** | PWA (SPC-06) 만 검증. 네이티브는 미래 |
| **AI/ML 정확도** | `translate.py` 의 번역 품질, `vision_api` 의 NSFW 정확도 검증 X |
| **PostGIS 정밀도** | OPR-16 smoke 에서 86km 검증 완료. 본 사이클은 응답시간만 |
| **LINE LIFF 통합** | OPR-02 (VITE_LINE_LIFF_ID) 미설정 시 자동 skip |
| **PayPay Webhook 신규 엔드포인트** | CLAUDE.md P0 별도 항목, STB 사이클 후 |
| **환불 라우터** | CLAUDE.md P0 별도 항목, STB 사이클 후 |

---

## 8. STB-02~07 착수 게이트

각 카드가 본 spec 의 어느 § 만 읽으면 추가 질문 없이 착수 가능한지:

| 카드 | 필독 § | 핵심 입력 |
|---|---|---|
| STB-02 | §4 시나리오 #1, §2 C-1 (결제 멱등) | Square Sandbox 환경변수, 시드 매장 1개 |
| STB-03 | §4 시나리오 #2, §3 S-3 (allergens/stock 보존) | 사장님 로그인 시드 |
| STB-04 | §4 시나리오 #3, §2 C-2 (WS), §3 S-1 (race) | 마스터 PIN 시드 |
| STB-05 | §4 시나리오 #4, §3 S-2/S-4 (nearby/referral) | geolocation mock, 시드 매장 5개 |
| STB-06 | §5 전체 | `pg_stat_statements` 활성화 + 시드 (50/500/1000) |
| STB-07 | §6 전체 | 운영 DB 또는 시드 DB read-only 접근 |

---

## 9. 사이클 종료 조건

다음 모두 충족 시 STB 사이클 종료 + `archive/2026-05-stb-cycle.md` 작성:

- [ ] STB-02 ~ STB-05 골든패스 4개 모두 Chromium 통과 (WebKit fail 은 비고 처리)
- [ ] STB-06 6개 endpoint p95 임계 달성 또는 핫픽스 머지
- [ ] STB-07 5 카테고리 모두 통과 또는 발견 항목 핫픽스
- [ ] STB-08 슬롯의 모든 a/b/c 핫픽스 ✅ DONE
- [ ] CI hook (선택, STB-02 권고): `npm run build` pre-merge gate 등록

---

## 10. 변경 이력

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-21 | v1.0 | 초안 (opus). STB-02~07 입력 정밀화 + OUT-OF-SCOPE 5 항목. |

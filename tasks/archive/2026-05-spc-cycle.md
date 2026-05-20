# Archive — 2026-05 qraku-Specialize Cycle (SPC)

> **사이클 기간**: 2026-05-20 (단일 세션)
> **결과**: 고텐바 50개 식당 베치헤드 출시를 위한 차별화 기능 11개 카드 완료
> **핵심 USP**: "걸어서 10분 이내 마감 할인 식당 발견"
> **잔여**: DBM-13 (MySQL 정리, 2026-05-26), OPS-04 (GCP 디스크 알람), OPR-14/17 (운영자)

---

## 사이클 동기

- **미니홈피 (/{shop_id})** 는 80% 구현 완료 상태였으나, 위경도 검색 + 서버 자동화 부재로 핵심 USP 작동 불가
- PostGIS 활성화 (OPR-16) 완료 → SPC-03 PostGIS 경로 진행 가능해짐
- 기존 코드 감사 (2026-05-19) 결과: 미니홈피, 공개 동의 UI, 지역 디스커버 ✅ / 마감 할인 자동화, 위경도 검색, 지도 UI ⚠

---

## 카드별 결과 요약

### Phase A — 명세 (SPC-01, opus)

| 카드 | 결과 | 산출물 |
|---|---|---|
| **SPC-01** | qraku-specialize 기능 명세 + 사용자 흐름 | `tasks/spc-spec.md` (13 §, 손님/사장님 mermaid 흐름, 기능 명세 15행, API 5개, 결정 대기 5항목) |

**자이라 확정 결정 (v1.1~v1.3)**:
- Discover 인증 = 익명 + IP rate-limit
- 알레르기 = P2 유지
- PWA 푸시 = 옵트인 "단골 등록" 버튼
- 마감 할인 자동/수동 = **이벤트 발동 방식만** (is_open 과 무관)
- 지도 라이브러리 = Google Maps SDK X, 외부 링크 + Embed iframe (0원)
- SPC-11 위치 = 신규 페이지 X, 기존 SettingView 신규 탭 "毎日運営"

### Phase B — 백엔드 핵심 (SPC-02, SPC-03, SPC-11)

| 카드 | 결과 |
|---|---|
| **SPC-02** | Dramatiq actor `food_rescue_check` — 매 5분 close_at 기준 `food_rescue_manual_active` 자동 갱신. `business_hours.py:get_close_time_today()` 추가 (자정 넘김 처리). 단위 테스트 7케이스 PASS. WebSocket broadcast (`FOOD_RESCUE_CHANGED`). |
| **SPC-03** | `GET /api/public/discover/nearby` — PostGIS `ST_DWithin`+`ST_Distance`. radius 기본 800m, max 5000m. 함수형 GIST 인덱스 마이그레이션. `food_rescue_only` 필터. |
| **SPC-11** | `SettingView.jsx` 신규 탭 "毎日運営" (첫 탭) — 매장 ON/OFF (녹/적) + 마감 할인 수동 토글 (주황/회) 상하 분리. auto 모드 시 disabled + admin 링크 안내. `RegisterView.jsx` 중복 토글 제거. |

### Phase C — 프론트 핵심 (SPC-04, SPC-05, SPC-06)

| 카드 | 결과 |
|---|---|
| **SPC-04** | `DiscoverView.jsx` 지도 모드 추가. 현재 위치 버튼 → `GET /api/public/discover/nearby` 호출. 마감 할인 식당 카드에 "🔥 마감할인" 배지. "📍 지도 보기" 클릭 → Google Maps 외부 링크 (0원). 카드 ↔ 지도 토글. 필터 (카테고리/할인중만/거리). |
| **SPC-05** | `backend/routers/seo.py` 신규. `GET /sitemap.xml` — `allow_public_listing=True` 매장 동적 생성. `GET /robots.txt`. `StorePublicView.jsx` 에 JSON-LD Restaurant schema + hreflang 4개 언어. `react-helmet-async` 추가. |
| **SPC-06** | `frontend-react/public/manifest.json` + `vite-plugin-pwa`. service worker (캐시 우선). `backend/routers/push.py` — VAPID 구독 API (OPR-17 대기). 미니홈피 "단골 등록" 푸시 알림 옵트인 버튼. |

### Phase D — 사장님 가치 강화 (SPC-07, SPC-08, SPC-09)

| 카드 | 결과 |
|---|---|
| **SPC-07** | `backend/routers/insights.py` 신규 — 4개 admin 전용 엔드포인트 (`/visitors`, `/popular_menus`, `/rescue_effect`, `/neighborhood_avg`). `AdminHomePageView.jsx` — `InsightsSection` 컴포넌트 (CSS-only 바 차트, Promise.all 병렬 패치, 4개 패널). |
| **SPC-08** | `Menu.allergens` VARCHAR(500) JSON 배열. `backend/database.py` 마이그레이션. `AdminMenuRegisterView.jsx` + `MenuManagementView.jsx` — 13종 알레르기 칩 토글 (이모지 라벨). `menus.py` allowed_fields 확장. |
| **SPC-09** | `Menu.stock_today_total` (None=무제한) + `Menu.stock_today_sold`. `orders.py` step 6.5 — OrderItem 생성 시 stock_today_sold 자동 증가 + 품절 시 is_available=False. `SettingView.jsx` SoldOutTab — "残 N/M" 배지 + 仕込み量 입력 + ↺ 리셋. `PATCH /api/menus/{id}/stock` 신규. |

### Phase E — 바이럴 (SPC-10)

| 카드 | 결과 |
|---|---|
| **SPC-10** | `backend/routers/referrals.py` 신규 — 8자 랜덤 코드 생성 (5회 충돌 방지). 사장님: 코드 생성/목록/비활성화. 손님: `/claim` (중복 방지, 만료/한도 체크). `ReferralCode` + `ReferralClaim` SQLModel 모델. `AdminHomePageView.jsx` — `ReferralSection` (코드 복사 링크 `?ref=CODE`). `StorePublicView.jsx` — `?ref=` URL 파라미터 자동 프리필, claim 성공 시 `reward_message` 초록 배너. |

---

## 데이터 모델 변경 요약

| 모델 | 신규 필드 | 카드 |
|---|---|---|
| `Menu` | `allergens VARCHAR(500) DEFAULT '[]'` | SPC-08 |
| `Menu` | `stock_today_total INTEGER NULL` | SPC-09 |
| `Menu` | `stock_today_sold INTEGER DEFAULT 0` | SPC-09 |
| `ReferralCode` | 신규 테이블 (auto-created) | SPC-10 |
| `ReferralClaim` | 신규 테이블 (auto-created) | SPC-10 |

`database.py` migration_sqls 추가 (날짜/카드 태그 준수):
- `[2026-05-20] SPC-03` — PostGIS GIST 인덱스
- `[2026-05-20] SPC-08` — allergens 컬럼
- `[2026-05-20] SPC-09` — stock_today_total/sold 컬럼

---

## API 추가 요약

| 메서드 | 경로 | 카드 |
|---|---|---|
| GET | `/api/public/discover/nearby` | SPC-03 |
| GET | `/sitemap.xml` | SPC-05 |
| GET | `/robots.txt` | SPC-05 |
| POST | `/api/push/subscribe` | SPC-06 |
| GET | `/api/admin/insights/visitors` | SPC-07 |
| GET | `/api/admin/insights/popular_menus` | SPC-07 |
| GET | `/api/admin/insights/rescue_effect` | SPC-07 |
| GET | `/api/admin/insights/neighborhood_avg` | SPC-07 |
| PATCH | `/api/menus/{id}/stock` | SPC-09 |
| POST | `/api/referrals/generate` | SPC-10 |
| GET | `/api/referrals/my-codes` | SPC-10 |
| PATCH | `/api/referrals/{code_id}/deactivate` | SPC-10 |
| POST | `/api/referrals/claim` | SPC-10 |

---

## 운영자 잔여 항목

| ID | 항목 | 메모 |
|---|---|---|
| OPR-14 | VM 방화벽 IP 재조정 | IAP 룰 활용 권장 |
| OPR-17 | VAPID 키 생성 | `npx web-push generate-vapid-keys` 후 `.env` VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY 추가. SPC-06 푸시 알림 활성화 선결조건. |
| OPS-04 | GCP Monitoring 디스크 80% 알람 | 콘솔 5분 |

---

## 참고 링크

- 명세: [`tasks/spc-spec.md`](../spc-spec.md)
- 보류 검토: [`tasks/pending-review.md`](../pending-review.md)
- work-log: [`tasks/work-log.md`](../work-log.md) §§ 2026-05-20 SPC-*
- 이전 사이클: [`2026-05-dbm-pg-cycle.md`](./2026-05-dbm-pg-cycle.md)

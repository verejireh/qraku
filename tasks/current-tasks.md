# Current Tasks

> **2026-05-19 컷오버 완료**: MySQL → PostgreSQL 이전 사이클 종료.
> 상세는 [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md) 참조.
> 본 파일은 **살아있는 카드** + **신규 SPC 사이클 (qraku-Specialize)** 만 보관.

---

## 작업 완료 시 필수 절차

각 카드 종료 시 **두 가지**:

1. **진행 보드 상태 갱신** — `TODO → ✅ DONE`
2. **`tasks/work-log.md` append** — 기존 템플릿 사용

사이클 종료 시: ✅ DONE 카드를 `archive/{YYYY-MM-cycle-name}.md` 로 압축 이전 → 본 파일은 다시 살아있는 카드만.

---

## 🟢 살아있는 카드 (이전 사이클 잔여)

| ID | 항목 | 담당 | 비고 |
|---|---|---|---|
| **DBM-13** | MySQL 의존 정리 + 최적화 | 운영자 + sonnet | D+7 (2026-05-26) `systemctl stop mysql`, D+14 (2026-06-02) purge |
| **OPS-04** | GCP Monitoring 디스크 80% 알람 추가 | 운영자 | GCP 콘솔에서 5분 |

---

## 운영자 미완료 (코드 외)

| ID | 항목 | 비고 |
|---|---|---|
| ~~OPR-01~~ | ~~`ENCRYPTION_KEY`~~ | ✅ DONE (2026-05-20, 새 Fernet 키 발급 + `.env` 갱신 + `qrorder` restart. 이전 평문 fallback 종료) |
| OPR-02 | `VITE_LINE_LIFF_ID` | (이전 사이클 carry) |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` | (이전 사이클 carry) |
| OPR-04 | `VISION_API_KEY` (선택) | (이전 사이클 carry) |
| OPR-06 | PayPay 콘솔 webhook URL | (이전 사이클 carry) |
| OPR-07 | Alembic baseline stamp | (이전 사이클 carry) |
| OPR-08 | `PAYPAY_WEBHOOK_SECRET` | (이전 사이클 carry) |
| ~~OPR-13~~ | ~~Cloud SQL `ilhae` 비번 로테이션~~ | ✅ DONE (2026-05-20, 새 16자 비번 + `.env` 갱신 + backend restart) |
| **OPR-14** | **운영 VM 22 포트 방화벽 IP 재조정** | OPS-05 후속. 자이라 PC IP 자주 바뀜 — IAP 룰 (`allow-iap-ssh-real`, `35.235.240.0/20`) 활용 가능 |
| ~~OPR-15~~ | ~~Google Maps API 키~~ | ❌ 제거 (SPC-04 v1.3 — SDK 미사용, 외부 링크 + Embed iframe 으로 0원) |
| ~~OPR-16~~ | ~~Cloud SQL PostGIS 활성화~~ | ✅ DONE (2026-05-20, ilhae cloudsqlsuperuser 권한 + `CREATE EXTENSION postgis` 3.6.0. smoke test: Tokyo↔Gotemba 86km 정확) |
| **OPR-17** | **VAPID 키 생성 (Web Push, SPC-06)** | `python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key_to_str(), v.private_key_to_str())"` 또는 `npx web-push generate-vapid-keys` |
| ~~OPR-18~~ | ~~운영 VM `.env` CRLF → LF~~ | ✅ DONE (2026-05-20, `sed -i 's/\r$//'`. carriage returns 0 확인) |
| ~~OPR-19~~ | ~~`ENCRYPTION_KEY` 회전 검토~~ | ✅ DONE (2026-05-20, OPR-01 과 동시 회전. 노출된 이전 키 폐기) |

---

# 신규 사이클 — SPC (qraku-Specialize)

> **사이클 목표**: 고텐바 50개 식당 베치헤드 출시를 위한 차별화 기능 완성.
> 미니홈피 (`/{shop_id}`) + 마감 할인 자동화 + 위경도 발견 페이지.
> 자세한 마케팅 전략은 별도 프로젝트 `D:\myproject\qraku-marketing\` 참조.
>
> **코드 감사 결과 (2026-05-19, work-log 참조)**: 80% 이미 구현. 남은 20%가 USP 의 심장 (위경도 검색 + 서버 자동화).

## 사이클 컨텍스트

- **베치헤드**: 고텐바 (88k 인구, Mt. Fuji 관광 허브, 御殿場プレミアム・アウトレット 인근)
- **타겟 식당**: 50개 (카페/베이커리/소규모 음식점 중심)
- **차별화**: 마감 할인 + 위경도 발견 + 다국어 (이미 ja/en/ko/zh)
- **수익 모델**: 사장님 정보 공개 시 월 1000엔 할인 → 데이터 인센티브

## SPC 진행 보드

| ID | 제목 | Phase | P | 모델 | 상태 |
|---|---|---|---|---|---|
| SPC-01 | qraku-specialize 기능 명세 + 사용자 흐름 | A | 🔴 P0 | **opus** | ✅ DONE (2026-05-20, [`spc-spec.md`](./spc-spec.md)) |
| SPC-02 | 마감 할인 서버 자동화 (Dramatiq scheduled actor) | B | 🔴 P0 | **sonnet** | TODO |
| SPC-03 | 위경도 검색 API (`/api/discover/nearby`, PostGIS or haversine) | B | 🔴 P0 | **sonnet** | TODO |
| SPC-04 | 디스커버 페이지 — 지도 + 위치 요청 + 거리/할인 필터 UI | C | 🔴 P0 | **sonnet** | TODO |
| SPC-05 | 미니홈피 SEO 강화 — JSON-LD Restaurant schema + sitemap.xml + meta tags | C | 🟠 P1 | **sonnet** | TODO |
| SPC-06 | PWA 설치 가능화 — manifest.json + service worker + 푸시 알림 | C | 🟠 P1 | **sonnet** | TODO |
| SPC-07 | 사장님 데이터 인사이트 미니 대시보드 | D | 🟡 P2 | **sonnet** | TODO |
| SPC-08 | 알레르기 정보 — Menu 모델 + admin UI + filter | D | 🟡 P2 | **sonnet** | TODO |
| SPC-09 | 실시간 재고 — Menu.stock_today + auto-disable + register 입력 UI | D | 🟡 P2 | **sonnet** | TODO |
| SPC-10 | 친구 추천 referral — 사장님/손님 양쪽 | E | 🟡 P2 | **opus → sonnet** | TODO |
| SPC-11 | 기존 SettingView 에 매장 ON/OFF + 마감 할인 수동 토글 **별도 버튼** 추가 + RegisterView 의 중복 토글 제거 | B | 🔴 P0 | **sonnet** | TODO (2026-05-20 신규, v1.2 정정) |

### Phase 분할 + 출시 시점

| Phase | 카드 | 시간 | 출시 시점 |
|---|---|---|---|
| **A**: 명세 | SPC-01 | 2h | |
| **B**: 백엔드 핵심 | SPC-02, 03 | 1.5d | |
| **B+**: 공통 staff setting | SPC-11 | 0.5d | (B 와 병렬) |
| **C**: 프론트 핵심 | SPC-04, 05, 06 | 2d | **MVP 출시 가능** (A+B+B++C ≈ 5일) |
| **D**: 사장님 가치 강화 | SPC-07, 08, 09 | 3d | 출시 후 1-2주 |
| **E**: 바이럴 | SPC-10 | 2d | 출시 후 |

### 병행 작업

이 SPC worktree 외에:
- **`stabilize/post-pg-cutover`** worktree — PG 컷오버 회귀 테스트 (Playwright 자동화 추천) + 발견된 버그 핫픽스

### 모델 사용 규칙

| 작업 유형 | 플랜 | 코딩 | 리뷰 |
|---|---|---|---|
| 사소 (오타, 1줄) | Sonnet 인라인 | Sonnet | Opus 1회 |
| 중간 (기능 1개) | **Opus 단독** | Sonnet | Opus + GPT-5.5 (옵션) |
| 큰 결정 (아키텍처/보안/결제) | **Opus + GPT-5.5 교차** | Sonnet | Opus + GPT + 자이라 |

---

# 카드 정의

> 각 카드 끝에 **사용자 지시 프롬프트**. 그대로 복사해서 Claude 에 붙여넣으면 실행.

---

## 🟦 SPC-01 — qraku-specialize 기능 명세 + 사용자 흐름

**Owner**: qraku-architect (opus)
**Priority**: 🔴 P0
**Depends on**: 코드 감사 (2026-05-19 work-log 'qraku-specialize 코드 감사')

### 배경

자이라가 80% 구현해놓은 qraku-specialize 기능을 고텐바 50개 식당 베치헤드 출시 기준으로 명세 + 사용자 흐름 정리. 이 명세가 SPC-02~10 의 입력.

### 허용 파일

- `tasks/spc-spec.md` (신규)
- 참고만: `frontend-react/src/views/StorePublicView.jsx`, `AdminHomePageView.jsx`, `DiscoverView.jsx`, `backend/routers/discover.py`, `backend/models.py:Store/Menu`

### 산출물

1. **사용자 흐름 다이어그램** (mermaid 2개 이상)
   - 손님: 구글맵 검색 → 미니홈피 → 메뉴 → 선결제 테이크아웃 → 픽업
   - 손님: 디스커버 → 지도 → 마감 할인 식당 → 미니홈피 → 픽업
   - 사장님: admin → `allow_public_listing` ON + 영업 정보 입력 + 마감 할인 룰
   - 사장님: register → 매일 영업 시작 토글 + 수동 할인 발동
2. **기능 명세 표** (10행 이상, 각 기능별 입력/출력/의존)
3. **데이터 모델 추가 필요** (Store, Menu, OrderItem 신규 필드 — SPC-08/09 영향)
4. **API 추가 필요** (메서드, 경로, 요청/응답)
5. **출시 의사결정 항목** (discover 인증 X 확정? 알레르기 우선순위? PWA 푸시 알림 권한 UX?)

### 수용 기준

- [ ] mermaid 다이어그램 2개 이상
- [ ] 기능 명세 표 10 행 이상
- [ ] SPC-02~10 각 카드 명확한 입력 제공
- [ ] 데이터 / API 변경사항 명시

### 사용자 지시 프롬프트

```
SPC-01 명세 작성. tasks/spc-spec.md 신규.
- 코드 감사 결과 (work-log 2026-05-19 'qraku-specialize 코드 감사')
- 고텐바 50개 베치헤드 컨텍스트 (HANDOFF + 마케팅 플랜)
- 자이라 답변 (영업시간=공지, register 토글=실 활성화, 할인 자동 시간기반, 알레르기 무시)
```

---

## 🟦 SPC-02 — 마감 할인 서버 자동화

**Owner**: postgres-specialist / sonnet
**Priority**: 🔴 P0
**Depends on**: SPC-01, OPS-02 (Dramatiq broker — 이미 .env REDIS_URL 적용됨)

### 배경

현재 `Store.food_rescue_mode='auto'` + `food_rescue_auto_minutes` 필드는 있지만, **클라이언트 (StorePublicView) 가 시계 비교** 만 수행. 사장님이 register 페이지 안 열고 있으면 실제로 backend 의 `food_rescue_manual_active` 가 안 켜짐 → 디스커버 검색 결과에 안 나옴.

해결: Dramatiq scheduled actor 가 매 5분 영업 시간 + `food_rescue_auto_minutes` 비교 → 조건 도달 시 `food_rescue_manual_active=True` 자동 set.

### 허용 파일

- `backend/workers/food_rescue_scheduler.py` (신규)
- `backend/workers/__init__.py` (수정 — actor 등록)
- `backend/services/` (옵션, 영업 시간 파싱 헬퍼)

### 절차

1. Dramatiq cron schedule (`apscheduler` 또는 dramatiq-crontab) 으로 매 5분 실행
2. `SELECT id, open_at, close_at, food_rescue_auto_minutes, food_rescue_mode FROM store WHERE food_rescue_mode='auto' AND open_at IS NOT NULL`
3. 각 store: 현재 시간이 close_at - food_rescue_auto_minutes 분 이내면 `food_rescue_manual_active=True`, close_at 지나면 False
4. WebSocket broadcast — 활성 변경 시 손님 / register 페이지 즉시 반영

### 수용 기준

- [ ] Dramatiq actor `food_rescue_auto_tick` 등록
- [ ] 매 5분 자동 실행 (또는 cron `*/5 * * * *`)
- [ ] 영업 시간 + auto_minutes 비교 정확
- [ ] WebSocket broadcast 동작
- [ ] 단위 테스트 1개 이상 (영업 시간 경계 케이스)

### 사용자 지시 프롬프트

```
SPC-02 마감 할인 서버 자동화. postgres-specialist (sonnet).
SPC-01 명세 §3 (할인 자동화 룰) 참고.
```

---

## 🟦 SPC-03 — 위경도 검색 API (`/api/discover/nearby`)

**Owner**: postgres-specialist / sonnet
**Priority**: 🔴 P0
**Depends on**: SPC-01

### 배경

현재 `/api/discover/*` 는 지역명 (prefecture/city) 필터만 지원. USP "걸어서 10분 이내" 발견을 위해 lat/lng + radius 검색 필요.

PG 의 PostGIS extension 사용 권장 (Cloud SQL 에서 활성화 가능). 또는 단순 haversine 식 (소규모 가능).

### 허용 파일

- `backend/routers/discover.py` (수정 — `GET /public/discover/nearby` 엔드포인트 추가)
- `backend/database.py` (선택, PostGIS extension `CREATE EXTENSION IF NOT EXISTS postgis` 추가)
- `backend/models.py` (Store lat/lng 인덱스 추가)

### API 명세

```
GET /api/discover/nearby
  query: lat (float), lng (float), radius_m (int, default 800 = 10분 도보)
         only_active (bool, default true — food_rescue_manual_active OR 영업중)
         category (str, optional)
  response: [{
    shop_id, name, category, distance_m, lat, lng,
    food_rescue_active, food_rescue_msg, current_special_menu (옵션),
    photo_url, open_until
  }, ...]  거리 오름차순 max 20
```

### 수용 기준

- [ ] PostGIS 활성화 (Cloud SQL): `CREATE EXTENSION postgis;`
- [ ] `Store.location geography(POINT,4326)` 컬럼 + lat/lng 변경 시 trigger
- [ ] 인덱스: `CREATE INDEX idx_store_location ON store USING gist(location)`
- [ ] 또는 PostGIS 안 쓰면 haversine SQL + 박스 prefilter (위경도 ±radius/111000)
- [ ] 응답 시간 < 100ms (식당 50개 기준)

### 사용자 지시 프롬프트

```
SPC-03 위경도 검색 API. postgres-specialist (sonnet).
PostGIS 사용 결정 (운영자 GCP 콘솔에서 enable) 또는 haversine 폴백 명시.
```

---

## 🟦 SPC-04 — 디스커버 페이지 (지도 + 위치 요청 + 필터)

**Owner**: frontend / sonnet
**Priority**: 🔴 P0
**Depends on**: SPC-03

### 배경

`DiscoverView.jsx` 가 현재 지역명 텍스트 검색만 지원. 손님이 자기 위치 기반으로 발견하려면 지도 + 마커 + 필터 UI 필요.

### 허용 파일

- `frontend-react/src/views/DiscoverView.jsx` (수정 — 지도 모드 + 필터 추가)
- `frontend-react/src/components/discover/*` (신규 컴포넌트들)
- `frontend-react/package.json` (필요시 `react-leaflet` 또는 `@vis.gl/react-google-maps` 추가)

### UX 요구사항

1. **위치 권한 요청** — 거부 시 지역명 텍스트 폴백
2. **지도 + 마커** (할인 중인 식당은 다른 색)
3. **목록 view** 토글 (지도 ↔ 카드 목록)
4. **필터**: 카테고리 / 할인 중만 / 거리 (300m, 500m, 800m, 1km)
5. **카드 클릭 → 미니홈피 `/{shop_id}`** 이동
6. **다국어** (ja/en/ko/zh)

### 지도 라이브러리 선택

| 라이브러리 | 장점 | 단점 |
|---|---|---|
| **react-leaflet + OpenStreetMap** | 무료, 키 불필요 | 일본 지도 디테일 ↓ |
| **@vis.gl/react-google-maps** | 일본 지도 우수 | API 키 + 비용 (월 28k 호출까지 무료) |

→ MVP 는 **Google Maps** 추천 (관광객 친숙). 운영자 API 키 발급 필요 (OPR-15).

### 수용 기준

- [ ] 위치 권한 요청 + 거부 대응
- [ ] 지도 + 마커 + 클러스터링 (50+ 식당 시)
- [ ] 5가지 필터 동작
- [ ] 카드 ↔ 지도 sync
- [ ] 모바일 first

### 사용자 지시 프롬프트

```
SPC-04 디스커버 페이지. frontend (sonnet).
지도 라이브러리 선택 운영자 결정 후 진행.
```

---

## 🟦 SPC-05 — 미니홈피 SEO 강화

**Owner**: frontend / sonnet
**Priority**: 🟠 P1
**Depends on**: SPC-01

### 배경

`StorePublicView` 가 React CSR (Client-Side Rendering) → Google bot SEO 약함. JSON-LD structured data + meta tags + sitemap 강화로 구글맵/검색 노출 ↑.

### 허용 파일

- `frontend-react/src/views/StorePublicView.jsx` (수정 — `<Helmet>` 추가)
- `frontend-react/index.html` (SPA root)
- `backend/main.py` (수정 — `GET /sitemap.xml` 엔드포인트)
- `frontend-react/package.json` (`react-helmet-async` 추가)

### 산출물

1. **JSON-LD Restaurant schema** — `application/ld+json` 스크립트로 각 미니홈피에 inline
   ```json
   {
     "@context": "https://schema.org",
     "@type": "Restaurant",
     "name": "...", "image": [...], "address": {...},
     "geo": {"latitude": ..., "longitude": ...},
     "openingHoursSpecification": [...],
     "servesCuisine": "...", "priceRange": "¥¥",
     "menu": "https://qraku.com/{shop_id}/menu"
   }
   ```
2. **Open Graph + Twitter Card meta** (이미지 / 제목 / 설명)
3. **sitemap.xml** — `allow_public_listing=True` 매장만 동적 생성
4. **robots.txt** — sitemap 위치 명시
5. **다국어 hreflang** — 4개 언어 alternate URLs

### 수용 기준

- [ ] Lighthouse SEO 점수 90+
- [ ] Google Rich Results Test 통과 (Restaurant schema)
- [ ] sitemap.xml 가 동적 가게 목록 반영
- [ ] hreflang 4개 언어

### 사용자 지시 프롬프트

```
SPC-05 미니홈피 SEO. frontend (sonnet).
```

---

## 🟦 SPC-06 — PWA 설치 가능화

**Owner**: frontend / sonnet
**Priority**: 🟠 P1
**Depends on**: SPC-04

### 배경

PWA 만들면 손님이 미니홈피 / 디스커버 페이지를 홈 화면에 추가 → 앱처럼 사용 + 푸시 알림 (단골 카페 할인 시작) 가능.

### 허용 파일

- `frontend-react/public/manifest.json` (신규)
- `frontend-react/src/sw.js` (신규, service worker)
- `frontend-react/vite.config.js` (`vite-plugin-pwa` 추가)
- `backend/routers/push.py` (신규, 푸시 알림 구독 관리)

### 산출물

1. **manifest.json** — 앱 이름, 아이콘 (192, 512), theme color
2. **Service Worker** — offline 캐시 (메뉴 이미지, 미니홈피 정적 부분)
3. **푸시 알림 구독 UI** — "이 카페 할인 시작 시 알림"
4. **Web Push 백엔드** — VAPID 키 + `pywebpush` 라이브러리

### 수용 기준

- [ ] Lighthouse PWA 점수 90+
- [ ] "홈 화면에 추가" prompt 동작 (Chrome / Safari)
- [ ] 오프라인 시 미니홈피 캐시 표시
- [ ] 푸시 알림 발송 → 모바일 받음

### 사용자 지시 프롬프트

```
SPC-06 PWA. frontend (sonnet). VAPID 키 생성 운영자.
```

---

## 🟦 SPC-07 — 사장님 데이터 인사이트 미니 대시보드

**Owner**: full-stack / sonnet
**Priority**: 🟡 P2
**Depends on**: SPC-01 (인사이트 카드 명세)

### 배경

`allow_public_listing=True` 사장님에게 무료 인사이트 제공 → 데이터 공개 인센티브 강화.

### 산출물 (admin 페이지에 새 탭)

- 이번 주 방문자 수 / 시간대 분포 / 디바이스 (모바일 vs 데스크탑)
- 인기 메뉴 / 인기 검색 키워드
- 마감 할인 효과 ("할인 후 30분 픽업율 X%")
- 동네 평균 (익명) — 자기 vs 동네 평균 비교

### 수용 기준

- [ ] admin 에 "인사이트" 탭 추가
- [ ] 4개 차트 (recharts 활용 — 이미 있음 가정)
- [ ] 데이터는 backend `/api/admin/insights/*` 에서

---

## 🟦 SPC-08 — 알레르기 정보

**Owner**: full-stack / sonnet
**Priority**: 🟡 P2

### 배경

자이라가 처음엔 무시한다고 했지만, 일본 시장 (특히 인바운드 관광객) 에서 알레르기 정보는 신뢰 / 차별화 큰 요소. P2 로 두되 출시 후 추가 가능.

### 데이터 모델

`Menu.allergens` (JSON array): `["wheat", "dairy", "peanut", "egg", "shellfish", "soy", "fish", "tree_nut"]`

### 산출물

- admin 에 메뉴 편집 시 알레르기 체크박스 추가
- 미니홈피에 알레르기 아이콘 표시 + 필터
- 디스커버 페이지에 "알레르기 필터" (예: 글루텐프리만)

---

## 🟦 SPC-09 — 실시간 재고

**Owner**: full-stack / sonnet
**Priority**: 🟡 P2

### 배경

"크루아상 5개 50% 할인" 같은 정밀 마감 할인 위해 메뉴별 오늘 재고 + 자동 sold-out.

### 데이터 모델

- `Menu.stock_today_total` (int, 매일 register 에서 입력)
- `Menu.stock_today_sold` (int, OrderItem 생성 시 자동 증가)
- `Menu.is_sold_out_today` (computed: stock_today_total - stock_today_sold <= 0)

### 산출물

- register 페이지 매일 입력 UI (선택, 입력 안 하면 무한 재고로 동작)
- 미니홈피 / 디스커버 페이지에 남은 수량 표시
- 자동 sold-out 시 메뉴 숨김

---

## 🟦 SPC-10 — 친구 추천 referral

**Owner**: opus 플랜 → sonnet 구현
**Priority**: 🟡 P2

### 배경

출시 후 바이럴 강화. 사장님 → 사장님 추천 (구독 1개월 무료) + 손님 → 손님 추천 (다음 할인 ¥200).

### 산출물

- 사장님: admin 에 referral 코드 + 추천 현황
- 손님: 미니홈피에 "친구한테 보여주기" 공유 버튼 + UTM 트래킹
- 백엔드: referral 추적 + 자동 인센티브 적용

---

## 🟦 SPC-11 — 기존 SettingView 에 매장 ON/OFF + 마감 할인 수동 토글 별도 버튼

**Owner**: frontend / sonnet
**Priority**: 🔴 P0
**Depends on**: SPC-01 (§10-d UI 위치 룰)
**발견 일자**: 2026-05-20 (자이라 검토 중 §10-d 명확화에서 발견)
**정정**: 2026-05-20 v1.2 — 신규 페이지 X (기존 SettingView 활용), 두 토글 물리적 분리 필수

### 배경

자이라 결정 (spc-spec §10-d):
- **admin** = 설정 (자동/수동 선택, 영업시간 JSON 등)
- **기존 SettingView (`/{shop_id}/setting`, 마스터 PIN 보유자용)** = 매일 운영
  - 매장 ON/OFF 버튼 + 마감 할인 수동 토글 **물리적 분리 필수** (한 위젯에 묶지 X)
  - `food_rescue_mode='auto'` 일 때 수동 토글 disabled + "admin 에서 자동 모드 설정" 안내

현재 매장 영업 시작/종료 (`is_open`) 토글은 [RegisterView.jsx:285-290](../frontend-react/src/views/RegisterView.jsx) 에만 존재 → 이동.

### 허용 파일

- `frontend-react/src/views/SettingView.jsx` (수정 — 신규 섹션 또는 신규 탭 추가)
- `frontend-react/src/views/RegisterView.jsx` (수정 — 기존 영업 시작/종료 버튼 + food rescue 토글 제거)
- API 변경 **없음** — 기존 `PATCH /api/stores/{id}/business-status` + `food-rescue-status` 재사용.

### 확정 사항 (자이라 2026-05-20)

- 신규 탭 "毎日運営" 추가 (탭 순서: 毎日運営 → 勤務管理 → 品切れ管理)
- 두 버튼 **상하 분리** + **색상 차별화** (매장 ON/OFF = 녹색/빨강, 마감 할인 = 주황/회색)
- auto 모드 시 마감 할인 수동 토글 disabled + admin 링크 안내

### 수용 기준

- [ ] SettingView 에 신규 탭 "毎日運営" 추가 (첫 탭으로)
- [ ] 매장 ON/OFF 버튼 (녹색/빨강) — 상단
- [ ] 마감 할인 수동 토글 (주황/회색) — 하단, 시각적 분리 명확
- [ ] `food_rescue_mode='auto'` 일 때 마감 할인 토글 disabled + "admin 에서 자동 모드 설정 — backend 가 자동 발동" 안내 + admin 페이지 링크
- [ ] RegisterView 의 기존 두 토글 제거 (중복 해소)
- [ ] 진입 흐름 무변경 (RegisterView 사이드바 → SettingView)
- [ ] 모바일 first
- [ ] 기존 API 재사용 — 백엔드 변경 없음

### 사용자 지시 프롬프트

```
SPC-11. frontend (sonnet).
spc-spec.md §10-d (v1.2) + pending-review.md PR-03 확정 후 착수.
SettingView.jsx 에 신규 섹션 추가 + RegisterView 의 중복 토글 제거.
두 버튼 물리적 분리 필수.
```

---

## 사이클 종료 절차

이번 SPC 사이클 종료 시:
- 모든 ✅ DONE 카드를 `archive/2026-XX-spc-cycle.md` 로 요약
- `current-tasks.md` 살아있는 카드만 유지 (다음 사이클 진입 준비)

---

## 참고 (이전 사이클)

- 직전 사이클: [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md)
- 그 이전: [`archive/2026-05-saas-infra-cycle.md`](./archive/2026-05-saas-infra-cycle.md)
- DBM 도구 (영구 유지): `tools/{pg_data_migrator,migration_check,rollback_resync,init_pg_schema,cloud-sql-proxy.service}`
- DBM 문서: `tasks/db-migration-audit.md`, `tasks/db-migration-runbook.md`, `docs/adr/006~008.md`
- 마케팅 프로젝트: `D:\myproject\qraku-marketing\` (별도 폴더)

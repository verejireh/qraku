# GPT-5.5 교차 검증 지시서

**목적**: SPC 사이클 (qraku-Specialize) + STB 사이클 (Stabilize Post-PG-Cutover) 에서 내려진 아키텍처/보안/성능 결정에 대한 독립적 2nd-opinion.

**배경**: Claude (Sonnet 4.6) 가 구현. Opus 4.7 이 설계. GPT-5.5 는 코드를 보지 않은 독립적 관점에서 각 결정의 **함정·대안·보완 사항** 을 제시하면 됨.

**요청 형식**: 각 섹션마다 (a) 결정 요약 → (b) GPT 의 평가 → (c) 위험/대안/보완 권고 순으로 응답.

---

## § 1 — SPC-02: 마감 할인 자동화 (Dramatiq cron 설계)

### 구현된 결정

```
매 5분 Dramatiq beat 로 food_rescue_check() actor 실행.
today_close = business_hours.py:get_close_time_today() 로 계산.
close_at - food_rescue_auto_minutes(기본 60분) 이 현재 시각 이전이면:
  → store.food_rescue_manual_active = True (DB PATCH)
  → WebSocket broadcast FOOD_RESCUE_CHANGED
close_at 이후면 False 로 복구.
is_open (매장 영업 여부) 은 건드리지 않음.
```

**business_hours 구조**: `{mon:{open:"11:00",close:"21:00"}, ...}` JSON, 요일별. 자정 넘김(23:00~02:00) 은 close > "24:00" 로 표현.

### GPT 에게 묻는 것

1. `close_at - 60분` 기준 자동 발동이 **timezone 이슈** (서버=UTC, 매장=JST+9) 를 올바르게 처리하는가? 특히 자정 넘김 케이스.
2. **race condition**: 사장님이 수동으로 `food_rescue_manual_active=False` 눌렀는데 5분 이내에 cron 이 다시 True 로 덮어쓰는 시나리오. 해결책 제안.
3. Dramatiq beat (redis-based) 의 **다중 인스턴스** 환경에서 actor 중복 실행 위험. 현 설계에서 멱등성이 보장되는가?
4. 50개 매장 동시 점검 시 매 5분 DB write 부하 (50 UPDATE). 괜찮은가?

---

## § 2 — SPC-03: PostGIS nearby API 설계

### 구현된 결정

```
GET /api/public/discover/nearby?lat=35.31&lng=138.93&radius=800
인증: 없음 (익명 + IP rate-limit 계획)
쿼리:
  SELECT store.*, ST_Distance(
    ST_MakePoint(longitude, latitude)::geography,
    ST_MakePoint(:lng, :lat)::geography
  ) AS distance_m
  FROM store
  WHERE ST_DWithin(
    ST_MakePoint(longitude, latitude)::geography,
    ST_MakePoint(:lng, :lat)::geography,
    :radius
  )
  AND allow_public_listing = TRUE
  AND is_open = TRUE
  ORDER BY distance_m ASC
  LIMIT 20
radius 최대 5000m 클램프.
인덱스: CREATE INDEX idx_store_geo ON store USING GIST
  ((ST_MakePoint(longitude, latitude)::geography))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
```

### GPT 에게 묻는 것

1. **함수형 GIST 인덱스** (`ST_MakePoint(longitude, latitude)`) 가 위 `ST_DWithin` 쿼리에서 실제로 사용되는가? PostgreSQL 쿼리 플래너가 함수형 인덱스를 매치하려면 쿼리의 표현식이 인덱스 정의와 **정확히** 같아야 한다. 이 케이스에서 GIST 인덱스가 실제로 타는가, 아니면 seq scan 이 발생하는가?
2. **SQL injection 위험**: `lat`, `lng`, `radius` 파라미터가 `float` 형변환만 되면 충분한가? PostGIS 함수 인자로 직접 들어가는 경우 추가 검증이 필요한가?
3. 인증 없는 public API + IP rate-limit 계획. **IP rate-limit 없이 출시**하면 어느 정도 위험인가? 대안으로 Cloudflare 무료 플랜의 rate-limit 이 충분한가?
4. `is_open = TRUE` 조건이 인덱스 predicate 와 다름 (`WHERE latitude IS NOT NULL`). `allow_public_listing` + `is_open` 복합 인덱스가 더 효율적인가?

---

## § 3 — SPC-10: Referral 시스템 보안

### 구현된 결정

```
ReferralCode 모델: code=8자 alnum 랜덤 (secrets.token_urlsafe 기반)
충돌 방지: 5회 재시도 후 에러.
ReferralClaim 모델: (code_id, guest_uuid) UNIQUE — 중복 방지.
만료: expires_at NULL = 무기한.
한도: max_uses NULL = 무제한.
claim 조건: is_active=True, 만료일 미초과, 한도 미도달, 동일 guest_uuid 미클레임.
reward: reward_message 반환 (문자열). 실제 결제 할인 미적용 (S-4, P2 연기).
```

### GPT 에게 묻는 것

1. **8자 alnum 코드 엔트로피** (62^8 ≈ 218조): 50개 매장 × 코드 100개 규모에서 brute-force 현실적인가? IP rate-limit 없이 `/api/referrals/claim` 을 반복 호출하면 시간이 얼마나 걸리는가?
2. **guest_uuid 신뢰성**: 클라이언트가 생성하는 UUID. 악의적 사용자가 UUID 를 바꿔가며 같은 코드를 여러 번 claim 할 수 있는가? 현재 중복 방지 로직이 이를 막는가?
3. `reward_message` 가 결제와 분리되어 있음 (S-4 연기). **사용자 혼란** — "혜택 받았다" 배너가 뜨는데 실제 할인이 안 됨. UX + 법적 리스크?
4. referral 코드를 `?ref=CODE` URL 파라미터로 노출. **로그/분석 도구에 코드가 노출**되는 리스크. 대안?

---

## § 4 — SPC-07: Admin Insights API 보안

### 구현된 결정

```
GET /api/admin/insights/visitors?store_id={id}
GET /api/admin/insights/popular_menus?store_id={id}
GET /api/admin/insights/rescue_effect?store_id={id}
GET /api/admin/insights/neighborhood_avg?store_id={id}

인증: require_admin(store_id) — Bearer JWT, store.owner_id == current_user.id 검증.
neighborhood_avg: 같은 지역(prefecture+city)의 타 매장 평균 매출 노출.
```

### GPT 에게 묻는 것

1. **`neighborhood_avg`**: 같은 지역 타 매장의 평균 매출을 공개하는 것이 **경쟁사 정보 노출** 위험인가? 집계 n < 3 일 때 특정 매장 역추산 가능 여부.
2. `store_id` 를 쿼리 파라미터로 받는 패턴 — 현재 `require_admin(store_id)` 가 본인 매장만 접근 가능하도록 검증한다면 충분한가? IDOR 위험 분석.
3. 4개 엔드포인트를 `Promise.all` 로 병렬 패치 — 느린 쿼리 1개가 전체 UI 블록. 권장 패턴?

---

## § 5 — STB 사이클: Playwright 골든패스 커버리지 평가

### 구현된 것

총 20 tests in 4 파일:

| 파일 | 시나리오 |
|---|---|
| `golden-customer-order.spec.js` | 손님 QR→메뉴→카트→Square 결제→영수증→KDS WS |
| `golden-admin-crud.spec.js` | admin 로그인→메뉴CRUD(allergens+stock)→S-3→allow_public_listing→SettingView |
| `golden-staff-takeout-kds.spec.js` | 마스터PIN→register→테이크아웃→현금→픽업코드→KDS WS broadcast |
| `golden-spc-integration.spec.js` | nearby API→미니홈피→4개 언어전환→JSON-LD→referral claim |

모두 Chromium + WebKit 양 브라우저. Square 없으면 auto-skip.

### GPT 에게 묻는 것

1. **커버리지 공백**: 위 4개 시나리오에서 "컷오버 후 가장 먼저 깨질 수 있는데 테스트 안 된" 흐름이 있는가?
2. **WebSocket 테스트 안정성**: 별도 브라우저 컨텍스트 2개로 WS broadcast 확인. 타이밍 이슈로 flaky 해질 가능성? 권장 패턴?
3. `fullyParallel:false, workers:1` — 느리지만 WS 간섭 방지. 50개 test 기준 예상 실행 시간? CI 에서 허용 가능한 수준인가?
4. 시드 데이터를 매 test suite 마다 새 매장 생성 (unique slug). DB 누적 시 부작용? `afterAll` cleanup 이 없으면 어떻게 되는가?

---

## § 6 — 전반적 아키텍처 검토

### 현재 아키텍처

```
FastAPI + SQLModel + asyncpg (PostgreSQL)
Dramatiq + Redis (background jobs: translate, food_rescue_check)
WebSocket (KDS 주문 현황, Redis pub/sub fan-out)
Stripe (구독), Square (테이크아웃 결제), PayPay (선결제)
PostGIS (nearby API)
Vite SPA → FastAPI catch-all 서빙
단일 GCP VM (35.213.6.149), 고텐바 50개 식당 초기 베치헤드
```

### GPT 에게 묻는 것

1. **단일 VM**: 50개 식당 동시 피크 (점심 12:00 JST) 에서 uvicorn 4 workers + 2 Dramatiq workers 가 충분한가? 병목 지점 예측.
2. **Redis 단일 인스턴스**: WS pub/sub + Dramatiq broker + idempotency cache 가 동일 Redis. 분리 필요 시점?
3. **SQLModel vs Alembic 이중 마이그레이션**: `migration_sqls` (수동 ALTER) + `SQLModel.metadata.create_all` + Alembic (신규 변경) 3중 레이어. 장기적으로 유지보수 리스크?
4. 고텐바 → 전국 확장 시 PostGIS 쿼리 (현재 전체 테이블 scan 후 ST_DWithin) 가 버텨내는 규모 한계는?

---

## 응답 형식 요청

각 § 마다:
```
§N-Q{번호}: [질문 요약]
  평가: ...
  위험: ...
  권고: ...
```

우선순위 있으면 🔴/🟠/🟡 마킹.

총 분량 제한 없음. 상세할수록 좋음.

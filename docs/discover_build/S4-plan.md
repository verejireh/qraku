# S4 — 메신저 봇 위치추천 (LINE, WhatsApp 확장 대비) — 스펙 + 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> 브랜치: `discover_build` · 작성일: 2026-06-08 · 상위: [WORKPLAN.md](./WORKPLAN.md)
> 상태: **계획 확정 / 구현 대기 (LINE 채널 자격은 대표님 병행 작업 — 아래 §지침서)**

**Goal:** 손님이 메신저에서 위치를 보내면 근처 가게 TOP3 카드를 회신하고, 카드에서 LINE 안 자동로그인 주문(LIFF)까지 잇는다. **일본=LINE으로 먼저 구현하되, 유럽=WhatsApp 확장 시 어댑터 1개만 추가**하면 되도록 핵심/플랫폼부를 분리한다.

---

## 0. 유럽 대비 아키텍처 (핵심 원칙)

"위치 → 근처 가게 → 카드"의 **핵심은 메신저와 무관**(좌표는 LINE이든 WhatsApp이든 동일). 플랫폼마다 다른 건 **웹훅 파싱·서명검증·회신 API·카드 포맷**뿐. 따라서 **플랫폼 무관 핵심 + 플랫폼별 어댑터**로 나눈다.

```
[플랫폼 무관 핵심 — 재사용 100%]
  find_nearby_stores(lat,lng,radius,limit)  → 가게 결과(list[dict])   utils/nearby.py
  to_store_cards(stores)                    → 중립 카드 모델(list)     utils/nearby_cards.py
        │
        ├── LINE 어댑터        utils/line_client.py + routers/line_bot.py        ← S4 (지금)
        └── WhatsApp 어댑터     utils/whatsapp_client.py + routers/whatsapp_bot.py ← 유럽 (나중, 본 계획 밖)
```

- **중립 카드 모델**(`to_store_cards`)은 LINE Flex/WhatsApp 어느 쪽도 아닌 **순수 데이터**(이름·거리라벨·뱃지·slug·좌표·google_maps_url). URL/포맷은 각 어댑터가 생성 → 플랫폼 종속 제거.
- 기존 **결제 어댑터 패턴**(`services/pos/adapters/`)과 동일 철학.

---

## 1. File Fence
| 파일 | 변경 |
|---|---|
| `backend/utils/nearby.py` | **신규** — `find_nearby_stores()` (discover `/nearby` SQL 추출, 플랫폼 무관) |
| `backend/utils/nearby_cards.py` | **신규** — `to_store_cards()` 중립 카드 모델 |
| `backend/utils/line_client.py` | **신규** — LINE 서명검증·Flex 빌더·reply 호출 (LINE 어댑터) |
| `backend/routers/line_bot.py` | **신규** — `POST /api/webhooks/line` 웹훅 오케스트레이션 |
| `backend/routers/discover.py` | `/nearby`가 `find_nearby_stores()`를 호출하도록 **리팩토링**(응답 불변) |
| `backend/main.py` | line_bot 라우터 등록만 |
| `backend/tests/test_*.py` | 신규 단위테스트(서명·카드·파싱) |

**불가침:** 결제 로직, `models.py`(WebhookEvent 재사용만), 마이그레이션, OrderView/MagnoliaCartModal.
**재사용:** `WebhookEvent`(멱등성), `FRONTEND_BASE_URL`, GiST 공간인덱스, S1 `can_accept_takeout`, OrderView의 LIFF 자동로그인.

---

## 2. 동선 (LINE 안 자동로그인 주문)
```
LINE 대화방 → 봇 카드 [テイクアウト注文]
   → LIFF URL (https://liff.line.me/{LIFF_ID}/{slug}/takeout)
      → LINE 인앱 브라우저에서 OrderView 열림 + LIFF 자동로그인(이미 구현)
         → Square/PayPay 선결제(기존) → 완료, LINE 안에서
```
- 카드 주문버튼 = **LIFF URL**(LINE 자동로그인). 가게/지도 버튼은 일반 https.
- (WhatsApp 어댑터는 동일 slug로 **일반 https** 주문 URL 생성 — 유럽은 브라우저 주문.)

---

## 3. Tasks

### Task 1 — `find_nearby_stores()` 추출 (플랫폼 무관 핵심)
**Files:** Create `backend/utils/nearby.py`; Modify `backend/routers/discover.py`.

- [ ] **Step 1:** `utils/nearby.py`에 `async def find_nearby_stores(session, lat, lng, radius, limit=20) -> list[dict]` 작성. 현재 `discover_nearby`의 raw SQL(LEFT JOIN paymentsettings, IS NOT NULL 불린, ST_DWithin, takeout_default_wait_minutes 포함) + 행→dict 매핑 + `can_accept_takeout` 계산을 **그대로 이동**. 반환 dict 키는 현재 `/nearby` items와 동일(`store_id, store_name, slug, category, prefecture, city, address, phone, theme, latitude, longitude, is_open, food_rescue_*, about_description, specialty, business_hours, distance_m, google_maps_url, can_accept_takeout, takeout_default_wait_minutes`).
- [ ] **Step 2:** `discover_nearby`를 리팩토링 — `find_nearby_stores()` 호출 후 기존 필터(`takeout_only`/`open_only`는 SQL이 아니라 호출 옵션 또는 후처리로 유지)·envelope 구성. **응답 JSON 불변**이 핵심(스모크로 확인).
- [ ] **Step 3:** 구문검증 + `uv run --with pytest pytest backend/tests/ -q`(9 passed) + (가능 시) `/nearby` 스모크로 동일 응답 확인.
- [ ] **Step 4:** commit `refactor(discover): 근처검색을 find_nearby_stores 로 추출 (플랫폼 무관, S4 T1)`

> 주의: `open_only`(SQL WHERE)·`takeout_only`(파이썬 후필터) 동작 보존. 추출 시 둘 다 `find_nearby_stores` 인자로 받거나, 봇은 필터 없이 호출(기본).

### Task 2 — `to_store_cards()` 중립 카드 모델
**File:** Create `backend/utils/nearby_cards.py`

- [ ] **Step 1: 순수함수 작성**
```python
def _dist_label(m: float) -> str:
    return f"{round(m)}m" if m < 1000 else f"{m/1000:.1f}km"

def to_store_cards(stores: list[dict]) -> list[dict]:
    """가게 결과(list[dict]) → 플랫폼 무관 카드 데이터. URL/포맷은 각 어댑터가 생성."""
    cards = []
    for s in stores:
        cards.append({
            "store_id": s["store_id"],
            "name": s["store_name"],
            "distance_label": _dist_label(s["distance_m"]),
            "category": s.get("category"),
            "is_open": bool(s.get("is_open")),
            "can_accept_takeout": bool(s.get("can_accept_takeout")),
            "food_rescue": bool(s.get("food_rescue_manual_active") and s.get("food_rescue_active")),
            "wait_minutes": s.get("takeout_default_wait_minutes") or 0,
            "slug": s.get("slug"),
            "google_maps_url": s.get("google_maps_url"),
        })
    return cards
```
- [ ] **Step 2: 단위테스트** `backend/tests/test_nearby_cards.py` — 거리라벨(999→"999m", 1500→"1.5km"), 플래그 매핑, slug 통과.
- [ ] **Step 3:** `uv run --with pytest pytest backend/tests/ -q` → 통과
- [ ] **Step 4:** commit `feat(messaging): 중립 근처 카드 모델 to_store_cards + 테스트 (S4 T2)`

### Task 3 — `line_client.py` (LINE 어댑터: 서명·Flex·reply)
**File:** Create `backend/utils/line_client.py`

- [ ] **Step 1: 서명검증(순수)**
```python
import os, hmac, hashlib, base64

def verify_line_signature(body: bytes, signature: str | None) -> bool:
    secret = os.getenv("LINE_CHANNEL_SECRET", "")
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)
```
- [ ] **Step 2: Flex 빌더(순수)** `build_flex_carousel(cards, *, liff_id, base_url) -> dict` — 중립 카드 list → LINE Flex carousel(bubble per card). 주문버튼 URL = `https://liff.line.me/{liff_id}/{slug}/takeout`(can_accept_takeout && slug일 때만), 지도버튼 = google_maps_url. 営業中/事前決済OK/⚡割引中 라벨 반영. 카드 0개면 "근처에 없음" 텍스트 메시지 dict 반환.
- [ ] **Step 3: location quick-reply(순수)** `build_location_request() -> dict` — "📍 現在地を送る"(`action: location`) quick-reply 포함 텍스트 메시지.
- [ ] **Step 4: reply 호출** `async def reply_message(reply_token, messages: list[dict])` — httpx POST `https://api.line.me/v2/bot/message/reply`, `Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}`. 토큰 없으면 로그+return(죽지 않게).
- [ ] **Step 5: 단위테스트** `backend/tests/test_line_client.py` — `verify_line_signature`(정상/위조/시크릿없음), `build_flex_carousel`(주문버튼 LIFF URL 포함/미포함 분기, 0개 처리), `build_location_request` 구조. (reply_message는 네트워크 → 테스트 제외/모킹.)
- [ ] **Step 6:** `uv run --with pytest pytest backend/tests/ -q` → 통과
- [ ] **Step 7:** commit `feat(messaging): LINE 어댑터(서명검증·Flex·reply) + 테스트 (S4 T3)`

### Task 4 — `line_bot.py` 웹훅 오케스트레이션
**Files:** Create `backend/routers/line_bot.py`; Modify `backend/main.py`(라우터 등록).

- [ ] **Step 1: 엔드포인트** `POST /webhooks/line` (prefix로 `/api/webhooks/line`):
  - raw body + `X-Line-Signature` 헤더 → `verify_line_signature` 실패 시 401.
  - env(`LINE_CHANNEL_SECRET/ACCESS_TOKEN`) 없으면 503 + 로그(미구성).
  - payload `events[]` 순회:
    - `message`/`location` → `find_nearby_stores(lat,lng,800,limit=3)` → `to_store_cards` → `build_flex_carousel` → `reply_message`.
    - `follow` 또는 `message`/`text` → `build_location_request` 회신.
  - 멱등성: 각 event의 `webhookEventId`로 `WebhookEvent(provider="line", event_id=...)` 삽입, IntegrityError면 skip.
  - LINE은 200 빠르게 응답해야 함 → 처리 오류도 200 반환(로그만), 단 서명실패만 401.
- [ ] **Step 2: main.py 등록** — 기존 라우터 등록부에 `app.include_router(line_bot.router, prefix="/api")` (다른 라우터와 동일 패턴).
- [ ] **Step 3:** 구문검증 + 서버 import 스모크 + `uv run --with pytest pytest backend/tests/ -q`.
- [ ] **Step 4:** commit `feat(messaging): LINE 위치봇 웹훅 (위치→TOP3 Flex, follow/text→위치요청) (S4 T4)`

### Task 5 — Green Gate + 문서
- [ ] `uv run --with pytest pytest backend/tests/ -q` → 통과
- [ ] 서버 기동 import 확인(라우터 등록 정상)
- [ ] `/security-review` 1회(공개 웹훅·서명검증·토큰 노출 점검)
- [ ] `backend/CLAUDE.md` env 표에 `LINE_CHANNEL_ACCESS_TOKEN`,`LINE_CHANNEL_SECRET` 추가(문서)
- [ ] (채널 준비 후) 실기기 E2E: 친구추가→위치전송→카드→LIFF 주문→선결제

## 완료 기준 (DoD)
- [ ] 핵심(`find_nearby_stores`/`to_store_cards`)이 LINE과 독립 → WhatsApp 어댑터만 추가하면 재사용 가능한 구조
- [ ] `/api/webhooks/line`: 서명검증, location→TOP3 Flex, follow/text→위치요청, 멱등성
- [ ] 주문버튼 = LIFF URL(LINE 자동로그인) / 지도버튼 = google_maps_url
- [ ] `/nearby` 응답 불변(리팩토링 회귀 없음)
- [ ] 단위테스트(서명·카드·Flex) 통과, Green Gate 통과, 토큰 무노출

---

## §지침서 — 대표님 작업 (병행)

### A. 지금: LINE 채널 개설 (일본 출시용)
1. [developers.line.biz](https://developers.line.biz) → Provider → **Messaging API 채널**(QRaku 플랫폼 공식계정) 생성.
2. 확보·설정:
   - **Channel secret**, **Channel access token(long-lived)**
   - **Webhook URL = `https://qraku.com/api/webhooks/line`** 등록 + **Webhook 사용 ON**
   - **응답메시지(auto-reply) OFF** (봇이 직접 회신)
3. 토큰 2개를 **직접 `backend/.env`** 에 입력 — 채팅/PR에 붙여넣지 말 것:
   ```
   LINE_CHANNEL_ACCESS_TOKEN=...
   LINE_CHANNEL_SECRET=...
   ```
4. (이미 보유) `VITE_LINE_LIFF_ID` — LIFF 주문 자동로그인용. LIFF 엔드포인트 URL이 `https://qraku.com` 을 가리키는지 확인.
5. "채널 준비됨" 알려주시면 실기기 E2E 동행.

### B. 나중: 유럽 진출 시 WhatsApp (참고)
- **Meta WhatsApp Business Platform(Cloud API)** 채널 개설 → **App secret / Access token / Phone number ID** 확보, Webhook = `https://qraku.com/api/webhooks/whatsapp` (어댑터 추가 시).
- 위치 공유·"위치 요청 버튼"·카드 회신 **개념 동일** → 본 계획의 핵심(`find_nearby_stores`/`to_store_cards`)을 그대로 쓰고 **WhatsApp 어댑터(서명검증·페이로드 파싱·interactive 카드·/messages 회신)만 신규**. 주문은 일반 https(브라우저).
- 별도 스테이지로 진행(본 계획 범위 밖, 구조만 대비).

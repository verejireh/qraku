# 호텔 모드 (인룸 룸서비스) MVP — 설계

> **타깃**: 대형 호텔이 아니라 **소형 호텔·비즈니스호텔·민박(B&B)**. QRaku 의 강점(미니홈피 + 선결제 테이크아웃)을 호텔 인룸 룸서비스로 접목한다.
> **브랜치**: `feat/hotel-room-service` (origin/main 기준)

## Goal

체크인한 호텔 손님이 **객실 QR**을 스캔해 룸서비스를 **선결제 주문**하고, 스태프와 **채팅**할 수 있게 한다. 업주는 음식 메뉴 추가하듯 룸서비스 메뉴(+ ¥0 비품 요청)를 등록한다. **기존 eat-in 세션/정산 기계는 건드리지 않는다.**

## 핵심 설계 원칙 (왜 단순한가)

**"몇 호 손님인지"는 eat-in 세션이 아니라 객실에 붙은 QR(URL)에서 나온다.** 301호 QR 은 체류 내내 항상 301호다. 따라서:

- 룸서비스 주문 = **선결제 테이크아웃 1건** + 객실번호 태깅. 지속 세션 없음 → "오늘 닫히고 내일 다시 여는" 문제가 원천적으로 발생하지 않는다.
- 채팅 = **(매장, 객실번호) 키 스레드**. 객실번호가 URL 에서 오므로 스태프는 매 메시지에서 객실을 즉시 안다.

이 원칙 덕분에 eat-in 세션/정산 로직을 전혀 수정하지 않고 "선결제의 단순함 + 객실 식별 + 채팅"을 동시에 얻는다.

## Scope (In)

1. **업종 분류**: `StoreCategory` 에 `HOTEL` 추가 + admin 에서 선택.
2. **용어 레이어**: category=HOTEL 일 때 프론트 표시 용어 매핑(테이블→객실, 注文→ルームサービス 등). 표시만 바꾸며 데이터/플로우는 동일.
3. **객실 = 기존 Table 재사용**: 객실 = `Table` 행(`table_number`=객실번호). 테이블 CRUD + QR 빌더/인쇄 그대로 사용.
4. **룸서비스 주문(선결제)**: 객실 QR → 룸서비스 메뉴 → Square 선결제 → `order_type='room_service'` 주문 → KDS 로 전달.
5. **¥0 비품/요청**: 합계 0 이면 결제 스킵, "요청"으로 주문 생성.
6. **객실 채팅**: 손님↔스태프 양방향, (매장,객실) 스코프, WebSocket 실시간. 기존 `Table.call_staff` 호출의 진화.

## Scope (Out / 비범위)

- eat-in 세션·register 정산 로직 수정 — **하지 않음**.
- PMS/객실 후불(폴리오) 연동 — 미포함(미래 단계).
- 미니홈피 숙박 예약/이벤트 선결제 — 별도 표면(다음 spec).
- 다국어·결제수단·통화 — 기존 국가/통화 레이어 그대로 사용(추가 작업 없음).
- 대형 호텔용 멀티아웃렛/스파/컨시어지 — 비범위.

## 데이터 모델 변경 (`backend/models.py`)

1. `StoreCategory` enum 에 `HOTEL = "HOTEL"` 추가.
   - 마이그레이션: enum 은 문자열 컬럼이므로 `Store.category` 스키마 변경 불필요. (값 추가만.)
2. `Order.order_type`: 새 값 `'room_service'` 사용. **문자열 필드라 스키마 변경 없음.** (기존 `'eat_in'|'take_out'` 과 병렬.)
3. 신규 테이블 **`RoomMessage`** (SQLModel `table=True` → `create_all` 자동 생성, ALTER 불필요):
   - `id: int PK`
   - `store_id: int` (index)
   - `room_number: str` (index) — `Order.table_number` 와 동일 규약(객실번호 문자열)
   - `sender_type: RoomMessageSenderType` — enum `{GUEST, STAFF}` (name==value 통일, 기존 `MessageSenderType` 패턴 따름)
   - `content: str`
   - `is_read: bool = False`
   - `created_at: datetime`
   - 대화 스레드 = `(store_id, room_number)` 로 조회.

> 채팅을 `table_id` FK 가 아니라 `(store_id, room_number)` 로 키잉하는 이유: 주문 태깅(`Order.table_number`)과 동일 규약으로 일관, Table 행 존재에 강결합하지 않음. 표시용 객실명은 room_number 그대로 사용.

## API (백엔드)

> 인증 규약은 기존 그대로(`backend/CLAUDE.md`): 손님 공개 생성 엔드포인트 + 스태프(마스터PIN/admin) 보호 엔드포인트. 새 라우터 파일 `routers/room_service.py` (도메인 경계 — 기존 파일에 끼워넣지 않음, 루트 CLAUDE.md 규칙 3).

### 주문
- 룸서비스 주문 생성은 **기존 `orders.py` 선결제 경로를 재사용**한다. 추가는 `order_type='room_service'` + `table_number`=객실 태깅 분기뿐.
  - **¥0 처리**: 서버에서 주문 합계(이미 서버 재계산)가 0 이면 Square 결제 호출을 스킵하고 `payment_status='paid'` 로 주문 생성(합계 0 = 결제 완료로 간주). 음식과의 구분은 `order_type='room_service'` + 아이템 가격(0)으로 충분. (음수/조작 방지는 기존 서버 재계산 그대로.)
- 스태프 측 룸서비스 주문 조회는 기존 KDS/주문 조회 재사용(객실번호 = table_number 로 표시).

### 채팅 (`routers/room_service.py`)
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/room-chat/{store_id}/{room_number}` | 공개(객실 QR) | 해당 객실 대화 목록 |
| POST | `/api/room-chat/{store_id}/{room_number}` | 공개(객실 QR) | 손님 메시지 전송(sender=GUEST) → WS emit |
| GET | `/api/room-chat/{store_id}/active` | 스태프 | 미읽음/활성 객실 대화 요약(스태프 패널용) |
| POST | `/api/room-chat/{store_id}/{room_number}/reply` | 스태프 | 스태프 답장(sender=STAFF) → WS emit |
| POST | `/api/room-chat/{store_id}/{room_number}/read` | 스태프 | 읽음 처리 |

- **실시간**: 기존 `routers/ws.py` WebSocket 매니저 재사용. 메시지 생성 시 매장 채널로 emit(스태프 실시간 수신) + 객실 채널로 emit(손님 실시간 수신). 기존 KDS emit 패턴을 그대로 따른다.

## 프론트엔드

### 라우팅 / 객실 QR
- 객실 QR = 기존 테이블 QR `/:shop_id/table/:room`. 별도 `/room/` 라우트 신설하지 않음(재사용). 객실번호 = tableNumber.
- 룸서비스 메뉴 = 해당 객실 페이지에서 표시. **공개 미니홈피(숙박 이벤트)와는 다른 표면** — 객실 QR URL 로 진입한 인룸 메뉴만 룸서비스 + 채팅 UI 노출.

### 용어 레이어
- `src/config/` 에 category→용어 매핑(작은 사전). 예: HOTEL → `{ table: '客室', order: 'ルームサービス', ... }`. 손님/스태프 뷰에서 라벨에만 적용. (통화 레이어의 `currencyHelpers`/`useCurrency` 와 유사한 경량 헬퍼.)
- 깊은 플로우 분기 없음 — 라벨 치환 수준.

### 손님 측
- 객실 페이지: 룸서비스 메뉴(기존 메뉴/카트 재사용) + **선결제 결제**(기존 `MagnoliaCartModal` 테이크아웃 결제 경로 재사용) + **¥0 요청** 버튼 + **채팅 패널**(기존 점원호출 자리 진화).

### 스태프 측
- **룸서비스 주문**: KitchenView(KDS)에 객실번호 태깅되어 표시(테이크아웃과 동일 흐름).
- **객실 채팅**: StaffView 에 채팅 패널(객실별 대화 + 미읽음 뱃지). 기존 테이블/호출 UI 와 같은 화면.

## 보안

- 객실 채팅·주문은 **객실 QR(물리적 출입 게이트)** 기반. 객실에 물리적으로 접근 가능한 사람 = 그 객실 손님으로 간주(인룸 한정 허용). 로그인 없음.
- 손님 공개 엔드포인트는 store_id/room_number 스코프 검증, 스태프 엔드포인트는 기존 마스터PIN/admin 인증 + store 소유 검증.
- 결제 금액은 기존 규약대로 **서버 재계산**(클라이언트 금액 불신).
- **알려진 한계(MVP 허용)**: room_number 는 추측·열거 가능하므로 공개 채팅 GET 으로 타 객실 대화 내용이 노출될 수 있다. 룸서비스 채팅은 **저민감 정보**로 간주하고 허용한다. 향후 강화 옵션: QR URL 에 객실별 단기 접근 토큰을 포함하거나, 채팅 GET 에 rate-limit 적용. (MVP 에서는 구현하지 않음.)

## 테스트

- 백엔드 `backend/tests/`:
  - `RoomMessage` CRUD + (store,room) 스코프 격리.
  - 룸서비스 주문: `order_type='room_service'` 생성, ¥0 시 결제 스킵 경로, 서버 금액 재계산.
  - 채팅 엔드포인트 인증(공개 vs 스태프) + WS emit 호출.
- 프론트: 변경 파일 `npx eslint` + `npm run build` exit 0. (기존 회귀 룰)

## 비고

- 마이그레이션: 새 테이블은 `create_all` 자동. enum 값 추가는 컬럼 변경 불필요. `database.py migration_sqls` 추가 시 날짜·목적 주석 규칙 준수(루트 CLAUDE.md 규칙 2).
- 라우터: 새 도메인은 새 파일(`room_service.py`) + `main.py` 등록만(규칙 3).

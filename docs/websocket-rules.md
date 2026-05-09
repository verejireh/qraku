# WebSocket Rules — QRaku

> WebSocket은 **주방·스태프·관리자·손님**이 실시간 주문 흐름을 보는 핵심 채널이다.
> 다음 규칙을 어기면 다른 매장 주문이 노출되거나, 다중 인스턴스 환경에서 메시지가 사라진다.

이 문서는:
1. 현재 구현(As-Is) 정리
2. Redis Pub/Sub 도입 후 목표(To-Be) 설계
3. 메시지 스키마
4. 모든 WebSocket 변경에 적용되는 규칙

---

## 1. 현재 구현 (As-Is)

### 1.1 엔드포인트

`backend/routers/ws.py`:
| 경로 | 용도 | 인증 |
|---|---|---|
| `/ws/kitchen/{store_id}` | 주방용 KDS | **없음** (개선 대상) |
| `/ws/admin/{store_id}` | Staff/Register/Admin 공유 | **없음** (개선 대상) |
| `/ws/customer/{store_id}/{table_number}` | 손님 디바이스 | **없음** (개선 대상) |

### 1.2 매니저

`backend/utils/websocket.py`의 `ConnectionManager`:
- `active_connections: Dict[int, List[WebSocket]]` — `store_id → 연결 리스트`
- `active_customer_connections: Dict[Tuple[int, str], List[WebSocket]]` — `(store_id, table_number) → 연결 리스트`
- 모두 **인메모리 dict** — 단일 프로세스 한정.

### 1.3 한계

| 한계 | 영향 |
|---|---|
| 인메모리 상태 | 다중 인스턴스 시 인스턴스 A에서 발행한 이벤트가 인스턴스 B의 클라이언트에 도달 안 함 |
| 인증 없음 | 다른 매장의 `store_id`로 연결하면 그대로 메시지 수신 가능 (멀티테넌시 위반) |
| 메시지 스키마 미정의 | 라우터마다 다른 dict 형태로 broadcast → 클라이언트 분기 어려움 |
| heartbeat 없음 | 끊긴 연결 정리 지연 |
| 백프레셔 없음 | 메시지 폭주 시 메모리 누수 위험 |

---

## 2. 목표 구현 (To-Be) — Phase 2

### 2.1 Redis Pub/Sub 어댑터

```
[FastAPI app1]                                [FastAPI app2]
   ↓ broadcast()                                  ↑ on_message()
   └── PUBLISH ws:store:{store_id}            SUBSCRIBE ws:store:{store_id}
              │                                         │
              └─────────────── Redis ───────────────────┘
```

- **PUBLISH 채널 네이밍 규칙**:
  - 매장 전체: `ws:store:{store_id}`
  - 손님 테이블: `ws:store:{store_id}:table:{table_number}`
- 각 FastAPI 인스턴스는 **자신이 가진 모든 store_id에 대해 SUBSCRIBE**.
- 수신 메시지를 인메모리에 있는 해당 store_id 연결들에 forward.

### 2.2 인터페이스 설계

`backend/utils/websocket.py` 새 시그니처:

```python
class WebSocketBroker:
    """Pub/Sub 어댑터. ConnectionManager가 사용."""

    async def publish_store(self, store_id: int, message: dict) -> None: ...
    async def publish_table(self, store_id: int, table_number: str, message: dict) -> None: ...
    async def subscribe_store(self, store_id: int) -> None: ...
    async def unsubscribe_store(self, store_id: int) -> None: ...

class ConnectionManager:
    # 기존 메서드 유지 (시그니처 보존)
    async def connect(self, websocket: WebSocket, store_id: int) -> None: ...
    def disconnect(self, websocket: WebSocket, store_id: int) -> None: ...
    async def broadcast(self, message: str, store_id: int) -> None:
        # 1) Redis publish
        # 2) 같은 인스턴스의 로컬 연결에는 별도 echo (publish는 자기 자신도 구독 중이라 중복 필터 필요)
```

> ⚠️ **중복 메시지 방지**: PUBLISH 시 인스턴스 ID를 메시지에 포함시키고, SUBSCRIBE 콜백에서 자기 인스턴스가 발행한 건 무시 (이미 로컬 echo함).

### 2.3 인증

새 엔드포인트:
```
POST /api/ws/token         → 단기 토큰 발급 (TTL = WS_AUTH_TOKEN_TTL_SECONDS, 기본 300초)
                             요청 시 store_id, audience(kitchen|admin|customer), table_number(?) 명시
                             응답: { token, expires_at }
```

WebSocket 연결 시:
```
/ws/kitchen/{store_id}?token=<단기토큰>
```

서버는 토큰을 Redis에서 검증하고 `store_id` / `audience` 일치 확인 후 `accept()`. 불일치면 즉시 close(1008 = policy violation).

> 토큰 발급 시점: 손님은 첫 메뉴 로드 시, 스태프/관리자는 로그인 직후. 만료되면 클라이언트가 자동 재발급.

### 2.4 Heartbeat / 재연결

- 서버가 30초마다 `{"type": "ping"}` 송신, 클라이언트는 `{"type": "pong"}` 응답.
- 60초 무응답 시 연결 닫음.
- 클라이언트는 끊김 감지 시 **지수 백오프**(1s → 2s → 5s → 10s, max 30s) 재연결.
- 재연결 후 마지막으로 받은 `event_id`를 query로 보내 누락된 이벤트 catch-up (서버는 Redis Stream에서 재전송).

### 2.5 Rate Limiting / 백프레셔

- 인스턴스당 매장별 최대 연결 수: 200 (운영 모니터링 후 조정)
- 발행 큐 사이즈 초과 시 가장 오래된 비-critical 이벤트 drop
- `event.priority`: `critical` | `normal`. critical은 절대 drop 금지 (주문 생성, 결제 완료 등).

---

## 3. 메시지 스키마 (표준화)

### 3.1 공통 envelope

```json
{
  "type": "<event_type>",
  "event_id": "evt_01HZX...",
  "store_id": 123,
  "ts": "2026-05-09T12:34:56.000Z",
  "priority": "critical",
  "data": { ... }
}
```

| 필드 | 설명 |
|---|---|
| `type` | 이벤트 종류 (`order.created`, `order.updated`, `order.cancelled`, `tabehoudai.session.started`, `ping`, `pong`, `system.notice`) |
| `event_id` | ULID — catch-up 용 |
| `store_id` | 항상 포함 (클라이언트 측에서 자기 매장 검증) |
| `ts` | ISO8601 UTC |
| `priority` | `critical` / `normal` |
| `data` | type별 페이로드 |

### 3.2 이벤트 카탈로그 (초기)

| type | 발신자 | 수신 채널 | data 예시 |
|---|---|---|---|
| `order.created` | `orders.py` | kitchen + admin | `{ order_id, table_number, items: [...], order_type }` |
| `order.updated` | `orders.py`, `pos.py` | kitchen + admin | `{ order_id, status, ... }` |
| `order.cancelled` | `pos.py`, `admin.py` | kitchen + admin | `{ order_id, reason }` |
| `payment.completed` | `paypay.py`, webhook | admin | `{ order_id, amount, method }` |
| `payment.failed` | webhook | admin | `{ order_id, error_code }` |
| `refund.issued` | refund 라우터 | admin | `{ order_id, refund_id, amount }` |
| `tabehoudai.session.started` | `tabehoudai.py` | admin + customer(table) | `{ session_id, table_number, group_id, expires_at }` |
| `tabehoudai.session.ended` | `tabehoudai.py` | admin + customer(table) | `{ session_id }` |
| `tabehoudai.last_order` | server timer | customer(table) | `{ session_id }` |
| `staff.call` | customer | admin | `{ table_number, message }` |
| `system.notice` | system | all | `{ level, message }` |
| `ping` / `pong` | both | — | `{}` |

> **새 이벤트 추가 규칙**: 이 카탈로그에 행을 추가하고, 발신 라우터 / 수신 채널을 명시. 임의 type을 던지지 않는다.

### 3.3 클라이언트 측 가드

수신 시 반드시:
```js
if (msg.store_id !== currentShopId) return;  // 멀티테넌시 가드
```

---

## 4. WebSocket 변경에 적용되는 규칙

### 규칙 W-1 — 매장 격리 (멀티테넌시)

- 모든 broadcast 호출은 `store_id`를 인자로 받는다. **글로벌 broadcast 금지.**
- 메시지 envelope에 항상 `store_id` 포함.
- 손님 채널은 `(store_id, table_number)` 튜플로만 식별. table_number 없이 broadcast 금지.

### 규칙 W-2 — 인메모리 상태 금지 (Phase 2 이후)

- WebSocket 매니저 외부의 어떤 코드도 `manager.active_connections`를 직접 만지지 않는다.
- 캐시(메뉴 / 활성 세션 등)는 Redis로. 인메모리 dict 신규 추가 금지.

### 규칙 W-3 — 메시지 발행은 한 곳에서

- 라우터에서 `manager.broadcast(...)` 직접 호출하는 대신, **이벤트 헬퍼**(`utils/events.py`)를 거친다:
  ```python
  await emit_order_created(store_id, order)
  ```
- 헬퍼 안에서:
  1. 메시지 envelope 생성 (event_id, ts, store_id 자동 채움)
  2. EventLog에도 함께 기록 (감사 로그)
  3. `manager.broadcast` 호출
- 이렇게 해야 새 이벤트 타입을 한 곳에서 관리 가능.

### 규칙 W-4 — Critical 이벤트 누락 방지

- `priority: critical` 이벤트는 **반드시 EventLog에 먼저 commit한 뒤 broadcast**.
- broadcast 실패해도 EventLog는 남아 있어, catch-up으로 복구 가능.
- DB 트랜잭션 내부에서 broadcast 호출 금지 (롤백 시 이미 보낸 메시지 회수 불가).

### 규칙 W-5 — 인증 토큰 검증

- 모든 `/ws/*` 엔드포인트는 query param으로 단기 토큰을 받고, Redis에서 검증.
- 검증 실패 시 `await websocket.close(code=1008)`.
- 토큰의 `audience`와 엔드포인트가 다르면 거부 (예: customer 토큰으로 `/ws/admin` 접근 차단).

### 규칙 W-6 — 메시지 사이즈 제한

- 단일 메시지 ≤ 64 KB. 큰 페이로드(이미지 등)는 URL 참조로.

### 규칙 W-7 — 클라이언트 재연결 우선

- 서버는 끊긴 연결을 **즉시** dict에서 제거.
- 클라이언트는 끊긴 후 즉시 재연결 시도 (지수 백오프).

---

## 5. 구현 가이드 (Phase 2 작업자용)

### 5.1 새 파일 위치

| 파일 | 역할 |
|---|---|
| `backend/utils/redis.py` | aioredis 클라이언트 싱글톤 |
| `backend/utils/websocket.py` | (수정) `ConnectionManager` + `WebSocketBroker` |
| `backend/utils/events.py` | (신규) 이벤트 헬퍼 (`emit_order_created` 등) |
| `backend/routers/ws.py` | (수정) 인증 토큰 검증 추가 |
| `backend/routers/ws_token.py` | (신규) `POST /api/ws/token` |

### 5.2 기존 호출 사이트 변경 범위

라우터에서 `manager.broadcast(...)` 직접 호출하는 곳을 **모두 grep으로 찾아 헬퍼 사용으로 교체**.

```
backend/routers/orders.py         ← 주문 생성 broadcast
backend/routers/pos.py            ← 정산 broadcast
backend/routers/tabehoudai.py     ← 세션 broadcast
... (작업 시작 시 grep으로 정확히 산출)
```

### 5.3 클라이언트 측

| 파일 | 변경 |
|---|---|
| `frontend-react/src/hooks/useWebSocket.js` 또는 동등 | 토큰 발급 → 연결 → heartbeat → 재연결 로직 캡슐화 |
| 사용처 (`KitchenView`, `StaffView`, `OrderView` 등) | 훅 사용으로 통일 |

### 5.4 테스트 시나리오

1. **2 인스턴스 시뮬레이션** (로컬 docker-compose) — A에 연결한 클라이언트가 B에서 발행한 이벤트를 받는지.
2. **재연결 후 catch-up** — 클라이언트 끊고 5초 뒤 재연결 시 그동안의 critical 이벤트를 받는지.
3. **다른 store_id 토큰으로 접근** — 거부되는지.
4. **table_number 다른 손님 채널** — 메시지 격리되는지.
5. **heartbeat 시뮬레이션** — 60초 무응답 시 서버가 끊는지.

---

## 6. 비범위

- **Sticky session** — 도입 안 함. 어느 인스턴스에 연결돼도 동작해야 함 (Pub/Sub 전제).
- **WebSocket 외 transport** (SSE, long-polling) — 현재 안 함.
- **메시지 영속화** — Phase 2에서는 Redis Stream 24h만. 영속 저장은 EventLog에서.

# ADR-004 WebSocket Pub/Sub Lazy Start + 자기메시지 Dedup

**상태**: Accepted (2026-05-10)
**관련 카드**: WS-02

## 결정

WebSocket fan-out 은 Redis Pub/Sub 으로 처리한다. 핵심 패턴:

1. **단일 패턴 구독**: `psubscribe("ws:store:*")` — 매장당 채널을 분리해서 publish 하되 수신은 한 번만 구독.
2. **로컬 우선 + Pub/Sub 보완**: `broadcast()` 호출 시 **먼저** 로컬 dispatch → **그 다음** Redis publish. 발행자 인스턴스의 클라이언트는 로컬에서 이미 받았으므로, Pub/Sub 으로 자기 메시지를 다시 받아도 `instance_id` 비교로 skip.
3. **Lazy start**: `_pubsub_listener` 백그라운드 task 는 `connect()` / `broadcast()` 첫 호출 시 시작. `main.py` 수정 없음. `asyncio.Lock` + `_pubsub_started` 플래그로 race 방지.
4. **재연결 backoff**: 리스너는 무한 루프, Redis 끊김 시 `(1, 2, 5, 10, 30)` 초 backoff. 발행 실패는 격리(`logger.exception` + return) — 로컬 dispatch 는 절대 막지 않음.

Envelope 형식:
```json
{
  "instance_id": "abc123def456",
  "target": "staff" | "customer",
  "store_id": 5,
  "table_number": "3",
  "payload": "<원본 메시지 JSON 문자열 그대로>"
}
```

`payload` 는 `utils/events.py` 가 만든 envelope JSON 문자열 **그대로** — 재직렬화 금지 (event_id / ts 가 바뀌면 안 됨).

## 이유

- **로컬 우선**: 단일 인스턴스 / 같은 인스턴스 사용자에게 추가 지연 0.
- **자기메시지 dedup**: 발행자가 자기 메시지를 SUBSCRIBE 에서 받아 다시 dispatch 하면 클라이언트가 같은 메시지를 두 번 받음 → `instance_id` 비교로 차단.
- **Lazy start**: `main.py` 의 startup 훅을 건드리지 않아 File Fence 준수. 또한 테스트/스크립트에서 WS 매니저를 import 만 해도 프로세스가 안 떠야 함.
- **단일 패턴 구독**: 매장 수가 늘어도 SUBSCRIBE 수는 1. 채널 분리는 publish 측에만.

## 대안

- **인스턴스별 직접 통신** (gRPC / 내부 HTTP): 인스턴스 수 제곱으로 연결 증가. 서비스 디스커버리 필요.
- **Pub/Sub 만 사용 (로컬 dispatch 없음)**: 단일 인스턴스 동작도 Redis 왕복 → 추가 지연.
- **별도 메시지 브로커** (RabbitMQ 등): Redis 기능과 중복. 추가 인프라.
- **인스턴스별 채널 분리** (`ws:store:{id}:instance:{id}`): 발행자가 모든 인스턴스에 publish 해야 함 → 발견(discovery) 부담.

## 결론

규모 ~수십 인스턴스까지는 본 방식이 단순·견고.
**미래 분기점**: 매장 수가 수만 단위가 되거나 메시지 당 클라이언트 수가 많아져 fan-out 부하가 커지면 NATS / Kafka 같은 전용 브로커 검토.

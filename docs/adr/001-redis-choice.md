# ADR-001 Redis 선택

**상태**: Accepted (2026-05-09)
**관련 카드**: INF-01

## 결정

`redis-py >= 5.0` 의 asyncio 인터페이스를 사용한다 (단일 Redis 인스턴스).

용도:
1. WebSocket Pub/Sub (다중 인스턴스 fan-out)
2. Idempotency-Key 분산 잠금 + 결과 캐시
3. WS 인증 토큰 단기 저장
4. Dramatiq 큐 브로커
5. 일반 캐시 (메뉴 / 매장 설정 등 — 향후)

## 이유

- `aioredis` 는 deprecated. 공식 권장은 `redis.asyncio`.
- FastAPI / SQLAlchemy 비동기 스택과 자연스럽게 호환.
- Pub/Sub · 큐 · 캐시 · 분산락을 **단일 컴포넌트**로 충당 → 인프라 복잡도 최소.
- 운영 비용 저렴, 사실상 표준.

## 대안

- **RabbitMQ**: 큐 기능은 강력하나 Pub/Sub · 캐시 · 락 용도로는 과하다. 추가 컴포넌트.
- **NATS**: 메시징은 우수하나 캐시 / 결과 저장에 부적합. 인프라 한 종류 더 늘림.
- **Memcached**: 캐시만 가능. Pub/Sub / 큐 불가능.
- **자체 in-memory 캐시 유지**: 다중 인스턴스 불가능 → 이번 사이클 목표(스케일아웃 준비)와 충돌.

## 결론

현재 SaaS 규모(GCP VM 단일 인스턴스, 매장 수십~수백)에서는 Redis 단일로 충분.
**미래 분기점**: 큐가 폭증하거나 Pub/Sub 토픽 수 만 단위가 되면 RabbitMQ / NATS 별도 도입 검토.

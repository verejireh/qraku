# Architecture Decision Records (ADR)

> 주요 설계 결정의 **결정·이유·대안·결론**을 짧게 기록.
> 코드 / 카드 / 사이클이 바뀌어도 "왜 이렇게 두었는가" 를 잃어버리지 않기 위함.

## 작성 규칙

1. 새 ADR 은 다음 번호 + 짧은 제목으로 파일 생성: `NNN-<short-title>.md`
2. 본문은 **간결하게** (보통 30~80줄). 결정·이유·대안·결론 4 섹션.
3. 결정이 뒤집히면 새 ADR 을 추가해 이전 ADR 을 superseded 로 표시.
4. 코드 변경은 ADR 에 적지 않는다 — 그건 PR/커밋의 몫.

## 색인

| ID | 제목 | 상태 |
|---|---|---|
| [001](./001-redis-choice.md) | Redis 선택 | Accepted (2026-05) |
| [002](./002-dramatiq-over-celery.md) | Dramatiq 선택 (vs Celery) | Accepted (2026-05) |
| [003](./003-inline-migration-coexistence.md) | Alembic + 인라인 마이그레이션 공존 | Accepted (2026-05) |
| [004](./004-websocket-pubsub-lazy-start.md) | WebSocket Pub/Sub Lazy Start + 자기메시지 dedup | Accepted (2026-05) |
| [005](./005-jwt-ws-token.md) | 단기 JWT WebSocket 인증 토큰 | Accepted (2026-05) |

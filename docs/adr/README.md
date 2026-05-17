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
| [006](./006-postgresql-migration.md) | PostgreSQL (Cloud SQL) 마이그레이션 | Accepted (2026-05) |
| [007](./007-pgloader-choice.md) | pgloader 선택 (마이그레이션 도구) | Accepted (2026-05) |
| [008](./008-cutover-strategy.md) | Big-Bang 컷오버 (MySQL → PostgreSQL) | Accepted (2026-05) |

## 2026-05 PostgreSQL 마이그레이션 사이클 ADRs

- **[006](./006-postgresql-migration.md)** — 왜 PG 로 가는가 + Cloud SQL 사양·네트워크
- **[007](./007-pgloader-choice.md)** — 데이터 마이그레이션 도구 (pgloader vs DMS vs 자체 스크립트)
- **[008](./008-cutover-strategy.md)** — 컷오버 전략 (big-bang vs 듀얼라이트 vs read replica)

> 본 묶음의 입력은 `tasks/db-migration-audit.md` §13 (DBM-02 산출). 사이클 카드는 `tasks/current-tasks.md` 의 DBM-01 ~ DBM-13.
>
> 본 사이클의 DBM-13 (컷오버 후 정리) 완료 시점에 [ADR-003 (인라인 마이그레이션 공존)](./003-inline-migration-coexistence.md) 의 "공존" 전제가 해제되어 단일화 예정. 자세한 메모는 ADR-003 본문 끝 참조.

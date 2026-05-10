# ADR-002 Dramatiq 선택 (vs Celery)

**상태**: Accepted (2026-05-10)
**관련 카드**: OPS-02

## 결정

백그라운드 작업 큐는 **Dramatiq + Redis 브로커**.
첫 워커는 메뉴 자동 번역 (`backend/workers/translate_tasks.py`).

## 이유

- 가볍고 의존성 적음 (Redis 만 있으면 끝).
- 코드가 단순 — `@dramatiq.actor` 데코레이터 하나로 정의 → `task.send(args)` 로 enqueue.
- 재시도 / 백오프 / time_limit 설정이 직관적 (decorator kwargs).
- FastAPI 비동기 스택과 별개로 sync 워커 프로세스로 동작 — DB·Redis 모두 sync 클라이언트 사용.

## 대안

- **Celery**: 기능 풍부하나 설정·운영 복잡. broker / result backend / beat 등 컴포넌트 분리, 우리 규모에 과함.
- **RQ**: Dramatiq 보다도 단순하지만 재시도 / 미들웨어 지원이 약함.
- **arq**: asyncio 기반 — FastAPI 와 같은 이벤트 루프 공유. 다만 동기 라이브러리(Gemini SDK 등) 호출이 많아 별 이점이 없고, 생태계가 Dramatiq 보다 작다.
- **FastAPI BackgroundTasks**: 같은 프로세스 안에서 처리 → 워커 분리 의미 없음. 인스턴스 재시작 시 인플라이트 작업 유실.

## 결론

Dramatiq 가 **현재 규모 + 향후 확장성** 두 요건의 균형에 가장 부합.
**미래 분기점**: 작업 종류가 많아져 라우팅 / 우선순위 / scheduled job 이 복잡해지면 Celery 또는 별도 스케줄러(APScheduler 등) 검토.

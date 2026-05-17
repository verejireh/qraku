# ADR-003 Alembic + 인라인 마이그레이션 공존

**상태**: Accepted (2026-05-10)
**관련 카드**: OPS-03

## 결정

Alembic 을 도입하되 **기존 `database.py:migration_sqls` (인라인 ALTER) 를 즉시 폐기하지 않는다**.
이중 안전망 기간 동안 같은 변경을 양쪽에 모두 추가.

- 기존 운영 환경: 첫 배포 시 1회 `uv run alembic stamp head` 로 baseline 마킹 (`alembic/versions/0001_baseline.py` 는 no-op).
- 신규 변경: ① `models.py` 수정 → ② `alembic revision --autogenerate` → ③ 같은 SQL 을 `migration_sqls` 에도 append.
- `main.py` startup / `deploy.py` 어디에도 `alembic upgrade head` 자동 실행 안 함.

## 이유

- 이미 운영 중인 GCP VM 의 schema 가 `migration_sqls` 의 누적 결과물이고, Alembic 으로의 즉시 전환은 운영 위험이 크다.
- `migration_sqls` 의 멱등성 (이미 존재하는 컬럼 추가 → 무시) 으로 인해 서버 재시작이 안전.
- Alembic 의 autogenerate 가 SQLModel Enum / JSON-as-TEXT 컬럼에서 노이즈를 검출 → 자동 적용은 위험.
- 자동 `upgrade head` 를 `main.py` 에 넣으면 `migration_sqls` 와 **이중 적용** 위험 (같은 ALTER 가 두 번 시도).

## 대안

- **즉시 단일화 (Alembic only)**: 기존 schema 의 모든 ALTER 를 reverse-engineering 해서 하나의 baseline revision 으로 정리해야 함. 운영 정합 검증 부담이 크다.
- **Alembic 자동 실행**: `main.py` 에 `upgrade head` 추가. 인라인과 충돌 위험.
- **인라인 유지, Alembic 미도입**: 마이그레이션 도구의 표준화 / autogenerate / branching 이점 포기.

## 결론

공존이 가장 안전. 충분한 운영 검증 후 `migration_sqls` 를 단계적으로 deprecate (별도 사이클).
**미래 분기점**: `migration_sqls` 가 마지막 변경된 지 수 사이클 경과 + Alembic revision 으로 모든 schema 가 표현됨이 확인되면, baseline 압축 + `migration_sqls` 폐기.

---

## Update (2026-05-11) — PG 컷오버 후 단일화 예정

> **수퍼시드 예고**: [ADR-006 PostgreSQL 마이그레이션](./006-postgresql-migration.md) + [ADR-008 Big-Bang 컷오버](./008-cutover-strategy.md) 의 결정에 따라, 본 ADR 의 "공존" 전제는 **2026-05 PostgreSQL 마이그레이션 사이클의 DBM-12 컷오버 시점까지만 유효**.
>
> **DBM-13 (컷오버 후 정리)** 단계에서 다음 중 하나로 결정:
> - **읽기 전용 보존**: `migration_sqls` 를 코드에 그대로 두되 신규 변경은 Alembic only. 역사 / 디버깅 가치 보존.
> - **물리적 제거**: `database.py` 의 `migration_sqls` 리스트 + 호출부 삭제. Alembic 단일화.
>
> 어느 쪽이든 본 ADR 의 "Alembic + 인라인 공존" 정책은 **DBM-13 종료 시점에 종료**. 그 시점에 본 ADR 의 상태를 **Superseded by ADR-009** (또는 DBM-13 가 산출하는 후속 ADR) 로 변경 예정.
>
> 따라서 DBM-04 ~ DBM-12 기간 동안 신규 schema 변경이 발생하면, 본 ADR 의 기존 정책 (Alembic + `migration_sqls` 양쪽 추가) 을 그대로 따른다.

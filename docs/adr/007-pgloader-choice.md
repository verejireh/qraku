# ADR-007 pgloader 선택 (마이그레이션 도구)

**상태**: Accepted (2026-05-11)
**관련 카드**: DBM-09 (pgloader config + 스테이징 실행), DBM-10 (정합성 검증), DBM-12 (운영 컷오버)
**입력**: `tasks/db-migration-audit.md` §13.3

## 결정

데이터 마이그레이션 도구로 **pgloader** 를 선택. **스테이징 리허설과 운영 컷오버 모두 동일한 `tools/pgloader/qraku.load` config 를 재사용**한다.

## 이유

- **단일 명령으로 schema + data 일괄**: `mysqldump → 자체 변환 → psql` 파이프라인 대비 변환 단계가 사라지고 디버깅 표면이 좁다.
- **데이터 타입 자동 매핑**: `DATETIME → TIMESTAMP`, `TINYINT(1) → BOOLEAN`, `JSON → TEXT` 등 audit §5 의 1차 매핑표와 정확히 일치. 수작업 변환 0.
- **시퀀스 / auto-increment 보정 자동**: PG 의 sequence next_val 을 `max(id)+1` 로 자동 설정. DBM-10 정합성 스크립트가 추가 검증.
- **데이터 규모 ~1 GB**: GCP DMS 의 복잡성·종속성 없이 단일 binary 로 충분. 실행 시간 수 분 ~ 십 수 분 예상.
- **로컬·CI 재현성**: docker 컨테이너에서 100% 재현 가능. 스테이징 리허설을 그대로 운영 컷오버에 옮길 수 있어 룬북 정합성이 높다.
- **운영 종속성 0**: GCP 외 환경 (개발자 로컬, 다른 클라우드 추후 검토 시) 에서도 동일 도구 사용.

## 대안

- **Google Database Migration Service (DMS)**: GCP 관리형 도구로 read-replica 기반 컷오버 지원. 그러나 (1) 베타 단계 데이터 규모에 과한 도구, (2) GCP 콘솔 / IAM 권한 설정 부담, (3) 컷오버 전략(ADR-008 big-bang) 과 굳이 결합할 이점 없음. **재검토 시점**: 식당 수 100+ / 데이터 100 GB+ / 다운타임 5 분 미만 요구 도래 시.
- **자체 mysqldump + Python 변환 스크립트**: 데이터 타입 매핑·시퀀스·인코딩 버그가 발생하면 자체 디버깅 부담. 재현성·테스트 가능성 모두 pgloader 보다 낮음.
- **Logical replication (PG ↔ MySQL)**: MySQL → PG 단방향 도구 (예: `pg_chameleon`) 는 관리·안정성이 부족하고 듀얼라이트 컷오버 (ADR-008 에서 기각) 와만 의미. big-bang 전략과 정합 안 됨.

## 결론

DBM-09 에서 `tools/pgloader/qraku.load` config 작성 + 시드 데이터로 동작 검증. 운영 dump 수령 후 스테이징에서 1 회 실행 → DBM-10 정합성 스크립트 (`tools/migration_check.py`) 로 행 수 / MAX(id) / 시퀀스 / FK / 인코딩 / JSON / 인덱스 검증.

운영 컷오버 (DBM-12) 시점에도 동일 config 를 그대로 사용. 컷오버 룬북의 T-15 ~ T-10 구간에서 실행, 종료 코드 0 + 정합성 검증 모두 ✅ 시에만 다음 단계 진행.

**미래 분기점**: 식당 / 데이터 규모가 위 기준을 넘으면 DMS + read replica 컷오버로 재검토. 이때 본 ADR 을 superseded 처리.

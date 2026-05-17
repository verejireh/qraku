# ADR-006 PostgreSQL (Cloud SQL) 마이그레이션

**상태**: Accepted (2026-05-11)
**관련 카드**: DBM-01 ~ DBM-13 (2026-05 PostgreSQL 마이그레이션 사이클)
**입력**: `tasks/db-migration-audit.md` §1~12 (호환성 감사) + §13.1~13.2 (사양·네트워크 결정)

## 결정

운영 DB 를 **MySQL → PostgreSQL 16 (GCP Cloud SQL)** 로 이전한다.

- **인스턴스**: `db-custom-1-3840` (1 vCPU / 3.75 GB RAM)
- **스토리지**: 20 GB SSD, 자동 증가 ON
- **HA**: zonal (단일 인스턴스) — 식당 50+ 시 regional 검토
- **리전 / 존**: `asia-northeast1-b` (GCP VM 동일 존, latency 최소)
- **PostgreSQL 버전**: 16 (안정 + `jsonb` GIN 인덱스 + `EXTRACT` ANSI 호환 성숙)
- **백업**: 매일 02:00 KST, 7 일 보관
- **PITR**: 활성화, WAL 7 일 보관
- **네트워크**: Public IP + **Cloud SQL Auth Proxy** (GCP VM 에 systemd 서비스)

## 이유

### MySQL 의 현재 한계 (audit §1~5 요약)

- **식별자 인용 불일치**: `migration_sqls` 와 라우터(`demo.py`, `seed_data.py`, `reseed_demo.py`) 에 `` `order` `` / `` `table` `` 백틱 산재. ANSI 비호환 → 정리 비용 누적.
- **JSON 활용 한계**: `Menu.options` 를 비롯한 7 개 컬럼이 `str + Column(Text)` 우회. PG `jsonb` + GIN 인덱스로 마켓플레이스 (옵션·알레르기·태그) 검색 / 필터링 가능.
- **위치 기반 발견 부재**: 사용자 비전(미니홈피 + 근처 매장 발견 / GEO 사이클) 의 핵심인 PostGIS 가 PG 전용. MySQL Spatial 은 표준화·도구 생태계 빈약.
- **트랜잭션 DDL**: PG 는 대부분의 DDL 이 트랜잭션 안에서 안전. 마이그레이션 사고 시 롤백 / 부분 적용 회피 가능.
- **운영 도구 성숙도**: `pgloader`, `pg_dump`, `EXPLAIN ANALYZE`, `pg_stat_statements` 등의 깊이가 MySQL 대비 우월.
- **Cloud SQL 통합**: 백업·PITR·IAM 인증·Auth Proxy 가 GCP VM 운영 모델 (단일 인스턴스 + 짧은 다운타임 허용) 과 자연스럽게 맞물림.

### 사양 / 네트워크 근거

- 베타 단계, 식당 수십 매장 미만, 데이터 < 1 GB → 가장 작은 사이즈로 출발해 식당 추이에 따라 scale up.
- 단일 GCP VM 운영 → Public IP + Auth Proxy 가 VPC peering 대비 설정·비용·인지부담 모두 우위.

## 대안

- **MySQL 유지** + jsonb 대용 / 위치 기반 우회: 단기 변경 비용은 낮지만, 출시 후 트래픽·데이터 증가 상태에서의 이전 비용·다운타임 위험이 폭증. "지금이 가장 싸다."
- **AlloyDB / Cloud Spanner**: 베타 + 단일 인스턴스 운영에 과한 도구. 비용·러닝커브 부담.
- **자체 PG 설치 (GCP VM 내 docker postgres)**: 백업·HA·인증을 직접 운영해야 함. Cloud SQL 의 IAM·자동 백업·PITR 손실.
- **PG + Private IP (VPC peering)**: 보안은 약간 강하지만 단일 VM 운영에서 ROI 낮음. 향후 멀티 VM / GKE 전환 시 재검토.

## 결론

본 사이클 DBM-04 (driver 추가) → DBM-05/05b/05c (코드 ANSI 호환화) → DBM-06 (Alembic 양 DB) → DBM-07/08 (compose + PG 빈 인스턴스 검증) → DBM-09/10 (pgloader + 정합성) → DBM-11 (Cloud SQL + Auth Proxy) → DBM-12 (컷오버) → DBM-13 (MySQL 정리) 순으로 진행.

**관련 ADR**: ADR-007 (pgloader 도구), ADR-008 (big-bang 컷오버). ADR-003 (인라인 마이그레이션 공존) 은 DBM-13 종료 시점에 단일화 예정.

**운영자 협의 항목**: OPR-09 (Cloud SQL 인스턴스 생성), OPR-10 (Auth Proxy systemd 등록).

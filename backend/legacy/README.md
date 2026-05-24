# Legacy Migration Scripts

**상태**: 운영 비활성. 실행 금지.

이 디렉토리의 스크립트는 **SQLite 시절 일회성 마이그레이션 도구**입니다. 2026-05-19
PostgreSQL 컷오버 (DBM-12) 이후 운영 경로에 사용되지 않습니다. 보존 사유는 (1) 과거
스키마 변화 추적, (2) 데이터 복구 비상 시 참고용입니다.

## 보존 파일

| 파일 | 본래 용도 |
|---|---|
| `check_db.py` | SQLite 파일 무결성 점검 |
| `reset_db.py` | SQLite DB 파일 삭제 + 재생성 |
| `migrate_geofence.py` | Store 위경도 필드 추가 (구 SPC-03 전) |
| `migrate_kitchen_mode.py` | KitchenMode enum 컬럼 추가 |
| `migrate_menu.py` | 메뉴 다국어/이미지 필드 추가 |
| `migrate_menu_options.py` | 메뉴 옵션 JSON 컬럼 추가 |
| `migrate_reviews.py` | 리뷰/별점 관련 컬럼 |
| `migrate_square_oauth.py` | Square OAuth 토큰 컬럼 |
| `migrate_subscriptions.py` | 구독 type/status 컬럼 |
| `migrate_table_status.py` | TableStatus enum 컬럼 |
| `migrate_theme.py` | Store.theme 컬럼 |
| `migrate_v2_loyalty.py` | 포인트 / 스탬프 / 쿠폰 |
| `migrate_v3_policy.py` | 정책 / 약관 컬럼 |
| `migrate_v4_languages.py` | 다국어 / 언어 설정 컬럼 |

## 실행하지 마세요

PostgreSQL 운영 환경에서 이 스크립트들은:
- SQLite 파일 (`./database.db`) 가정으로 동작 → PG 환경에서 의미 없음
- 일부는 운영 데이터 손상 가능성 (예: `reset_db.py` 가 DB 파일 삭제)

신규 스키마 변경은 `backend/database.py:migration_sqls` 또는 향후 Alembic (OPR-07
완료 후) 으로 진행합니다.

## 폐기 일정

운영 안정화 + 1개월 (~2026-06-22) 후 검토. 비상 복구 참고 가치가 없다고 판단되면
git 이력에 보존 + 디렉토리 삭제. 단, **사라진 파일도 git history 로 추적 가능**.

"""baseline (no-op) — 기존 schema 는 backend/database.py:migration_sqls 로 관리됨

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-10
"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline 은 의도적으로 no-op.

    - 기존 운영 DB: 운영자가 `alembic stamp head` 1회 실행 (OPR-07).
    - 신규 dev DB: SQLModel.metadata.create_all 로 모든 테이블 생성된 후 stamp.
    이후의 모든 스키마 변경은 새 revision 으로 추가하며,
    동시에 backend/database.py:migration_sqls 에도 동일 SQL 추가하여 이중 안전망 유지.
    """
    pass


def downgrade() -> None:
    """Baseline downgrade 는 정의하지 않음 (의미가 없음)."""
    pass

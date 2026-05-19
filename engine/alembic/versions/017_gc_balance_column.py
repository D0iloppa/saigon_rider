"""rp_balance에 gc_balance 컬럼 추가

Revision ID: sre017
Revises: sre016
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre017"
down_revision: Union[str, None] = "sre016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE rp_balance
        ADD COLUMN IF NOT EXISTS gc_balance BIGINT NOT NULL DEFAULT 0
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE rp_balance DROP COLUMN IF EXISTS gc_balance")

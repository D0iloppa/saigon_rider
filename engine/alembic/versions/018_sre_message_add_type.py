"""sre_message_tbl에 type 컬럼 추가

Revision ID: sre018
Revises: sre017
Create Date: 2026-05-20
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre018"
down_revision: Union[str, None] = "sre017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE sre_message_tbl
        ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'gps'
    """)
    op.execute("""
        CREATE INDEX idx_sre_msg_type_ts
        ON sre_message_tbl (type, timestamp DESC)
    """)
    op.execute("""
        CREATE INDEX idx_sre_msg_uuid_ts
        ON sre_message_tbl (uuid, timestamp DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sre_msg_uuid_ts")
    op.execute("DROP INDEX IF EXISTS idx_sre_msg_type_ts")
    op.execute("ALTER TABLE sre_message_tbl DROP COLUMN IF EXISTS type")

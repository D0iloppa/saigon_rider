"""sre_message_tbl 생성

Revision ID: sre010
Revises: sre009
Create Date: 2026-05-15
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre010"
down_revision: Union[str, None] = "sre009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE sre_message_tbl (
            id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            uuid      TEXT        NOT NULL,
            message   TEXT        NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            _extra    JSONB       NOT NULL DEFAULT '{}'
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sre_message_tbl")

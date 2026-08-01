"""sre_user 테이블

Revision ID: sre002
Revises: sre001
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre002"
down_revision: Union[str, None] = "sre001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE sre_user (
          user_id              BIGINT       GENERATED ALWAYS AS IDENTITY,
          external_user_uuid   VARCHAR(64)  NOT NULL,
          account_type         account_type_enum NOT NULL DEFAULT 'STANDARD',
          is_driver_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
          status               user_status_enum  NOT NULL DEFAULT 'ACTIVE',
          created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id),
          CONSTRAINT uq_external_uuid UNIQUE (external_user_uuid)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sre_user")

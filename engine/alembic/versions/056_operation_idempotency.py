"""재화 작업의 요청 해시와 최초 응답을 idempotency_key에 저장

Revision ID: sre056
Revises: sre055
Create Date: 2026-07-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "sre056"
down_revision: Union[str, None] = "sre055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("idempotency_key", sa.Column("external_user_uuid", sa.String(36), nullable=True))
    op.add_column("idempotency_key", sa.Column("request_hash", sa.String(64), nullable=True))
    op.add_column("idempotency_key", sa.Column("response_json", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("idempotency_key", "response_json")
    op.drop_column("idempotency_key", "request_hash")
    op.drop_column("idempotency_key", "external_user_uuid")

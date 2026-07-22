"""policy reward delivery state and idempotency key

Revision ID: sre058
Revises: sre057
Create Date: 2026-07-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sre058"
down_revision: Union[str, None] = "sre057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_policy_log", sa.Column("status", sa.String(10), nullable=False, server_default="SUCCEEDED"))
    op.add_column("user_policy_log", sa.Column("idempotency_key", sa.String(160), nullable=True))
    op.add_column("user_policy_log", sa.Column("last_error", sa.Text(), nullable=True))
    op.execute("UPDATE user_policy_log SET idempotency_key = 'policy-legacy-' || id::text")
    op.alter_column("user_policy_log", "idempotency_key", nullable=False)
    op.create_unique_constraint("uq_user_policy_log_idempotency_key", "user_policy_log", ["idempotency_key"])
    op.alter_column("user_policy_log", "status", server_default="PENDING")
    op.create_table(
        "policy_action_grant",
        sa.Column("idempotency_key", sa.String(200), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("sre_user.user_id"), nullable=False),
        sa.Column("policy_id", sa.BigInteger(), sa.ForeignKey("reward_policy.id"), nullable=False),
        sa.Column("action_id", sa.BigInteger(), sa.ForeignKey("reward_policy_action.id"), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("policy_action_grant")
    op.drop_constraint("uq_user_policy_log_idempotency_key", "user_policy_log", type_="unique")
    op.drop_column("user_policy_log", "last_error")
    op.drop_column("user_policy_log", "idempotency_key")
    op.drop_column("user_policy_log", "status")

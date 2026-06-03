"""action_definition.rp_grant — RP(gc) 성취 보상 적립 (SGR-213)

쿠폰 구매 화폐 RP(gc_balance)의 적립 경로. 액션별 rp_grant(무상한).
초기: QUEST_COMPLETE = 50. 일일 퀘스트 슬롯이 자연 천장.

Revision ID: sre038
Revises: sre037
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sre038"
down_revision: Union[str, None] = "sre037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "action_definition",
        sa.Column("rp_grant", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("UPDATE action_definition SET rp_grant = 50 WHERE action_code = 'QUEST_COMPLETE'")


def downgrade() -> None:
    op.drop_column("action_definition", "rp_grant")

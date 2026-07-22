"""한 user_quest의 활성 카드를 하나로 제한

Revision ID: sre057
Revises: sre056
Create Date: 2026-07-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre057"
down_revision: Union[str, None] = "sre056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE sre_quest_card AS card
        SET status = 'CANCELLED'
        FROM (
            SELECT card_id, row_number() OVER (
                PARTITION BY user_quest_id ORDER BY accepted_at DESC, card_id DESC
            ) AS rn
            FROM sre_quest_card
            WHERE status = 'ACTIVE'
        ) AS duplicate
        WHERE card.card_id = duplicate.card_id AND duplicate.rn > 1
    """)
    op.create_index(
        "uq_quest_card_user_quest_active", "sre_quest_card", ["user_quest_id"],
        unique=True, postgresql_where="status = 'ACTIVE'",
    )


def downgrade() -> None:
    op.drop_index("uq_quest_card_user_quest_active", table_name="sre_quest_card")

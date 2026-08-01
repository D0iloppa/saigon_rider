"""QUEST_COMPLETE rp_grant 0 — RP는 per-quest 값(payload.rp)으로 적립 (SGR-213)

플랫 50 폐기. 퀘스트 RP = rewardXpPoints(reward_exp×0.3)를 BFF가 payload.rp로 전달,
event_bus가 그 값으로 gc_balance 적립 → 화면 표시값과 일치.
rp_grant 컬럼/폴백 메커니즘은 향후 비-퀘스트 액션용으로 유지.

Revision ID: sre039
Revises: sre038
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre039"
down_revision: Union[str, None] = "sre038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE action_definition SET rp_grant = 0 WHERE action_code = 'QUEST_COMPLETE'")


def downgrade() -> None:
    op.execute("UPDATE action_definition SET rp_grant = 50 WHERE action_code = 'QUEST_COMPLETE'")

"""LEVELUP_REWARD 정책 비활성 — 레벨업 보상 BFF 일원화 (SGR-228)

레벨업 보상(gold·skill_pt)을 BFF gain_exp + levelup_reward_policy(DB seed)로 통합.
엔진 LEVELUP_REWARD(GOLD 50 + 고아 XP 100, 엔진 레벨 기준)는 중복·레벨 정의
어긋남이 있어 비활성화한다. MILEAGE_EXP/BADGE_10KM 등 나머지 정책은 유지.

Revision ID: sre044
Revises: sre043
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre044"
down_revision: Union[str, None] = "sre043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = false WHERE policy_code = 'LEVELUP_REWARD'")


def downgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = true WHERE policy_code = 'LEVELUP_REWARD'")

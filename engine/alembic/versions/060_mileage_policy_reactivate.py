"""마일리지 보상 정책(MILEAGE_XP) 재활성화 (RP+Gold 지급 복구)

042 에서 사용처 없는 XP 고아화폐를 막으려 MILEAGE_XP 정책을 is_active=false 로 껐다.
054 가 이 정책의 지급을 RP(GRANT_RP)+Gold(GRANT_GOLD)로 전환했지만 재활성화는 누락 →
현재 5km 주행 마일리지 이벤트가 어떤 보상도 지급하지 못한다(policy_engine 은 is_active 만 평가).
054 의 의도(RP+Gold 지급)를 실제로 발동시키려 해당 정책만 정확히 다시 켠다.

Revision ID: sre060
Revises: sre059
Create Date: 2026-07-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre060"
down_revision: Union[str, None] = "sre059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = true WHERE policy_code = 'MILEAGE_XP'")


def downgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = false WHERE policy_code = 'MILEAGE_XP'")

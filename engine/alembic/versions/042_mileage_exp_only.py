"""마일리지 보상 EXP 전용 — MILEAGE_XP 비활성 (SGR-228)

누적 주행거리(마일리지) 마일스톤은 레벨링 EXP만 소폭 지급한다.
  MILEAGE_EXP (1km당 EXP 10 → BFF users.exp) : 유지
  MILEAGE_XP  (5km당 XP 30 → 엔진 current_balance, 사용처 없는 고아 화폐) : 비활성
거리 누적이 사용처 없는 XP를 적립하던 것을 제거.

Revision ID: sre042
Revises: sre041
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre042"
down_revision: Union[str, None] = "sre041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = false WHERE policy_code = 'MILEAGE_XP'")


def downgrade() -> None:
    op.execute("UPDATE reward_policy SET is_active = true WHERE policy_code = 'MILEAGE_XP'")

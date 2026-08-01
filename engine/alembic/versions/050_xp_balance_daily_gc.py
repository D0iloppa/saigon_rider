"""xp_balance 일일 RP(gc) 적립 누적 컬럼 — 일일 하드캡용 (SGR-228 후속)

economy-cap-rebalance-design.md §2-A: RP 일일 하드캡(DAILY_RP_CAP=60) 회로차단을 위해
credit_gc 시점에 VN 일자 경계로 누적/리셋할 컬럼 2종 추가. season_pass.daily_sxp_* 와 동일 패턴.

Revision ID: sre050
Revises: sre049
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre050"
down_revision: Union[str, None] = "sre049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE xp_balance ADD COLUMN IF NOT EXISTS daily_gc_today INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE xp_balance ADD COLUMN IF NOT EXISTS daily_gc_date DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE xp_balance DROP COLUMN IF EXISTS daily_gc_today")
    op.execute("ALTER TABLE xp_balance DROP COLUMN IF EXISTS daily_gc_date")

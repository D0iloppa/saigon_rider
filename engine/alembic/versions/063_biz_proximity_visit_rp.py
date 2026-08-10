"""BIZ_PROXIMITY_VISIT 액션 정의 추가 — 근접 광고 방문 확정 RP 적립

260806_proximity_ad_design.md D-5 확정: 10 RP/방문. proximity_policy.daily_rp_cap(3)
이 BFF 단에서 이미 게이트하므로, daily_count_limit=3 은 방어선 이중화(defense in depth)다.

Revision ID: sre063
Revises: sre062
Create Date: 2026-08-10
"""
from collections.abc import Sequence

from alembic import op

revision: str = "sre063"
down_revision: str | None = "sre062"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO action_definition
            (action_code, category_code, display_name, base_xp, rp_grant, daily_count_limit)
        VALUES
            ('BIZ_PROXIMITY_VISIT', 'MARKET', '근접 광고 방문 확정', 0, 10, 3)
        ON CONFLICT (action_code) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM action_definition WHERE action_code = 'BIZ_PROXIMITY_VISIT'")

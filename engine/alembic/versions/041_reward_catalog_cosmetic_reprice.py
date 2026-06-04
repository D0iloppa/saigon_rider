"""reward_catalog 코스메틱 RP 재정렬 — 커피(500 RP) 기준 (SGR-228)

face_value NULL(무비용 sink)인 코스메틱/뱃지를 커피 500 RP 대비 재배치.
충동 소비를 커피 아래에서 흡수(캐주얼 RP sink), 프레스티지만 위.
  BADGE_FOUNDER          200 → 100   (초기 진입 뱃지)
  FRAME_NEON             800 → 300   (커피 아래 코스메틱)
  BADGE_LEGEND_FIRST100 7000 → 2000  (프레스티지, 커피 위 유지)

Revision ID: sre041
Revises: sre040
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre041"
down_revision: Union[str, None] = "sre040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE reward_catalog SET required_xp =  100 WHERE item_code = 'BADGE_FOUNDER'")
    op.execute("UPDATE reward_catalog SET required_xp =  300 WHERE item_code = 'FRAME_NEON'")
    op.execute("UPDATE reward_catalog SET required_xp = 2000 WHERE item_code = 'BADGE_LEGEND_FIRST100'")


def downgrade() -> None:
    op.execute("UPDATE reward_catalog SET required_xp =  200 WHERE item_code = 'BADGE_FOUNDER'")
    op.execute("UPDATE reward_catalog SET required_xp =  800 WHERE item_code = 'FRAME_NEON'")
    op.execute("UPDATE reward_catalog SET required_xp = 7000 WHERE item_code = 'BADGE_LEGEND_FIRST100'")

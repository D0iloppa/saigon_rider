"""reward_catalog 재가격 — 1 RP = 100 VND (SGR-228 재화 밸런싱)

커피 한 잔(GOTIT_50K, 50,000 VND) = 500 RP 기준 정렬.
face_value 보유 항목(실물 가치)을 VND의 1/100 RP로 재산정:
  DATA_1GB    14,000 VND → 140 RP
  GOTIT_50K   50,000 VND → 500 RP  (커피 티어)
  GOTIT_100K 100,000 VND → 1,000 RP
코스메틱(face_value NULL: BADGE_FOUNDER/FRAME_NEON/BADGE_LEGEND)은
실물 가치가 없어 본 마이그 범위 밖(RP 가격은 별도 결정).

Revision ID: sre040
Revises: sre039
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre040"
down_revision: Union[str, None] = "sre039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1 RP = 100 VND (정수 나눗셈; 현 시드값은 모두 100의 배수)
    op.execute(
        "UPDATE reward_catalog SET required_xp = face_value_vnd / 100 "
        "WHERE face_value_vnd IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("UPDATE reward_catalog SET required_xp = 300  WHERE item_code = 'DATA_1GB'")
    op.execute("UPDATE reward_catalog SET required_xp = 1200 WHERE item_code = 'GOTIT_50K'")
    op.execute("UPDATE reward_catalog SET required_xp = 3000 WHERE item_code = 'GOTIT_100K'")

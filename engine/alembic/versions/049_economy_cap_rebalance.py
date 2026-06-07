"""경제 상한 + 리밸런싱 — 가챠 GP 인하 + 쿠폰 monthly_quota (SGR-228 후속)

economy-cap-rebalance-design.md 반영:
 - GP 가챠 인하(골드 일수급 ~150 기준): BASIC 200→150(10연 1800→1350),
   PREMIUM 1500→1050(10연 13500→9450). GC(RP) 가챠는 현행 유지(무비용 RP sink).
 - reward_catalog monthly_quota(월 발급 하드캡, 예산 월 100만원·커피≈3,000원 역산):
   GOTIT_50K=200 / GOTIT_100K=50 / DATA_1GB=100. 코스메틱(face_value NULL)은 무비용이라 NULL(무제한).

Revision ID: sre049
Revises: sre048
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre049"
down_revision: Union[str, None] = "sre048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # GP 가챠 인하 (GC 가챠는 미변경)
    op.execute(
        "UPDATE gacha_definition SET cost_per_pull = 150, cost_per_10_pull = 1350 "
        "WHERE gacha_code = 'BASIC_PULL'"
    )
    op.execute(
        "UPDATE gacha_definition SET cost_per_pull = 1050, cost_per_10_pull = 9450 "
        "WHERE gacha_code = 'PREMIUM_PULL'"
    )
    # 쿠폰 월 발급 하드캡 (예산 역산)
    op.execute("UPDATE reward_catalog SET monthly_quota = 200 WHERE item_code = 'GOTIT_50K'")
    op.execute("UPDATE reward_catalog SET monthly_quota = 50  WHERE item_code = 'GOTIT_100K'")
    op.execute("UPDATE reward_catalog SET monthly_quota = 100 WHERE item_code = 'DATA_1GB'")


def downgrade() -> None:
    op.execute(
        "UPDATE gacha_definition SET cost_per_pull = 200, cost_per_10_pull = 1800 "
        "WHERE gacha_code = 'BASIC_PULL'"
    )
    op.execute(
        "UPDATE gacha_definition SET cost_per_pull = 1500, cost_per_10_pull = 13500 "
        "WHERE gacha_code = 'PREMIUM_PULL'"
    )
    op.execute("UPDATE reward_catalog SET monthly_quota = NULL WHERE item_code = 'GOTIT_50K'")
    op.execute("UPDATE reward_catalog SET monthly_quota = NULL WHERE item_code = 'GOTIT_100K'")
    op.execute("UPDATE reward_catalog SET monthly_quota = NULL WHERE item_code = 'DATA_1GB'")

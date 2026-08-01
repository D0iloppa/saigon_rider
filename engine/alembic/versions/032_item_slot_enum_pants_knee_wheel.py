"""item_slot_enum — PANTS, KNEE, WHEEL 추가

신규 부위 3종(라이더 PANTS/KNEE, 바이크 WHEEL).
enum 값 추가는 별도 트랜잭션이어야 다음 시드(sre033)에서 사용 가능.

Revision ID: sre032
Revises: sre031
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre032"
down_revision: Union[str, None] = "sre031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for v in ["PANTS", "KNEE", "WHEEL"]:
        op.execute(sa.text(f"ALTER TYPE item_slot_enum ADD VALUE IF NOT EXISTS '{v}'"))


def downgrade() -> None:
    pass

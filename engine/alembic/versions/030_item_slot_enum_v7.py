"""item_slot_enum v7 — 신규 값 추가

HELMET, JACKET 신규. BODY, ENGINE, HANDLE, LIGHT, TAIL, NAME, RANK, START 추가
(구 값은 PG에서 제거 불가하므로 그대로 유지, 코드에서만 사용 중단).

Revision ID: sre030
Revises: sre029
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre030"
down_revision: Union[str, None] = "sre029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    new_vals = [
        "BODY", "ENGINE", "HANDLE", "LIGHT", "TAIL",
        "NAME", "RANK", "START", "HELMET", "JACKET",
    ]
    for v in new_vals:
        op.execute(sa.text(f"ALTER TYPE item_slot_enum ADD VALUE IF NOT EXISTS '{v}'"))


def downgrade() -> None:
    pass

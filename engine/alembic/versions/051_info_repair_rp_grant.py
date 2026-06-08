"""INFO_REPAIR_* base_xp→rp_grant 이전 — 정비 리뷰 보상을 RP(gc)로 전환

정비 리뷰/사진/가격 액션이 레거시 XP 원장(current_balance)에만 적립되고
사용자가 쓰는 RP(gc_balance)에는 안 들어가던 문제 교정. 화면 표기도 XP→RP.
base_xp는 0으로(XP 원장 적립 중단), rp_grant로 동일 수치(50/10/10) 이전.
RP 일일캡(60)은 credit_gc 에서 적용됨.

Revision ID: sre051
Revises: sre050
Create Date: 2026-06-08
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre051"
down_revision: Union[str, None] = "sre050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE action_definition SET base_xp = 0, rp_grant = 50 WHERE action_code = 'INFO_REPAIR_REVIEW'")
    op.execute("UPDATE action_definition SET base_xp = 0, rp_grant = 10 WHERE action_code = 'INFO_REPAIR_PHOTO'")
    op.execute("UPDATE action_definition SET base_xp = 0, rp_grant = 10 WHERE action_code = 'INFO_REPAIR_PRICE'")


def downgrade() -> None:
    op.execute("UPDATE action_definition SET base_xp = 50, rp_grant = 0 WHERE action_code = 'INFO_REPAIR_REVIEW'")
    op.execute("UPDATE action_definition SET base_xp = 10, rp_grant = 0 WHERE action_code = 'INFO_REPAIR_PHOTO'")
    op.execute("UPDATE action_definition SET base_xp = 10, rp_grant = 0 WHERE action_code = 'INFO_REPAIR_PRICE'")

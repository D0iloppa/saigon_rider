"""INFO_GAS_WAIT_REPORT base_xp→rp_grant 이전 — 주유 대기 제보 보상을 RP(gc)로 전환

정비 리뷰(sre051)와 동일 취지. 사용자 화면에 'XP' 개념을 노출하지 않고 RP로 통일.
base_xp 5 → 0, rp_grant 0 → 5. RP 일일캡(60)은 credit_gc 에서 적용됨.

Revision ID: sre052
Revises: sre051
Create Date: 2026-06-08
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre052"
down_revision: Union[str, None] = "sre051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE action_definition SET base_xp = 0, rp_grant = 5 WHERE action_code = 'INFO_GAS_WAIT_REPORT'")


def downgrade() -> None:
    op.execute("UPDATE action_definition SET base_xp = 5, rp_grant = 0 WHERE action_code = 'INFO_GAS_WAIT_REPORT'")

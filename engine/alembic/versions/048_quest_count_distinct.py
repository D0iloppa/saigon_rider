"""quest count_distinct — COUNT_DISTINCT 카드타입 추가

CountDistinctValidator(서로 다른 payload 키 개수 집계)를 위한 enum 확장.
progress JSONB 는 sre047 에서 이미 추가됨 — 추가 컬럼 불필요.

Revision ID: sre048
Revises: sre047
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre048"
down_revision: Union[str, None] = "sre047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE quest_card_type_enum ADD VALUE IF NOT EXISTS 'COUNT_DISTINCT'"))


def downgrade() -> None:
    # PG 는 enum 값 제거를 지원하지 않으므로 유지.
    pass

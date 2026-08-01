"""quest count_event — COUNT_EVENT 카드타입 + sre_quest_card.progress JSONB

agg='count_event' 검증기(CountEventValidator)를 위한 스키마 확장.
- quest_card_type_enum 에 'COUNT_EVENT' 추가 (기존 값 유지)
- sre_quest_card.progress JSONB 추가 (검증기 런타임 카운터 저장소)

Revision ID: sre047
Revises: sre046
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre047"
down_revision: Union[str, None] = "sre046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE quest_card_type_enum ADD VALUE IF NOT EXISTS 'COUNT_EVENT'"))
    op.execute(
        "ALTER TABLE sre_quest_card "
        "ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    # PG 는 enum 값 제거를 지원하지 않으므로 COUNT_EVENT 는 유지.
    op.execute("ALTER TABLE sre_quest_card DROP COLUMN IF EXISTS progress")

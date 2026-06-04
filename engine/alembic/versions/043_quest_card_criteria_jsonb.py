"""sre_quest_card — 목표 파라미터 criteria JSONB 전면 이관

타입별 컬럼(target_distance_m / target_lat / target_lng)과 chk_card_type CHECK
제약을 제거하고, 목표 파라미터를 criteria JSONB 단일 컬럼으로 통합한다.
신규 퀘스트 타입은 컬럼/제약 추가 없이 criteria 키만으로 확장한다.
(라이브 텔레메트리 컬럼 current_distance_m / distance_to_target_m / last_* 는 런타임 상태이므로 유지)

Revision ID: sre043
Revises: sre042
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre043"
down_revision: Union[str, None] = "sre042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE sre_quest_card ADD COLUMN criteria JSONB NOT NULL DEFAULT '{}'::jsonb")

    op.execute("""
        UPDATE sre_quest_card
        SET criteria = jsonb_build_object('target_distance_m', target_distance_m)
        WHERE card_type = 'DISTANCE' AND target_distance_m IS NOT NULL
    """)
    op.execute("""
        UPDATE sre_quest_card
        SET criteria = jsonb_build_object('target_lat', target_lat, 'target_lng', target_lng)
        WHERE card_type = 'CHECKPOINT' AND target_lat IS NOT NULL AND target_lng IS NOT NULL
    """)

    op.execute("ALTER TABLE sre_quest_card ALTER COLUMN criteria DROP DEFAULT")
    op.execute("ALTER TABLE sre_quest_card DROP CONSTRAINT IF EXISTS chk_card_type")
    op.execute("ALTER TABLE sre_quest_card DROP COLUMN target_distance_m")
    op.execute("ALTER TABLE sre_quest_card DROP COLUMN target_lat")
    op.execute("ALTER TABLE sre_quest_card DROP COLUMN target_lng")


def downgrade() -> None:
    op.execute("ALTER TABLE sre_quest_card ADD COLUMN target_distance_m INTEGER")
    op.execute("ALTER TABLE sre_quest_card ADD COLUMN target_lat NUMERIC(9,6)")
    op.execute("ALTER TABLE sre_quest_card ADD COLUMN target_lng NUMERIC(9,6)")

    op.execute("""
        UPDATE sre_quest_card
        SET target_distance_m = (criteria->>'target_distance_m')::int
        WHERE card_type = 'DISTANCE' AND criteria ? 'target_distance_m'
    """)
    op.execute("""
        UPDATE sre_quest_card
        SET target_lat = (criteria->>'target_lat')::numeric,
            target_lng = (criteria->>'target_lng')::numeric
        WHERE card_type = 'CHECKPOINT' AND criteria ? 'target_lat'
    """)

    op.execute("""
        ALTER TABLE sre_quest_card ADD CONSTRAINT chk_card_type CHECK (
            (card_type = 'DISTANCE' AND target_distance_m IS NOT NULL)
            OR
            (card_type = 'CHECKPOINT' AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
        )
    """)
    op.execute("ALTER TABLE sre_quest_card DROP COLUMN criteria")

"""sre_seed_config — 튜닝 가능 시드 파라미터 테이블

퀘스트 달성 체크 시스템의 정책 파라미터를 DB 기반으로 관리.

Revision ID: sre023
Revises: sre022
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre023"
down_revision: Union[str, None] = "sre022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE sre_seed_config (
            seed_code   VARCHAR(60) PRIMARY KEY,
            value_text  TEXT NOT NULL,
            description TEXT,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        INSERT INTO sre_seed_config (seed_code, value_text, description) VALUES
        ('DAILY_QUEST_BASE_SLOTS', '3', '일일 퀘스트 기본 슬롯 수'),
        ('CHECKPOINT_PROXIMITY_M', '100', '체크포인트 도달 인정 반경 (미터)'),
        ('MIN_MOVE_SPEED_KMH', '3', 'GPS 노이즈 필터 최소 속도 (km/h)'),
        ('DAILY_SLOT_LEVEL_BONUS', '{"type":"step","steps":[[5,1],[10,1],[20,1],[30,1]]}',
         '레벨별 일일 퀘스트 슬롯 보너스 (누적)')
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sre_seed_config")

"""sre_quest_card — GPS 기반 퀘스트 달성 카드

퀘스트 수락 시 생성, GPS 수신마다 달성 여부 체크.
DISTANCE(거리 누적) / CHECKPOINT(좌표 근접) 두 유형.

Revision ID: sre024
Revises: sre023
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre024"
down_revision: Union[str, None] = "sre023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE quest_card_type_enum AS ENUM ('DISTANCE', 'CHECKPOINT')")
    op.execute("CREATE TYPE quest_card_status_enum AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')")

    op.execute("""
        CREATE TABLE sre_quest_card (
            card_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id             BIGINT NOT NULL REFERENCES sre_user(user_id),
            external_quest_id   VARCHAR(64) NOT NULL,
            user_quest_id       VARCHAR(64) NOT NULL,
            card_type           quest_card_type_enum NOT NULL,

            target_distance_m   INTEGER,
            current_distance_m  INTEGER NOT NULL DEFAULT 0,

            target_lat          NUMERIC(9,6),
            target_lng          NUMERIC(9,6),

            status              quest_card_status_enum NOT NULL DEFAULT 'ACTIVE',
            accepted_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at        TIMESTAMPTZ,
            expires_at          TIMESTAMPTZ,

            CONSTRAINT chk_card_type CHECK (
                (card_type = 'DISTANCE' AND target_distance_m IS NOT NULL)
                OR
                (card_type = 'CHECKPOINT' AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
            )
        )
    """)

    op.execute("""
        CREATE INDEX idx_quest_card_user_active
            ON sre_quest_card (user_id, status)
            WHERE status = 'ACTIVE'
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sre_quest_card")
    op.execute("DROP TYPE IF EXISTS quest_card_status_enum")
    op.execute("DROP TYPE IF EXISTS quest_card_type_enum")

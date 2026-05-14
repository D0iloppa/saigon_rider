"""mission_definition, user_mission_progress, mission_recommendation 테이블

Revision ID: sre004
Revises: sre003
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre004"
down_revision: Union[str, None] = "sre003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE mission_definition (
          mission_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
          mission_code         VARCHAR(60)  NOT NULL,
          title                VARCHAR(120) NOT NULL,
          description          VARCHAR(500) NULL,
          category_code        VARCHAR(20)  NOT NULL,
          target_rule          JSONB        NOT NULL,
          reward_rp            INT          NOT NULL,
          duration_hours       INT          NULL,
          is_repeatable        BOOLEAN      NOT NULL DEFAULT FALSE,
          starts_at            TIMESTAMPTZ(3) NULL,
          ends_at              TIMESTAMPTZ(3) NULL,
          is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
          PRIMARY KEY (mission_id),
          CONSTRAINT uq_mission_code UNIQUE (mission_code)
        )
    """)
    op.execute("CREATE INDEX idx_mission_def_category ON mission_definition (category_code)")

    op.execute("""
        CREATE TABLE user_mission_progress (
          progress_id          BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          mission_id           BIGINT       NOT NULL,
          current_value        INT          NOT NULL DEFAULT 0,
          target_value         INT          NOT NULL,
          status               mission_status_enum NOT NULL DEFAULT 'ACTIVE',
          started_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at         TIMESTAMPTZ(3) NULL,
          expires_at           TIMESTAMPTZ(3) NULL,
          PRIMARY KEY (progress_id),
          CONSTRAINT fk_ump_user    FOREIGN KEY (user_id)    REFERENCES sre_user(user_id),
          CONSTRAINT fk_ump_mission FOREIGN KEY (mission_id) REFERENCES mission_definition(mission_id)
        )
    """)
    op.execute("CREATE INDEX idx_ump_user_status ON user_mission_progress (user_id, status)")
    op.execute("CREATE INDEX idx_ump_mission ON user_mission_progress (mission_id)")

    op.execute("""
        CREATE TABLE mission_recommendation (
          rec_id               BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          mission_id           BIGINT       NOT NULL,
          score                NUMERIC(6,3) NOT NULL,
          reason_code          VARCHAR(40)  NOT NULL,
          recommended_at       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          consumed_at          TIMESTAMPTZ(3) NULL,
          PRIMARY KEY (rec_id),
          CONSTRAINT fk_rec_user    FOREIGN KEY (user_id)    REFERENCES sre_user(user_id),
          CONSTRAINT fk_rec_mission FOREIGN KEY (mission_id) REFERENCES mission_definition(mission_id)
        )
    """)
    op.execute("CREATE INDEX idx_rec_user_recommended ON mission_recommendation (user_id, recommended_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mission_recommendation")
    op.execute("DROP TABLE IF EXISTS user_mission_progress")
    op.execute("DROP TABLE IF EXISTS mission_definition")

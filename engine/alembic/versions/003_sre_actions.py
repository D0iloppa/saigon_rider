"""action_definition, action_event 테이블

Revision ID: sre003
Revises: sre002
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre003"
down_revision: Union[str, None] = "sre002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE action_definition (
          action_code          VARCHAR(40)  NOT NULL,
          category_code        VARCHAR(20)  NOT NULL,
          display_name         VARCHAR(80)  NOT NULL,
          base_rp              INT          NOT NULL DEFAULT 0,
          daily_count_limit    INT          NULL,
          is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
          metadata_schema      JSONB        NULL,
          updated_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (action_code)
        )
    """)
    op.execute("CREATE INDEX idx_action_def_category ON action_definition (category_code)")
    op.execute("""
        CREATE TRIGGER trg_action_definition_updated_at
        BEFORE UPDATE ON action_definition
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    op.execute("""
        CREATE TABLE action_event (
          event_id             BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          action_code          VARCHAR(40)  NOT NULL,
          occurred_at          TIMESTAMPTZ(3) NOT NULL,
          payload              JSONB        NULL,
          idempotency_key      VARCHAR(80)  NOT NULL,
          calculated_rp        NUMERIC(12,2) NOT NULL DEFAULT 0,
          applied_multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1.00,
          process_status       event_status_enum NOT NULL DEFAULT 'PENDING',
          reject_reason_code   VARCHAR(40)  NULL,
          created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (event_id),
          CONSTRAINT uq_event_idem UNIQUE (idempotency_key),
          CONSTRAINT fk_event_user   FOREIGN KEY (user_id)     REFERENCES sre_user(user_id),
          CONSTRAINT fk_event_action FOREIGN KEY (action_code) REFERENCES action_definition(action_code)
        )
    """)
    op.execute("CREATE INDEX idx_event_user_occurred ON action_event (user_id, occurred_at)")
    op.execute("CREATE INDEX idx_event_action_occurred ON action_event (action_code, occurred_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS action_event")
    op.execute("DROP TRIGGER IF EXISTS trg_action_definition_updated_at ON action_definition")
    op.execute("DROP TABLE IF EXISTS action_definition")

"""abuse_rule, abuse_event, idempotency_key, audit_log 테이블

Revision ID: sre008
Revises: sre007
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre008"
down_revision: Union[str, None] = "sre007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE abuse_rule (
          rule_code            VARCHAR(40)  NOT NULL,
          rule_name            VARCHAR(120) NOT NULL,
          severity             abuse_severity_enum NOT NULL DEFAULT 'MEDIUM',
          condition_json       JSONB        NOT NULL,
          action               abuse_action_enum NOT NULL,
          is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
          PRIMARY KEY (rule_code)
        )
    """)

    op.execute("""
        CREATE TABLE abuse_event (
          abuse_event_id       BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          rule_code            VARCHAR(40)  NOT NULL,
          related_event_id     BIGINT       NULL,
          detail               JSONB        NULL,
          action_taken         abuse_action_enum NOT NULL,
          detected_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (abuse_event_id),
          CONSTRAINT fk_ae_user FOREIGN KEY (user_id)   REFERENCES sre_user(user_id),
          CONSTRAINT fk_ae_rule FOREIGN KEY (rule_code) REFERENCES abuse_rule(rule_code)
        )
    """)
    op.execute("CREATE INDEX idx_ae_user_detected ON abuse_event (user_id, detected_at)")

    op.execute("""
        CREATE TABLE idempotency_key (
          idempotency_key      VARCHAR(80)  NOT NULL,
          resource_type        VARCHAR(40)  NOT NULL,
          resource_id          BIGINT       NULL,
          created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at           TIMESTAMPTZ(3) NOT NULL,
          PRIMARY KEY (idempotency_key)
        )
    """)
    op.execute("CREATE INDEX idx_idem_expires ON idempotency_key (expires_at)")

    op.execute("""
        CREATE TABLE audit_log (
          audit_id             BIGINT       GENERATED ALWAYS AS IDENTITY,
          entity_type          VARCHAR(40)  NOT NULL,
          entity_id            BIGINT       NOT NULL,
          actor_user_id        BIGINT       NULL,
          action_code          VARCHAR(40)  NOT NULL,
          before_snapshot      JSONB        NULL,
          after_snapshot       JSONB        NULL,
          created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (audit_id)
        )
    """)
    op.execute("CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id)")
    op.execute("CREATE INDEX idx_audit_created ON audit_log (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS idempotency_key")
    op.execute("DROP TABLE IF EXISTS abuse_event")
    op.execute("DROP TABLE IF EXISTS abuse_rule")

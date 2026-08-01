"""rp_balance, rp_transaction, rp_expiration_schedule 테이블

Revision ID: sre005
Revises: sre004
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre005"
down_revision: Union[str, None] = "sre004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE rp_balance (
          user_id              BIGINT       NOT NULL,
          current_balance      BIGINT       NOT NULL DEFAULT 0,
          lifetime_earned      BIGINT       NOT NULL DEFAULT 0,
          lifetime_spent       BIGINT       NOT NULL DEFAULT 0,
          expiring_soon        BIGINT       NOT NULL DEFAULT 0,
          last_recalculated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id),
          CONSTRAINT fk_balance_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
        )
    """)

    op.execute("""
        CREATE TABLE rp_transaction (
          transaction_id       BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          tx_type              tx_type_enum NOT NULL,
          amount               BIGINT       NOT NULL,
          balance_after        BIGINT       NOT NULL,
          source_type          VARCHAR(40)  NOT NULL,
          source_id            BIGINT       NULL,
          related_event_id     BIGINT       NULL,
          occurred_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at           TIMESTAMPTZ(3) NULL,
          memo                 VARCHAR(200) NULL,
          PRIMARY KEY (transaction_id),
          CONSTRAINT fk_tx_user  FOREIGN KEY (user_id)          REFERENCES sre_user(user_id),
          CONSTRAINT fk_tx_event FOREIGN KEY (related_event_id) REFERENCES action_event(event_id)
        )
    """)
    op.execute("CREATE INDEX idx_tx_user_occurred ON rp_transaction (user_id, occurred_at)")
    op.execute("CREATE INDEX idx_tx_user_type ON rp_transaction (user_id, tx_type)")
    op.execute("CREATE INDEX idx_tx_expires ON rp_transaction (expires_at)")

    op.execute("""
        CREATE TABLE rp_expiration_schedule (
          expire_id            BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          source_transaction_id BIGINT      NOT NULL,
          remaining_amount     BIGINT       NOT NULL,
          expires_at           TIMESTAMPTZ(3) NOT NULL,
          status               expire_status_enum NOT NULL DEFAULT 'PENDING',
          PRIMARY KEY (expire_id),
          CONSTRAINT fk_exp_user FOREIGN KEY (user_id)               REFERENCES sre_user(user_id),
          CONSTRAINT fk_exp_tx   FOREIGN KEY (source_transaction_id) REFERENCES rp_transaction(transaction_id)
        )
    """)
    op.execute("CREATE INDEX idx_exp_user_expires ON rp_expiration_schedule (user_id, expires_at)")
    op.execute("CREATE INDEX idx_exp_status_expires ON rp_expiration_schedule (status, expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rp_expiration_schedule")
    op.execute("DROP TABLE IF EXISTS rp_transaction")
    op.execute("DROP TABLE IF EXISTS rp_balance")

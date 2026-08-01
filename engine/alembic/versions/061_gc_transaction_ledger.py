"""gc_transaction 원장 테이블 — RP(gc_balance) 적립/차감 감사용 (ENG-10)

gc_balance 는 그동안 잔액 컬럼만 변동하고 트랜잭션 원장이 없어 감사/검증이 불가능했다.
xp_transaction 을 미러한 gc_transaction 을 추가하고, xp_ledger.credit_gc 가 매 적립마다 1행 기록한다.
tx_type_enum(001)·sre_user·action_event 는 기존 스키마 재사용.

Revision ID: sre061
Revises: sre060
Create Date: 2026-07-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre061"
down_revision: Union[str, None] = "sre060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE gc_transaction (
          gc_transaction_id    BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          tx_type              tx_type_enum NOT NULL,
          amount               BIGINT       NOT NULL,
          balance_after        BIGINT       NOT NULL,
          source_type          VARCHAR(40)  NOT NULL,
          source_id            BIGINT       NULL,
          related_event_id     BIGINT       NULL,
          occurred_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          memo                 VARCHAR(200) NULL,
          PRIMARY KEY (gc_transaction_id),
          CONSTRAINT fk_gctx_user  FOREIGN KEY (user_id)          REFERENCES sre_user(user_id),
          CONSTRAINT fk_gctx_event FOREIGN KEY (related_event_id) REFERENCES action_event(event_id)
        )
    """)
    op.execute("CREATE INDEX idx_gctx_user_occurred ON gc_transaction (user_id, occurred_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS gc_transaction")

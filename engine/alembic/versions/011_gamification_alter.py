"""기존 SRE 테이블 ALTER — reward_bundle, currency, gc_balance, dispatch 컬럼

Revision ID: sre011
Revises: sre010
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre011"
down_revision: Union[str, None] = "sre010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1.1 mission_definition: reward_bundle JSONB 추가
    op.execute("""
        ALTER TABLE mission_definition
          ADD COLUMN IF NOT EXISTS reward_bundle JSONB
    """)
    op.execute("""
        UPDATE mission_definition
        SET reward_bundle = jsonb_build_object(
          'gp',    COALESCE(reward_rp, 0),
          'gc',    0,
          'sxp',   0,
          'items', '[]'::jsonb,
          'boxes', '[]'::jsonb
        )
        WHERE reward_bundle IS NULL
    """)
    op.execute("""
        ALTER TABLE mission_definition
          ALTER COLUMN reward_bundle SET NOT NULL
    """)
    op.execute("""
        COMMENT ON COLUMN mission_definition.reward_rp IS
          'DEPRECATED: use reward_bundle.gp instead. v2에서 제거 예정'
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_mission_def_reward_gp
          ON mission_definition (((reward_bundle->>'gp')::INT))
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_mission_def_has_items
          ON mission_definition USING gin ((reward_bundle->'items'))
    """)

    # 1.2 rp_transaction: currency 컬럼
    op.execute("""
        ALTER TABLE rp_transaction
          ADD COLUMN IF NOT EXISTS currency VARCHAR(4) NOT NULL DEFAULT 'GP'
    """)
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'rp_transaction_currency_check'
          ) THEN
            ALTER TABLE rp_transaction
              ADD CONSTRAINT rp_transaction_currency_check
              CHECK (currency IN ('GP', 'GC'));
          END IF;
        END $$
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rp_tx_user_currency
          ON rp_transaction(user_id, currency, occurred_at DESC)
    """)

    # 1.3 rp_balance: GC 잔액 컬럼 3개
    op.execute("""
        ALTER TABLE rp_balance
          ADD COLUMN IF NOT EXISTS gc_balance         BIGINT NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS lifetime_gc_earned BIGINT NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS lifetime_gc_spent  BIGINT NOT NULL DEFAULT 0
    """)
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rp_balance_gc_nonneg') THEN
            ALTER TABLE rp_balance
              ADD CONSTRAINT rp_balance_gc_nonneg CHECK (gc_balance >= 0);
          END IF;
        END $$
    """)

    # 1.4 user_mission_progress: 보상 디스패치 멱등성 컬럼
    op.execute("""
        ALTER TABLE user_mission_progress
          ADD COLUMN IF NOT EXISTS reward_dispatched_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS reward_dispatch_log  JSONB
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ump_status_dispatch
          ON user_mission_progress(status, reward_dispatched_at)
          WHERE status = 'COMPLETED' AND reward_dispatched_at IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ump_status_dispatch")
    op.execute("""
        ALTER TABLE user_mission_progress
          DROP COLUMN IF EXISTS reward_dispatch_log,
          DROP COLUMN IF EXISTS reward_dispatched_at
    """)
    op.execute("ALTER TABLE rp_balance DROP CONSTRAINT IF EXISTS rp_balance_gc_nonneg")
    op.execute("""
        ALTER TABLE rp_balance
          DROP COLUMN IF EXISTS lifetime_gc_spent,
          DROP COLUMN IF EXISTS lifetime_gc_earned,
          DROP COLUMN IF EXISTS gc_balance
    """)
    op.execute("DROP INDEX IF EXISTS idx_rp_tx_user_currency")
    op.execute("ALTER TABLE rp_transaction DROP CONSTRAINT IF EXISTS rp_transaction_currency_check")
    op.execute("ALTER TABLE rp_transaction DROP COLUMN IF EXISTS currency")
    op.execute("DROP INDEX IF EXISTS idx_mission_def_has_items")
    op.execute("DROP INDEX IF EXISTS idx_mission_def_reward_gp")
    op.execute("ALTER TABLE mission_definition DROP COLUMN IF EXISTS reward_bundle")

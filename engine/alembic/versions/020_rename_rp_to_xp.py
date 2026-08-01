"""RP(Reward Points) → XP 리네이밍

테이블, 컬럼, 제약조건, enum 값, 저장 함수 일괄 rename.

Revision ID: sre020
Revises: sre019
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre020"
down_revision: Union[str, None] = "sre019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Stored functions (xp_ references) ──────────────────────────────

_GRANT_CURRENCY_XP = """
CREATE OR REPLACE FUNCTION _grant_currency(
  p_user_id    BIGINT,
  p_currency   VARCHAR(4),
  p_amount     BIGINT,
  p_source_type VARCHAR,
  p_source_id  BIGINT,
  p_memo       VARCHAR DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance_after BIGINT;
  v_tx_id BIGINT;
BEGIN
  IF p_amount = 0 THEN RETURN NULL; END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION 'amount must be positive for EARN (got %)', p_amount; END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN RAISE EXCEPTION 'invalid currency: %', p_currency; END IF;

  IF p_currency = 'GP' THEN
    UPDATE xp_balance SET current_balance = current_balance + p_amount, lifetime_earned = lifetime_earned + p_amount
     WHERE user_id = p_user_id RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE xp_balance SET gc_balance = gc_balance + p_amount, lifetime_gc_earned = lifetime_gc_earned + p_amount
     WHERE user_id = p_user_id RETURNING gc_balance INTO v_balance_after;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO xp_balance (user_id, current_balance, lifetime_earned, gc_balance, lifetime_gc_earned)
    VALUES (p_user_id,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END)
    RETURNING CASE WHEN p_currency='GP' THEN current_balance ELSE gc_balance END INTO v_balance_after;
  END IF;

  INSERT INTO xp_transaction (user_id, tx_type, amount, balance_after, currency, source_type, source_id, occurred_at, memo)
  VALUES (p_user_id, 'EARN', p_amount, v_balance_after, p_currency, p_source_type, p_source_id, NOW(), p_memo)
  RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""

_SPEND_CURRENCY_XP = """
CREATE OR REPLACE FUNCTION _spend_currency(
  p_user_id     BIGINT,
  p_currency    VARCHAR(4),
  p_amount      BIGINT,
  p_source_type VARCHAR,
  p_source_id   BIGINT,
  p_memo        VARCHAR DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance_before BIGINT;
  v_balance_after  BIGINT;
  v_tx_id BIGINT;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'spend amount must be positive (got %)', p_amount; END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN RAISE EXCEPTION 'invalid currency: %', p_currency; END IF;

  IF p_currency = 'GP' THEN
    SELECT current_balance INTO v_balance_before FROM xp_balance WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT gc_balance INTO v_balance_before FROM xp_balance WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_balance_before IS NULL THEN RAISE EXCEPTION 'xp_balance row not found for user %', p_user_id; END IF;
  IF v_balance_before < p_amount THEN RAISE EXCEPTION 'insufficient % balance: have %, need %', p_currency, v_balance_before, p_amount; END IF;

  IF p_currency = 'GP' THEN
    UPDATE xp_balance SET current_balance = current_balance - p_amount, lifetime_spent = lifetime_spent + p_amount
     WHERE user_id = p_user_id RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE xp_balance SET gc_balance = gc_balance - p_amount, lifetime_gc_spent = lifetime_gc_spent + p_amount
     WHERE user_id = p_user_id RETURNING gc_balance INTO v_balance_after;
  END IF;

  INSERT INTO xp_transaction (user_id, tx_type, amount, balance_after, currency, source_type, source_id, occurred_at, memo)
  VALUES (p_user_id, 'SPEND', p_amount, v_balance_after, p_currency, p_source_type, p_source_id, NOW(), p_memo)
  RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""

# ── Stored functions (rp_ references, for downgrade) ───────────────

_GRANT_CURRENCY_RP = """
CREATE OR REPLACE FUNCTION _grant_currency(
  p_user_id    BIGINT,
  p_currency   VARCHAR(4),
  p_amount     BIGINT,
  p_source_type VARCHAR,
  p_source_id  BIGINT,
  p_memo       VARCHAR DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance_after BIGINT;
  v_tx_id BIGINT;
BEGIN
  IF p_amount = 0 THEN RETURN NULL; END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION 'amount must be positive for EARN (got %)', p_amount; END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN RAISE EXCEPTION 'invalid currency: %', p_currency; END IF;

  IF p_currency = 'GP' THEN
    UPDATE rp_balance SET current_balance = current_balance + p_amount, lifetime_earned = lifetime_earned + p_amount
     WHERE user_id = p_user_id RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE rp_balance SET gc_balance = gc_balance + p_amount, lifetime_gc_earned = lifetime_gc_earned + p_amount
     WHERE user_id = p_user_id RETURNING gc_balance INTO v_balance_after;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO rp_balance (user_id, current_balance, lifetime_earned, gc_balance, lifetime_gc_earned)
    VALUES (p_user_id,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END)
    RETURNING CASE WHEN p_currency='GP' THEN current_balance ELSE gc_balance END INTO v_balance_after;
  END IF;

  INSERT INTO rp_transaction (user_id, tx_type, amount, balance_after, currency, source_type, source_id, occurred_at, memo)
  VALUES (p_user_id, 'EARN', p_amount, v_balance_after, p_currency, p_source_type, p_source_id, NOW(), p_memo)
  RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""

_SPEND_CURRENCY_RP = """
CREATE OR REPLACE FUNCTION _spend_currency(
  p_user_id     BIGINT,
  p_currency    VARCHAR(4),
  p_amount      BIGINT,
  p_source_type VARCHAR,
  p_source_id   BIGINT,
  p_memo        VARCHAR DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance_before BIGINT;
  v_balance_after  BIGINT;
  v_tx_id BIGINT;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'spend amount must be positive (got %)', p_amount; END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN RAISE EXCEPTION 'invalid currency: %', p_currency; END IF;

  IF p_currency = 'GP' THEN
    SELECT current_balance INTO v_balance_before FROM rp_balance WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT gc_balance INTO v_balance_before FROM rp_balance WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_balance_before IS NULL THEN RAISE EXCEPTION 'rp_balance row not found for user %', p_user_id; END IF;
  IF v_balance_before < p_amount THEN RAISE EXCEPTION 'insufficient % balance: have %, need %', p_currency, v_balance_before, p_amount; END IF;

  IF p_currency = 'GP' THEN
    UPDATE rp_balance SET current_balance = current_balance - p_amount, lifetime_spent = lifetime_spent + p_amount
     WHERE user_id = p_user_id RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE rp_balance SET gc_balance = gc_balance - p_amount, lifetime_gc_spent = lifetime_gc_spent + p_amount
     WHERE user_id = p_user_id RETURNING gc_balance INTO v_balance_after;
  END IF;

  INSERT INTO rp_transaction (user_id, tx_type, amount, balance_after, currency, source_type, source_id, occurred_at, memo)
  VALUES (p_user_id, 'SPEND', p_amount, v_balance_after, p_currency, p_source_type, p_source_id, NOW(), p_memo)
  RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""


def upgrade() -> None:
    # ── 1. Rename tables ──
    op.execute("ALTER TABLE rp_balance RENAME TO xp_balance")
    op.execute("ALTER TABLE rp_transaction RENAME TO xp_transaction")
    op.execute("ALTER TABLE rp_expiration_schedule RENAME TO xp_expiration_schedule")

    # ── 2. Rename columns ──
    op.execute("ALTER TABLE action_definition RENAME COLUMN base_rp TO base_xp")
    op.execute("ALTER TABLE action_event RENAME COLUMN calculated_rp TO calculated_xp")
    op.execute("ALTER TABLE mission_definition RENAME COLUMN reward_rp TO reward_xp")
    op.execute("ALTER TABLE reward_catalog RENAME COLUMN required_rp TO required_xp")
    op.execute("ALTER TABLE reward_redemption RENAME COLUMN rp_transaction_id TO xp_transaction_id")

    # ── 3. Enum value: add GRANT_XP, migrate rows ──
    # New enum values require a committed transaction before use in DML.
    op.execute("COMMIT")
    op.execute("ALTER TYPE reward_action_type_enum ADD VALUE IF NOT EXISTS 'GRANT_XP'")
    op.execute("UPDATE reward_policy_action SET action_type = 'GRANT_XP' WHERE action_type = 'GRANT_RP'")

    # ── 4. Rename constraints ──
    op.execute("ALTER TABLE xp_transaction RENAME CONSTRAINT rp_transaction_currency_check TO xp_transaction_currency_check")
    op.execute("ALTER TABLE xp_balance RENAME CONSTRAINT rp_balance_gc_nonneg TO xp_balance_gc_nonneg")

    # ── 5. Column comment ──
    op.execute("COMMENT ON COLUMN mission_definition.reward_xp IS 'XP awarded on mission completion'")

    # ── 6. Recreate stored functions with xp_ table references ──
    # These functions contain :name patterns that SQLAlchemy misparses
    # as bind parameters; use exec_driver_sql to bypass this.
    bind = op.get_bind()
    bind.exec_driver_sql(_GRANT_CURRENCY_XP)
    bind.exec_driver_sql(_SPEND_CURRENCY_XP)


def downgrade() -> None:
    # ── 1. Rename tables back first (constraints/comments reference table names) ──
    op.execute("ALTER TABLE xp_balance RENAME TO rp_balance")
    op.execute("ALTER TABLE xp_transaction RENAME TO rp_transaction")
    op.execute("ALTER TABLE xp_expiration_schedule RENAME TO rp_expiration_schedule")

    # ── 2. Rename columns back ──
    op.execute("ALTER TABLE action_definition RENAME COLUMN base_xp TO base_rp")
    op.execute("ALTER TABLE action_event RENAME COLUMN calculated_xp TO calculated_rp")
    op.execute("ALTER TABLE mission_definition RENAME COLUMN reward_xp TO reward_rp")
    op.execute("ALTER TABLE reward_catalog RENAME COLUMN required_xp TO required_rp")
    op.execute("ALTER TABLE reward_redemption RENAME COLUMN xp_transaction_id TO rp_transaction_id")

    # ── 3. Enum value: revert rows to GRANT_RP ──
    # Note: PostgreSQL does not support removing enum values; GRANT_XP label remains but is unused.
    op.execute("UPDATE reward_policy_action SET action_type = 'GRANT_RP' WHERE action_type = 'GRANT_XP'")

    # ── 4. Rename constraints back (tables are now rp_*) ──
    op.execute("ALTER TABLE rp_transaction RENAME CONSTRAINT xp_transaction_currency_check TO rp_transaction_currency_check")
    op.execute("ALTER TABLE rp_balance RENAME CONSTRAINT xp_balance_gc_nonneg TO rp_balance_gc_nonneg")

    # ── 5. Column comment ──
    op.execute("COMMENT ON COLUMN mission_definition.reward_rp IS 'RP awarded on mission completion'")

    # ── 6. Restore stored functions with rp_ table references ──
    bind = op.get_bind()
    bind.exec_driver_sql(_GRANT_CURRENCY_RP)
    bind.exec_driver_sql(_SPEND_CURRENCY_RP)

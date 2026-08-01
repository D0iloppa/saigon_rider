"""상점/가챠 PL/pgSQL 함수 6개

Revision ID: sre016
Revises: sre015
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre016"
down_revision: Union[str, None] = "sre015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SPEND_CURRENCY = """
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
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'spend amount must be positive (got %)', p_amount;
  END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN
    RAISE EXCEPTION 'invalid currency: %', p_currency;
  END IF;

  IF p_currency = 'GP' THEN
    SELECT current_balance INTO v_balance_before
      FROM rp_balance WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT gc_balance INTO v_balance_before
      FROM rp_balance WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'rp_balance row not found for user %', p_user_id;
  END IF;
  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'insufficient % balance: have %, need %',
                    p_currency, v_balance_before, p_amount;
  END IF;

  IF p_currency = 'GP' THEN
    UPDATE rp_balance
       SET current_balance = current_balance - p_amount,
           lifetime_spent  = lifetime_spent + p_amount
     WHERE user_id = p_user_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE rp_balance
       SET gc_balance = gc_balance - p_amount,
           lifetime_gc_spent = lifetime_gc_spent + p_amount
     WHERE user_id = p_user_id
    RETURNING gc_balance INTO v_balance_after;
  END IF;

  INSERT INTO rp_transaction (
    user_id, tx_type, amount, balance_after, currency,
    source_type, source_id, occurred_at, memo
  ) VALUES (
    p_user_id, 'SPEND', p_amount, v_balance_after, p_currency,
    p_source_type, p_source_id, NOW(), p_memo
  ) RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""

_PICK_GACHA_ITEM = """
CREATE OR REPLACE FUNCTION _pick_gacha_item(
  p_gacha_code       VARCHAR,
  p_collection_filter VARCHAR,
  p_drop_table       JSONB,
  p_pity_threshold   INT,
  p_pity_rarity      item_rarity_enum,
  p_pity_count       INT,
  p_force_rarity     item_rarity_enum DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_picked_rarity item_rarity_enum;
  v_picked_item   VARCHAR;
  v_was_pity      BOOLEAN := FALSE;
  v_was_guar      BOOLEAN := FALSE;
  v_total_weight  INT := 0;
  v_random        INT;
  v_cumulative    INT := 0;
  v_entry         JSONB;
  v_seed          VARCHAR;
BEGIN
  v_seed := md5(p_gacha_code || NOW()::text || random()::text);

  IF p_force_rarity IS NOT NULL THEN
    v_picked_rarity := p_force_rarity;
    v_was_guar := TRUE;
  ELSIF p_pity_threshold IS NOT NULL AND p_pity_count + 1 >= p_pity_threshold THEN
    v_picked_rarity := p_pity_rarity;
    v_was_pity := TRUE;
  ELSE
    FOR v_entry IN SELECT jsonb_array_elements(p_drop_table->'weighted') LOOP
      v_total_weight := v_total_weight + (v_entry->>'weight')::INT;
    END LOOP;

    v_random := floor(random() * v_total_weight)::INT + 1;

    FOR v_entry IN SELECT jsonb_array_elements(p_drop_table->'weighted') LOOP
      v_cumulative := v_cumulative + (v_entry->>'weight')::INT;
      IF v_random <= v_cumulative THEN
        v_picked_rarity := (v_entry->>'rarity')::item_rarity_enum;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  SELECT item_code INTO v_picked_item
    FROM item_definition
   WHERE rarity = v_picked_rarity
     AND is_shop_visible = TRUE
     AND (p_collection_filter IS NULL OR collection_code = p_collection_filter)
   ORDER BY random()
   LIMIT 1;

  IF v_picked_item IS NULL THEN
    SELECT item_code INTO v_picked_item
      FROM item_definition
     WHERE rarity = v_picked_rarity
     ORDER BY random() LIMIT 1;
  END IF;

  IF v_picked_item IS NULL THEN
    RAISE EXCEPTION 'no item available for gacha % rarity %',
                    p_gacha_code, v_picked_rarity;
  END IF;

  RETURN jsonb_build_object(
    'rarity', v_picked_rarity,
    'item_code', v_picked_item,
    'was_pity_hit', v_was_pity,
    'was_guarantee', v_was_guar,
    'random_seed', v_seed
  );
END $$
"""

_PULL_GACHA = """
CREATE OR REPLACE FUNCTION pull_gacha(
  p_user_id      BIGINT,
  p_gacha_code   VARCHAR,
  p_do_10_pull   BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              gacha_status_enum;
  v_cost_currency       VARCHAR(4);
  v_cost_per_pull       INT;
  v_cost_per_10_pull    INT;
  v_collection_filter   VARCHAR;
  v_drop_table          JSONB;
  v_pity_threshold      INT;
  v_pity_rarity         item_rarity_enum;
  v_pity_resets_season  BOOLEAN;
  v_required_season     VARCHAR;
  v_starts_at           TIMESTAMPTZ;
  v_ends_at             TIMESTAMPTZ;

  v_active_season       VARCHAR;
  v_cost_total          INT;
  v_pulls_to_do         INT;
  v_guaranteed_rarity   item_rarity_enum;
  v_pity_count          INT;
  v_total_pulls         BIGINT;
  v_batch_id            BIGINT;
  v_spend_tx_id         BIGINT;
  v_force               item_rarity_enum;
  v_pick                JSONB;
  v_grant_result        JSONB;
  v_results             JSONB := '[]'::jsonb;
  v_one_result          JSONB;
  v_i                   INT;
  v_got_guaranteed      BOOLEAN := FALSE;
BEGIN
  SELECT status, cost_currency, cost_per_pull, cost_per_10_pull,
         collection_filter, drop_table,
         pity_threshold, pity_guarantee_rarity, pity_resets_with_season,
         required_season_code, starts_at, ends_at
    INTO v_status, v_cost_currency, v_cost_per_pull, v_cost_per_10_pull,
         v_collection_filter, v_drop_table,
         v_pity_threshold, v_pity_rarity, v_pity_resets_season,
         v_required_season, v_starts_at, v_ends_at
    FROM gacha_definition WHERE gacha_code = p_gacha_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gacha_code not found: %', p_gacha_code;
  END IF;
  IF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'gacha not active: % (status=%)', p_gacha_code, v_status;
  END IF;
  IF v_starts_at IS NOT NULL AND NOW() < v_starts_at THEN
    RAISE EXCEPTION 'gacha not yet started: %', p_gacha_code;
  END IF;
  IF v_ends_at IS NOT NULL AND NOW() > v_ends_at THEN
    RAISE EXCEPTION 'gacha period ended: %', p_gacha_code;
  END IF;

  IF v_required_season IS NOT NULL THEN
    v_active_season := _get_active_season();
    IF v_active_season IS NULL OR v_active_season <> v_required_season THEN
      RAISE EXCEPTION 'gacha requires active season %, got %',
                      v_required_season, COALESCE(v_active_season, 'NONE');
    END IF;
  END IF;

  v_pulls_to_do := CASE WHEN p_do_10_pull THEN 10 ELSE 1 END;
  v_cost_total := CASE WHEN p_do_10_pull
                       THEN v_cost_per_10_pull
                       ELSE v_cost_per_pull END;

  v_spend_tx_id := _spend_currency(
    p_user_id, v_cost_currency, v_cost_total,
    'GACHA_PULL', NULL,
    'gacha:' || p_gacha_code || CASE WHEN p_do_10_pull THEN ':10pull' ELSE '' END
  );

  v_batch_id := nextval('gacha_pull_log_pull_log_id_seq');

  INSERT INTO user_gacha_pity (user_id, gacha_code, pity_count, total_pulls)
  VALUES (p_user_id, p_gacha_code, 0, 0)
  ON CONFLICT (user_id, gacha_code) DO NOTHING;

  SELECT pity_count, total_pulls
    INTO v_pity_count, v_total_pulls
    FROM user_gacha_pity
   WHERE user_id = p_user_id AND gacha_code = p_gacha_code
   FOR UPDATE;

  v_guaranteed_rarity := (v_drop_table->>'guaranteed_at_10')::item_rarity_enum;

  FOR v_i IN 1..v_pulls_to_do LOOP
    v_force := NULL;
    IF p_do_10_pull AND v_i = 10 AND NOT v_got_guaranteed THEN
      v_force := v_guaranteed_rarity;
    END IF;

    v_pick := _pick_gacha_item(
      p_gacha_code, v_collection_filter, v_drop_table,
      v_pity_threshold, v_pity_rarity, v_pity_count, v_force
    );

    IF p_do_10_pull AND v_guaranteed_rarity IS NOT NULL THEN
      IF (v_pick->>'rarity')::item_rarity_enum >= v_guaranteed_rarity THEN
        v_got_guaranteed := TRUE;
      END IF;
    END IF;

    IF (v_pick->>'rarity')::item_rarity_enum >= v_pity_rarity THEN
      v_pity_count := 0;
    ELSE
      v_pity_count := v_pity_count + 1;
    END IF;

    v_grant_result := _grant_item(
      p_user_id,
      v_pick->>'item_code',
      COALESCE(v_drop_table->>'duplicate_policy', 'REFUND_GP'),
      'LOOTBOX'::acquisition_source_enum,
      v_batch_id
    );

    INSERT INTO gacha_pull_log (
      user_id, gacha_code, batch_id, is_10_pull, pull_index,
      cost_currency, cost_amount,
      picked_rarity, picked_item_code,
      was_duplicate, refund_currency, refund_amount,
      was_pity_hit, was_10pull_guarantee,
      pity_count_before, pity_count_after,
      random_seed
    ) VALUES (
      p_user_id, p_gacha_code, v_batch_id, p_do_10_pull, v_i,
      v_cost_currency, CASE WHEN v_i = 1 THEN v_cost_total ELSE 0 END,
      (v_pick->>'rarity')::item_rarity_enum,
      v_pick->>'item_code',
      (v_grant_result->>'status' LIKE 'REFUND_%'),
      v_grant_result->>'refund_currency',
      (v_grant_result->>'refund_amount')::INT,
      (v_pick->>'was_pity_hit')::BOOLEAN,
      (v_pick->>'was_guarantee')::BOOLEAN,
      CASE WHEN v_i = 1 THEN v_pity_count ELSE NULL END,
      v_pity_count,
      v_pick->>'random_seed'
    );

    v_one_result := jsonb_build_object(
      'pull_index', v_i,
      'rarity', v_pick->>'rarity',
      'item_code', v_pick->>'item_code',
      'was_pity_hit', v_pick->>'was_pity_hit',
      'was_guarantee', v_pick->>'was_guarantee',
      'grant_status', v_grant_result->>'status',
      'refund_currency', v_grant_result->>'refund_currency',
      'refund_amount', v_grant_result->>'refund_amount'
    );
    v_results := v_results || v_one_result;
  END LOOP;

  UPDATE user_gacha_pity
     SET pity_count   = v_pity_count,
         total_pulls  = v_total_pulls + v_pulls_to_do,
         last_pull_at = NOW(),
         season_scope = CASE WHEN v_pity_resets_season
                             THEN _get_active_season()
                             ELSE season_scope END
   WHERE user_id = p_user_id AND gacha_code = p_gacha_code;

  RETURN jsonb_build_object(
    'gacha_code',       p_gacha_code,
    'is_10_pull',       p_do_10_pull,
    'batch_id',         v_batch_id,
    'cost_currency',    v_cost_currency,
    'cost_amount',      v_cost_total,
    'spend_tx_id',      v_spend_tx_id,
    'results',          v_results,
    'pity_count_after', v_pity_count,
    'total_pulls_after', v_total_pulls + v_pulls_to_do
  );
END $$
"""

_PURCHASE_SHOP_ITEM = """
CREATE OR REPLACE FUNCTION purchase_shop_item(
  p_user_id   BIGINT,
  p_item_code VARCHAR,
  p_currency  VARCHAR(4)
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rarity        item_rarity_enum;
  v_season_lock   BOOLEAN;
  v_required_season VARCHAR;
  v_active_season VARCHAR;
  v_shop_visible  BOOLEAN;
  v_price_gp      INT;
  v_price_gc      INT;
  v_base_price    INT;
  v_discount_pct  INT := 0;
  v_was_featured  BOOLEAN := FALSE;
  v_cost_amount   INT;
  v_existing      INT;
  v_user_item_id  BIGINT;
  v_spend_tx_id   BIGINT;
  v_purchase_log_id BIGINT;
BEGIN
  SELECT rarity, season_lock, required_season_code, is_shop_visible,
         shop_price_gp, shop_price_gc
    INTO v_rarity, v_season_lock, v_required_season, v_shop_visible,
         v_price_gp, v_price_gc
    FROM item_definition WHERE item_code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_code not found: %', p_item_code;
  END IF;
  IF NOT v_shop_visible THEN
    RAISE EXCEPTION 'item not available in shop: % (가챠/시즌 한정)', p_item_code;
  END IF;

  IF v_season_lock THEN
    v_active_season := _get_active_season();
    IF v_active_season IS NULL OR v_active_season <> v_required_season THEN
      RAISE EXCEPTION 'item requires active season %, got %',
                      v_required_season, COALESCE(v_active_season, 'NONE');
    END IF;
  END IF;

  IF p_currency = 'GP' THEN
    IF v_price_gp IS NULL THEN
      RAISE EXCEPTION 'item % not purchasable in GP', p_item_code;
    END IF;
    v_base_price := v_price_gp;
  ELSIF p_currency = 'GC' THEN
    IF v_price_gc IS NULL THEN
      RAISE EXCEPTION 'item % not purchasable in GC', p_item_code;
    END IF;
    v_base_price := v_price_gc;
  ELSE
    RAISE EXCEPTION 'invalid currency: %', p_currency;
  END IF;

  SELECT discount_pct INTO v_discount_pct
    FROM daily_featured_item
   WHERE featured_date = CURRENT_DATE AND item_code = p_item_code;
  IF FOUND THEN
    v_was_featured := TRUE;
  ELSE
    v_discount_pct := 0;
  END IF;

  v_cost_amount := v_base_price - (v_base_price * v_discount_pct / 100);

  SELECT COUNT(*) INTO v_existing
    FROM user_item WHERE user_id = p_user_id AND item_code = p_item_code;
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'item already owned: % (Soul-bound, 재구매 불가)', p_item_code;
  END IF;

  v_spend_tx_id := _spend_currency(
    p_user_id, p_currency, v_cost_amount,
    'SHOP_PURCHASE', NULL,
    'shop:' || p_item_code || CASE WHEN v_was_featured
                                   THEN ':featured' ELSE '' END
  );

  INSERT INTO user_item (user_id, item_code, acquisition_source, source_ref_id)
  VALUES (p_user_id, p_item_code, 'SHOP', v_spend_tx_id)
  RETURNING user_item_id INTO v_user_item_id;

  INSERT INTO item_acquisition_log (
    user_id, item_code, acquisition_source, source_ref_id, granted_or_refunded
  ) VALUES (
    p_user_id, p_item_code, 'SHOP', v_spend_tx_id, 'GRANTED'
  );

  INSERT INTO shop_purchase_log (
    user_id, item_code, cost_currency, base_price, discount_pct,
    cost_amount, was_featured, user_item_id
  ) VALUES (
    p_user_id, p_item_code, p_currency, v_base_price, v_discount_pct,
    v_cost_amount, v_was_featured, v_user_item_id
  ) RETURNING purchase_log_id INTO v_purchase_log_id;

  RETURN jsonb_build_object(
    'item_code',      p_item_code,
    'cost_currency',  p_currency,
    'base_price',     v_base_price,
    'discount_pct',   v_discount_pct,
    'cost_amount',    v_cost_amount,
    'was_featured',   v_was_featured,
    'user_item_id',   v_user_item_id,
    'spend_tx_id',    v_spend_tx_id,
    'purchase_log_id', v_purchase_log_id
  );
END $$
"""

_REFRESH_DAILY_FEATURED = """
CREATE OR REPLACE FUNCTION refresh_daily_featured(
  p_featured_count INT DEFAULT 4
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_inserted INT := 0;
  v_picks RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM daily_featured_item WHERE featured_date = v_today) THEN
    RETURN jsonb_build_object(
      'date', v_today, 'inserted', 0, 'reason', 'ALREADY_REFRESHED'
    );
  END IF;

  FOR v_picks IN
    (SELECT item_code, 1 AS ord FROM item_definition
       WHERE rarity = 'C' AND is_shop_visible AND NOT season_lock
       ORDER BY random() LIMIT 1)
    UNION ALL
    (SELECT item_code, ord FROM (
       SELECT item_code, row_number() OVER (ORDER BY random()) + 1 AS ord
         FROM item_definition
        WHERE rarity = 'R' AND is_shop_visible AND NOT season_lock
        LIMIT 2
     ) AS r)
    UNION ALL
    (SELECT item_code, 4 AS ord FROM item_definition
       WHERE rarity = 'E' AND is_shop_visible AND NOT season_lock
       ORDER BY random() LIMIT 1)
  LOOP
    INSERT INTO daily_featured_item (featured_date, item_code, discount_pct, sort_order)
    VALUES (v_today, v_picks.item_code, 30, v_picks.ord)
    ON CONFLICT (featured_date, item_code) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'date', v_today, 'inserted', v_inserted, 'discount_pct', 30
  );
END $$
"""

_RESET_SEASON_GACHA_PITY = """
CREATE OR REPLACE FUNCTION reset_season_gacha_pity(
  p_season_code VARCHAR
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH updated AS (
    UPDATE user_gacha_pity
       SET pity_count = 0, season_scope = NULL
     WHERE gacha_code IN (
       SELECT gacha_code FROM gacha_definition
        WHERE pity_resets_with_season = TRUE
     )
     AND season_scope = p_season_code
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  INSERT INTO audit_log (entity_type, entity_id, action_code,
                          after_snapshot, created_at)
  VALUES ('GACHA', NULL, 'SEASON_PITY_RESET',
          jsonb_build_object('season_code', p_season_code, 'rows_reset', v_count),
          NOW());

  RETURN v_count;
END $$
"""


def upgrade() -> None:
    # PL/pgSQL function bodies contain ":name" patterns (e.g., ":10pull") that
    # SQLAlchemy misparses as bind parameters; use exec_driver_sql to bypass this.
    bind = op.get_bind()
    bind.exec_driver_sql(_SPEND_CURRENCY)
    bind.exec_driver_sql(_PICK_GACHA_ITEM)
    bind.exec_driver_sql(_PULL_GACHA)
    bind.exec_driver_sql(_PURCHASE_SHOP_ITEM)
    bind.exec_driver_sql(_REFRESH_DAILY_FEATURED)
    bind.exec_driver_sql(_RESET_SEASON_GACHA_PITY)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS reset_season_gacha_pity(VARCHAR)")
    op.execute("DROP FUNCTION IF EXISTS refresh_daily_featured(INT)")
    op.execute("DROP FUNCTION IF EXISTS purchase_shop_item(BIGINT, VARCHAR, VARCHAR)")
    op.execute("DROP FUNCTION IF EXISTS pull_gacha(BIGINT, VARCHAR, BOOLEAN)")
    op.execute("DROP FUNCTION IF EXISTS _pick_gacha_item(VARCHAR, VARCHAR, JSONB, INT, item_rarity_enum, INT, item_rarity_enum)")
    op.execute("DROP FUNCTION IF EXISTS _spend_currency(BIGINT, VARCHAR, BIGINT, VARCHAR, BIGINT, VARCHAR)")

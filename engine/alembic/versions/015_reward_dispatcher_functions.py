"""보상 디스패처 PL/pgSQL 함수 10개

Revision ID: sre015
Revises: sre014
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre015"
down_revision: Union[str, None] = "sre014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REFUND_AMOUNT_FOR = """
CREATE OR REPLACE FUNCTION _refund_amount_for(
  p_rarity   item_rarity_enum,
  p_currency VARCHAR(4)
) RETURNS INT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_currency = 'GP' THEN
    RETURN CASE p_rarity
      WHEN 'C' THEN 75
      WHEN 'R' THEN 375
      WHEN 'E' THEN 2000
      WHEN 'L' THEN 7500
      WHEN 'M' THEN 0
    END;
  ELSIF p_currency = 'GC' THEN
    RETURN CASE p_rarity
      WHEN 'C' THEN 0
      WHEN 'R' THEN 0
      WHEN 'E' THEN 0
      WHEN 'L' THEN 38
      WHEN 'M' THEN 75
    END;
  END IF;
  RETURN 0;
END $$
"""

_GET_ACTIVE_SEASON = """
CREATE OR REPLACE FUNCTION _get_active_season()
RETURNS VARCHAR
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_season_code VARCHAR;
BEGIN
  SELECT season_code INTO v_season_code
  FROM season
  WHERE status = 'ACTIVE'
    AND starts_at <= NOW()
    AND ends_at >= NOW()
  ORDER BY starts_at DESC
  LIMIT 1;
  RETURN v_season_code;
END $$
"""

_GRANT_CURRENCY = """
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
  IF p_amount = 0 THEN
    RETURN NULL;
  END IF;
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be positive for EARN (got %)', p_amount;
  END IF;
  IF p_currency NOT IN ('GP', 'GC') THEN
    RAISE EXCEPTION 'invalid currency: %', p_currency;
  END IF;

  IF p_currency = 'GP' THEN
    UPDATE rp_balance
       SET current_balance = current_balance + p_amount,
           lifetime_earned = lifetime_earned + p_amount
     WHERE user_id = p_user_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    UPDATE rp_balance
       SET gc_balance = gc_balance + p_amount,
           lifetime_gc_earned = lifetime_gc_earned + p_amount
     WHERE user_id = p_user_id
    RETURNING gc_balance INTO v_balance_after;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO rp_balance (user_id, current_balance, lifetime_earned,
                            gc_balance, lifetime_gc_earned)
    VALUES (p_user_id,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GP' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END,
            CASE WHEN p_currency='GC' THEN p_amount ELSE 0 END)
    RETURNING CASE WHEN p_currency='GP' THEN current_balance ELSE gc_balance END
        INTO v_balance_after;
  END IF;

  INSERT INTO rp_transaction (
    user_id, tx_type, amount, balance_after, currency,
    source_type, source_id, occurred_at, memo
  ) VALUES (
    p_user_id, 'EARN', p_amount, v_balance_after, p_currency,
    p_source_type, p_source_id, NOW(), p_memo
  ) RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$
"""

_GRANT_SXP = """
CREATE OR REPLACE FUNCTION _grant_sxp(
  p_user_id BIGINT,
  p_sxp_amount INT,
  p_source_progress_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_code VARCHAR;
  v_daily_cap INT;
  v_sxp_per_level INT;
  v_max_level INT;
  v_today DATE := CURRENT_DATE;
  v_actual_sxp INT;
  v_balance_before INT;
  v_balance_after INT;
  v_level_before INT;
  v_level_after INT;
  v_daily_today INT;
  v_daily_remain INT;
BEGIN
  IF p_sxp_amount <= 0 THEN
    RETURN jsonb_build_object('granted_sxp', 0, 'season_code', NULL);
  END IF;

  v_season_code := _get_active_season();
  IF v_season_code IS NULL THEN
    INSERT INTO audit_log (entity_type, entity_id, action_code, after_snapshot, created_at)
    VALUES ('USER_MISSION_PROGRESS', p_source_progress_id, 'SXP_DROPPED_NO_SEASON',
            jsonb_build_object('attempted_sxp', p_sxp_amount), NOW());
    RETURN jsonb_build_object('granted_sxp', 0, 'season_code', NULL);
  END IF;

  SELECT daily_sxp_cap, sxp_per_level, max_level
    INTO v_daily_cap, v_sxp_per_level, v_max_level
    FROM season WHERE season_code = v_season_code;

  INSERT INTO user_season_pass (user_id, season_code, sxp_balance, current_level,
                                 daily_sxp_today, daily_sxp_date)
  VALUES (p_user_id, v_season_code, 0, 0, 0, v_today)
  ON CONFLICT (user_id, season_code) DO NOTHING;

  SELECT sxp_balance, current_level,
         CASE WHEN daily_sxp_date = v_today THEN daily_sxp_today ELSE 0 END
    INTO v_balance_before, v_level_before, v_daily_today
    FROM user_season_pass
   WHERE user_id = p_user_id AND season_code = v_season_code
   FOR UPDATE;

  v_daily_remain := GREATEST(0, v_daily_cap - v_daily_today);
  v_actual_sxp := LEAST(p_sxp_amount, v_daily_remain);

  IF v_actual_sxp = 0 THEN
    INSERT INTO audit_log (entity_type, entity_id, action_code, after_snapshot, created_at)
    VALUES ('USER_SEASON_PASS', p_user_id, 'SXP_DAILY_CAP_HIT',
            jsonb_build_object('attempted', p_sxp_amount, 'cap', v_daily_cap), NOW());
    RETURN jsonb_build_object('granted_sxp', 0, 'season_code', v_season_code,
                              'reason', 'DAILY_CAP_HIT');
  END IF;

  v_balance_after := v_balance_before + v_actual_sxp;
  v_level_after := LEAST(v_max_level, v_balance_after / v_sxp_per_level);

  UPDATE user_season_pass
     SET sxp_balance = v_balance_after,
         current_level = v_level_after,
         daily_sxp_today = v_daily_today + v_actual_sxp,
         daily_sxp_date = v_today
   WHERE user_id = p_user_id AND season_code = v_season_code;

  IF v_level_after > v_level_before THEN
    INSERT INTO audit_log (entity_type, entity_id, action_code, before_snapshot, after_snapshot, created_at)
    VALUES ('USER_SEASON_PASS', p_user_id, 'LEVEL_UP',
            jsonb_build_object('level', v_level_before),
            jsonb_build_object('level', v_level_after, 'season_code', v_season_code),
            NOW());
  END IF;

  RETURN jsonb_build_object(
    'granted_sxp', v_actual_sxp,
    'season_code', v_season_code,
    'level_before', v_level_before,
    'level_after', v_level_after,
    'level_up', v_level_after > v_level_before
  );
END $$
"""

_GRANT_ITEM = """
CREATE OR REPLACE FUNCTION _grant_item(
  p_user_id BIGINT,
  p_item_code VARCHAR,
  p_on_duplicate VARCHAR,
  p_source acquisition_source_enum,
  p_source_ref_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rarity item_rarity_enum;
  v_season_lock BOOLEAN;
  v_required_season VARCHAR;
  v_active_season VARCHAR;
  v_existing_count INT;
  v_user_item_id BIGINT;
  v_refund_amount INT;
  v_refund_currency VARCHAR(4);
  v_tx_id BIGINT;
BEGIN
  SELECT rarity, season_lock, required_season_code
    INTO v_rarity, v_season_lock, v_required_season
    FROM item_definition WHERE item_code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_code not found: %', p_item_code;
  END IF;

  IF v_season_lock THEN
    v_active_season := _get_active_season();
    IF v_active_season IS NULL OR v_active_season IS DISTINCT FROM v_required_season THEN
      v_refund_currency := 'GP';
      v_refund_amount := _refund_amount_for(v_rarity, 'GP');
      IF v_refund_amount > 0 THEN
        v_tx_id := _grant_currency(p_user_id, v_refund_currency, v_refund_amount,
                                    'ITEM_SEASON_LOCK_FALLBACK', p_source_ref_id,
                                    'season_lock_fallback:' || p_item_code);
      END IF;
      INSERT INTO item_acquisition_log (user_id, item_code, acquisition_source,
                                         source_ref_id, granted_or_refunded,
                                         refund_currency, refund_amount)
      VALUES (p_user_id, p_item_code, p_source, p_source_ref_id, 'REFUNDED',
              v_refund_currency, v_refund_amount);
      RETURN jsonb_build_object(
        'status', 'SEASON_LOCKED',
        'item_code', p_item_code,
        'refund_currency', v_refund_currency,
        'refund_amount', v_refund_amount,
        'tx_id', v_tx_id
      );
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
    FROM user_item WHERE user_id = p_user_id AND item_code = p_item_code;

  IF v_existing_count > 0 THEN
    IF p_on_duplicate = 'SKIP' THEN
      INSERT INTO item_acquisition_log (user_id, item_code, acquisition_source,
                                         source_ref_id, granted_or_refunded)
      VALUES (p_user_id, p_item_code, p_source, p_source_ref_id, 'REFUNDED');
      RETURN jsonb_build_object('status', 'SKIPPED', 'item_code', p_item_code);
    ELSIF p_on_duplicate = 'REFUND_GP' THEN
      v_refund_currency := 'GP';
    ELSIF p_on_duplicate = 'REFUND_GC' THEN
      v_refund_currency := 'GC';
    ELSE
      RAISE EXCEPTION 'invalid on_duplicate value: %', p_on_duplicate;
    END IF;

    v_refund_amount := _refund_amount_for(v_rarity, v_refund_currency);
    IF v_refund_amount > 0 THEN
      v_tx_id := _grant_currency(p_user_id, v_refund_currency, v_refund_amount,
                                  'ITEM_DUPLICATE_REFUND', p_source_ref_id,
                                  'dup_refund:' || p_item_code);
    END IF;
    INSERT INTO item_acquisition_log (user_id, item_code, acquisition_source,
                                       source_ref_id, granted_or_refunded,
                                       refund_currency, refund_amount)
    VALUES (p_user_id, p_item_code, p_source, p_source_ref_id, 'REFUNDED',
            v_refund_currency, v_refund_amount);
    RETURN jsonb_build_object(
      'status', 'REFUND_' || v_refund_currency,
      'item_code', p_item_code,
      'refund_currency', v_refund_currency,
      'refund_amount', v_refund_amount,
      'tx_id', v_tx_id
    );
  END IF;

  INSERT INTO user_item (user_id, item_code, acquisition_source, source_ref_id)
  VALUES (p_user_id, p_item_code, p_source, p_source_ref_id)
  RETURNING user_item_id INTO v_user_item_id;

  INSERT INTO item_acquisition_log (user_id, item_code, acquisition_source,
                                     source_ref_id, granted_or_refunded)
  VALUES (p_user_id, p_item_code, p_source, p_source_ref_id, 'GRANTED');

  RETURN jsonb_build_object(
    'status', 'GRANTED',
    'item_code', p_item_code,
    'user_item_id', v_user_item_id
  );
END $$
"""

_GRANT_BOX = """
CREATE OR REPLACE FUNCTION _grant_box(
  p_user_id BIGINT,
  p_box_code VARCHAR,
  p_count INT,
  p_source acquisition_source_enum,
  p_source_ref_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_auto_open BOOLEAN;
  v_inventory_box_ids BIGINT[];
  v_box_id BIGINT;
  v_i INT;
BEGIN
  IF p_count <= 0 THEN
    RETURN jsonb_build_object('granted_count', 0);
  END IF;

  SELECT auto_open_on_grant INTO v_auto_open
    FROM lootbox_definition WHERE box_code = p_box_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'box_code not found: %', p_box_code;
  END IF;

  v_inventory_box_ids := ARRAY[]::BIGINT[];
  FOR v_i IN 1..p_count LOOP
    INSERT INTO user_inventory_box (user_id, box_code, granted_source, granted_source_ref)
    VALUES (p_user_id, p_box_code, p_source, p_source_ref_id)
    RETURNING inventory_box_id INTO v_box_id;
    v_inventory_box_ids := array_append(v_inventory_box_ids, v_box_id);

    IF v_auto_open THEN
      PERFORM open_lootbox(v_box_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'granted_count', p_count,
    'box_code', p_box_code,
    'inventory_box_ids', v_inventory_box_ids,
    'auto_opened', v_auto_open
  );
END $$
"""

_DISPATCH_MISSION_REWARD = """
CREATE OR REPLACE FUNCTION dispatch_mission_reward(
  p_progress_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id BIGINT;
  v_mission_id BIGINT;
  v_mission_code VARCHAR;
  v_status mission_status_enum;
  v_dispatched_at TIMESTAMPTZ;
  v_cached_log JSONB;
  v_bundle JSONB;

  v_gp_tx BIGINT;
  v_gc_tx BIGINT;
  v_sxp_result JSONB;
  v_items_result JSONB := '[]'::jsonb;
  v_boxes_result JSONB := '[]'::jsonb;

  v_item_obj JSONB;
  v_box_obj JSONB;
  v_one_result JSONB;
  v_final_log JSONB;
BEGIN
  SELECT ump.user_id, ump.mission_id, md.mission_code, ump.status,
         ump.reward_dispatched_at, ump.reward_dispatch_log, md.reward_bundle
    INTO v_user_id, v_mission_id, v_mission_code, v_status,
         v_dispatched_at, v_cached_log, v_bundle
    FROM user_mission_progress ump
    JOIN mission_definition md ON md.mission_id = ump.mission_id
   WHERE ump.progress_id = p_progress_id
   FOR UPDATE OF ump;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'progress not found: %', p_progress_id;
  END IF;

  IF v_dispatched_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'idempotent_hit', true,
      'dispatched_at', v_dispatched_at,
      'log', v_cached_log
    );
  END IF;

  IF v_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'progress not in COMPLETED state: % (got %)',
                    p_progress_id, v_status;
  END IF;

  IF v_bundle IS NULL THEN
    RAISE EXCEPTION 'mission has no reward_bundle: %', v_mission_code;
  END IF;

  IF (v_bundle->>'gp')::BIGINT > 0 THEN
    v_gp_tx := _grant_currency(
      v_user_id, 'GP', (v_bundle->>'gp')::BIGINT,
      'MISSION_REWARD', p_progress_id,
      'mission:' || v_mission_code
    );
  END IF;

  IF (v_bundle->>'gc')::BIGINT > 0 THEN
    v_gc_tx := _grant_currency(
      v_user_id, 'GC', (v_bundle->>'gc')::BIGINT,
      'MISSION_REWARD', p_progress_id,
      'mission:' || v_mission_code
    );
  END IF;

  v_sxp_result := _grant_sxp(
    v_user_id, COALESCE((v_bundle->>'sxp')::INT, 0), p_progress_id
  );

  IF jsonb_typeof(v_bundle->'items') = 'array' THEN
    FOR v_item_obj IN SELECT jsonb_array_elements(v_bundle->'items') LOOP
      v_one_result := _grant_item(
        v_user_id,
        v_item_obj->>'item_code',
        COALESCE(v_item_obj->>'on_duplicate', 'REFUND_GP'),
        'MISSION'::acquisition_source_enum,
        p_progress_id
      );
      v_items_result := v_items_result || v_one_result;
    END LOOP;
  END IF;

  IF jsonb_typeof(v_bundle->'boxes') = 'array' THEN
    FOR v_box_obj IN SELECT jsonb_array_elements(v_bundle->'boxes') LOOP
      v_one_result := _grant_box(
        v_user_id,
        v_box_obj->>'box_code',
        COALESCE((v_box_obj->>'count')::INT, 1),
        'MISSION'::acquisition_source_enum,
        p_progress_id
      );
      v_boxes_result := v_boxes_result || v_one_result;
    END LOOP;
  END IF;

  v_final_log := jsonb_build_object(
    'mission_code', v_mission_code,
    'gp_tx_id', v_gp_tx,
    'gc_tx_id', v_gc_tx,
    'sxp_result', v_sxp_result,
    'items', v_items_result,
    'boxes', v_boxes_result,
    'dispatched_at', NOW()
  );

  UPDATE user_mission_progress
     SET reward_dispatched_at = NOW(),
         reward_dispatch_log = v_final_log
   WHERE progress_id = p_progress_id;

  INSERT INTO audit_log (entity_type, entity_id, actor_user_id,
                          action_code, after_snapshot, created_at)
  VALUES ('USER_MISSION_PROGRESS', p_progress_id, v_user_id,
          'REWARD_DISPATCHED', v_final_log, NOW());

  RETURN v_final_log;

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO audit_log (entity_type, entity_id, action_code,
                            after_snapshot, created_at)
    VALUES ('USER_MISSION_PROGRESS', p_progress_id, 'REWARD_DISPATCH_ERROR',
            jsonb_build_object('error', SQLERRM, 'state', SQLSTATE), NOW());
    RAISE;
END $$
"""

_OPEN_LOOTBOX = """
CREATE OR REPLACE FUNCTION open_lootbox(
  p_inventory_box_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id BIGINT;
  v_box_code VARCHAR;
  v_box_status box_status_enum;
  v_opened_at TIMESTAMPTZ;
  v_drop_table JSONB;
  v_collection_filter VARCHAR;
  v_granted_source acquisition_source_enum;
  v_granted_source_ref BIGINT;

  v_total_weight INT;
  v_random INT;
  v_cumulative INT;
  v_picked_rarity item_rarity_enum;
  v_picked_item VARCHAR;
  v_weight_entry JSONB;
  v_dup_policy VARCHAR;
  v_grant_result JSONB;
  v_random_seed VARCHAR;
BEGIN
  SELECT user_id, box_code, status, opened_at, granted_source, granted_source_ref
    INTO v_user_id, v_box_code, v_box_status, v_opened_at,
         v_granted_source, v_granted_source_ref
    FROM user_inventory_box
   WHERE inventory_box_id = p_inventory_box_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'box not found: %', p_inventory_box_id;
  END IF;

  IF v_box_status = 'OPENED' THEN
    SELECT jsonb_build_object(
      'idempotent_hit', true,
      'dropped_item', dropped_item_code,
      'was_duplicate', was_duplicate,
      'refund_currency', refund_currency,
      'refund_amount', refund_amount,
      'opened_at', opened_at
    ) INTO v_grant_result
    FROM lootbox_drop_log
    WHERE inventory_box_id = p_inventory_box_id
    ORDER BY drop_log_id DESC LIMIT 1;
    RETURN COALESCE(v_grant_result, jsonb_build_object('idempotent_hit', true));
  END IF;

  IF v_box_status = 'EXPIRED' THEN
    RAISE EXCEPTION 'box expired: %', p_inventory_box_id;
  END IF;

  SELECT drop_table, collection_filter
    INTO v_drop_table, v_collection_filter
    FROM lootbox_definition WHERE box_code = v_box_code;

  v_dup_policy := COALESCE(v_drop_table->>'duplicate_policy', 'REFUND_GP');

  IF jsonb_array_length(COALESCE(v_drop_table->'guaranteed', '[]'::jsonb)) > 0 THEN
    v_picked_item := (v_drop_table->'guaranteed'->0->>'item_code');
  ELSE
    v_total_weight := 0;
    FOR v_weight_entry IN SELECT jsonb_array_elements(v_drop_table->'weighted') LOOP
      v_total_weight := v_total_weight + (v_weight_entry->>'weight')::INT;
    END LOOP;

    v_random := floor(random() * v_total_weight)::INT + 1;
    v_random_seed := md5(p_inventory_box_id::text || NOW()::text || v_random::text);

    v_cumulative := 0;
    FOR v_weight_entry IN SELECT jsonb_array_elements(v_drop_table->'weighted') LOOP
      v_cumulative := v_cumulative + (v_weight_entry->>'weight')::INT;
      IF v_random <= v_cumulative THEN
        v_picked_rarity := (v_weight_entry->>'rarity')::item_rarity_enum;
        EXIT;
      END IF;
    END LOOP;

    SELECT item_code INTO v_picked_item
      FROM item_definition
     WHERE rarity = v_picked_rarity
       AND (v_collection_filter IS NULL OR collection_code = v_collection_filter)
     ORDER BY random()
     LIMIT 1;

    IF v_picked_item IS NULL THEN
      SELECT item_code INTO v_picked_item
        FROM item_definition
       WHERE (v_collection_filter IS NULL OR collection_code = v_collection_filter)
       ORDER BY random()
       LIMIT 1;
    END IF;

    IF v_picked_item IS NULL THEN
      RAISE EXCEPTION 'no item available for box: %', v_box_code;
    END IF;
  END IF;

  v_grant_result := _grant_item(
    v_user_id, v_picked_item, v_dup_policy,
    'LOOTBOX'::acquisition_source_enum,
    p_inventory_box_id
  );

  UPDATE user_inventory_box
     SET opened_at = NOW(), status = 'OPENED'
   WHERE inventory_box_id = p_inventory_box_id;

  INSERT INTO lootbox_drop_log (
    inventory_box_id, user_id, box_code, dropped_item_code,
    was_duplicate, refund_currency, refund_amount, random_seed
  ) VALUES (
    p_inventory_box_id, v_user_id, v_box_code, v_picked_item,
    (v_grant_result->>'status' LIKE 'REFUND_%'),
    v_grant_result->>'refund_currency',
    (v_grant_result->>'refund_amount')::INT,
    v_random_seed
  );

  RETURN jsonb_build_object(
    'inventory_box_id', p_inventory_box_id,
    'box_code', v_box_code,
    'dropped_item', v_picked_item,
    'rarity', v_picked_rarity,
    'grant_result', v_grant_result,
    'opened_at', NOW()
  );
END $$
"""

_EXPIRE_SEASON_BOXES = """
CREATE OR REPLACE FUNCTION expire_season_boxes(
  p_season_code VARCHAR
) RETURNS TABLE(opened_count BIGINT, expired_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_box RECORD;
  v_opened BIGINT := 0;
  v_expired BIGINT := 0;
BEGIN
  UPDATE season SET status = 'ENDED' WHERE season_code = p_season_code;

  FOR v_box IN
    SELECT uib.inventory_box_id, ld.auto_open_on_grant
      FROM user_inventory_box uib
      JOIN lootbox_definition ld ON ld.box_code = uib.box_code
     WHERE uib.status = 'UNOPENED'
       AND ld.expires_with_season = TRUE
       AND ld.required_season_code = p_season_code
     ORDER BY uib.inventory_box_id
  LOOP
    BEGIN
      PERFORM open_lootbox(v_box.inventory_box_id);
      v_opened := v_opened + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE user_inventory_box
         SET status = 'EXPIRED'
       WHERE inventory_box_id = v_box.inventory_box_id;
      v_expired := v_expired + 1;
      INSERT INTO audit_log (entity_type, entity_id, action_code,
                              after_snapshot, created_at)
      VALUES ('USER_INVENTORY_BOX', v_box.inventory_box_id, 'FORCE_EXPIRE_ERROR',
              jsonb_build_object('error', SQLERRM), NOW());
    END;
  END LOOP;

  RETURN QUERY SELECT v_opened, v_expired;
END $$
"""

_DISPATCH_MISSION_REWARD_SAFE = """
CREATE OR REPLACE FUNCTION dispatch_mission_reward_safe(
  p_progress_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  BEGIN
    v_result := dispatch_mission_reward(p_progress_id);
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'progress_id', p_progress_id,
      'retry_recommended', true
    );
  END;
END $$
"""

_EXTRA_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_ump_status_dispatch
  ON user_mission_progress(status, reward_dispatched_at)
  WHERE status = 'COMPLETED' AND reward_dispatched_at IS NULL
"""

_EXTRA_INDEX_2 = """
CREATE INDEX IF NOT EXISTS idx_user_inv_box_status_season
  ON user_inventory_box(status)
  WHERE status = 'UNOPENED'
"""


def upgrade() -> None:
    op.execute(_REFUND_AMOUNT_FOR)
    op.execute(_GET_ACTIVE_SEASON)
    op.execute(_GRANT_CURRENCY)
    op.execute(_GRANT_SXP)
    op.execute(_GRANT_ITEM)
    op.execute(_GRANT_BOX)
    op.execute(_OPEN_LOOTBOX)
    op.execute(_DISPATCH_MISSION_REWARD)
    op.execute(_EXPIRE_SEASON_BOXES)
    op.execute(_DISPATCH_MISSION_REWARD_SAFE)
    op.execute(_EXTRA_INDEXES)
    op.execute(_EXTRA_INDEX_2)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_user_inv_box_status_season")
    op.execute("DROP INDEX IF EXISTS idx_ump_status_dispatch")
    op.execute("DROP FUNCTION IF EXISTS dispatch_mission_reward_safe(BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS expire_season_boxes(VARCHAR)")
    op.execute("DROP FUNCTION IF EXISTS dispatch_mission_reward(BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS open_lootbox(BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS _grant_box(BIGINT, VARCHAR, INT, acquisition_source_enum, BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS _grant_item(BIGINT, VARCHAR, VARCHAR, acquisition_source_enum, BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS _grant_sxp(BIGINT, INT, BIGINT)")
    op.execute("DROP FUNCTION IF EXISTS _grant_currency(BIGINT, VARCHAR, BIGINT, VARCHAR, BIGINT, VARCHAR)")
    op.execute("DROP FUNCTION IF EXISTS _get_active_season()")
    op.execute("DROP FUNCTION IF EXISTS _refund_amount_for(item_rarity_enum, VARCHAR)")

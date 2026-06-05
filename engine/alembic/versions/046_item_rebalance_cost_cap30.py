"""아이템 효과 시드 리밸런싱(cap 기준 역산) + 비용할인 cap 50→030

SGR-245. 풀장비+스킬만렉이 각 축 cap에 닿도록 시드 재조정:
- RP_MULT/GOLD_MULT: 1/2/4/6/7 (5슬롯 M합 35 + 스킬 15 = +50%)
- COST_DISCOUNT: 1/2/3/4/5 (5슬롯 M합 25 + 스킬 6 = -31% → cap -30)
- QUEST_SLOT: 0/0/0/1/1 (L/M만 +1, BFF가 아이템분 ≤1 클램프; 스킬 +1 = cap +2)
가차/상점 비용할인 상한 50→030 (시그 045에서 시그니처 동일, LEAST 상한만 변경).

Revision ID: sre046
Revises: sre045
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre046"
down_revision: Union[str, None] = "sre045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REBALANCE = """
UPDATE item_effect_value SET stat_value = CASE rarity
  WHEN 'C' THEN 1 WHEN 'R' THEN 2 WHEN 'E' THEN 4 WHEN 'L' THEN 6 WHEN 'M' THEN 7 END
 WHERE effect_type IN ('RP_MULT', 'GOLD_MULT');
UPDATE item_effect_value SET stat_value = CASE rarity
  WHEN 'C' THEN 1 WHEN 'R' THEN 2 WHEN 'E' THEN 3 WHEN 'L' THEN 4 WHEN 'M' THEN 5 END
 WHERE effect_type = 'COST_DISCOUNT';
UPDATE item_effect_value SET stat_value = CASE rarity
  WHEN 'L' THEN 1 WHEN 'M' THEN 1 ELSE 0 END
 WHERE effect_type = 'QUEST_SLOT';
-- QUEST_SLOT 부여 슬롯 3종→1종(PET). GLOVES/HANDLE 는 효과 제거(코스메틱화) →
-- 아이템 슬롯 기여 최대 +1 자연 보장(표시=실제). PET 만 0/0/0/1/1 적용.
UPDATE item_definition SET effect_type = NULL
 WHERE slot IN ('GLOVES', 'HANDLE') AND effect_type = 'QUEST_SLOT';
"""


_PULL_GACHA = """
CREATE OR REPLACE FUNCTION pull_gacha(
  p_user_id            BIGINT,
  p_gacha_code         VARCHAR,
  p_do_10_pull         BOOLEAN DEFAULT FALSE,
  p_skill_discount_pct INT DEFAULT 0
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
  v_discount_pct        INT := 0;
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

  -- 착용효과 + 스킬 COST_DISCOUNT 가산(상한 30%)
  v_discount_pct := LEAST(_resolve_cost_discount(p_user_id) + p_skill_discount_pct, 30);
  IF v_discount_pct > 0 THEN
    v_cost_total := v_cost_total - (v_cost_total * v_discount_pct / 100);
  END IF;

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
    'discount_pct',     v_discount_pct,
    'spend_tx_id',      v_spend_tx_id,
    'results',          v_results,
    'pity_count_after', v_pity_count,
    'total_pulls_after', v_total_pulls + v_pulls_to_do
  );
END $$
"""

_PURCHASE_SHOP_ITEM = """
CREATE OR REPLACE FUNCTION purchase_shop_item(
  p_user_id            BIGINT,
  p_item_code          VARCHAR,
  p_currency           VARCHAR(4),
  p_skill_discount_pct INT DEFAULT 0
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
  v_equip_discount INT := 0;
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

  -- 착용효과 + 스킬 COST_DISCOUNT 가산 후 상한 30%
  v_equip_discount := _resolve_cost_discount(p_user_id);
  v_discount_pct := LEAST(v_discount_pct + v_equip_discount + p_skill_discount_pct, 30);

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


def upgrade() -> None:
    # asyncpg 는 한 번의 실행에 다중 SQL문 불가 → _REBALANCE 의 UPDATE 들을 문장 단위로 분리 실행.
    bind = op.get_bind()
    for _stmt in _REBALANCE.split(";"):
        if _stmt.strip():
            bind.exec_driver_sql(_stmt)
    bind.exec_driver_sql(_PULL_GACHA)
    bind.exec_driver_sql(_PURCHASE_SHOP_ITEM)


def downgrade() -> None:
    # 시드/cap 되돌림은 034/036/045 재실행. 여기선 no-op.
    pass

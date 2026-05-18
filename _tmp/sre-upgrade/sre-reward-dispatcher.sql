-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — Reward Dispatcher (PL/pgSQL)
-- 발행일: 2026-05-18
-- 대상: PostgreSQL 14+
-- 참조: sre-mission-item-reward-spec.md §10 (Reward Dispatcher)
--
-- 핵심 책임:
--   1. mission_definition.reward_bundle (JSONB) 해석
--   2. GP / GC / SXP / Items / Boxes 5채널을 단일 트랜잭션으로 지급
--   3. 멱등성 보장 (user_mission_progress.reward_dispatched_at 잠금)
--   4. 중복 보유 아이템 → 등급별 환산률로 GP/GC 환원
--   5. 시즌 활성 검증 + 시즌 한정 아이템 폴백
--   6. 모든 변동을 audit_log + item_acquisition_log에 기록
--
-- 함수 계층:
--   ┌─ dispatch_mission_reward(progress_id)       [PUBLIC, 메인]
--   │   ├─ _grant_currency(user_id, currency, amount, source, ref_id)
--   │   ├─ _grant_sxp(user_id, sxp_amount, source_progress_id)
--   │   ├─ _grant_item(user_id, item_code, on_dup, source, ref_id)
--   │   │   └─ _refund_item_value(user_id, item_code, on_dup, source_ref_id)
--   │   └─ _grant_box(user_id, box_code, count, source, ref_id)
--   │
--   └─ open_lootbox(inventory_box_id)             [PUBLIC]
--       ├─ _pick_dropped_item(box_code, user_id, mission_category)
--       └─ _grant_item(...) ← 박스 개봉도 같은 지급 경로 재사용
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 0. 환산률 헬퍼: 아이템 등급별 중복 환원 금액
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _refund_amount_for(
  p_rarity   item_rarity_enum,
  p_currency VARCHAR(4)
) RETURNS INT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- 설계서 §5.1 환산률 표 (샵 가격의 25%)
  IF p_currency = 'GP' THEN
    RETURN CASE p_rarity
      WHEN 'C' THEN 75
      WHEN 'R' THEN 375
      WHEN 'E' THEN 2000
      WHEN 'L' THEN 7500
      WHEN 'M' THEN 0       -- Mythic은 GP 환원 안 함 (GC 환원만)
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 1. 현재 활성 시즌 조회
-- ──────────────────────────────────────────────────────────────────────────
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. GP/GC 적립 (Point Module 위임)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _grant_currency(
  p_user_id    BIGINT,
  p_currency   VARCHAR(4),
  p_amount     BIGINT,
  p_source_type VARCHAR,
  p_source_id  BIGINT,
  p_memo       VARCHAR DEFAULT NULL
) RETURNS BIGINT  -- transaction_id
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

  -- 잔액 잠금 + 갱신
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

  -- rp_balance 행이 없으면 즉시 생성
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

  -- 트랜잭션 기록
  INSERT INTO rp_transaction (
    user_id, tx_type, amount, balance_after, currency,
    source_type, source_id, occurred_at, memo
  ) VALUES (
    p_user_id, 'EARN', p_amount, v_balance_after, p_currency,
    p_source_type, p_source_id, NOW(), p_memo
  ) RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. SXP 적립 (Season Pass 갱신)
-- ──────────────────────────────────────────────────────────────────────────
-- 반환: { granted_sxp, new_level, level_up_count, season_code }
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

  -- 1) 활성 시즌 확인
  v_season_code := _get_active_season();
  IF v_season_code IS NULL THEN
    INSERT INTO audit_log (entity_type, entity_id, action_code, after_snapshot, created_at)
    VALUES ('USER_MISSION_PROGRESS', p_source_progress_id, 'SXP_DROPPED_NO_SEASON',
            jsonb_build_object('attempted_sxp', p_sxp_amount), NOW());
    RETURN jsonb_build_object('granted_sxp', 0, 'season_code', NULL);
  END IF;

  -- 2) 시즌 설정 로드
  SELECT daily_sxp_cap, sxp_per_level, max_level
    INTO v_daily_cap, v_sxp_per_level, v_max_level
    FROM season WHERE season_code = v_season_code;

  -- 3) 사용자 시즌 패스 UPSERT (행 잠금)
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

  -- 4) 일일 캡 적용
  v_daily_remain := GREATEST(0, v_daily_cap - v_daily_today);
  v_actual_sxp := LEAST(p_sxp_amount, v_daily_remain);

  IF v_actual_sxp = 0 THEN
    -- 일일 캡 도달
    INSERT INTO audit_log (entity_type, entity_id, action_code, after_snapshot, created_at)
    VALUES ('USER_SEASON_PASS', p_user_id, 'SXP_DAILY_CAP_HIT',
            jsonb_build_object('attempted', p_sxp_amount, 'cap', v_daily_cap), NOW());
    RETURN jsonb_build_object('granted_sxp', 0, 'season_code', v_season_code,
                              'reason', 'DAILY_CAP_HIT');
  END IF;

  -- 5) 잔액 + 레벨 갱신
  v_balance_after := v_balance_before + v_actual_sxp;
  v_level_after := LEAST(v_max_level, v_balance_after / v_sxp_per_level);

  UPDATE user_season_pass
     SET sxp_balance = v_balance_after,
         current_level = v_level_after,
         daily_sxp_today = v_daily_today + v_actual_sxp,
         daily_sxp_date = v_today
   WHERE user_id = p_user_id AND season_code = v_season_code;

  -- 6) 레벨업 발생 시 audit (시즌 패스 트랙 보상 지급은 별도 모듈 책임)
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 4. 아이템 지급 (중복 보유 시 환원)
-- ──────────────────────────────────────────────────────────────────────────
-- 반환: { status: 'GRANTED'|'REFUND_GP'|'REFUND_GC'|'SKIPPED'|'SEASON_LOCKED',
--         item_code, refund_amount, refund_currency, user_item_id, tx_id }
CREATE OR REPLACE FUNCTION _grant_item(
  p_user_id BIGINT,
  p_item_code VARCHAR,
  p_on_duplicate VARCHAR,          -- 'REFUND_GP' | 'REFUND_GC' | 'SKIP'
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
  -- 1) 아이템 메타 로드
  SELECT rarity, season_lock, required_season_code
    INTO v_rarity, v_season_lock, v_required_season
    FROM item_definition WHERE item_code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_code not found: %', p_item_code;
  END IF;

  -- 2) 시즌 한정 검증
  IF v_season_lock THEN
    v_active_season := _get_active_season();
    IF v_active_season IS NULL OR v_active_season IS DISTINCT FROM v_required_season THEN
      -- 시즌 미스매치 → 폴백: 등급별 GP 환원 (설계서 §11.4 정책 B)
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

  -- 3) 보유 여부 확인 (FOR UPDATE NOWAIT는 안 함 - 같은 트랜잭션 내 동시성은 없음)
  SELECT COUNT(*) INTO v_existing_count
    FROM user_item WHERE user_id = p_user_id AND item_code = p_item_code;

  -- 4) 중복 처리
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

  -- 5) 신규 지급
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 5. 박스 적재 (개봉은 별도 함수)
-- ──────────────────────────────────────────────────────────────────────────
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

    -- auto_open_on_grant=TRUE면 즉시 개봉
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 6. MAIN: 미션 보상 디스패치
-- ──────────────────────────────────────────────────────────────────────────
-- 호출: Mission Module이 user_mission_progress.status='COMPLETED' 직후 1회 호출
-- 멱등성: 같은 progress_id에 대해 두 번 호출돼도 1회만 처리 (캐시된 결과 반환)
-- 트랜잭션: 호출자가 BEGIN/COMMIT을 관리 (외부 트랜잭션 컨텍스트에서 실행)
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
  -- 1) progress 로드 + 멱등성 잠금
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

  -- 2) 멱등성 검사: 이미 처리됨
  IF v_dispatched_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'idempotent_hit', true,
      'dispatched_at', v_dispatched_at,
      'log', v_cached_log
    );
  END IF;

  -- 3) 상태 검증: COMPLETED만 처리
  IF v_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'progress not in COMPLETED state: % (got %)',
                    p_progress_id, v_status;
  END IF;

  -- 4) reward_bundle 검증
  IF v_bundle IS NULL THEN
    RAISE EXCEPTION 'mission has no reward_bundle: %', v_mission_code;
  END IF;

  -- 5) GP 적립
  IF (v_bundle->>'gp')::BIGINT > 0 THEN
    v_gp_tx := _grant_currency(
      v_user_id, 'GP', (v_bundle->>'gp')::BIGINT,
      'MISSION_REWARD', p_progress_id,
      'mission:' || v_mission_code
    );
  END IF;

  -- 6) GC 적립
  IF (v_bundle->>'gc')::BIGINT > 0 THEN
    v_gc_tx := _grant_currency(
      v_user_id, 'GC', (v_bundle->>'gc')::BIGINT,
      'MISSION_REWARD', p_progress_id,
      'mission:' || v_mission_code
    );
  END IF;

  -- 7) SXP 적립 (시즌 활성 시에만 효과 발생)
  v_sxp_result := _grant_sxp(
    v_user_id, COALESCE((v_bundle->>'sxp')::INT, 0), p_progress_id
  );

  -- 8) 직접 아이템 지급
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

  -- 9) 박스 적재
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

  -- 10) 결과 로그 작성
  v_final_log := jsonb_build_object(
    'mission_code', v_mission_code,
    'gp_tx_id', v_gp_tx,
    'gc_tx_id', v_gc_tx,
    'sxp_result', v_sxp_result,
    'items', v_items_result,
    'boxes', v_boxes_result,
    'dispatched_at', NOW()
  );

  -- 11) 멱등성 마크 + 로그 저장
  UPDATE user_mission_progress
     SET reward_dispatched_at = NOW(),
         reward_dispatch_log = v_final_log
   WHERE progress_id = p_progress_id;

  -- 12) audit_log 기록
  INSERT INTO audit_log (entity_type, entity_id, actor_user_id,
                          action_code, after_snapshot, created_at)
  VALUES ('USER_MISSION_PROGRESS', p_progress_id, v_user_id,
          'REWARD_DISPATCHED', v_final_log, NOW());

  RETURN v_final_log;

EXCEPTION
  WHEN OTHERS THEN
    -- 트랜잭션은 호출자가 ROLLBACK 처리.
    -- 단, audit_log는 별도 자율 트랜잭션으로 기록하면 좋지만,
    -- v1에서는 단순화: 호출자가 dispatch_mission_reward_safe()로 감싸도록 권장
    INSERT INTO audit_log (entity_type, entity_id, action_code,
                            after_snapshot, created_at)
    VALUES ('USER_MISSION_PROGRESS', p_progress_id, 'REWARD_DISPATCH_ERROR',
            jsonb_build_object('error', SQLERRM, 'state', SQLSTATE), NOW());
    RAISE;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 7. 박스 개봉
-- ──────────────────────────────────────────────────────────────────────────
-- 드랍 룰:
--   1) drop_table.guaranteed가 있으면 그 아이템들을 100% 지급
--   2) weighted 배열에서 가중치에 따라 등급(rarity) 선택
--   3) 해당 등급 + collection_filter (있으면) 후보 풀에서 랜덤 1개 선택
--   4) affinity_boost가 있으면 미션 카테고리 친화 컬렉션 가중치 ×factor
--   5) _grant_item으로 지급 (중복 환원 동일 경로)
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
  -- 1) 박스 잠금
  SELECT user_id, box_code, status, opened_at, granted_source, granted_source_ref
    INTO v_user_id, v_box_code, v_box_status, v_opened_at,
         v_granted_source, v_granted_source_ref
    FROM user_inventory_box
   WHERE inventory_box_id = p_inventory_box_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'box not found: %', p_inventory_box_id;
  END IF;

  -- 멱등: 이미 개봉됨
  IF v_box_status = 'OPENED' THEN
    -- 마지막 드랍 결과 조회
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

  -- 2) 박스 정의 로드
  SELECT drop_table, collection_filter
    INTO v_drop_table, v_collection_filter
    FROM lootbox_definition WHERE box_code = v_box_code;

  v_dup_policy := COALESCE(v_drop_table->>'duplicate_policy', 'REFUND_GP');

  -- 3) Guaranteed 처리 (있는 경우)
  IF jsonb_array_length(COALESCE(v_drop_table->'guaranteed', '[]'::jsonb)) > 0 THEN
    v_picked_item := (v_drop_table->'guaranteed'->0->>'item_code');
  ELSE
    -- 4) 가중치 기반 등급 선택
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

    -- 5) 후보 풀에서 랜덤 1개 (collection_filter 적용)
    -- 시즌 잠금 아이템도 후보에 포함되지만, _grant_item에서 시즌 검증.
    SELECT item_code INTO v_picked_item
      FROM item_definition
     WHERE rarity = v_picked_rarity
       AND (v_collection_filter IS NULL OR collection_code = v_collection_filter)
     ORDER BY random()
     LIMIT 1;

    IF v_picked_item IS NULL THEN
      -- 폴백: 같은 컬렉션의 가까운 등급
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

  -- 6) 지급 (LOOTBOX 소스로)
  v_grant_result := _grant_item(
    v_user_id, v_picked_item, v_dup_policy,
    'LOOTBOX'::acquisition_source_enum,
    p_inventory_box_id
  );

  -- 7) 박스 상태 갱신
  UPDATE user_inventory_box
     SET opened_at = NOW(), status = 'OPENED'
   WHERE inventory_box_id = p_inventory_box_id;

  -- 8) drop_log 기록
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 8. 시즌 종료 배치: expires_with_season 박스 강제 개봉
-- ──────────────────────────────────────────────────────────────────────────
-- 호출 시점: 시즌 종료 시 (스케줄러 또는 수동 트리거)
-- 사용: SELECT * FROM expire_season_boxes('TET_S1');
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
  -- 시즌 종료 마크
  UPDATE season SET status = 'ENDED' WHERE season_code = p_season_code;

  -- 해당 시즌 박스 중 UNOPENED인 것을 모두 처리
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
      -- 개별 박스 실패는 EXPIRED로 표기, 전체 중단 안 함
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
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 9. 안전 래퍼: 에러 시 SAVEPOINT 롤백 + 재시도 큐 등록
-- ──────────────────────────────────────────────────────────────────────────
-- 호출 측에서 트랜잭션 통제하기 어려운 경우용
CREATE OR REPLACE FUNCTION dispatch_mission_reward_safe(
  p_progress_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- 단일 progress_id 처리는 자체 SAVEPOINT
  BEGIN
    v_result := dispatch_mission_reward(p_progress_id);
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    -- 부분 실패 시 호출자에게 재시도 신호
    -- (재시도 큐 테이블이 별도로 있으면 INSERT)
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'progress_id', p_progress_id,
      'retry_recommended', true
    );
  END;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 10. 권한 / 인덱스 권장
-- ──────────────────────────────────────────────────────────────────────────
-- 함수는 SRE 서비스 계정만 호출 가능
-- REVOKE EXECUTE ON FUNCTION dispatch_mission_reward FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION dispatch_mission_reward TO sre_service;
-- GRANT EXECUTE ON FUNCTION open_lootbox TO sre_service;
-- GRANT EXECUTE ON FUNCTION expire_season_boxes TO sre_admin;

-- 추가 권장 인덱스
CREATE INDEX IF NOT EXISTS idx_ump_status_dispatch
  ON user_mission_progress(status, reward_dispatched_at)
  WHERE status = 'COMPLETED' AND reward_dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_inv_box_status_season
  ON user_inventory_box(status)
  WHERE status = 'UNOPENED';

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 사용 예시
-- ──────────────────────────────────────────────────────────────────────────
-- -- 미션 완료 후 보상 디스패치
-- BEGIN;
-- UPDATE user_mission_progress SET status='COMPLETED' WHERE progress_id=12345;
-- SELECT dispatch_mission_reward(12345);
-- COMMIT;
--
-- -- 박스 개봉
-- SELECT open_lootbox(67890);
--
-- -- 시즌 종료 일괄 처리
-- SELECT * FROM expire_season_boxes('TET_S1');

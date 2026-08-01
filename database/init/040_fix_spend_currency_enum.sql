-- _spend_currency 함수가 tx_type='SPEND' 를 사용하지만
-- tx_type_enum 에는 SPEND 값이 없음 (EARN, REDEEM, EXPIRE, ADJUST_PLUS, ADJUST_MINUS, REFUND).
-- 상점 구매·가챠 모두 500 발생 → REDEEM 으로 교체.

CREATE OR REPLACE FUNCTION _spend_currency(
  p_user_id     BIGINT,
  p_currency    VARCHAR,
  p_amount      BIGINT,
  p_source_type VARCHAR,
  p_source_id   BIGINT,
  p_memo        TEXT
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
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
  VALUES (p_user_id, 'REDEEM', p_amount, v_balance_after, p_currency, p_source_type, p_source_id, NOW(), p_memo)
  RETURNING transaction_id INTO v_tx_id;

  RETURN v_tx_id;
END $$;

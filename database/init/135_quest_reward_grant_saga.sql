ALTER TABLE user_quests
  ADD COLUMN IF NOT EXISTS reward_grant_status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS reward_idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reward_last_error TEXT;

UPDATE user_quests
SET reward_grant_status = 'SUCCEEDED',
    reward_idempotency_key = 'quest-reward-' || id::text
WHERE status = 'COMPLETED' AND reward_idempotency_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_quests_reward_idempotency_key
  ON user_quests (reward_idempotency_key)
  WHERE reward_idempotency_key IS NOT NULL;

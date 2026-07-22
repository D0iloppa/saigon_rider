CREATE TABLE IF NOT EXISTS internal_reward_grants (
    idempotency_key VARCHAR(160) PRIMARY KEY,
    operation       VARCHAR(30) NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

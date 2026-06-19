-- 마이그 100: OAuth identity 테이블 + users.phone NOT NULL 해제
-- asyncpg 다중문장 금지 → 문장 단위 분리

ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_oauth_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    raw_profile     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identity_user ON user_oauth_identities(user_id);

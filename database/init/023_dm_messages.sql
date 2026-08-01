-- ================================================================
-- 023_dm_messages.sql
-- DM 메시지 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_messages (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID        NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT,
    image_content_id UUID       REFERENCES contents(id) ON DELETE SET NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conv
    ON dm_messages (conversation_id, created_at DESC);

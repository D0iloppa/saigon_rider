-- ================================================================
-- 022_dm_conversations.sql
-- DM 대화방 테이블 (1:1 채팅)
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_conversations (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_1  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_2  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_1, participant_2),
    CHECK (participant_1 < participant_2)
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_p1
    ON dm_conversations (participant_1);

CREATE INDEX IF NOT EXISTS idx_dm_conv_p2
    ON dm_conversations (participant_2);

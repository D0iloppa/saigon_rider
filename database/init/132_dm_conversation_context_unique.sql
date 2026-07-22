-- DM 문맥 불변성: 일반 대화는 사용자 쌍당 1개, 매물 문의는 사용자 쌍+매물당 1개.
ALTER TABLE dm_conversations
    DROP CONSTRAINT IF EXISTS dm_conversations_participant_1_participant_2_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_direct
    ON dm_conversations (participant_1, participant_2)
    WHERE context_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_listing
    ON dm_conversations (participant_1, participant_2, context_type, context_id)
    WHERE context_type = 'listing' AND context_id IS NOT NULL;

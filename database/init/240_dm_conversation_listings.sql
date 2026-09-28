-- 240: F-DM-02 실기기 피드백(260928) — 방 하나에 여러 매물이 얽히는 실사용 패턴을 반영해
-- 대화-매물 연결을 다:다로 승격한다. dm_conversations.context_id 는 "가장 최근" 포인터로
-- 계속 유지(하위호환, 드롭 안 함) — 이 테이블이 그 히스토리 전체를 보관한다.
CREATE TABLE IF NOT EXISTS dm_conversation_listings (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(20) NOT NULL DEFAULT 'inquiry' CHECK (source IN ('inquiry', 'card', 'appointment')),
    PRIMARY KEY (conversation_id, listing_id)
);

CREATE INDEX IF NOT EXISTS ix_dm_conversation_listings_conversation
    ON dm_conversation_listings (conversation_id, linked_at DESC);

-- 백필 1: 대화의 "최근 문의 매물" 포인터
INSERT INTO dm_conversation_listings (conversation_id, listing_id, linked_at, source)
SELECT c.id, c.context_id, c.last_message_at, 'inquiry'
FROM dm_conversations c
WHERE c.context_type = 'listing' AND c.context_id IS NOT NULL
ON CONFLICT (conversation_id, listing_id) DO NOTHING;

-- 백필 2: 이 대화에서 실제로 오간 약속(제안/수락/완료 불문) 대상 매물
INSERT INTO dm_conversation_listings (conversation_id, listing_id, linked_at, source)
SELECT a.conversation_id, a.listing_id, a.created_at, 'appointment'
FROM marketplace_appointments a
ON CONFLICT (conversation_id, listing_id) DO NOTHING;

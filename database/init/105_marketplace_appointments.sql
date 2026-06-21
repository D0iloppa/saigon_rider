-- ================================================================
-- 105_marketplace_appointments.sql
-- 거래 약속 승격 (SGR-287) — DM 메시지 meta 흩어짐 → 도메인 엔티티
--   · 거래(listing) 1건의 만남 = 단일 진실. RideNav 길안내·매물 상태가 여기에 엮임
--   · 생명주기: PROPOSED → ACCEPTED(listing RESERVED) → COMPLETED(listing SOLD) / CANCELLED
-- 대화당 새 제안마다 행 추가(채팅 타임라인 = 제안 이력). 최신 행이 활성.
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    proposer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    when_at         TIMESTAMPTZ NOT NULL,
    place_name      TEXT,
    place_lat       NUMERIC(9, 6),
    place_lng       NUMERIC(9, 6),
    status          VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_conversation ON marketplace_appointments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointment_listing      ON marketplace_appointments(listing_id);

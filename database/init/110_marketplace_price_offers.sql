-- ================================================================
-- 110_marketplace_price_offers.sql
-- 가격 제안 (DM 가격제안하기, 260706) — marketplace_appointments(105) 패턴 미러
--   · 생명주기: PROPOSED → ACCEPTED / DECLINED / CANCELLED (매물 상태는 변경 없음)
-- 대화당 새 제안마다 행 추가(채팅 타임라인 = 제안 이력). 최신 행이 활성.
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_price_offers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    proposer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_offer_conversation ON marketplace_price_offers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_price_offer_listing      ON marketplace_price_offers(listing_id);

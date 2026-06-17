-- ================================================================
-- 088_marketplace_reviews.sql
-- 거래 후기 + 매너온도 (SGR-287, §5/REF-05·06) — B안: BFF 로컬 집계
--   · users.manner_temp : 매너온도(36.5 시작, 후기로 가감)
--   · marketplace_reviews : 거래 후기(만족도·칭찬태그·텍스트)
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS manner_temp NUMERIC(4,1) NOT NULL DEFAULT 36.5;

CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id   UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL,
    reviewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating       VARCHAR(8) NOT NULL CHECK (rating IN ('GOOD', 'BAD')),
    manner_tags  JSONB,
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (listing_id, reviewer_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_reviews_target ON marketplace_reviews (target_id);

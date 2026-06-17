-- ================================================================
-- 089_marketplace_likes.sql
-- 찜(관심) — 놀라움 층(§3). feed PostLike 패턴.
--   marketplace_listings.like_count 는 이미 존재(토글 시 갱신)
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_listing_likes (
    listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_likes_user ON marketplace_listing_likes (user_id, created_at DESC);

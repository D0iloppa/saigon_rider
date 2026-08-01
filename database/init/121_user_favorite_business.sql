-- =====================================================
-- 121: 업체 찜 (동네지도 프로필 실배선 P-BE T1)
--   - marketplace_listing_likes 패턴 미러 (084_marketplace.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_favorite_business (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id UUID        NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_business_user ON user_favorite_business(user_id, created_at DESC);

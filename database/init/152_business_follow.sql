-- =====================================================
-- 152: 업체 단골(팔로우) — 당근형 "단골맺기" (찜과 별개 개념)
--   - user_favorite_business 패턴 미러 (121_user_favorite_business.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS business_follow (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id UUID        NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_business_follow_profile ON business_follow(profile_id);

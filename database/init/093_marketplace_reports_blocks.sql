-- ================================================================
-- 093_marketplace_reports_blocks.sql  (SGR-301)
-- 모더레이션(신뢰 생명선, 기획 §7): 매물 신고 + 사용자 차단
--   · marketplace_listing_reports : 신고 적재(중복 1회 가드). admin 큐는 후속.
--   · user_blocks                 : 차단(차단자→피차단자). 피드에서 피차단자 매물 제외.
-- CHECK 제약 사용(PG enum 회피 — 값 추가 시 마이그+enum 이중갱신 부담 없음).
-- 멱등: IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_listing_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      VARCHAR(20) NOT NULL
                  CHECK (reason IN ('SPAM', 'FRAUD', 'PROHIBITED', 'DUPLICATE', 'OTHER')),
    note        TEXT,
    status      VARCHAR(12) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (listing_id, reporter_id)   -- 신고자당 매물 1회
);

CREATE INDEX IF NOT EXISTS idx_mp_reports_status  ON marketplace_listing_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_reports_listing ON marketplace_listing_reports (listing_id);

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks (blocker_id);

-- 248: 커뮤니티 그룹 주제(대표 승인 260929) — 그룹당 고정 목록에서 정확히 1개(자유 해시태그 없음). 멱등.
-- 기존 그룹은 'etc'(기타)로 시작.
ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS topic VARCHAR(32) NOT NULL DEFAULT 'etc';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_community_groups_topic') THEN
        ALTER TABLE community_groups ADD CONSTRAINT ck_community_groups_topic CHECK (topic IN (
            'neighborhood_friends', 'riding_tour', 'sports', 'food_cafe', 'language_exchange',
            'hobby', 'self_dev', 'family', 'pets', 'etc'
        ));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_groups_topic ON community_groups (topic);

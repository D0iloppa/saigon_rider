-- ================================================================
-- 017_feed_image_content.sql
-- feed_posts 테이블에 image_content_id FK 추가
-- 모든 피드 이미지는 contents 테이블로 중개되며 content_id 로 매핑된다.
-- image_url(TEXT)은 레거시 폴백으로 유지, image_content_id 가 우선.
-- ================================================================

ALTER TABLE feed_posts
    ADD COLUMN IF NOT EXISTS image_content_id UUID
        REFERENCES contents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_image_content ON feed_posts (image_content_id);

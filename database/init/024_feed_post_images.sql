-- 024: feed_post_images 테이블 (피드 다중 이미지 지원)
CREATE TABLE IF NOT EXISTS feed_post_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    content_id  UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_post_images_post_id ON feed_post_images(post_id, sort_order);

-- 기존 feed_posts.image_content_id 데이터를 feed_post_images로 이관
INSERT INTO feed_post_images (post_id, content_id, sort_order)
SELECT id, image_content_id, 0
FROM feed_posts
WHERE image_content_id IS NOT NULL
ON CONFLICT DO NOTHING;

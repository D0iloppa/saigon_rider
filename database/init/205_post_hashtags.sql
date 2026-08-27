-- ================================================================
-- 205_post_hashtags.sql
-- 커뮤니티 강화 Phase 3 (ai-docs/task/active/260827_community_enhancement_task.md §5 P3-2)
-- 게시물 해시태그 정규화 테이블. 전역 카테고리는 만들지 않는다(Q-8) — 그룹 + 해시태그만.
-- ================================================================

CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id    UUID        NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    tag        VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags (tag, post_id);

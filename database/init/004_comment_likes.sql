-- =============================================================
-- 004_comment_likes.sql
-- 댓글 좋아요 기능 (F-09-6c)
-- post_comments에 like_count 카운터 추가 +
-- post_comment_likes 토글 테이블 추가
-- =============================================================

ALTER TABLE post_comments
    ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_comment_likes (
    comment_id  UUID        NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON post_comment_likes(comment_id);

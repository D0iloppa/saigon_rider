-- ================================================================
-- 219_dm_channel_post_comments.sql
-- 대화방 게시판 댓글 (218 의 P2).
--   · PostComment(feed) 재사용 불가 — post_id 가 feed_posts FK 다. 방 전용 테이블로 둔다.
--   · parent_id 로 1단 대댓글. 부모가 지워져도 자식은 남아야 하므로 SET NULL.
--   · 삭제는 소프트삭제(deleted_at) — 살아있는 답글이 달린 댓글만 "삭제됨" 자리로 남기고
--     그 외에는 서버가 목록에서 제외한다.
--   · 개수는 dm_channel_posts.comment_count 가 들고 있다(218 에서 이미 생성).
-- 매 배포 재실행 안전(멱등).
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_channel_post_comments (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id    UUID NOT NULL REFERENCES dm_channel_posts(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  UUID REFERENCES dm_channel_post_comments(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_channel_post_comments_post
    ON dm_channel_post_comments (post_id, created_at);

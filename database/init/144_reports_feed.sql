-- ================================================================
-- 141_reports_feed.sql
-- FD-4: 피드 게시물/댓글 신고 — reports 통합 테이블(126)에 POST/COMMENT 대상 추가.
-- 기존 LISTING/USER/DM 패턴과 동일: target_type CHECK 확장 + FK 컬럼 + 부분 유니크 인덱스.
-- 멱등: IF NOT EXISTS / 제약은 DROP IF EXISTS 후 재생성.
-- ================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES feed_posts(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('LISTING','USER','DM','POST','COMMENT'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_post_check;
ALTER TABLE reports ADD CONSTRAINT reports_post_check CHECK (target_type <> 'POST' OR post_id IS NOT NULL);

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_comment_check;
ALTER TABLE reports ADD CONSTRAINT reports_comment_check CHECK (target_type <> 'COMMENT' OR comment_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_post_once    ON reports (post_id, reporter_id)    WHERE target_type = 'POST';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_comment_once ON reports (comment_id, reporter_id) WHERE target_type = 'COMMENT';

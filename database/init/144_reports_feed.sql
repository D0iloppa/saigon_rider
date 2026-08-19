-- ================================================================
-- 141_reports_feed.sql
-- FD-4: 피드 게시물/댓글 신고 — reports 통합 테이블(126)에 POST/COMMENT 대상 추가.
-- 기존 LISTING/USER/DM 패턴과 동일: target_type CHECK 확장 + FK 컬럼 + 부분 유니크 인덱스.
-- 멱등: IF NOT EXISTS / 제약은 DROP IF EXISTS 후 재생성.
-- 🔴 W8 사고 재발 방지(2026-08-19): bff_migrate 는 이 파일을 매 배포마다 재실행한다
--   (스탬프는 INSERT ON CONFLICT DO NOTHING 이라 본문은 항상 다시 돈다). 이 파일은 아래 세
--   CHECK 의 최종 소유자가 아니다 — reports_target_type_check 는 198/199 가, reports_post_check/
--   reports_comment_check 는 167 이 최종 상태(전자는 7값 재정의, 후자는 영구 DROP)를 소유한다.
--   최종 소유자가 아닌 여기서 검증 포함 ADD 를 하면, 그 사이 쌓인 최신 데이터(예: REVIEW/BIZ
--   신고, post/comment detach 로 NULL 이 된 행)를 이 시점의 좁은 정의가 위반해 배포가 막힌다.
--   그래서 여기서는 NOT VALID 로 기존 행 검사를 건너뛴다 — 최종 소유자가 뒤에서 다시 정의(또는
--   삭제)하며 실제 검증을 담당한다.
-- ================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES feed_posts(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('LISTING','USER','DM','POST','COMMENT')) NOT VALID;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_post_check;
ALTER TABLE reports ADD CONSTRAINT reports_post_check CHECK (target_type <> 'POST' OR post_id IS NOT NULL) NOT VALID;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_comment_check;
ALTER TABLE reports ADD CONSTRAINT reports_comment_check CHECK (target_type <> 'COMMENT' OR comment_id IS NOT NULL) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_post_once    ON reports (post_id, reporter_id)    WHERE target_type = 'POST';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_comment_once ON reports (comment_id, reporter_id) WHERE target_type = 'COMMENT';

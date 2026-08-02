-- ================================================================
-- 167_reports_content_detach.sql
-- 탈퇴 30일 파기 배치(F-10 확장, purge_deleted_accounts.py)가 feed_posts/post_comments 를
-- 지우면 reports.post_id/comment_id 의 기존 ON DELETE CASCADE 로 그 글/댓글에 대한 신고
-- 행 자체가 함께 사라진다. 대표 결정: user_sanctions(제재 이력)를 상습 위반자 추적
-- 목적으로 보존하기로 했는데, 그 제재의 근거인 신고가 사라지면 목적이 무너진다 —
-- 신고 사유·대상 유저·처리 결과는 보존하고 원문 링크만 끊는다(detach).
--
-- 파기 배치에 한정하지 않고 FK 레벨(ON DELETE SET NULL)로 교정한다: 같은 CASCADE 구조가
-- 관리자 모더레이션 삭제(admin_api/feed.py DELETE /feed/{post_id})와 작성자 자진 삭제
-- (routers/feed.py DELETE /{post_id})에도 이미 걸려 있어, 그 경로들에서도 신고가 조용히
-- 사라지는 동일한 문제가 이미 발생 중이었다. 단일 지점 수정으로 모든 삭제 경로를 커버한다.
-- user_sanctions.report_id 가 이미 이 detach 패턴(ON DELETE SET NULL)으로 되어 있어
-- 이 코드베이스의 기존 관례와도 일치한다.
--
-- post_id/comment_id 가 detach 이후 NULL 이 되어도 target_type 은 신고 당시 대상 종류
-- (POST/COMMENT)를 그대로 보존해야 하므로, 생성 시점 전용이었던 NOT NULL 강제 CHECK
-- (144_reports_feed.sql) 를 제거한다 — 삭제 후에도 NULL 을 허용해야 하기 때문이다.
-- 멱등: DROP CONSTRAINT IF EXISTS 후 재생성.
-- ================================================================

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_post_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_comment_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_comment_id_fkey
    FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_post_check;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_comment_check;

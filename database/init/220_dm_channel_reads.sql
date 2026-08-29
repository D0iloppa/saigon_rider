-- ================================================================
-- 220_dm_channel_reads.sql
-- 게시판 채널 미읽음 배지 (218/219 의 P3).
--   · 채널마다 "내가 어디까지 읽었나"(last_read_at) 하나만 들고, 미읽음 수는 그 시각 이후의
--     라이브 글 수로 계산한다 — 글마다 읽음 행을 쌓지 않는다(방·채널 수 × 멤버 수로 폭발).
--   · 댓글은 P3 범위 밖 — 글 단위 배지만 센다.
--   · 방이나 유저가 사라지면 함께 사라진다(CASCADE).
-- 매 배포 재실행 안전(멱등).
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_channel_reads (
    channel_id   UUID NOT NULL REFERENCES dm_conversation_channels(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

-- 읽음 행은 항상 (channel_id, user_id) 로만 찾는다 — PK 가 그대로 커버하므로 별도 인덱스는 군더더기다.
-- 이미 배포된 dev 에서 걷어내기 위한 정리(초기 배포 환경에선 no-op).
DROP INDEX IF EXISTS idx_dm_channel_reads_user;

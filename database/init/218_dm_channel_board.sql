-- ================================================================
-- 218_dm_channel_board.sql
-- 대화방 안의 채널형 게시판 (Discord 식) — P1: 채널 + 글.
--   · feed_posts 재사용 대신 신규 2테이블(option A). 사적 대화방의 글이
--     /feed 계열 쿼리에 **애초에 존재하지 않는다** — feed 쪽 모든 목록·검색·인기글에
--     `channel_id IS NULL` 을 빠짐없이 붙여야 하는 유출 위험을 스키마 단계에서 제거한다.
--   · 권한 축도 하나로 유지된다: dm_conversation_members(방 멤버) 단일 축.
--     (feed_posts 는 community_group_members 축이라 사적 방은 멤버십 2벌 합성이 필요했다)
--   · direct 방 차단은 애플리케이션에서 400 으로 한다 — CHECK 제약은 걸지 않는다(체인 사고 회피).
--   · 글 삭제는 소프트삭제(deleted_at) — 서버가 목록·상세에서 필터한다.
--   · 댓글(dm_channel_post_comments)은 P2 — comment_count 컬럼만 미리 둔다.
-- 매 배포 재실행 안전(멱등).
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_conversation_channels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    name            VARCHAR(40) NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    -- 개설자가 탈퇴해도 채널은 방의 자산으로 남는다(SET NULL)
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_channels_conv ON dm_conversation_channels (conversation_id, position);

CREATE TABLE IF NOT EXISTS dm_channel_posts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id        UUID NOT NULL REFERENCES dm_conversation_channels(id) ON DELETE CASCADE,
    author_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body              TEXT NOT NULL,
    -- 첨부 이미지는 contents 중개 — UUID 배열을 순서 그대로 보관한다(최대 4장, 애플리케이션 제한)
    image_content_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    comment_count     INTEGER NOT NULL DEFAULT 0,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_channel_posts_ch ON dm_channel_posts (channel_id, created_at DESC);

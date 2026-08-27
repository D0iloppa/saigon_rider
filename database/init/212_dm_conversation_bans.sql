-- ================================================================
-- 212_dm_conversation_bans.sql
-- 그룹 대화방 블랙리스트 (대표 지시 2026-08-28)
-- 운영진(owner/admin)이 등록하며, 해제 전까지 초대·입장 모두 거부된다.
-- 강퇴(dm_conversation_members.left_at)와는 별개 개념 —
-- 강퇴는 즉시 퇴장이지만 재초대로 복귀 가능하고, 밴은 복귀 자체를 막는다.
-- ================================================================

CREATE TABLE IF NOT EXISTS dm_conversation_bans (
    conversation_id  UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- "이 사용자가 밴된 방 목록" 역방향 조회용 (프로필/신고 처리 화면)
CREATE INDEX IF NOT EXISTS idx_dm_conversation_bans_user ON dm_conversation_bans(user_id);

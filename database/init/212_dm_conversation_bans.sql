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
    -- 등록한 운영진이 사라져도 밴은 유지돼야 한다 — CASCADE 면 그 운영진이 등록한 밴이 통째로
    -- 풀려 제재 대상이 다시 들어올 수 있다. 그래서 SET NULL(누가 걸었는지만 잊는다).
    banned_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    reason           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- "이 사용자가 밴된 방 목록" 역방향 조회용 (프로필/신고 처리 화면)
CREATE INDEX IF NOT EXISTS idx_dm_conversation_bans_user ON dm_conversation_bans(user_id);

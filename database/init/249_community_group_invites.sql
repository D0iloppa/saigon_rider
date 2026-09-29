-- 249: 커뮤니티 그룹 초대(대표 판정 260929) — 관계 기반(팔로우/팔로워/1:1 DM 상대) 초대. 멱등.
-- 초대는 1:1 DM 에 group_invite 카드로 전달되고, 초대장 수락이 초대전용(invite) 그룹의 유일한 진입 경로다.
CREATE TABLE IF NOT EXISTS community_group_invites (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id     UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    inviter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(12) NOT NULL DEFAULT 'pending',   -- pending | accepted | declined | revoked
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CONSTRAINT community_group_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'revoked'))
);
-- 그룹·초대받는 사람당 pending 초대는 1건 (스팸/중복 카드 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cgi_pending ON community_group_invites (group_id, invitee_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cgi_invitee ON community_group_invites (invitee_id, status);

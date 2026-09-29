-- 251: 커뮤니티 그룹 멤버 재가입 승인 표식 + 그룹 밴이 만든 방 밴 출처. 멱등.
-- requires_approval: 강퇴 후 재신청(PENDING)은 join 재호출로 승격 불가 — 승인(approve)만.
-- room_banned: 그룹 영구차단이 공식 채팅방 밴을 직접 만든 경우만 true — 해제 시 그 밴만 삭제(별도 DM 방 밴 보호).
ALTER TABLE community_group_members ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_group_members ADD COLUMN IF NOT EXISTS room_banned BOOLEAN NOT NULL DEFAULT FALSE;

-- 247: 커뮤니티 그룹 공식 채팅 자동 참여(대표 판정 260929) — 기존 ACTIVE 그룹 멤버를 그룹 공식 대화방 참여자로 백필. 멱등.
-- 공식 채널이므로 알림 켜진 상태(muted_at NULL)로 시작(대표 판정 260929). 방에서 밴된 사용자는 제외. 누락된 행만 삽입 — 기존 행(탈퇴/강퇴 left_at 포함)은 건드리지 않는다.
INSERT INTO dm_conversation_members (conversation_id, user_id, role, joined_at, last_read_at)
SELECT c.id, m.user_id, CASE WHEN m.role = 'owner' THEN 'owner' ELSE 'member' END, now(), now()
FROM dm_conversations c
JOIN community_group_members m ON m.group_id = c.community_group_id AND m.status = 'ACTIVE'
WHERE c.community_group_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dm_conversation_bans b WHERE b.conversation_id = c.id AND b.user_id = m.user_id)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

UPDATE dm_conversations c
SET member_count = (SELECT count(*) FROM dm_conversation_members x WHERE x.conversation_id = c.id AND x.left_at IS NULL)
WHERE c.community_group_id IS NOT NULL;

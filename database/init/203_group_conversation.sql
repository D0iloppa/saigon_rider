-- ================================================================
-- 203_group_conversation.sql
-- 커뮤니티 강화 Phase 1 (ai-docs/task/active/260827_community_enhancement_task.md §3.3)
-- dm_conversations 를 그룹/오픈톡방까지 표현하도록 확장하고, 참가자를
-- dm_conversation_members 조인 테이블로 분리한다. 테이블은 새로 만들지 않는다
-- (022 dm_conversations 를 그대로 확장 — market.py 등 기존 FK 를 깨지 않기 위함).
--
-- community_group_id 는 이 시점에 community_groups 테이블이 아직 존재하지 않아
-- (Phase 2, 204_community_group.sql 예정) FK 없이 plain UUID 로 추가한다.
-- FK 는 204 가 생성된 뒤 별도 마이그레이션에서 추가한다.
-- ================================================================

-- 대화 종류. 기존 행은 전부 'direct'.
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct';
    --  'direct' : 기존 1:1 DM (마켓 약속·가격제안이 붙는 유일한 종류)
    --  'group'  : 순수 그룹톡방 (사적 다자간, 초대로만 입장)
    --  'open'   : 커뮤니티 오픈톡방 (community_group_id 필수, 그룹 멤버면 입장)

ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS community_group_id UUID,   -- 'open' 전용. FK 는 community_groups 생성(204) 후 추가.
    ADD COLUMN IF NOT EXISTS title            VARCHAR(60),   -- group/open 방 제목
    ADD COLUMN IF NOT EXISTS photo_content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS member_count     INTEGER NOT NULL DEFAULT 2,  -- 비정규화 카운터
    ADD COLUMN IF NOT EXISTS archived_at      TIMESTAMPTZ;

-- participant_1/2 를 nullable 로 완화 (group/open 은 조인 테이블만 쓴다)
ALTER TABLE dm_conversations ALTER COLUMN participant_1 DROP NOT NULL;
ALTER TABLE dm_conversations ALTER COLUMN participant_2 DROP NOT NULL;

-- 022 의 무명 CHECK(participant_1 < participant_2) 를 종류별 조건부로 교체
ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS dm_conversations_check;
ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS dm_conversations_direct_pair_check;
ALTER TABLE dm_conversations
    ADD CONSTRAINT dm_conversations_direct_pair_check CHECK (
        conversation_type <> 'direct'
        OR (participant_1 IS NOT NULL AND participant_2 IS NOT NULL AND participant_1 < participant_2)
    );
ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS dm_conversations_open_group_check;
ALTER TABLE dm_conversations
    ADD CONSTRAINT dm_conversations_open_group_check CHECK (
        (conversation_type = 'open') = (community_group_id IS NOT NULL)
    );

-- 132 의 부분 유니크 인덱스는 direct 한정으로 재선언 (group/open 은 쌍 유일성 개념이 없다)
DROP INDEX IF EXISTS uq_dm_conversation_direct;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_direct
    ON dm_conversations (participant_1, participant_2)
    WHERE conversation_type = 'direct' AND context_id IS NULL;

DROP INDEX IF EXISTS uq_dm_conversation_listing;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_listing
    ON dm_conversations (participant_1, participant_2, context_type, context_id)
    WHERE conversation_type = 'direct' AND context_type = 'listing' AND context_id IS NOT NULL;

-- ── 참가자 조인 테이블 (신설) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_conversation_members (
    conversation_id UUID        NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(12) NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member'
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- 읽음 SoT (그룹)
    muted_at        TIMESTAMPTZ,                             -- 방별 알림 끄기
    left_at         TIMESTAMPTZ,                             -- 나감(행은 남긴다 — 과거 메시지 귀속·신고 추적)
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_members_user
    ON dm_conversation_members (user_id, left_at);          -- 내 대화방 목록
CREATE INDEX IF NOT EXISTS idx_dm_conv_members_conv
    ON dm_conversation_members (conversation_id) WHERE left_at IS NULL;

-- 기존 1:1 대화 백필 (멱등)
INSERT INTO dm_conversation_members (conversation_id, user_id, role, joined_at, last_read_at)
SELECT c.id, p.uid, 'member', c.created_at, COALESCE(
        (SELECT MAX(m.read_at) FROM dm_messages m
          WHERE m.conversation_id = c.id AND m.sender_id <> p.uid AND m.read_at IS NOT NULL),
        c.created_at)
  FROM dm_conversations c
 CROSS JOIN LATERAL (VALUES (c.participant_1), (c.participant_2)) AS p(uid)
 WHERE c.conversation_type = 'direct' AND p.uid IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

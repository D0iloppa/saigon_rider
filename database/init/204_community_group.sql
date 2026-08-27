-- ================================================================
-- 204_community_group.sql
-- 커뮤니티 강화 Phase 2 (ai-docs/task/active/260827_community_enhancement_task.md §4.2)
-- 커뮤니티 그룹(Band/FB Group 스타일) 엔티티 신설.
--
-- 203_group_conversation.sql 이 남겨둔 숙제도 여기서 마무리한다:
-- dm_conversations.community_group_id 는 그 시점에 community_groups 가
-- 아직 없어 FK 없이 plain UUID 로 추가됐다 — 이제 FK 를 채운다.
-- ================================================================

CREATE TABLE IF NOT EXISTS community_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(40) UNIQUE,                 -- 딥링크용
    name            VARCHAR(60)  NOT NULL,
    description     TEXT,
    cover_content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    group_type      VARCHAR(20) NOT NULL DEFAULT 'interest',  -- 'interest' | 'neighborhood'
    ward_id         SMALLINT REFERENCES wards(id) ON DELETE SET NULL,      -- neighborhood 전용
    district_id     SMALLINT REFERENCES districts(id) ON DELETE SET NULL,
    join_policy     VARCHAR(20) NOT NULL DEFAULT 'open',      -- 'open' | 'approval' | 'invite'
    visibility      VARCHAR(20) NOT NULL DEFAULT 'public',    -- 'public' | 'private'
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    member_count    INTEGER NOT NULL DEFAULT 0,
    post_count      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE | SUSPENDED | ARCHIVED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT community_groups_neighborhood_check CHECK (
        group_type <> 'neighborhood' OR ward_id IS NOT NULL OR district_id IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS community_group_members (
    group_id   UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(12) NOT NULL DEFAULT 'member',   -- 'owner' | 'manager' | 'member'
    status     VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',   -- 'PENDING'(승인제) | 'ACTIVE' | 'BANNED'
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cgm_user ON community_group_members (user_id, status);

-- 피드 게시물 ↔ 그룹 (additive, nullable — 기존 글은 전부 NULL = 전체 공개 피드)
ALTER TABLE feed_posts
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES community_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_feed_posts_group
    ON feed_posts (group_id, created_at DESC) WHERE group_id IS NOT NULL;

-- 203 이 FK 없이 추가해둔 dm_conversations.community_group_id 에 이제 FK 를 채운다.
ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS dm_conversations_community_group_id_fkey;
ALTER TABLE dm_conversations
    ADD CONSTRAINT dm_conversations_community_group_id_fkey
        FOREIGN KEY (community_group_id) REFERENCES community_groups(id) ON DELETE CASCADE;

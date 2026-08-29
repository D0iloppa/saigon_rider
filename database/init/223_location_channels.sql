-- ================================================================
-- 223_location_channels.sql
-- 실시간 위치공유 채널(Live Location Channel) Phase 1 코어 테이블.
-- SoT: ai-docs/task/active/260829_live_location_channel_task.md §3
--
-- 2026-08-27 약속 기반 위젯(`marketplace_location_shares`)을 대체하는 채널 모델. 대화방(1:1/그룹)
-- 단위로 열리고, 활성 채널은 대화방당 최대 1개(partial unique). 좌표는 참가자별 최신 1건만 보관
-- (이력 미보관) — 이탈·종료 시 즉시 NULL.
--
-- 재실행 멱등: CREATE TABLE/INDEX IF NOT EXISTS 만 사용.
-- ================================================================

CREATE TABLE IF NOT EXISTS location_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES marketplace_appointments(id) ON DELETE SET NULL,
    dest_lat NUMERIC(9, 6),
    dest_lng NUMERIC(9, 6),
    dest_name VARCHAR(120),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    end_reason VARCHAR(20)
);

-- 대화방당 활성(ended_at IS NULL) 채널은 최대 1개.
CREATE UNIQUE INDEX IF NOT EXISTS ux_location_channels_active_conversation
    ON location_channels (conversation_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_location_channels_conversation
    ON location_channels (conversation_id);

CREATE TABLE IF NOT EXISTS location_channel_members (
    channel_id UUID NOT NULL REFERENCES location_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consented_at TIMESTAMPTZ NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    lat NUMERIC(9, 6),
    lng NUMERIC(9, 6),
    accuracy_m INTEGER,
    heading REAL,
    speed_mps REAL,
    located_at TIMESTAMPTZ,
    eta_s INTEGER,
    distance_m INTEGER,
    eta_computed_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_location_channel_members_channel_active
    ON location_channel_members (channel_id) WHERE left_at IS NULL;

-- 목적지 변경 제안 (Phase 1: 테이블만 생성, API 는 Phase 2).
CREATE TABLE IF NOT EXISTS location_channel_dest_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES location_channels(id) ON DELETE CASCADE,
    proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    name VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_location_channel_dest_proposals_channel
    ON location_channel_dest_proposals (channel_id);

CREATE TABLE IF NOT EXISTS location_channel_dest_votes (
    proposal_id UUID NOT NULL REFERENCES location_channel_dest_proposals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accept BOOLEAN NOT NULL,
    voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (proposal_id, user_id)
);

-- 252: 커뮤니티 그룹 영구차단 메타 — 차단 시각 / 차단한 운영진. 멱등, nullable(기존 차단 행은 NULL → 화면에서 '-').
ALTER TABLE community_group_members ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE community_group_members ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id) ON DELETE SET NULL;

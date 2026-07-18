-- ================================================================
-- 127_user_sanctions.sql
-- T&S 관리자 콘솔 리메이크 — 유저 상태·제재 이력.
--   · users.status/suspended_until/last_seen_at : 계정 상태 조회/필터용 컬럼 추가.
--   · user_sanctions : 경고/정지/영구정지/해제 이력 (report 와 옵션 연결).
--   · notification_type 에 MODERATION 추가 (112/115 패턴과 동일 — ADD VALUE IF NOT EXISTS).
-- 멱등: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS 후 재생성.
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE','SUSPENDED','BANNED'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_sanctions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type           VARCHAR(10) NOT NULL CHECK (type IN ('WARN','SUSPEND','BAN','LIFT')),
    reason         TEXT NOT NULL,
    report_id      UUID REFERENCES reports(id) ON DELETE SET NULL,
    ends_at        TIMESTAMPTZ,
    admin_username VARCHAR(50) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_user ON user_sanctions (user_id, created_at DESC);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'MODERATION';

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at);

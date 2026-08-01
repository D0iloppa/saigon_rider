-- ================================================================
-- 129_admin_audit_log.sql
-- T&S 관리자 콘솔 리메이크 — 관리자 행위 감사 로그.
--   · admin_audit_log : 어떤 관리자가 언제 무엇을(action/target) 했는지 append-only 기록.
-- 멱등: IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    admin_username VARCHAR(50) NOT NULL,
    admin_role     VARCHAR(10) NOT NULL,
    action         VARCHAR(50) NOT NULL,
    target_type    VARCHAR(20),
    target_id      VARCHAR(64),
    detail         JSONB,
    ip             VARCHAR(45),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin   ON admin_audit_log (admin_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit_log (target_type, target_id);

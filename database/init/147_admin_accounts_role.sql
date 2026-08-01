-- ================================================================
-- 147_admin_accounts_role.sql
--
-- 관리자 권한 3단계(ROOT / ADMIN / MANAGER) 도입:
--   - ROOT   : .env(ADMIN_USER) 정적 계정. DB 행 아님.
--   - ADMIN  : root 동등 권한(계정관리 + 감사로그 포함). role='admin' DB 행.
--   - MANAGER: 기존 admin 권한(계정관리·감사로그 제외 전부). role='manager' DB 행.
--
-- admin_accounts 에 role 컬럼 추가. 기존 행은 DEFAULT 'manager' 로 강등된다
-- (기존 DB 계정 = 오늘의 admin = MANAGER). 멱등(IF NOT EXISTS).
-- ================================================================

ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'manager';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_accounts_role_check'
  ) THEN
    ALTER TABLE admin_accounts
      ADD CONSTRAINT admin_accounts_role_check CHECK (role IN ('admin', 'manager'));
  END IF;
END $$;

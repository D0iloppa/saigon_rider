-- ================================================================
-- 016_admin_accounts.sql
--
-- 1) admin_accounts 테이블 신설 — DB 기반 관리자 계정 (root 가 등록)
--    - root 관리자는 .env (ADMIN_USER / ADMIN_PASS_HASH) 정적 계정으로 별도
--    - 여기에 등록된 계정은 일반 admin 권한 (root 메뉴 제외 모든 admin 페이지 접근)
--
-- 2) 가상 admin user (015 시드) 의 nickname 을 'admin' → 'SaigonRider' 로 변경
--    - 피드 작성 시 표시되는 공통 계정 이름
--    - 여러 관리자가 공통으로 게시 (관리자별 user 매핑 X)
-- ================================================================

CREATE TABLE IF NOT EXISTS admin_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    note          VARCHAR(200),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_username ON admin_accounts(username);

-- 피드 공통 계정 nickname 갱신 (멱등 — 이미 SaigonRider 면 no-op)
UPDATE users
   SET nickname = 'SaigonRider'
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND nickname IS DISTINCT FROM 'SaigonRider';

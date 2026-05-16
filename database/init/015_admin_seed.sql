-- ================================================================
-- 015_admin_seed.sql
-- 관리자 콘솔 전용 가상 user 시드 (피드 작성자 / 프로필 이미지 owner)
--
-- 정책:
--   - phone = '__admin__' 을 sentinel 로 사용 (실 전화번호 충돌 없음)
--   - nickname = 'admin'
--   - id 는 결정론적 UUID '00000000-0000-0000-0000-000000000001' 로 고정
--     → 백엔드에서 ADMIN_USER_ID 환경변수 기본값과 일치
--   - 멱등 (ON CONFLICT DO NOTHING)
-- ================================================================

INSERT INTO users (id, phone, nickname, level, exp, gold, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '__admin__',
    'SaigonRider',
    99,
    0,
    0,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- 125_seller_phone_verify.sql (판매자 휴대폰 인증 — 매물 등록 게이트)
-- OAuth 로그인 위에 얹는 온보딩 레이어: OTP 인증 완료 시 users.phone 바인딩 +
-- phone_verified_at 기록. users.phone UNIQUE 가 폰 1개 = 계정 1개를 강제.
--
-- user_otp (001, 미사용 dead schema) 를 보안 형태로 재목적화:
--   - otp_hash: OTP 는 해시만 저장 (평문 otp_code 컬럼은 신규 쓰기 금지 → NOT NULL 해제)
--   - user_id: 세션 유저 스코프 조회 + 유저 단위 rate-limit
--   - attempt_count / last_sent_at: 오입력 횟수 제한·재전송 쿨다운
-- 멱등성: IF NOT EXISTS / DROP NOT NULL 은 재실행 안전.
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

ALTER TABLE user_otp ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_otp ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(255);
ALTER TABLE user_otp ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE user_otp ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- 레거시 평문 컬럼 — read-only 폴백조차 없음(코드 미사용). 신규 행은 NULL 로 둔다.
ALTER TABLE user_otp ALTER COLUMN otp_code DROP NOT NULL;

-- 유저/폰 단위 최신 OTP 조회 + 시간당 발송 카운트용
CREATE INDEX IF NOT EXISTS idx_user_otp_user_created ON user_otp (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_otp_phone_created ON user_otp (phone, created_at DESC);

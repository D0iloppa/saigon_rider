-- =============================================================
-- Migration 002: users 테이블에 passcode_hash 추가
-- OTP 없이 phone + passcode 기반 인증을 위한 컬럼
-- =============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(255);

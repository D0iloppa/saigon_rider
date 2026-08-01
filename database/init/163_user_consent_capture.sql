-- F-9: 가입 시 약관/개인정보처리방침 동의 캡처(증빙 가능한 기록).
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_agreed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_privacy_version VARCHAR(20);

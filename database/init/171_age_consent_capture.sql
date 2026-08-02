-- 171: 가입 시 연령(만 14세 이상) 확인 캡처 — F-9 동의 캡처(163)와 동일 방식(시각+버전 증빙).
-- 이용약관 §1 연령 요건에 대한 별개 체크박스 확인. 기존 계정 소급(backfill) 금지 —
-- 증빙 없는 동의를 위조하지 않는다. 미기록 계정은 다음 로그인 시 동의 화면에서 수집된다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_age_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_age_version VARCHAR(20);

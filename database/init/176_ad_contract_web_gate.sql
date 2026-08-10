-- ================================================================
-- 176_ad_contract_web_gate.sql
--
-- 광고주 tier 계약서 동의를 웹(business.saigon-rider.com)에서 처리하기 위한
-- 게이트 컬럼 (Apple 3.1.3(g) 회피 — 결제/계약 확인을 앱 밖으로 분리).
-- 전자서명 벤더 연동 전 단계라 체크박스 동의 + 서명자명 + 시각 + IP 만 기록한다.
--
-- 멱등(ADD COLUMN IF NOT EXISTS). 전부 NULL 허용.
-- ================================================================

ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS contract_token UUID NULL UNIQUE,
  ADD COLUMN IF NOT EXISTS contract_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS contract_method VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS contract_signer_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS contract_signer_ip VARCHAR(45) NULL;

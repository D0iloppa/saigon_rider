-- ================================================================
-- 151_biz_verification.sql
--
-- 광고주(비즈니스 파트너) "중간 검증" 축 + 월구독 광고 라이프사이클.
-- 기존 business_profile.status(계정 승인축: PENDING/APPROVED/REJECTED/SUSPENDED)와
-- 별개의 검증축(verification_status)을 도입한다. CCCD/주민증은 수집하지 않는다(중간 검증).
--
--   · business_profile.verification_status : pending → docs_submitted → verified/rejected
--   · biz_license_content_id / signboard_content_id : contents 중개 문서 스캔 FK
--   · verified_at / verification_reject_reason : 심사 결과
--   · rep_name / phone_verified : 신원 보조 필드(현재 business_profile 에 없어 신규)
--       (trade_name=name, category, 주소=address, phone 은 기존 컬럼 재사용)
--   · ad_tiers.features_json : 플랜 피처 목록(프론트 플랜피커용, JSON 배열)
--   · marketplace_ads.is_ongoing : 상시 게시 여부(true 면 ends_at 무시)
--   · marketplace_ads.subscription_status : 월구독 입금상태(admin 토글)
--
-- 멱등(ADD COLUMN IF NOT EXISTS / pg_constraint 가드). 147·148 패턴 미러.
-- ================================================================

-- ── business_profile: 검증축 ─────────────────────────────────────
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS biz_license_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS signboard_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS verification_reject_reason TEXT;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS rep_name VARCHAR(120);

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_profile_verification_status_check'
  ) THEN
    ALTER TABLE business_profile
      ADD CONSTRAINT business_profile_verification_status_check
      CHECK (verification_status IN ('pending', 'docs_submitted', 'verified', 'rejected'));
  END IF;
END $$;

-- ── ad_tiers: 플랜 피처 목록 ──────────────────────────────────────
ALTER TABLE ad_tiers
  ADD COLUMN IF NOT EXISTS features_json JSONB;

-- ── marketplace_ads: 상시게시 + 월구독 입금상태 ──────────────────
ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS is_ongoing BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) NOT NULL DEFAULT 'pending_payment';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_ads_subscription_status_check'
  ) THEN
    ALTER TABLE marketplace_ads
      ADD CONSTRAINT marketplace_ads_subscription_status_check
      CHECK (subscription_status IN ('pending_payment', 'active', 'expired'));
  END IF;
END $$;

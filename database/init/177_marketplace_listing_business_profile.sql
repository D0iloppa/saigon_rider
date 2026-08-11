-- ================================================================
-- 177_marketplace_listing_business_profile.sql
--
-- T-1(업체 매물 등록 경로): marketplace_listings 에 업체 FK 추가.
-- marketplace_ads.owner_business_profile_id (113_business_partner.sql) 패턴 그대로 미러 —
-- nullable, 개인 판매자 매물은 NULL 유지.
--
-- 멱등(ADD COLUMN IF NOT EXISTS).
-- ================================================================

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS business_profile_id UUID REFERENCES business_profile(id) ON DELETE SET NULL;

-- ================================================================
-- 148_marketplace_ads_exposure.sql
--
-- 제휴 광고 노출을 "균등 라운드로빈"에서 "광고료 비례 가중 노출"로 전환.
-- marketplace_ads 에 노출 가중 산정용 2개 컬럼 추가:
--   · exposure_tier : 노출 등급(GOLD/SILVER/BRONZE). tier 간 base weight.
--                     기존 광고는 최하위 BRONZE 로 채워진다(과금 이력 없음 = 최하위).
--   · ad_fee        : 과금액(VND). 동급(same tier) 내 가중 tiebreak — 클수록 더 노출.
--
-- 멱등(IF NOT EXISTS). fresh volume(docker-entrypoint-initdb.d) 자동적용 +
-- 기존 volume 수동 ALTER 둘 다 안전. 기존 행은 DEFAULT 로 자동 backfill.
-- ================================================================

ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS exposure_tier VARCHAR(20) NOT NULL DEFAULT 'BRONZE';

ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS ad_fee INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_ads_exposure_tier_check'
  ) THEN
    ALTER TABLE marketplace_ads
      ADD CONSTRAINT marketplace_ads_exposure_tier_check
      CHECK (exposure_tier IN ('GOLD', 'SILVER', 'BRONZE'));
  END IF;
END $$;

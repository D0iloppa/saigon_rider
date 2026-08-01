-- ================================================================
-- 143_marketplace_biz_poi_geom.sql  (DB-7)
-- 반경검색 전용 GEOGRAPHY(GIST) 컬럼 소급 적용 — 기존 DB(dev)용.
--   신규 볼륨은 084/113/124 소스에서 이미 동일 계약(geom + GIST).
--   gas_station/repair_shop/flood_report(035) · flood_risk_daily(054) 와 동일 패턴.
--   · marketplace_listings.geom
--   · business_profile.geom
--   · poi.geom
-- ================================================================

DO $$
BEGIN
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_mp_listings_geom ON marketplace_listings USING GIST(geom);

DO $$
BEGIN
  IF to_regclass('public.business_profile') IS NOT NULL THEN
    ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_biz_profile_geom ON business_profile USING GIST(geom);

DO $$
BEGIN
  IF to_regclass('public.poi') IS NOT NULL THEN
    ALTER TABLE poi ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_poi_geom ON poi USING GIST(geom);

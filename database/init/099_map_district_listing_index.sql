-- marketplace_listings.district_id 인덱스 (district-count 집계 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_mp_listings_district
    ON marketplace_listings(district_id)
    WHERE district_id IS NOT NULL;

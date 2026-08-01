-- ================================================================
-- 020_feed_location.sql
-- feed_posts 에 위치 컬럼(lat/lng) + district FK 추가
-- ================================================================

ALTER TABLE feed_posts
    ADD COLUMN IF NOT EXISTS latitude    NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude   NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS district_id SMALLINT REFERENCES districts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_location
    ON feed_posts USING gist (
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    )
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_district
    ON feed_posts (district_id)
    WHERE district_id IS NOT NULL;

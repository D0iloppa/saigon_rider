CREATE TABLE IF NOT EXISTS wards (
    id         SMALLSERIAL PRIMARY KEY,
    code       VARCHAR(40)  NOT NULL UNIQUE,
    city_code  VARCHAR(10)  NOT NULL DEFAULT 'HCMC',
    name_vi    VARCHAR(100) NOT NULL,
    name_en    VARCHAR(100) NOT NULL,
    name_ko    VARCHAR(100),
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN  NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_wards_city_code ON wards (city_code);

ALTER TABLE marketplace_listings
    ADD COLUMN IF NOT EXISTS ward_id SMALLINT REFERENCES wards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_ward_id ON marketplace_listings (ward_id);

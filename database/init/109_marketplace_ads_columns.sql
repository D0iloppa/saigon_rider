ALTER TABLE marketplace_ads
    ADD COLUMN IF NOT EXISTS category         VARCHAR(60),
    ADD COLUMN IF NOT EXISTS rating           NUMERIC(2, 1),
    ADD COLUMN IF NOT EXISTS service_count    INTEGER,
    ADD COLUMN IF NOT EXISTS established_year SMALLINT,
    ADD COLUMN IF NOT EXISTS business_hours   VARCHAR(50);

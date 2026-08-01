-- SGR-310: Ward 테이블 생성 + marketplace_listings.ward_id 컬럼 추가
-- 실행 방법:
--   psql $DATABASE_URL -f scripts/migrate_wards.sql
--
-- 주의: asyncpg 다중문장 마이그 금지 규칙에 따라 각 문장을 분리함.
-- wards 테이블이 이미 있으면 무시 (IF NOT EXISTS).

-- ① wards 테이블 생성
CREATE TABLE IF NOT EXISTS wards (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(40)  NOT NULL UNIQUE,
    city_code   VARCHAR(10)  NOT NULL DEFAULT 'HCMC',
    name_vi     VARCHAR(100) NOT NULL,
    name_en     VARCHAR(100) NOT NULL,
    name_ko     VARCHAR(100),
    center_lat  DOUBLE PRECISION,
    center_lng  DOUBLE PRECISION,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ② marketplace_listings에 ward_id 컬럼 추가 (이미 있으면 무시)
ALTER TABLE marketplace_listings
    ADD COLUMN IF NOT EXISTS ward_id SMALLINT REFERENCES wards(id) ON DELETE SET NULL;

-- ③ 인덱스
CREATE INDEX IF NOT EXISTS idx_wards_city_code ON wards(city_code);
CREATE INDEX IF NOT EXISTS idx_listings_ward_id ON marketplace_listings(ward_id);

-- 035: 정보 모듈 — 날씨·침수·주유소·정비소 테이블 12종
-- reporter/reviewer FK는 BFF users(id) UUID 기준

-- =====================================================
-- Module 1: Weather
-- =====================================================
CREATE TABLE IF NOT EXISTS weather_cache (
    cache_id       BIGSERIAL   PRIMARY KEY,
    district_code  VARCHAR(20) NOT NULL,
    lat            DECIMAL(10, 7) NOT NULL,
    lng            DECIMAL(10, 7) NOT NULL,
    weather_type   VARCHAR(20) NOT NULL,
    data           JSONB       NOT NULL,
    fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    UNIQUE (district_code, weather_type)
);
CREATE INDEX IF NOT EXISTS idx_weather_cache_district ON weather_cache(district_code, weather_type);
CREATE INDEX IF NOT EXISTS idx_weather_cache_expires  ON weather_cache(expires_at);

CREATE TABLE IF NOT EXISTS user_favorite_location (
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label          VARCHAR(50) NOT NULL,
    lat            DECIMAL(10, 7) NOT NULL,
    lng            DECIMAL(10, 7) NOT NULL,
    notify_rain    BOOLEAN     DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, label)
);

-- =====================================================
-- Module 2: Flood
-- =====================================================
CREATE TABLE IF NOT EXISTS flood_report (
    report_id          BIGSERIAL   PRIMARY KEY,
    reporter_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    lat                DECIMAL(10, 7) NOT NULL,
    lng                DECIMAL(10, 7) NOT NULL,
    district_code      VARCHAR(20) NOT NULL,
    street_name        VARCHAR(200),
    depth_level        VARCHAR(20) NOT NULL
                       CHECK (depth_level IN ('ankle', 'knee', 'thigh', 'above')),
    photo_url          TEXT,
    reported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ,
    confidence_score   INT         DEFAULT 1,
    status             VARCHAR(20) DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'RESOLVED', 'EXPIRED', 'FLAGGED')),
    expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours'),
    geom               GEOGRAPHY(POINT, 4326)
                       GENERATED ALWAYS AS (
                           ST_SetSRID(ST_MakePoint(lng::double precision, lat::double precision), 4326)::geography
                       ) STORED
);
CREATE INDEX IF NOT EXISTS idx_flood_active  ON flood_report(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_flood_geom    ON flood_report USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_flood_reporter ON flood_report(reporter_user_id, reported_at);

CREATE TABLE IF NOT EXISTS flood_confirmation (
    confirmation_id    BIGSERIAL   PRIMARY KEY,
    report_id          BIGINT      NOT NULL REFERENCES flood_report(report_id) ON DELETE CASCADE,
    user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    confirmation_type  VARCHAR(20) NOT NULL
                       CHECK (confirmation_type IN ('still_flooded', 'resolved', 'false')),
    confirmed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_confirm_report ON flood_confirmation(report_id);

CREATE TABLE IF NOT EXISTS flood_hotspot_stats (
    hotspot_id       BIGSERIAL   PRIMARY KEY,
    district_code    VARCHAR(20) NOT NULL,
    street_name      VARCHAR(200),
    centroid_lat     DECIMAL(10, 7),
    centroid_lng     DECIMAL(10, 7),
    flood_count_30d  INT         DEFAULT 0,
    last_flood_at    TIMESTAMPTZ,
    avg_depth_level  VARCHAR(20),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Module 3: Gas Station
-- =====================================================
CREATE TABLE IF NOT EXISTS gas_station (
    station_id     BIGSERIAL   PRIMARY KEY,
    osm_id         VARCHAR(50) UNIQUE,
    brand          VARCHAR(50),
    name           VARCHAR(200),
    lat            DECIMAL(10, 7) NOT NULL,
    lng            DECIMAL(10, 7) NOT NULL,
    district_code  VARCHAR(20),
    street_name    VARCHAR(200),
    opening_hours  VARCHAR(100),
    status         VARCHAR(20) DEFAULT 'ACTIVE',
    geom           GEOGRAPHY(POINT, 4326)
                   GENERATED ALWAYS AS (
                       ST_SetSRID(ST_MakePoint(lng::double precision, lat::double precision), 4326)::geography
                   ) STORED,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gas_geom  ON gas_station USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_gas_brand ON gas_station(brand);

CREATE TABLE IF NOT EXISTS fuel_price_official (
    price_id        BIGSERIAL   PRIMARY KEY,
    fuel_type       VARCHAR(20) NOT NULL,
    price_vnd       INT         NOT NULL,
    effective_from  DATE        NOT NULL,
    effective_until DATE,
    source_url      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gas_station_wait_report (
    wait_id           BIGSERIAL   PRIMARY KEY,
    station_id        BIGINT      NOT NULL REFERENCES gas_station(station_id) ON DELETE CASCADE,
    reporter_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    wait_minutes      INT         NOT NULL CHECK (wait_minutes >= 0 AND wait_minutes <= 120),
    reported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 minutes')
);
CREATE INDEX IF NOT EXISTS idx_wait_station_recent ON gas_station_wait_report(station_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_wait_expires        ON gas_station_wait_report(expires_at);

-- =====================================================
-- Module 4: Repair Shop
-- =====================================================
CREATE TABLE IF NOT EXISTS repair_shop (
    shop_id          BIGSERIAL   PRIMARY KEY,
    osm_id           VARCHAR(50) UNIQUE,
    name             VARCHAR(200) NOT NULL,
    lat              DECIMAL(10, 7) NOT NULL,
    lng              DECIMAL(10, 7) NOT NULL,
    district_code    VARCHAR(20),
    street_name      VARCHAR(200),
    phone            VARCHAR(20),
    opening_hours    VARCHAR(100),
    brand_focus      VARCHAR(100),
    is_verified      BOOLEAN     DEFAULT FALSE,
    status           VARCHAR(20) DEFAULT 'ACTIVE',
    added_by_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
    geom             GEOGRAPHY(POINT, 4326)
                     GENERATED ALWAYS AS (
                         ST_SetSRID(ST_MakePoint(lng::double precision, lat::double precision), 4326)::geography
                     ) STORED,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repair_geom   ON repair_shop USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_repair_status ON repair_shop(status) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS repair_service_type (
    service_code          VARCHAR(20)  PRIMARY KEY,
    service_name_ko       VARCHAR(100),
    service_name_vi       VARCHAR(100),
    service_name_en       VARCHAR(100),
    typical_duration_min  INT
);

INSERT INTO repair_service_type VALUES
    ('OIL_CHANGE',    '엔진오일 교체',  'Thay nhớt động cơ',   'Engine Oil Change',   30),
    ('TIRE',          '타이어 교체',    'Thay lốp xe',          'Tire Replacement',    45),
    ('CHAIN',         '체인 교체',      'Thay xích',            'Chain Replacement',   60),
    ('ENGINE',        '엔진 정비',      'Sửa động cơ',          'Engine Repair',      120),
    ('BRAKE',         '브레이크 패드',  'Thay má phanh',        'Brake Pad',           45),
    ('BATTERY',       '배터리 교체',    'Thay pin',             'Battery Replacement', 30),
    ('GENERAL_CHECK', '일반 점검',      'Bảo dưỡng tổng quát', 'General Maintenance', 60),
    ('WASH',          '세차',           'Rửa xe',               'Wash',                20)
ON CONFLICT (service_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS repair_review (
    review_id         BIGSERIAL   PRIMARY KEY,
    shop_id           BIGINT      NOT NULL REFERENCES repair_shop(shop_id) ON DELETE CASCADE,
    reviewer_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    service_code      VARCHAR(20) REFERENCES repair_service_type(service_code),
    motorcycle_model  VARCHAR(100),
    rating            SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    price_vnd         INT,
    comment           TEXT,
    photo_url         TEXT,
    is_anonymous      BOOLEAN     DEFAULT FALSE,
    reviewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    upvotes           INT         DEFAULT 0,
    flagged           BOOLEAN     DEFAULT FALSE,
    UNIQUE (shop_id, reviewer_user_id, service_code)
);
CREATE INDEX IF NOT EXISTS idx_review_shop ON repair_review(shop_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_user ON repair_review(reviewer_user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS repair_shop_stats AS
SELECT
    shop_id,
    COUNT(*)                                                AS review_count,
    ROUND(AVG(rating)::numeric, 1)                         AS avg_rating,
    AVG(price_vnd)::INT                                    AS avg_price,
    MAX(reviewed_at)                                       AS last_review_at
FROM repair_review
WHERE flagged = FALSE
GROUP BY shop_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_stats_shop ON repair_shop_stats(shop_id);

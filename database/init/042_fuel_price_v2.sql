-- ═══════════════════════════════════════════════════════════════════════════
-- 042 — Fuel Price v2 (3-source scraping + crowdsourcing)
-- 작업 지시서: docs/fuel-price-instructions.md
-- 활성 태스크: ai-docs/task/active/260527_fuel_price_pipeline_task.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- L1: 정부/브랜드 공식 참고가 스냅샷
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_price_snapshot (
    snapshot_id     BIGSERIAL PRIMARY KEY,
    effective_date  DATE        NOT NULL,
    effective_time  TIMESTAMPTZ NOT NULL,
    region          VARCHAR(10) NOT NULL CHECK (region IN ('VUNG_1', 'VUNG_2')),
    brand           VARCHAR(32) NOT NULL CHECK (brand IN (
        'PETROLIMEX', 'PVOIL', 'SAIGON_PETRO', 'MIPEC', 'COMECO', 'MARKET_AVG'
    )),
    fuel_type       VARCHAR(20) NOT NULL CHECK (fuel_type IN (
        'RON95_III', 'RON95_V', 'E5_RON92_II', 'DO_001S_V', 'DO_005S_II'
    )),
    price_vnd       INT         NOT NULL CHECK (price_vnd > 0),
    source          VARCHAR(64) NOT NULL,
    source_url      TEXT,
    raw_fetched_at  TIMESTAMPTZ NOT NULL,
    validated_by    JSONB,
    status          VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','REJECTED','PENDING')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (effective_date, region, brand, fuel_type, source)
);

CREATE INDEX IF NOT EXISTS idx_fuel_active
    ON fuel_price_snapshot(brand, fuel_type, effective_date DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_fuel_status_date
    ON fuel_price_snapshot(status, effective_date DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- L2: gas_station 확장 (브랜드 정규화 + 운영 메타)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE gas_station
    ADD COLUMN IF NOT EXISTS source_type       VARCHAR(30) DEFAULT 'OSM'
        CHECK (source_type IN ('OSM','GOOGLE','PETROLIMEX_OFFICIAL','PVOIL_OFFICIAL','USER_REPORTED')),
    ADD COLUMN IF NOT EXISTS external_id       VARCHAR(128),
    ADD COLUMN IF NOT EXISTS is_24h            BOOLEAN     DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS brand_normalized  VARCHAR(32);

UPDATE gas_station SET brand_normalized = CASE
    WHEN brand IS NULL                                                  THEN 'UNKNOWN'
    WHEN LOWER(brand) LIKE '%petrolimex%'                               THEN 'PETROLIMEX'
    WHEN LOWER(brand) LIKE '%pv%oil%' OR LOWER(brand) LIKE '%pvoil%'    THEN 'PVOIL'
    WHEN LOWER(brand) LIKE '%saigon petro%'
         OR LOWER(brand) LIKE '%sài gòn petro%'                         THEN 'SAIGON_PETRO'
    WHEN LOWER(brand) LIKE '%mipec%'                                    THEN 'MIPEC'
    WHEN LOWER(brand) LIKE '%comeco%'                                   THEN 'COMECO'
    ELSE 'UNKNOWN'
END
WHERE brand_normalized IS NULL;

CREATE INDEX IF NOT EXISTS idx_gas_brand_norm ON gas_station(brand_normalized);

-- ───────────────────────────────────────────────────────────────────────────
-- L3: 라이더 가격 제보 (v1 = 스키마만, 로직 v2)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_price_report (
    report_id       BIGSERIAL PRIMARY KEY,
    station_id      BIGINT      NOT NULL REFERENCES gas_station(station_id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fuel_type       VARCHAR(20) NOT NULL,
    price_vnd       INT         NOT NULL CHECK (price_vnd > 0),
    reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
    deviation_pct   DECIMAL(5, 2),
    photo_url       TEXT
);
CREATE INDEX IF NOT EXISTS idx_fuel_report_station ON fuel_price_report(station_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_report_user    ON fuel_price_report(user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 운영자 감사 로그
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_price_fetch_log (
    log_id          BIGSERIAL PRIMARY KEY,
    source          VARCHAR(64) NOT NULL,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(20) CHECK (status IN ('SUCCESS','FAILED','PARTIAL')),
    items_found     INT DEFAULT 0,
    items_inserted  INT DEFAULT 0,
    error_message   TEXT,
    raw_response    TEXT
);
CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON fuel_price_fetch_log(source, scheduled_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 백필: fuel_price_official → fuel_price_snapshot (MARKET_AVG)
-- 가장 최근 effective_from 한 행씩 fuel_type 별로
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO fuel_price_snapshot
    (effective_date, effective_time, region, brand, fuel_type, price_vnd,
     source, source_url, raw_fetched_at, validated_by, status)
SELECT
    fpo.effective_from AS effective_date,
    fpo.effective_from::timestamptz AS effective_time,
    'VUNG_1' AS region,
    'MARKET_AVG' AS brand,
    CASE
        WHEN fpo.fuel_type IN ('RON95', 'RON95_III') THEN 'RON95_III'
        WHEN fpo.fuel_type = 'RON95_V'                THEN 'RON95_V'
        WHEN fpo.fuel_type IN ('E5', 'E5_RON92', 'E5_RON92_II') THEN 'E5_RON92_II'
        WHEN fpo.fuel_type LIKE 'DO%001%'             THEN 'DO_001S_V'
        WHEN fpo.fuel_type LIKE 'DO%005%'             THEN 'DO_005S_II'
        ELSE 'RON95_III'
    END AS fuel_type,
    fpo.price_vnd,
    'legacy:fuel_price_official' AS source,
    fpo.source_url,
    fpo.created_at AS raw_fetched_at,
    '{"backfilled_from":"fuel_price_official"}'::jsonb AS validated_by,
    'SUPERSEDED' AS status
FROM fuel_price_official fpo
WHERE EXISTS (SELECT 1 FROM fuel_price_official) -- noop if empty
ON CONFLICT (effective_date, region, brand, fuel_type, source) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 폐기: fuel_price_official
-- ───────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS fuel_price_official;

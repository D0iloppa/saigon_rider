-- =====================================================
-- 050: 주유소 phone/url 컬럼 + UGC 제보 대기큐
--   - CSV(업체명·좌표·전화·URL) 시드를 담기 위한 phone/url 추가
--   - 사용자 제보는 gas_station 에 직접 쓰지 않고 submission 큐에 적재 →
--     admin 수동 검증(confirm) 시에만 gas_station 으로 upsert.
--   - 향후 AI 자동검증 스크립트가 status/review_note 를 기록할 수 있도록 개방.
-- =====================================================

ALTER TABLE gas_station ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE gas_station ADD COLUMN IF NOT EXISTS url   TEXT;

CREATE TABLE IF NOT EXISTS gas_station_submission (
    submission_id        BIGSERIAL    PRIMARY KEY,
    name                 VARCHAR(200) NOT NULL,
    lat                  DECIMAL(10, 7) NOT NULL,
    lng                  DECIMAL(10, 7) NOT NULL,
    phone                VARCHAR(30),
    brand                VARCHAR(50),
    brand_normalized     VARCHAR(32),
    district_code        VARCHAR(20),
    note                 TEXT,
    reporter_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
    review_note          TEXT,
    reviewed_at          TIMESTAMPTZ,
    resulting_station_id BIGINT       REFERENCES gas_station(station_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gas_sub_status ON gas_station_submission(status, created_at DESC);

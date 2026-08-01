-- =====================================================
-- 122: 장소 제안 대기큐 (동네지도 프로필 실배선 P-BE T2)
--   - gas_station_submission 패턴 미러 (050_gas_ugc.sql)
--   - 승인은 상태만 CONFIRMED 로 바꾸는 참고용 큐 — business_profile 자동 upsert 는 범위 밖.
-- =====================================================

CREATE TABLE IF NOT EXISTS place_submission (
    id               BIGSERIAL    PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    category         VARCHAR(30),
    address          VARCHAR(200),
    lat              DECIMAL(10, 7) NOT NULL,
    lng              DECIMAL(10, 7) NOT NULL,
    note             TEXT,
    reporter_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    status           VARCHAR(12)  NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
    review_note      TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reviewed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_place_submission_status ON place_submission(status, created_at DESC);

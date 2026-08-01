-- =====================================================
-- 053: 정비소 UGC 제보 대기큐
--   사용자 제보는 repair_shop 에 직접 쓰지 않고 submission 큐에 적재 →
--   admin 수동 검증(confirm) 시에만 repair_shop 으로 upsert.
--   향후 AI 자동검증 스크립트가 status/review_note 를 기록할 수 있도록 개방.
-- =====================================================

CREATE TABLE IF NOT EXISTS repair_shop_submission (
    submission_id        BIGSERIAL    PRIMARY KEY,
    name                 VARCHAR(200) NOT NULL,
    lat                  DECIMAL(10, 7) NOT NULL,
    lng                  DECIMAL(10, 7) NOT NULL,
    phone                VARCHAR(30),
    district_code        VARCHAR(20),
    note                 TEXT,
    reporter_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
    review_note          TEXT,
    reviewed_at          TIMESTAMPTZ,
    resulting_shop_id    BIGINT       REFERENCES repair_shop(shop_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_sub_status ON repair_shop_submission(status, created_at DESC);

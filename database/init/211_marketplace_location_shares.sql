-- ================================================================
-- 211_marketplace_location_shares.sql
-- 거래중 위치공유 강화 P2 (ai-docs/task/active/260827_deal_location_sharing_task.md §5)
-- 실시간 실측 좌표 전용 신규 테이블. 약속 핀(marketplace_appointments.place_lat/lng)
-- 과는 수명주기·삭제정책이 달라 분리한다 — 최신 1건만 보관(이력 미보관).
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_location_shares (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id   UUID NOT NULL REFERENCES marketplace_appointments(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat              NUMERIC(9, 6) NOT NULL,
    lng              NUMERIC(9, 6) NOT NULL,
    accuracy_m       INTEGER,
    consented_at     TIMESTAMPTZ NOT NULL,
    consent_version  VARCHAR(20) NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_location_shares_appointment_user_uq UNIQUE (appointment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_location_shares_appointment
    ON marketplace_location_shares (appointment_id);

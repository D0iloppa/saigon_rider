-- ================================================================
-- 091_marketplace_keyword_alerts.sql
-- 🔔 키워드 알림 (REF-08, 놀라움 층 §3)
--   유저가 키워드 구독 → 매칭 매물 등록 시 푸시(SGR-274 경로)
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_keyword_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword     VARCHAR(60) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_kw_alert ON marketplace_keyword_alerts (user_id, lower(keyword));
CREATE INDEX IF NOT EXISTS idx_mp_kw_alert_kw ON marketplace_keyword_alerts (lower(keyword));

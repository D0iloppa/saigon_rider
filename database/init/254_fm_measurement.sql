-- 254: FactMind 측정 — 봇 방문 기록(fm_bot_visit) / 공식 IP 피드 캐시(fm_bot_feed) / fm_event kind 에 ai_probe 추가. 멱등.
-- fm_bot_visit.ip·ua 는 VERIFIED 방문에만 저장(미들웨어 규칙) — 그 외는 null. 시드 INSERT 없음.
CREATE TABLE IF NOT EXISTS fm_bot_visit (
    id          BIGSERIAL PRIMARY KEY,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    bot_id      TEXT NOT NULL,
    verdict     TEXT NOT NULL CHECK (verdict IN ('VERIFIED', 'UNVERIFIED', 'UNKNOWN')),
    path        TEXT NOT NULL,
    path_kind   TEXT NOT NULL CHECK (path_kind IN ('profile', 'facts', 'list', 'sitemap', 'rss', 'key')),
    method      TEXT,
    ip          INET,
    ua          TEXT,
    evidence    JSONB
);
CREATE INDEX IF NOT EXISTS ix_fm_bot_visit_observed ON fm_bot_visit (observed_at DESC);
CREATE INDEX IF NOT EXISTS ix_fm_bot_visit_bot ON fm_bot_visit (bot_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS fm_bot_feed (
    feed_id      TEXT PRIMARY KEY,
    networks     JSONB NOT NULL,
    sha          TEXT NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE fm_event DROP CONSTRAINT IF EXISTS fm_event_kind_check;
ALTER TABLE fm_event ADD CONSTRAINT fm_event_kind_check CHECK (kind IN ('publish', 'verify', 'withdraw', 'index_notified', 'site_report', 'diagnosis', 'console_coverage', 'ai_probe'));

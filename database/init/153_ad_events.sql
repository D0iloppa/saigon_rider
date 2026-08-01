-- ================================================================
-- 153_ad_events.sql
--
-- 광고 성과 계측 — 원시 이벤트 테이블 (ai-docs/spec/ad-performance-metrics.md §4-2).
-- 이번 단계는 데이터 모델만 생성한다. 수집 엔드포인트/워커(§3, B-1~B-7)는
-- 후속 단계 — ADS_ENABLED(lib/adPlacement.ts) 가 꺼져 있어 채울 이벤트가 없다.
--
-- 멱등(IF NOT EXISTS). fresh volume(docker-entrypoint-initdb.d) 자동적용 +
-- 기존 volume 수동 psql 적용 둘 다 안전.
-- ================================================================

CREATE TABLE IF NOT EXISTS ad_events (
    id                  BIGSERIAL PRIMARY KEY,
    ad_id               UUID NOT NULL REFERENCES marketplace_ads(id) ON DELETE CASCADE,
    business_profile_id UUID NULL REFERENCES business_profile(id) ON DELETE SET NULL,
    event_type          VARCHAR(24) NOT NULL,
    surface             VARCHAR(24) NOT NULL,
    user_key            UUID NULL,
    anon_key            CHAR(32) NULL,
    is_self             BOOLEAN NOT NULL DEFAULT FALSE,
    attributed_ad_id    UUID NULL,
    occurred_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stat_date           DATE NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_events_event_type_check'
  ) THEN
    ALTER TABLE ad_events
      ADD CONSTRAINT ad_events_event_type_check
      CHECK (event_type IN (
        'impression', 'click', 'cta_call', 'cta_follow', 'cta_favorite',
        'cta_review', 'cta_news_view', 'cta_profile_enter', 'cta_share'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_events_ad_date_type ON ad_events(ad_id, stat_date, event_type);
CREATE INDEX IF NOT EXISTS idx_ad_events_profile_date ON ad_events(business_profile_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_ad_events_stat_date ON ad_events(stat_date);
CREATE INDEX IF NOT EXISTS idx_ad_events_user_ad_occurred
  ON ad_events(user_key, ad_id, occurred_at DESC) WHERE user_key IS NOT NULL;

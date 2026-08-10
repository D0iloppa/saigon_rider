-- ================================================================
-- 174_proximity_policy.sql
--
-- 근접 광고(Proximity Ad) 백엔드 1단계 — ai-docs/260806_proximity_ad_design.md §5, §9-1.
--
-- proximity_policy: 정책 파라미터 단일 row(id=1). is_enabled=FALSE 킬스위치로 시작 —
-- 이 마이그레이션은 무동작 상태로 병합된다(오픈을 막지 않음).
-- proximity_hit: 근접 진입 상태·쿨다운·방문 적립 근거.
-- ad_events.event_type CHECK 확장: 'proximity_impression'/'proximity_visit' 추가.
-- (surface 컬럼은 CHECK 제약이 없는 VARCHAR(24) 자유값이라 별도 확장 불필요 — 153_ad_events.sql 확인.)
--
-- 멱등(IF NOT EXISTS / DROP+ADD CONSTRAINT 가드). fresh volume 자동적용 + 기존 volume 수동 psql 둘 다 안전.
-- ================================================================

CREATE TABLE IF NOT EXISTS proximity_policy (
    id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    notify_radius_m         INTEGER NOT NULL DEFAULT 300,
    visit_radius_m          INTEGER NOT NULL DEFAULT 50,
    visit_dwell_sec         INTEGER NOT NULL DEFAULT 120,
    cooldown_hours          INTEGER NOT NULL DEFAULT 24,
    daily_notify_cap        INTEGER NOT NULL DEFAULT 2,
    daily_rp_cap            INTEGER NOT NULL DEFAULT 3,
    max_speed_kmh           INTEGER NOT NULL DEFAULT 120,
    candidate_radius_m      INTEGER NOT NULL DEFAULT 3000,
    is_enabled              BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO proximity_policy (id, notify_radius_m, visit_radius_m, visit_dwell_sec, cooldown_hours,
                               daily_notify_cap, daily_rp_cap, max_speed_kmh, candidate_radius_m, is_enabled)
VALUES (1, 300, 50, 120, 24, 2, 3, 120, 3000, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS proximity_hit (
    id                  BIGSERIAL PRIMARY KEY,
    user_key            UUID NOT NULL,
    business_profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    ad_id               UUID NULL REFERENCES marketplace_ads(id) ON DELETE SET NULL,
    hit_lat             DOUBLE PRECISION NOT NULL,
    hit_lng             DOUBLE PRECISION NOT NULL,
    distance_m          INTEGER NOT NULL,
    notified_at         TIMESTAMPTZ NULL,
    visit_confirmed_at  TIMESTAMPTZ NULL,
    rp_granted          BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proximity_hit_user_biz_occurred
  ON proximity_hit (user_key, business_profile_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_proximity_hit_user_occurred
  ON proximity_hit (user_key, occurred_at DESC);

ALTER TABLE ad_events DROP CONSTRAINT IF EXISTS ad_events_event_type_check;
ALTER TABLE ad_events
  ADD CONSTRAINT ad_events_event_type_check
  CHECK (event_type IN (
    'impression', 'click', 'cta_call', 'cta_follow', 'cta_favorite',
    'cta_review', 'cta_news_view', 'cta_profile_enter', 'cta_share',
    'proximity_impression', 'proximity_visit'
  ));

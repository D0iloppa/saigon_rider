-- ================================================================
-- 154_ad_daily_stats.sql
--
-- 광고 성과 계측 — 일별 롤업 테이블 (ai-docs/spec/ad-performance-metrics.md §4-3).
-- 대시보드/조회 API 는 이 테이블만 읽는다 (ad_events 원시 스캔 금지).
-- 롤업 배치(B-7, jobs/rollup_ad_stats.py)는 후속 단계 — 지금은 테이블만 생성되고
-- 채우는 잡이 없으므로 항상 비어 있다(정상 상태).
--
-- 멱등(IF NOT EXISTS).
-- ================================================================

-- ad_id 는 marketplace_ads(id) 를 가리키지만 FK 제약을 걸지 않는다: 광고 행이 삭제돼도
-- 이 롤업은 영구 보존돼야 하는 청구 근거이기 때문이다(§4-3 "비용 지표는 저장하지 않는다"
-- 및 "원시는 90일 삭제, 롤업은 영구 보존"). ad_id 가 (ad_id, stat_date, surface) PK 의
-- 일부라 NOT NULL 이 강제돼 ON DELETE SET NULL 도 쓸 수 없다 — FK 자체를 두지 않는다.
CREATE TABLE IF NOT EXISTS ad_daily_stats (
    ad_id               UUID NOT NULL,
    stat_date           DATE NOT NULL,
    surface             VARCHAR(24) NOT NULL,
    business_profile_id UUID NULL,
    impressions         INTEGER NOT NULL DEFAULT 0,
    reach               INTEGER NOT NULL DEFAULT 0,
    clicks              INTEGER NOT NULL DEFAULT 0,
    cta_call            INTEGER NOT NULL DEFAULT 0,
    cta_follow          INTEGER NOT NULL DEFAULT 0,
    cta_favorite        INTEGER NOT NULL DEFAULT 0,
    cta_review          INTEGER NOT NULL DEFAULT 0,
    cta_secondary       INTEGER NOT NULL DEFAULT 0,
    self_impressions    INTEGER NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ad_id, stat_date, surface)
);

CREATE INDEX IF NOT EXISTS idx_ad_daily_stats_profile_date ON ad_daily_stats(business_profile_id, stat_date);

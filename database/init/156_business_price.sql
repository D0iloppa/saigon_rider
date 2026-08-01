-- ================================================================
-- 156_business_price.sql
-- 업체 가격표 (파트너 라운지 가격표 등록 — 대표 지적사항: "가격표 등록을 할 수 없다")
--   business_news(118_business_news.sql) 컬럼·인덱스 스타일 미러.
-- ================================================================

CREATE TABLE IF NOT EXISTS business_price (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    name       VARCHAR(120) NOT NULL,
    price_vnd  INTEGER NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_price_profile_sort
    ON business_price (profile_id, sort_order);

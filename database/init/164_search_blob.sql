-- 다국어 검색: 엔티티별 정규화 검색 blob 컬럼 + pg_trgm GIN 인덱스.
-- 260801_multilingual_search_design.md §4.2/§5(P2) 그대로. 멱등(기존 볼륨 재적용 안전).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE business_profile     ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE business_news        ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE feed_posts           ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE marketplace_ads      ADD COLUMN IF NOT EXISTS search_blob text;

-- 인덱스는 coalesce(search_blob,'') 표현식으로 건다 — 쿼리(market.py/biz.py)가 NULL 방어를 위해
-- COALESCE 로 감싸는데, 일반 컬럼 GIN 인덱스는 그 표현식과 매칭되지 않아 플래너가 Seq Scan 으로
-- 폴백한다(실측 확인: coalesce(search_blob,'') like ... 는 plain gin(search_blob) 인덱스를 안 탄다).
-- 표현식 인덱스로 걸면 쿼리의 COALESCE 표현식과 정확히 매칭돼 Bitmap Index Scan 이 된다.
CREATE INDEX IF NOT EXISTS idx_listings_search_blob ON marketplace_listings USING gin ((coalesce(search_blob, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_biz_search_blob      ON business_profile     USING gin ((coalesce(search_blob, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_biz_news_search_blob ON business_news        USING gin ((coalesce(search_blob, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_feed_search_blob     ON feed_posts           USING gin ((coalesce(search_blob, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ads_search_blob      ON marketplace_ads      USING gin ((coalesce(search_blob, '')) gin_trgm_ops);

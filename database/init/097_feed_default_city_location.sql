-- ================================================================
-- 097_feed_default_city_location.sql  (SGR-287)
-- 위치 없는 기존 피드 글을 기본 동네(Bến Thành, 지도 default ward) 좌표·구로 보정.
--   → 동네지도/동네피드(위치 기반 필터)에 노출되도록.
-- 신규 글은 작성 시 현위치 자동 첨부(FeedCreate). 멱등(latitude NULL 만 대상).
-- ================================================================

UPDATE feed_posts
   SET latitude = d.center_lat,
       longitude = d.center_lng,
       district_id = d.id
  FROM districts d
 WHERE d.code = 'BEN_THANH'
   AND feed_posts.latitude IS NULL;

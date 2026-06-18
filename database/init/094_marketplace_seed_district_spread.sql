-- ================================================================
-- 094_marketplace_seed_district_spread.sql  (SGR-296)
-- seed 매물이 전부 한 구(BEN_THANH)에 몰려 피드가 비현실적 → 여러 구로 분산.
--   · 기존 9개 매물을 created_at 순서로 구에 배정 + 좌표를 해당 구 center 로.
-- 개발용 seed 보정. 멱등(고정 매핑 재적용).
-- ================================================================

WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM marketplace_listings
),
assign(rn, code) AS (
    VALUES (1, 'BINH_THANH'), (2, 'QUAN_1'), (3, 'QUAN_7'), (4, 'PHU_NHUAN'),
           (5, 'THU_DUC'), (6, 'GO_VAP'), (7, 'TAN_BINH'), (8, 'QUAN_3'), (9, 'BEN_THANH')
)
UPDATE marketplace_listings l
   SET district_id = d.id,
       latitude    = d.center_lat,
       longitude   = d.center_lng
  FROM ranked r
  JOIN assign a ON a.rn = r.rn
  JOIN districts d ON d.code = a.code
 WHERE l.id = r.id;

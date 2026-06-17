-- ================================================================
-- 090_marketplace_price_drop.sql
-- 가격내림 (REF-08, 놀라움 층 §3)
--   original_price_vnd : 인하 직전 기준가. price_vnd < original 이면 '가격내림'.
--   원가 이상으로 올리면 NULL 로 리셋.
-- ================================================================

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS original_price_vnd BIGINT;

-- seed 시연: 미쉐린 타이어 750k → 620k 인하('가격내림' 배지)
UPDATE marketplace_listings
SET original_price_vnd = 750000
WHERE id = 'a0000000-0000-4000-8000-000000000002' AND price_vnd = 620000;

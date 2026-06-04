-- =====================================================
-- 055: repair_shop.phone 폭 확장 (20 → 30)
--   제보 큐 repair_shop_submission.phone 는 VARCHAR(30) (제보 API max_length=30)인데
--   repair_shop.phone 이 VARCHAR(20) 이라, admin 승인 시 21자↑ 전화 INSERT 가 실패(500).
--   gas_station.phone(30) 과도 폭 통일.
-- =====================================================

ALTER TABLE repair_shop ALTER COLUMN phone TYPE VARCHAR(30);

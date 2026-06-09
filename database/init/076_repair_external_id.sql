-- =====================================================
-- 076: repair_shop 보강용 컬럼 추가 (gas_station 와 동일 패턴)
--   external_id(Google place_id) + source_type. 077(OSM)/078(Google) 시드의 전제.
--   partial unique index 로 멱등 ON CONFLICT 지원. 기존 052 CSV 240건은 source_type NULL(legacy).
-- =====================================================

ALTER TABLE repair_shop ADD COLUMN IF NOT EXISTS external_id varchar(128);
ALTER TABLE repair_shop ADD COLUMN IF NOT EXISTS source_type varchar(30);
CREATE UNIQUE INDEX IF NOT EXISTS repair_shop_external_id_uidx ON repair_shop(external_id) WHERE external_id IS NOT NULL;

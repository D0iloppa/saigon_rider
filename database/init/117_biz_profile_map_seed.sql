-- ================================================================
-- 117_biz_profile_map_seed.sql  (SGR-322 P1-2)
-- 동네지도 업체 핀 레이어 QA 용 — 114 의 dev business_profile 5건에
-- 실좌표(구별 분산) + category 배정
--   전제: 114_business_dev_migration.sql (business_profile dev 시드 5건,
--         name = users.nickname 그대로 유지)
--
-- 배정 (name LIKE 는 098/114 의 dev 시드 표기 관례 그대로 사용):
--   [DEV] Bình Thạnh Moto Care  → Bình Thạnh,  category=repair
--   [DEV] Quận 1 Parts & Gear   → Quận 1,      category=parts
--   [DEV] Thủ Đức Tire & Oil    → Quận 3,      category=wash
--   [DEV] Quận 7 Scooter Mart   → Quận 7,      category=food
--   [DEV] Saigon Rider Shop     → Phú Nhuận,   category=cafe
--
-- 멱등성: UPDATE ... WHERE name LIKE — 재실행해도 동일 값으로 덮어씀.
-- ================================================================

DO $dev_seed$
BEGIN
IF current_setting('app.seed_profile', true) IN ('development', 'dev', 'local', 'test') THEN
UPDATE business_profile SET latitude = 10.804100, longitude = 106.710800, category = 'repair'
WHERE name LIKE '[DEV] Bình Thạnh%';

UPDATE business_profile SET latitude = 10.776900, longitude = 106.700900, category = 'parts'
WHERE name LIKE '[DEV] Quận 1%';

UPDATE business_profile SET latitude = 10.784300, longitude = 106.687100, category = 'wash'
WHERE name LIKE '[DEV] Thủ Đức%';

UPDATE business_profile SET latitude = 10.729500, longitude = 106.718300, category = 'food'
WHERE name LIKE '[DEV] Quận 7%';

UPDATE business_profile SET latitude = 10.799100, longitude = 106.679700, category = 'cafe'
WHERE name LIKE '[DEV] Saigon Rider%';
END IF;
END
$dev_seed$;

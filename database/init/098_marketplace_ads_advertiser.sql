-- ================================================================
-- 098_marketplace_ads_advertiser.sql
-- 광고 기능 강화:
--   1) marketplace_ads 에 phone / address / owner_id 컬럼 추가
--   2) users 에 is_advertiser 플래그 추가
--   3) seed 광고주 계정 생성 후 기존 [DEV] 광고에 연결
-- ================================================================

-- 1) users 에 is_advertiser 플래그
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_advertiser BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) marketplace_ads 연락처/주소/owner_id
ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS phone   VARCHAR(30);
ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS address VARCHAR(200);
ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3) seed 광고주 계정 (가맹 계정, 일반 가입 아님)
INSERT INTO users (id, phone, nickname, is_advertiser, created_at, updated_at)
VALUES
    ('a1000000-0000-0000-0000-000000000001', '+84-ADV-001', '[DEV] Bình Thạnh Moto Care',  TRUE, NOW(), NOW()),
    ('a1000000-0000-0000-0000-000000000002', '+84-ADV-002', '[DEV] Quận 1 Parts & Gear',   TRUE, NOW(), NOW()),
    ('a1000000-0000-0000-0000-000000000003', '+84-ADV-003', '[DEV] Thủ Đức Tire & Oil',    TRUE, NOW(), NOW()),
    ('a1000000-0000-0000-0000-000000000004', '+84-ADV-004', '[DEV] Quận 7 Scooter Mart',   TRUE, NOW(), NOW()),
    ('a1000000-0000-0000-0000-000000000005', '+84-ADV-005', '[DEV] Saigon Rider Shop',      TRUE, NOW(), NOW())
ON CONFLICT (phone) DO NOTHING;

-- 4) 기존 [DEV] 광고에 연락처·주소·owner 연결
UPDATE marketplace_ads SET
    phone    = '028-3800-0001',
    address  = '12 Xô Viết Nghệ Tĩnh, Bình Thạnh, TP.HCM',
    owner_id = 'a1000000-0000-0000-0000-000000000001'::uuid
WHERE partner_name LIKE '[DEV] Bình Thạnh%';

UPDATE marketplace_ads SET
    phone    = '028-3820-0002',
    address  = '45 Lê Lai, Quận 1, TP.HCM',
    owner_id = 'a1000000-0000-0000-0000-000000000002'::uuid
WHERE partner_name LIKE '[DEV] Quận 1%';

UPDATE marketplace_ads SET
    phone    = '028-3722-0003',
    address  = '78 Võ Văn Ngân, Thủ Đức, TP.HCM',
    owner_id = 'a1000000-0000-0000-0000-000000000003'::uuid
WHERE partner_name LIKE '[DEV] Thủ Đức%';

UPDATE marketplace_ads SET
    phone    = '028-5413-0004',
    address  = '99 Nguyễn Thị Thập, Quận 7, TP.HCM',
    owner_id = 'a1000000-0000-0000-0000-000000000004'::uuid
WHERE partner_name LIKE '[DEV] Quận 7%';

UPDATE marketplace_ads SET
    phone    = '1800-0005',
    address  = 'Toàn quốc (giao hàng tận nơi)',
    owner_id = 'a1000000-0000-0000-0000-000000000005'::uuid
WHERE partner_name LIKE '[DEV] Saigon Rider%';

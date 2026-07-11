-- ================================================================
-- 119_business_category.sql  (W3-BE T1)
-- 업체 카테고리 DB화(오토바이 생활권 15종, 그룹 4종) — 하드코딩 5종 대체
--   기존 지도 카테고리(repair/parts/wash/food/cafe)와 코드 호환 유지.
--
-- 레거시 정규화: BizApply(business_profile.category)는 지도와 다른
--   taxonomy(restaurant/retail/service/other)를 써온 선재 버그 — 신규
--   15종 코드로 맞춘 뒤 FK 로 강제.
-- ================================================================

CREATE TABLE IF NOT EXISTS business_category (
    code             VARCHAR(30)  PRIMARY KEY,
    group_code       VARCHAR(20)  NOT NULL,
    group_label_ko   VARCHAR(40)  NOT NULL,
    group_label_vi   VARCHAR(40)  NOT NULL,
    group_label_en   VARCHAR(40)  NOT NULL,
    group_sort_order SMALLINT     NOT NULL DEFAULT 0,
    icon             VARCHAR(30)  NOT NULL,
    label_ko         VARCHAR(40)  NOT NULL,
    label_vi         VARCHAR(40)  NOT NULL,
    label_en         VARCHAR(40)  NOT NULL,
    sort_order       SMALLINT     NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ── 시드 15종 (ON CONFLICT DO NOTHING — 재실행 안전) ─────────────
INSERT INTO business_category
    (code, group_code, group_label_ko, group_label_vi, group_label_en, group_sort_order,
     icon, label_ko, label_vi, label_en, sort_order)
VALUES
    ('repair',       'MAINTENANCE', '정비·관리', 'Bảo dưỡng',            'Maintenance',      1, 'repair',       '정비/수리',   'Sửa xe',              'Repair',                1),
    ('wash',         'MAINTENANCE', '정비·관리', 'Bảo dưỡng',            'Maintenance',      1, 'wash',         '세차',        'Rửa xe',              'Car wash',              2),
    ('tire',         'MAINTENANCE', '정비·관리', 'Bảo dưỡng',            'Maintenance',      1, 'tire',         '타이어',      'Lốp xe',              'Tires',                 3),
    ('fuel',         'MAINTENANCE', '정비·관리', 'Bảo dưỡng',            'Maintenance',      1, 'fuel',         '주유·충전',   'Xăng & sạc điện',     'Fuel & charging',       4),
    ('parts',        'SHOPPING',    '구매·장비', 'Mua sắm & đồ nghề',    'Shopping & gear',  2, 'parts',        '용품',        'Phụ tùng',            'Parts',                 1),
    ('gear',         'SHOPPING',    '구매·장비', 'Mua sắm & đồ nghề',    'Shopping & gear',  2, 'gear',         '헬멧·보호구', 'Đồ bảo hộ',           'Gear',                  2),
    ('accessory',    'SHOPPING',    '구매·장비', 'Mua sắm & đồ nghề',    'Shopping & gear',  2, 'accessory',    '튜닝·액세서리', 'Phụ kiện độ xe',    'Accessories',           3),
    ('cafe',         'FOOD_REST',   '먹거리·휴식', 'Ăn uống & nghỉ ngơi', 'Food & rest',    3, 'cafe',         '카페',        'Cà phê',              'Cafe',                  1),
    ('food',         'FOOD_REST',   '먹거리·휴식', 'Ăn uống & nghỉ ngơi', 'Food & rest',    3, 'food',         '음식',        'Đồ ăn',               'Food',                  2),
    ('convenience',  'FOOD_REST',   '먹거리·휴식', 'Ăn uống & nghỉ ngơi', 'Food & rest',    3, 'convenience',  '편의점',      'Cửa hàng tiện lợi',   'Convenience store',     3),
    ('parking',      'SERVICE',     '생활 서비스', 'Dịch vụ',             'Services',       4, 'parking',      '주차장',      'Bãi đỗ xe',           'Parking',               1),
    ('laundry',      'SERVICE',     '생활 서비스', 'Dịch vụ',             'Services',       4, 'laundry',      '세탁',        'Giặt ủi',             'Laundry',               2),
    ('phone_repair', 'SERVICE',     '생활 서비스', 'Dịch vụ',             'Services',       4, 'phone_repair', '폰수리',      'Sửa điện thoại',      'Phone repair',          3),
    ('towing',       'SERVICE',     '생활 서비스', 'Dịch vụ',             'Services',       4, 'towing',       '견인·출동',   'Cứu hộ xe',           'Towing & roadside',     4),
    ('etc',          'SERVICE',     '생활 서비스', 'Dịch vụ',             'Services',       4, 'etc',          '기타',        'Khác',                'Other',                 5)
ON CONFLICT (code) DO NOTHING;

-- ── 레거시 taxonomy 정규화 (BizApply 이원화 선재 버그 해소) ──────
UPDATE business_profile SET category = 'food'  WHERE category = 'restaurant';
UPDATE business_profile SET category = 'parts' WHERE category = 'retail';
UPDATE business_profile SET category = 'etc'   WHERE category IN ('service', 'other');

-- ── FK 추가 (재실행 안전 — 존재 여부 확인 후 추가) ────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_profile_category'
    ) THEN
        ALTER TABLE business_profile
            ADD CONSTRAINT fk_business_profile_category
            FOREIGN KEY (category) REFERENCES business_category(code)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- ================================================================
-- 092_marketplace_category_tree.sql  (SGR-298)
-- 카테고리 SoT 재설계: 오토바이 한정 → 중고물품 전체 2-depth 트리
--   · parent_id (self-FK) + depth 추가
--   · 당근마켓 중고거래 대분류 벤치마크(베이스 A) + 오토바이 가지 강화
--   · 기존 flat 4종(PARTS/GEAR/ACCESSORY/BIKE)은 '오토바이' 가지로 재매핑
--     (id 보존 → 기존 매물 category_id FK 무손상)
--   · 사용자 입력 ❌ — 사전 구축 트리에 id만 연결(AI 자동분류 대비)
-- 멱등: fresh init(084→092) / 기존 dev 수동적용 모두 안전
-- ================================================================

-- ── 1. 트리 컬럼 ────────────────────────────────────────────────
ALTER TABLE marketplace_categories
    ADD COLUMN IF NOT EXISTS parent_id SMALLINT REFERENCES marketplace_categories(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS depth     SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mp_categories_parent ON marketplace_categories (parent_id, sort_order);

-- ── 2. 대분류 (depth 0) ─────────────────────────────────────────
-- 오토바이를 최상단(우리 버티컬). 나머지는 당근 중고거래 대분류 벤치마크.
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth) VALUES
    ('MOTORCYCLE',    '오토바이',       'Xe máy',          'Motorcycle',      '🛵',  1, 0),
    ('DIGITAL',       '디지털기기',     'Thiết bị số',     'Digital devices', '📱',  2, 0),
    ('APPLIANCE',     '생활가전',       'Đồ điện gia dụng','Appliances',      '🔌',  3, 0),
    ('FURNITURE',     '가구·인테리어',  'Nội thất',        'Furniture',       '🛋️', 4, 0),
    ('LIVING',        '생활·주방',      'Đồ gia dụng',     'Living & kitchen','🍴',  5, 0),
    ('KIDS',          '유아동',         'Đồ trẻ em',       'Kids',            '🧸',  6, 0),
    ('WOMEN_FASHION', '여성패션',       'Thời trang nữ',   'Women fashion',   '👗',  7, 0),
    ('MEN_FASHION',   '남성패션',       'Thời trang nam',  'Men fashion',     '👔',  8, 0),
    ('BEAUTY',        '뷰티·미용',      'Làm đẹp',         'Beauty',          '💄',  9, 0),
    ('SPORTS',        '스포츠·레저',    'Thể thao',        'Sports & leisure','⚽', 10, 0),
    ('HOBBY',         '취미·게임·음반', 'Sở thích',        'Hobby & games',   '🎮', 11, 0),
    ('BOOK',          '도서',           'Sách',            'Books',           '📚', 12, 0),
    ('TICKET',        '티켓·교환권',    'Vé & Voucher',    'Tickets',         '🎫', 13, 0),
    ('FOOD',          '가공식품',       'Thực phẩm',       'Food',            '🍱', 14, 0),
    ('PET',           '반려동물용품',   'Thú cưng',        'Pet supplies',    '🐶', 15, 0),
    ('PLANT',         '식물',           'Cây cảnh',        'Plants',          '🪴', 16, 0),
    ('ETC',           '기타 중고물품',  'Đồ khác',         'Other',           '📦', 99, 0)
ON CONFLICT (code) DO NOTHING;

-- ── 3. 기존 4종을 '오토바이' 가지로 재매핑 (id·code 보존) ───────
UPDATE marketplace_categories
   SET parent_id = (SELECT id FROM marketplace_categories WHERE code = 'MOTORCYCLE'),
       depth = 1,
       sort_order = CASE code
           WHEN 'PARTS'     THEN 1
           WHEN 'GEAR'      THEN 2
           WHEN 'ACCESSORY' THEN 3
           WHEN 'BIKE'      THEN 4
       END
 WHERE code IN ('PARTS', 'GEAR', 'ACCESSORY', 'BIKE');

-- ── 4. 중분류 (depth 1) ─────────────────────────────────────────
-- 오토바이: 기존 4종 외 부족분 보강
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('MOTO_OIL',    '오일·소모품',  'Dầu nhớt & vật tư', 'Oil & consumables', 5),
    ('MOTO_HELMET', '헬멧',         'Mũ bảo hiểm',       'Helmets',           6)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'MOTORCYCLE'
ON CONFLICT (code) DO NOTHING;

-- 디지털기기
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('DIGITAL_PHONE',    '휴대폰',     'Điện thoại',     'Phones',      1),
    ('DIGITAL_LAPTOP',   '노트북·PC',  'Laptop & PC',    'Laptop & PC', 2),
    ('DIGITAL_TABLET',   '태블릿',     'Máy tính bảng',  'Tablets',     3),
    ('DIGITAL_CAMERA',   '카메라',     'Máy ảnh',        'Cameras',     4),
    ('DIGITAL_AUDIO',    '음향기기',   'Thiết bị âm thanh','Audio',     5),
    ('DIGITAL_GAME',     '게임기',     'Máy chơi game',  'Consoles',    6),
    ('DIGITAL_WEARABLE', '웨어러블',   'Thiết bị đeo',   'Wearables',   7),
    ('DIGITAL_ETC',      '기타 디지털','Số khác',        'Other digital',8)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'DIGITAL'
ON CONFLICT (code) DO NOTHING;

-- 생활가전
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('APP_FRIDGE',  '냉장고',     'Tủ lạnh',       'Refrigerators',  1),
    ('APP_WASHER',  '세탁기',     'Máy giặt',      'Washers',        2),
    ('APP_AIRCON',  '에어컨',     'Máy lạnh',      'Air conditioners',3),
    ('APP_TV',      '영상가전',   'TV & màn hình', 'TV & display',   4),
    ('APP_KITCHEN', '주방가전',   'Đồ bếp điện',   'Kitchen appliances',5),
    ('APP_CLEANER', '청소기',     'Máy hút bụi',   'Cleaners',       6),
    ('APP_ETC',     '기타 가전',  'Điện máy khác', 'Other appliances',7)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'APPLIANCE'
ON CONFLICT (code) DO NOTHING;

-- 가구·인테리어
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('FUR_BED',    '침대·매트리스','Giường & nệm',  'Beds',         1),
    ('FUR_SOFA',   '소파',         'Sofa',          'Sofas',        2),
    ('FUR_DESK',   '책상·의자',    'Bàn & ghế',     'Desks & chairs',3),
    ('FUR_STORAGE','수납·옷장',    'Tủ & kệ',       'Storage',      4),
    ('FUR_LIGHT',  '조명',         'Đèn',           'Lighting',     5),
    ('FUR_DECO',   '인테리어소품', 'Đồ trang trí',  'Decor',        6),
    ('FUR_ETC',    '기타 가구',    'Nội thất khác', 'Other furniture',7)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'FURNITURE'
ON CONFLICT (code) DO NOTHING;

-- 생활·주방
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('LIV_KITCHEN','주방용품',   'Đồ bếp',        'Kitchenware',  1),
    ('LIV_TABLE',  '식기',       'Bát đĩa',       'Tableware',    2),
    ('LIV_TOOL',   '공구·산업',  'Dụng cụ',       'Tools',        3),
    ('LIV_ETC',    '생활용품',   'Đồ dùng khác',  'Living goods', 4)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'LIVING'
ON CONFLICT (code) DO NOTHING;

-- 유아동
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('KIDS_CLOTHES','유아동 의류','Quần áo trẻ em','Kids clothes', 1),
    ('KIDS_GEAR',   '유모차·카시트','Xe đẩy & ghế','Strollers',   2),
    ('KIDS_TOY',    '완구',       'Đồ chơi',       'Toys',         3),
    ('KIDS_FUR',    '유아동 가구','Nội thất trẻ em','Kids furniture',4),
    ('KIDS_ETC',    '기타 유아동','Trẻ em khác',   'Other kids',   5)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'KIDS'
ON CONFLICT (code) DO NOTHING;

-- 여성패션
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('WF_CLOTHES','여성의류', 'Quần áo nữ', 'Women clothes', 1),
    ('WF_SHOES',  '여성신발', 'Giày nữ',    'Women shoes',   2),
    ('WF_BAG',    '여성가방', 'Túi nữ',     'Women bags',    3),
    ('WF_ACC',    '여성잡화', 'Phụ kiện nữ','Women accessories',4)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'WOMEN_FASHION'
ON CONFLICT (code) DO NOTHING;

-- 남성패션
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('MF_CLOTHES','남성의류', 'Quần áo nam', 'Men clothes', 1),
    ('MF_SHOES',  '남성신발', 'Giày nam',    'Men shoes',   2),
    ('MF_BAG',    '남성가방', 'Túi nam',     'Men bags',    3),
    ('MF_ACC',    '남성잡화', 'Phụ kiện nam','Men accessories',4)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'MEN_FASHION'
ON CONFLICT (code) DO NOTHING;

-- 뷰티·미용
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('BEAUTY_SKIN',  '스킨케어',   'Chăm sóc da', 'Skincare',  1),
    ('BEAUTY_MAKEUP','메이크업',   'Trang điểm',  'Makeup',    2),
    ('BEAUTY_PERFUME','향수',      'Nước hoa',    'Perfume',   3),
    ('BEAUTY_HAIR',  '헤어·바디',  'Tóc & body',  'Hair & body',4),
    ('BEAUTY_DEVICE','미용기기',   'Máy làm đẹp', 'Beauty devices',5)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'BEAUTY'
ON CONFLICT (code) DO NOTHING;

-- 스포츠·레저
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('SPT_FITNESS','헬스·요가', 'Gym & yoga',  'Fitness',  1),
    ('SPT_CYCLE',  '자전거',    'Xe đạp',      'Bicycles', 2),
    ('SPT_GOLF',   '골프',      'Golf',        'Golf',     3),
    ('SPT_CAMPING','캠핑',      'Cắm trại',    'Camping',  4),
    ('SPT_ETC',    '기타 스포츠','Thể thao khác','Other sports',5)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'SPORTS'
ON CONFLICT (code) DO NOTHING;

-- 취미·게임·음반
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('HOB_GAME',   '게임',       'Game',         'Games',      1),
    ('HOB_MUSIC',  '음반·악기',  'Nhạc cụ & đĩa','Music',      2),
    ('HOB_COLLECT','수집품',     'Đồ sưu tầm',   'Collectibles',3),
    ('HOB_ART',    '미술·공예',  'Mỹ thuật',     'Art & craft',4),
    ('HOB_ETC',    '기타 취미',  'Sở thích khác','Other hobby',5)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'HOBBY'
ON CONFLICT (code) DO NOTHING;

-- 도서
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('BOOK_GENERAL','일반도서',     'Sách phổ thông','General books',1),
    ('BOOK_TEXT',   '교재·참고서',  'Sách giáo khoa','Textbooks',   2),
    ('BOOK_COMIC',  '만화책',       'Truyện tranh',  'Comics',      3),
    ('BOOK_KIDS',   '유아·아동도서','Sách thiếu nhi','Kids books',  4)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'BOOK'
ON CONFLICT (code) DO NOTHING;

-- 티켓·교환권
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('TKT_VOUCHER','상품권·기프티콘','Voucher',    'Vouchers', 1),
    ('TKT_EVENT',  '공연·전시',      'Sự kiện',    'Events',   2),
    ('TKT_TRAVEL', '여행·숙박',      'Du lịch',    'Travel',   3)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'TICKET'
ON CONFLICT (code) DO NOTHING;

-- 가공식품
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('FOOD_PROCESSED','가공식품',  'Thực phẩm chế biến','Processed food',1),
    ('FOOD_HEALTH',   '건강식품',  'Thực phẩm chức năng','Health food', 2),
    ('FOOD_ETC',      '기타 식품', 'Thực phẩm khác',     'Other food',  3)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'FOOD'
ON CONFLICT (code) DO NOTHING;

-- 반려동물용품
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('PET_FOOD',   '사료·간식', 'Thức ăn thú cưng','Pet food',   1),
    ('PET_SUPPLY', '반려용품',  'Phụ kiện thú cưng','Pet goods', 2),
    ('PET_ETC',    '기타 반려', 'Thú cưng khác',   'Other pet',  3)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'PET'
ON CONFLICT (code) DO NOTHING;

-- 식물
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order, depth, parent_id)
SELECT v.code, v.name_ko, v.name_vi, v.name_en, NULL, v.so, 1, p.id
FROM (VALUES
    ('PLANT_INDOOR', '실내식물', 'Cây trong nhà', 'Indoor plants', 1),
    ('PLANT_OUTDOOR','실외식물', 'Cây ngoài trời','Outdoor plants',2),
    ('PLANT_SUPPLY', '원예용품', 'Đồ làm vườn',   'Garden supplies',3)
) AS v(code, name_ko, name_vi, name_en, so), marketplace_categories p
WHERE p.code = 'PLANT'
ON CONFLICT (code) DO NOTHING;

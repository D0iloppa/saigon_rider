-- =====================================================
-- 043 — Districts/Ward 통합 (ward 테이블 폐기 → districts 흡수)
-- ward-data.ts (HCMC_WARDS 29개) 를 districts 에 흡수.
-- 042 가 추가한 ward_code 컬럼은 district_code 가 이미 동일 역할이므로 제거.
-- 시안: docs/saigon-map-v2-accurate.html, 프론트: components/maps/ward-data.ts
-- =====================================================

-- 1. districts 컬럼 보강 (시각 정보 + 행정개편 이력)
ALTER TABLE districts
    ADD COLUMN IF NOT EXISTS zone         VARCHAR(20) CHECK (zone IN ('center', 'inner', 'outer')),
    ADD COLUMN IF NOT EXISTS svg_x        INT,
    ADD COLUMN IF NOT EXISTS svg_y        INT,
    ADD COLUMN IF NOT EXISTS old_district VARCHAR(40);

-- 2. ward-data.ts 29개 → districts UPSERT
--    중복 코드(BINH_THANH, GO_VAP 등 10개)는 zone/svg_x/svg_y/old_district 채움.
--    신규 코드 19개는 INSERT. name_en 은 name_vi 그대로 복제(추후 보강).
INSERT INTO districts (code, name_ko, name_vi, name_en, sort_order, zone, svg_x, svg_y, old_district) VALUES
  -- outer
  ('CU_CHI',           '꾸찌',         'Củ Chi',           'Củ Chi',           42, 'outer',  88,  28, 'Củ Chi'),
  ('HOC_MON',          '혹몬',         'Hóc Môn',          'Hóc Môn',          43, 'outer', 126,  55, 'Hóc Môn'),
  ('BINH_CHANH',       '빈짠',         'Bình Chánh',       'Bình Chánh',       40, 'outer',  92, 178, 'Bình Chánh'),
  ('NHA_BE',           '냐베',         'Nhà Bè',           'Nhà Bè',           44, 'outer', 202, 228, 'Nhà Bè'),
  ('CAN_GIO',          '깐저',         'Cần Giờ',          'Cần Giờ',          41, 'outer', 210, 260, 'Cần Giờ'),
  ('TAN_THOI_HIEP',    '떤터이히엡',   'Tân Thới Hiệp',    'Tân Thới Hiệp',    50, 'outer', 176,  63, 'Q.12'),
  ('THOI_AN',          '터이안',       'Thới An',          'Thới An',          51, 'outer', 145,  62, 'Q.12'),
  -- inner
  ('TAN_BINH',         '떤빈',         'Tân Bình',         'Tân Bình',         24, 'inner', 174,  83, 'Tân Bình'),
  ('GO_VAP',           '고밥',         'Gò Vấp',           'Gò Vấp',           22, 'inner', 200,  78, 'Gò Vấp'),
  ('HOA_BINH',         '호아빈',       'Hòa Bình',         'Hòa Bình',         52, 'inner', 143, 112, 'Q.11'),
  ('HOA_HUNG',         '호아흥',       'Hòa Hưng',         'Hòa Hưng',         53, 'inner', 169, 108, 'Q.10'),
  ('BINH_TAN',         '빈떤',         'Bình Tân',         'Bình Tân',         21, 'inner', 110, 118, 'Bình Tân'),
  ('THU_DUC',          '투득',         'Thủ Đức',          'Thủ Đức',          30, 'inner', 330,  90, 'Thủ Đức'),
  ('LINH_TRUNG',       '린쭝',         'Linh Trung',       'Linh Trung',       54, 'inner', 262,  88, 'Thủ Đức'),
  ('LINH_XUAN',        '린쑤안',       'Linh Xuân',        'Linh Xuân',        55, 'inner', 292,  93, 'Thủ Đức'),
  ('THAO_DIEN',        '타오디엔',     'Thảo Điền',        'Thảo Điền',        56, 'inner', 263, 114, 'Q.2'),
  ('BINH_THANH',       '빈탄',         'Bình Thạnh',       'Bình Thạnh',       20, 'inner', 242, 116, 'Bình Thạnh'),
  ('PHU_MY',           '푸미',         'Phú Mỹ',           'Phú Mỹ',           57, 'inner', 206, 192, 'Q.7'),
  ('TAN_MY',           '떤미',         'Tân Mỹ',           'Tân Mỹ',           58, 'inner', 182, 172, 'Q.7'),
  ('TAN_THUAN',        '떤투언',       'Tân Thuận',        'Tân Thuận',        59, 'inner', 220, 169, 'Q.7'),
  -- center
  ('CHO_LON',          '쩌런',         'Chợ Lớn',          'Chợ Lớn',          60, 'center', 137, 141, 'Q.5'),
  ('AN_DONG',          '안동',         'An Đông',          'An Đông',          61, 'center', 158, 137, 'Q.5'),
  ('CHANH_HUNG',       '짠흥',         'Chánh Hưng',       'Chánh Hưng',       62, 'center', 143, 170, 'Q.8'),
  ('NGUYEN_THAI_BINH', '응우옌타이빈', 'Nguyễn Thái Bình', 'Nguyễn Thái Bình', 63, 'center', 190, 127, 'Q.1'),
  ('CO_GIANG',         '꼬장',         'Cô Giang',         'Cô Giang',         64, 'center', 177, 132, 'Q.1'),
  ('PHAM_NGU_LAO',     '팜응우라오',   'Phạm Ngũ Lão',     'Phạm Ngũ Lão',     65, 'center', 176, 144, 'Q.1'),
  ('BEN_THANH',        '벤탄',         'Bến Thành',        'Bến Thành',        66, 'center', 193, 143, 'Q.1'),
  ('SAIGON',           '사이공',       'Saigon',           'Saigon',           67, 'center', 212, 124, 'Q.1'),
  ('BEN_NGHE',         '벤응에',       'Bến Nghé',         'Bến Nghé',         68, 'center', 213, 142, 'Q.1')
ON CONFLICT (code) DO UPDATE SET
    zone         = EXCLUDED.zone,
    svg_x        = EXCLUDED.svg_x,
    svg_y        = EXCLUDED.svg_y,
    old_district = EXCLUDED.old_district;

CREATE INDEX IF NOT EXISTS idx_districts_zone   ON districts(zone);
CREATE INDEX IF NOT EXISTS idx_districts_svg_xy ON districts(svg_x, svg_y);

-- 3. 042 가 추가한 ward_code 컬럼 제거 (district_code 가 이미 동일 역할)
DROP INDEX IF EXISTS idx_flood_ward;
DROP INDEX IF EXISTS idx_gas_ward;
DROP INDEX IF EXISTS idx_repair_ward;
ALTER TABLE flood_report DROP COLUMN IF EXISTS ward_code;
ALTER TABLE gas_station  DROP COLUMN IF EXISTS ward_code;
ALTER TABLE repair_shop  DROP COLUMN IF EXISTS ward_code;

-- 4. ward 테이블 폐기
DROP TABLE IF EXISTS ward CASCADE;

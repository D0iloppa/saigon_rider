-- =====================================================
-- 042 — Ward Mapping (2025-07-01 호치민 행정개편)
-- 168 ward 마스터 + flood/gas/repair 테이블 ward_code 매핑
-- 시안: docs/saigon-map-v2-accurate.html, 프론트: components/maps/ward-data.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS ward (
    ward_code      VARCHAR(40) PRIMARY KEY,
    name_vi        VARCHAR(100) NOT NULL,
    name_ko        VARCHAR(100),
    old_district   VARCHAR(40),
    zone           VARCHAR(20) CHECK (zone IN ('center', 'inner', 'outer')),
    center_lat     DECIMAL(10, 7) NOT NULL,
    center_lng     DECIMAL(10, 7) NOT NULL,
    svg_x          INT,
    svg_y          INT,
    geom           GEOGRAPHY(POINT, 4326)
                   GENERATED ALWAYS AS (
                       ST_SetSRID(ST_MakePoint(center_lng::double precision, center_lat::double precision), 4326)::geography
                   ) STORED,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ward_geom         ON ward USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_ward_old_district ON ward(old_district);

-- ── Seed: 주요 29개 ward (시안 + ward-data.ts 와 동기) ──
INSERT INTO ward (ward_code, name_vi, name_ko, old_district, zone, center_lat, center_lng, svg_x, svg_y) VALUES
  ('CU_CHI',            'Củ Chi',          '꾸찌',        'Củ Chi',      'outer', 11.0000, 106.5000,  88,  28),
  ('HOC_MON',           'Hóc Môn',         '혹몬',        'Hóc Môn',     'outer', 10.8886, 106.5958, 126,  55),
  ('BINH_CHANH',        'Bình Chánh',      '빈짠',        'Bình Chánh',  'outer', 10.7500, 106.5500,  92, 178),
  ('NHA_BE',            'Nhà Bè',          '냐베',        'Nhà Bè',      'outer', 10.6900, 106.7400, 202, 228),
  ('CAN_GIO',           'Cần Giờ',         '깐저',        'Cần Giờ',     'outer', 10.4144, 106.9333, 210, 260),
  ('TAN_THOI_HIEP',     'Tân Thới Hiệp',   '떤터이히엡',  'Q.12',        'outer', 10.8611, 106.6406, 176,  63),
  ('THOI_AN',           'Thới An',         '터이안',      'Q.12',        'outer', 10.8728, 106.6544, 145,  62),
  ('TAN_BINH',          'Tân Bình',        '떤빈',        'Tân Bình',    'inner', 10.8014, 106.6531, 174,  83),
  ('GO_VAP',            'Gò Vấp',          '고밥',        'Gò Vấp',      'inner', 10.8386, 106.6664, 200,  78),
  ('HOA_BINH',          'Hòa Bình',        '호아빈',      'Q.11',        'inner', 10.7703, 106.6453, 143, 112),
  ('HOA_HUNG',          'Hòa Hưng',        '호아흥',      'Q.10',        'inner', 10.7744, 106.6717, 169, 108),
  ('BINH_TAN',          'Bình Tân',        '빈떤',        'Bình Tân',    'inner', 10.8036, 106.5914, 110, 118),
  ('THU_DUC',           'Thủ Đức',         '투득',        'Thủ Đức',     'inner', 10.8500, 106.7717, 330,  90),
  ('LINH_TRUNG',        'Linh Trung',      '린쭝',        'Thủ Đức',     'inner', 10.8717, 106.7717, 262,  88),
  ('LINH_XUAN',         'Linh Xuân',       '린쑤안',      'Thủ Đức',     'inner', 10.8800, 106.7717, 292,  93),
  ('THAO_DIEN',         'Thảo Điền',       '타오디엔',    'Q.2',         'inner', 10.8060, 106.7395, 263, 114),
  ('BINH_THANH',        'Bình Thạnh',      '빈탄',        'Bình Thạnh',  'inner', 10.8011, 106.7100, 242, 116),
  ('CHO_LON',           'Chợ Lớn',         '쩌런',        'Q.5',         'center', 10.7519, 106.6588, 137, 141),
  ('AN_DONG',           'An Đông',         '안동',        'Q.5',         'center', 10.7565, 106.6697, 158, 137),
  ('CHANH_HUNG',        'Chánh Hưng',      '짠흥',        'Q.8',         'center', 10.7450, 106.6758, 143, 170),
  ('NGUYEN_THAI_BINH',  'Nguyễn Thái Bình','응우옌타이빈','Q.1',         'center', 10.7660, 106.6960, 190, 127),
  ('CO_GIANG',          'Cô Giang',        '꼬장',        'Q.1',         'center', 10.7625, 106.6905, 177, 132),
  ('PHAM_NGU_LAO',      'Phạm Ngũ Lão',    '팜응우라오',  'Q.1',         'center', 10.7680, 106.6920, 176, 144),
  ('BEN_THANH',         'Bến Thành',       '벤탄',        'Q.1',         'center', 10.7720, 106.6960, 193, 143),
  ('SAIGON',            'Saigon',          '사이공',      'Q.1',         'center', 10.7665, 106.7000, 212, 124),
  ('BEN_NGHE',          'Bến Nghé',        '벤응에',      'Q.1',         'center', 10.7780, 106.7019, 213, 142),
  ('PHU_MY',            'Phú Mỹ',          '푸미',        'Q.7',         'inner', 10.7228, 106.7178, 206, 192),
  ('TAN_MY',            'Tân Mỹ',          '떤미',        'Q.7',         'inner', 10.7261, 106.7228, 182, 172),
  ('TAN_THUAN',         'Tân Thuận',       '떤투언',      'Q.7',         'inner', 10.7550, 106.7364, 220, 169)
ON CONFLICT (ward_code) DO NOTHING;

-- ── 기존 테이블에 ward_code FK 컬럼 추가 ──
ALTER TABLE flood_report ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);
ALTER TABLE gas_station  ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);
ALTER TABLE repair_shop  ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);

CREATE INDEX IF NOT EXISTS idx_flood_ward  ON flood_report(ward_code);
CREATE INDEX IF NOT EXISTS idx_gas_ward    ON gas_station(ward_code);
CREATE INDEX IF NOT EXISTS idx_repair_ward ON repair_shop(ward_code);

-- ── 기존 데이터 ward_code 백필 (가장 가까운 ward) ──
UPDATE gas_station gs
SET ward_code = (
    SELECT w.ward_code FROM ward w
    ORDER BY w.geom <-> gs.geom
    LIMIT 1
)
WHERE gs.ward_code IS NULL AND gs.geom IS NOT NULL;

UPDATE repair_shop rs
SET ward_code = (
    SELECT w.ward_code FROM ward w
    ORDER BY w.geom <-> rs.geom
    LIMIT 1
)
WHERE rs.ward_code IS NULL AND rs.geom IS NOT NULL;

UPDATE flood_report fr
SET ward_code = (
    SELECT w.ward_code FROM ward w
    ORDER BY w.geom <-> fr.geom
    LIMIT 1
)
WHERE fr.ward_code IS NULL AND fr.geom IS NOT NULL;

-- ================================================================
-- 010_master_tables.sql
-- districts / rider_types / safety_grades 마스터 테이블 생성
-- quests.district(enum) → district_id FK
-- quests.min_safety_grade(enum) → min_safety_grade_id FK
-- users.rider_type(enum) → rider_type_id FK
-- ================================================================

-- ── Districts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS districts (
    id          SMALLSERIAL  PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name_ko     VARCHAR(100) NOT NULL,
    name_vi     VARCHAR(100) NOT NULL,
    name_en     VARCHAR(100) NOT NULL,
    image_url   TEXT,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO districts (code, name_ko, name_vi, name_en, sort_order) VALUES
    ('QUAN_1',     '1군',          'Quận 1',     'District 1',  1),
    ('QUAN_3',     '3군',          'Quận 3',     'District 3',  3),
    ('QUAN_4',     '4군',          'Quận 4',     'District 4',  4),
    ('QUAN_5',     '5군',          'Quận 5',     'District 5',  5),
    ('QUAN_6',     '6군',          'Quận 6',     'District 6',  6),
    ('QUAN_7',     '7군',          'Quận 7',     'District 7',  7),
    ('QUAN_8',     '8군',          'Quận 8',     'District 8',  8),
    ('QUAN_10',    '10군',         'Quận 10',    'District 10', 10),
    ('QUAN_11',    '11군',         'Quận 11',    'District 11', 11),
    ('QUAN_12',    '12군',         'Quận 12',    'District 12', 12),
    ('BINH_THANH', '빈탄군',       'Bình Thạnh', 'Binh Thanh',  20),
    ('BINH_TAN',   '빈떤군',       'Bình Tân',   'Binh Tan',    21),
    ('GO_VAP',     '고밥군',       'Gò Vấp',     'Go Vap',      22),
    ('PHU_NHUAN',  '푸뉴언군',     'Phú Nhuận',  'Phu Nhuan',   23),
    ('TAN_BINH',   '떤빈군',       'Tân Bình',   'Tan Binh',    24),
    ('TAN_PHU',    '떤푸군',       'Tân Phú',    'Tan Phu',     25),
    ('THU_DUC',    '투득시',       'Thủ Đức',    'Thu Duc',     30),
    ('BINH_CHANH', '빈짠현',       'Bình Chánh', 'Binh Chanh',  40),
    ('CAN_GIO',    '껀저현',       'Cần Giờ',    'Can Gio',     41),
    ('CU_CHI',     '꾸찌현',       'Củ Chi',     'Cu Chi',      42),
    ('HOC_MON',    '혹몬현',       'Hóc Môn',    'Hoc Mon',     43),
    ('NHA_BE',     '냐베현',       'Nhà Bè',     'Nha Be',      44);

-- ── Rider Types ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_types (
    id       SMALLSERIAL  PRIMARY KEY,
    code     VARCHAR(30)  NOT NULL UNIQUE,
    name_ko  VARCHAR(100) NOT NULL,
    name_vi  VARCHAR(100) NOT NULL,
    name_en  VARCHAR(100) NOT NULL,
    icon     VARCHAR(10)
);

INSERT INTO rider_types (code, name_ko, name_vi, name_en, icon) VALUES
    ('COMMUTER',    '출퇴근 라이더', 'Người đi làm',   'Commuter',    '🏢'),
    ('CAFE_HUNTER', '카페 헌터',    'Thợ săn cà phê', 'Cafe Hunter', '☕'),
    ('NIGHT_RIDER', '나이트 라이더', 'Người đua đêm',  'Night Rider', '🌙');

-- ── Safety Grades ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_grades (
    id       SMALLSERIAL  PRIMARY KEY,
    code     CHAR(1)      NOT NULL UNIQUE,
    name_ko  VARCHAR(100) NOT NULL,
    name_vi  VARCHAR(100) NOT NULL,
    name_en  VARCHAR(100) NOT NULL
);

INSERT INTO safety_grades (code, name_ko, name_vi, name_en) VALUES
    ('A', '안전',   'An toàn',    'Safe'),
    ('B', '보통',   'Trung bình', 'Average'),
    ('C', '위험',   'Nguy hiểm',  'Risky');

-- ── quests: district_id, min_safety_grade_id 추가 ────────────────
ALTER TABLE quests
    ADD COLUMN IF NOT EXISTS district_id         SMALLINT REFERENCES districts(id),
    ADD COLUMN IF NOT EXISTS min_safety_grade_id SMALLINT REFERENCES safety_grades(id);

-- 기존 district enum 값 → district_id 매핑
UPDATE quests q
SET district_id = d.id
FROM districts d
WHERE q.district::text = d.name_vi
  AND q.district IS NOT NULL;

-- 기존 min_safety_grade enum 값 → min_safety_grade_id 매핑
UPDATE quests q
SET min_safety_grade_id = s.id
FROM safety_grades s
WHERE q.min_safety_grade::text = s.code
  AND q.min_safety_grade IS NOT NULL;

ALTER TABLE quests
    DROP COLUMN IF EXISTS district,
    DROP COLUMN IF EXISTS min_safety_grade;

DROP TYPE IF EXISTS district_enum;

-- ── users: rider_type_id 추가 ────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rider_type_id SMALLINT REFERENCES rider_types(id);

UPDATE users u
SET rider_type_id = r.id
FROM rider_types r
WHERE u.rider_type::text = r.code
  AND u.rider_type IS NOT NULL;

ALTER TABLE users
    DROP COLUMN IF EXISTS rider_type;

DROP TYPE IF EXISTS rider_type;

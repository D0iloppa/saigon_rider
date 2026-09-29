-- 250: 커뮤니티 그룹 주제를 하드코딩(CHECK·코드 상수) 대신 테이블로 — 라벨(ko/en/vi)·정렬·활성 여부를 데이터로 관리. 멱등.
CREATE TABLE IF NOT EXISTS community_group_topics (
    code       VARCHAR(32) PRIMARY KEY,
    label_ko   TEXT NOT NULL,
    label_en   TEXT NOT NULL,
    label_vi   TEXT NOT NULL,
    sort_order INT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO community_group_topics (code, label_ko, label_en, label_vi, sort_order) VALUES
    ('neighborhood_friends', '동네친구',   'Neighborhood friends', 'Bạn cùng khu phố',        10),
    ('riding_tour',          '라이딩/투어', 'Riding & tours',       'Đi xe & tour',             20),
    ('sports',               '운동',       'Sports & fitness',     'Thể thao',                 30),
    ('food_cafe',            '맛집/카페',   'Food & cafes',         'Ăn uống & cà phê',         40),
    ('language_exchange',    '언어교환',   'Language exchange',    'Trao đổi ngôn ngữ',        50),
    ('hobby',                '취미',       'Hobbies',              'Sở thích',                 60),
    ('self_dev',             '자기계발',   'Self-improvement',     'Phát triển bản thân',      70),
    ('family',               '육아/가족',   'Parenting & family',   'Nuôi dạy con & gia đình',  80),
    ('pets',                 '반려동물',   'Pets',                 'Thú cưng',                 90),
    ('etc',                  '기타',       'Other',                'Khác',                     100)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE community_groups DROP CONSTRAINT IF EXISTS ck_community_groups_topic;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_community_groups_topic') THEN
        ALTER TABLE community_groups
            ADD CONSTRAINT fk_community_groups_topic FOREIGN KEY (topic)
            REFERENCES community_group_topics (code) ON UPDATE CASCADE;
    END IF;
END $$;

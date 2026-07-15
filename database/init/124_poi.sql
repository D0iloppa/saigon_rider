-- ================================================================
-- 124_poi.sql  (Phase A-1)
-- 신규 POI(지형·랜드마크/행정·생활) 도메인 — business_profile/business_category 미러
--   · poi_category : POI 대분류 (2종, 3개국어 라벨)
--   · poi          : 개별 POI (읽기 전용 지도 핀. Phase B 에이전트 인제스천 대비
--                     source/external_ref 부분 유니크 인덱스 선반영)
-- ================================================================

CREATE TABLE IF NOT EXISTS poi_category (
    code       VARCHAR(60) PRIMARY KEY,
    label_ko   VARCHAR(80) NOT NULL,
    label_vi   VARCHAR(80) NOT NULL,
    label_en   VARCHAR(80) NOT NULL,
    icon       VARCHAR(80) NOT NULL,
    sort_order INT         NOT NULL DEFAULT 0,
    is_active  BOOLEAN     NOT NULL DEFAULT true
);

INSERT INTO poi_category (code, label_ko, label_vi, label_en, icon, sort_order)
VALUES
    ('landmark', '지형·랜드마크', 'Địa danh',   'Landmarks', 'landmark', 1),
    ('civic',    '행정·생활',     'Hành chính', 'Civic',     'civic',    2)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS poi (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category          VARCHAR(60) NOT NULL REFERENCES poi_category(code),
    name_ko           VARCHAR(160) NOT NULL,
    name_vi           VARCHAR(160),
    name_en           VARCHAR(160),
    description       TEXT,
    address           VARCHAR(200),
    latitude          NUMERIC(9, 6) NOT NULL,
    longitude         NUMERIC(9, 6) NOT NULL,
    photo_content_id  UUID REFERENCES contents(id) ON DELETE SET NULL,
    source            VARCHAR(60),
    external_ref      VARCHAR(200),
    published         BOOLEAN NOT NULL DEFAULT true,
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_source_external_ref
    ON poi (source, external_ref) WHERE external_ref IS NOT NULL;

-- ── 시드 — 호치민 1군 실좌표 랜드마크/행정 5건 (지도 시각 확인용) ──
-- external_ref 는 seed 재실행 idempotency 용 키 (partial unique index 대상).
INSERT INTO poi (category, name_ko, name_vi, name_en, address, latitude, longitude, published, source, external_ref)
VALUES
    ('landmark', '벤탄 시장',       'Chợ Bến Thành',                 'Ben Thanh Market',          'Lê Lợi, Bến Thành, Quận 1', 10.772100, 106.698000, true, 'seed', 'ben-thanh-market'),
    ('landmark', '노트르담 대성당', 'Nhà thờ Đức Bà Sài Gòn',        'Notre-Dame Cathedral Saigon', 'Công xã Paris, Bến Nghé, Quận 1', 10.779700, 106.699000, true, 'seed', 'notre-dame-cathedral-saigon'),
    ('civic',    '사이공 중앙우체국', 'Bưu điện Trung tâm Sài Gòn',   'Saigon Central Post Office', '2 Công xã Paris, Bến Nghé, Quận 1', 10.779900, 106.699900, true, 'seed', 'saigon-central-post-office'),
    ('landmark', '랜드마크 81',     'Landmark 81',                    'Landmark 81',               '720A Điện Biên Phủ, Bình Thạnh', 10.795100, 106.721800, true, 'seed', 'landmark-81'),
    ('landmark', '사이공 대교',     'Cầu Sài Gòn',                    'Saigon Bridge',             'Xa lộ Hà Nội, Quận 2', 10.796900, 106.726700, true, 'seed', 'saigon-bridge')
ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING;

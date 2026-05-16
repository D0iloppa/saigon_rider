-- ================================================================
-- 012_system_contents_seed.sql
-- 시스템 이미지(district / quest 썸네일)를 contents 테이블에 등록
-- 파일 위치: contents/system/districts/*.jpg, contents/system/quests/*.jpg
-- ================================================================

-- ── District 이미지 ─────────────────────────────────────────────

WITH district_contents AS (
    INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
    VALUES
        ('system', 'system/districts/quan-1.jpg',     'image/jpeg', 'quan-1.jpg'),
        ('system', 'system/districts/phu-nhuan.jpg',  'image/jpeg', 'phu-nhuan.jpg'),
        ('system', 'system/districts/thu-duc.jpg',    'image/jpeg', 'thu-duc.jpg'),
        ('system', 'system/districts/binh-thanh.jpg', 'image/jpeg', 'binh-thanh.jpg'),
        ('system', 'system/districts/quan-7.jpg',     'image/jpeg', 'quan-7.jpg')
    ON CONFLICT DO NOTHING
    RETURNING id, file_path
)
UPDATE districts d
SET image_content_id = dc.id
FROM district_contents dc
WHERE dc.file_path = 'system/districts/' || replace(lower(d.code), '_', '-') || '.jpg';

-- ── Quest 썸네일 ────────────────────────────────────────────────
-- quests 테이블의 실제 UUID는 생성 시점에 결정되므로,
-- contents만 등록해두고 quest 생성/업데이트 시 thumbnail_content_id를 연결한다.

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('system', 'system/quests/q-ben-thanh-loop.jpg',    'image/jpeg', 'q-ben-thanh-loop.jpg'),
    ('system', 'system/quests/q-phu-nhuan-cafe.jpg',    'image/jpeg', 'q-phu-nhuan-cafe.jpg'),
    ('system', 'system/quests/q-thu-duc-sprint.jpg',    'image/jpeg', 'q-thu-duc-sprint.jpg'),
    ('system', 'system/quests/q-bui-vien-sweep.jpg',    'image/jpeg', 'q-bui-vien-sweep.jpg'),
    ('system', 'system/quests/q-binh-thanh-market.jpg', 'image/jpeg', 'q-binh-thanh-market.jpg'),
    ('system', 'system/quests/q-quan-7-bridge.jpg',     'image/jpeg', 'q-quan-7-bridge.jpg')
ON CONFLICT DO NOTHING;

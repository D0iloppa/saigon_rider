-- ================================================================
-- 061_quest_event_image_assign.sql
-- 특수(이벤트) 퀘스트 3종에 전용 일러스트를 퀘스트별 개별 지정(override).
--   monsoon → S-RAIN-04  '야간 우중 라이딩'   (card-EVENT_MONSOON)
--   cafe    → S-SPRING-05 '봄 카페 투어'       (card-EVENT_CAFE)
--   legend  → W-RD-21     '호치민 모든 District' (card-EVENT_LEGEND)
-- 공유 card_code(057/058) 대신 main/thumbnail/banner_content_id 를 전용 파일에 직접 연결.
-- → 해당 퀘스트에만 표시, 다른 퀘스트(family) 영향 없음.
--
-- 파일: contents/system/quest-cards/{card,thumb,banner}-EVENT_{MONSOON,CAFE,LEGEND}.png
--       (generate_quest_derived_images.py 로 thumb/banner 파생 생성 완료)
-- 주의: is_active 는 건드리지 않는다. 대상 퀘스트는 059 정책상 검증기 미구현으로
--       비활성 상태이며, 검증기 구현 후 별도 활성화한다. (이미지 스테이징만)
-- ================================================================

-- 1) 전용 일러스트 contents 행 등록 (card/thumb/banner × 3, 멱등)
INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('system', 'system/quest-cards/card-EVENT_MONSOON.png',   'image/png', 'card-EVENT_MONSOON.png'),
    ('system', 'system/quest-cards/thumb-EVENT_MONSOON.png',  'image/png', 'thumb-EVENT_MONSOON.png'),
    ('system', 'system/quest-cards/banner-EVENT_MONSOON.png', 'image/png', 'banner-EVENT_MONSOON.png'),
    ('system', 'system/quest-cards/card-EVENT_CAFE.png',      'image/png', 'card-EVENT_CAFE.png'),
    ('system', 'system/quest-cards/thumb-EVENT_CAFE.png',     'image/png', 'thumb-EVENT_CAFE.png'),
    ('system', 'system/quest-cards/banner-EVENT_CAFE.png',    'image/png', 'banner-EVENT_CAFE.png'),
    ('system', 'system/quest-cards/card-EVENT_LEGEND.png',    'image/png', 'card-EVENT_LEGEND.png'),
    ('system', 'system/quest-cards/thumb-EVENT_LEGEND.png',   'image/png', 'thumb-EVENT_LEGEND.png'),
    ('system', 'system/quest-cards/banner-EVENT_LEGEND.png',  'image/png', 'banner-EVENT_LEGEND.png')
ON CONFLICT DO NOTHING;

-- 2) 퀘스트별 슬롯 override (main=상세 / thumbnail=리스트·월드맵 / banner=이벤트배너)
UPDATE quests q SET
    main_content_id      = cm.id,
    thumbnail_content_id = ct.id,
    banner_content_id    = cb.id
FROM contents cm, contents ct, contents cb
WHERE q.mission_code = 'S-RAIN-04'
  AND cm.file_path = 'system/quest-cards/card-EVENT_MONSOON.png'
  AND ct.file_path = 'system/quest-cards/thumb-EVENT_MONSOON.png'
  AND cb.file_path = 'system/quest-cards/banner-EVENT_MONSOON.png';

UPDATE quests q SET
    main_content_id      = cm.id,
    thumbnail_content_id = ct.id,
    banner_content_id    = cb.id
FROM contents cm, contents ct, contents cb
WHERE q.mission_code = 'S-SPRING-05'
  AND cm.file_path = 'system/quest-cards/card-EVENT_CAFE.png'
  AND ct.file_path = 'system/quest-cards/thumb-EVENT_CAFE.png'
  AND cb.file_path = 'system/quest-cards/banner-EVENT_CAFE.png';

UPDATE quests q SET
    main_content_id      = cm.id,
    thumbnail_content_id = ct.id,
    banner_content_id    = cb.id
FROM contents cm, contents ct, contents cb
WHERE q.mission_code = 'W-RD-21'
  AND cm.file_path = 'system/quest-cards/card-EVENT_LEGEND.png'
  AND ct.file_path = 'system/quest-cards/thumb-EVENT_LEGEND.png'
  AND cb.file_path = 'system/quest-cards/banner-EVENT_LEGEND.png';

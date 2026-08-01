-- ================================================================
-- 063_quest_delivery_image_assign.sql
-- 남은 배달 변형 아트 2장을 배달 테마 퀘스트에 퀘스트별 개별 지정(override).
--   delivery v1 (Morning Commute 배달)   → O-DL-01 '오늘의 첫 배차'   (EVENT_DISPATCH)
--   delivery v3 (5-stop 루트맵)           → M-DL-01 '월 1000건 프로'   (EVENT_DELIVERY_PRO)
-- 061과 동일 방식(main/thumbnail/banner_content_id 직접 연결, 공유 card_code 무영향).
--
-- is_active 무변경(이미지 스테이징만). 두 퀘스트는 '건수' 누적형 의도로,
-- 구현된 GPS 검증기(DISTANCE/CHECKPOINT)로 충실 판정 불가 → 카운터 검증기 후속.
-- ================================================================

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('system', 'system/quest-cards/card-EVENT_DISPATCH.png',       'image/png', 'card-EVENT_DISPATCH.png'),
    ('system', 'system/quest-cards/thumb-EVENT_DISPATCH.png',      'image/png', 'thumb-EVENT_DISPATCH.png'),
    ('system', 'system/quest-cards/banner-EVENT_DISPATCH.png',     'image/png', 'banner-EVENT_DISPATCH.png'),
    ('system', 'system/quest-cards/card-EVENT_DELIVERY_PRO.png',   'image/png', 'card-EVENT_DELIVERY_PRO.png'),
    ('system', 'system/quest-cards/thumb-EVENT_DELIVERY_PRO.png',  'image/png', 'thumb-EVENT_DELIVERY_PRO.png'),
    ('system', 'system/quest-cards/banner-EVENT_DELIVERY_PRO.png', 'image/png', 'banner-EVENT_DELIVERY_PRO.png')
ON CONFLICT DO NOTHING;

UPDATE quests q SET
    main_content_id      = cm.id,
    thumbnail_content_id = ct.id,
    banner_content_id    = cb.id
FROM contents cm, contents ct, contents cb
WHERE q.mission_code = 'O-DL-01'
  AND cm.file_path = 'system/quest-cards/card-EVENT_DISPATCH.png'
  AND ct.file_path = 'system/quest-cards/thumb-EVENT_DISPATCH.png'
  AND cb.file_path = 'system/quest-cards/banner-EVENT_DISPATCH.png';

UPDATE quests q SET
    main_content_id      = cm.id,
    thumbnail_content_id = ct.id,
    banner_content_id    = cb.id
FROM contents cm, contents ct, contents cb
WHERE q.mission_code = 'M-DL-01'
  AND cm.file_path = 'system/quest-cards/card-EVENT_DELIVERY_PRO.png'
  AND ct.file_path = 'system/quest-cards/thumb-EVENT_DELIVERY_PRO.png'
  AND cb.file_path = 'system/quest-cards/banner-EVENT_DELIVERY_PRO.png';

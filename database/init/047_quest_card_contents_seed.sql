-- ================================================================
-- 047_quest_card_contents_seed.sql
-- Quest 카드 이미지(25개 전체)를 contents 테이블에 등록.
-- 파일 위치: contents/system/quest-cards/card-{CARD_CODE}.png
-- 생성 모델: gemini-2.5-flash-image (Nano Banana)
-- 생성 스크립트: scripts/generate_quest_card_images.py
-- ================================================================

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    -- RIDER (12)
    ('system', 'system/quest-cards/card-RIDING_DAILY.png',     'image/png', 'card-RIDING_DAILY.png'),
    ('system', 'system/quest-cards/card-RIDING_WEEKLY.png',    'image/png', 'card-RIDING_WEEKLY.png'),
    ('system', 'system/quest-cards/card-RIDING_MONTHLY.png',   'image/png', 'card-RIDING_MONTHLY.png'),
    ('system', 'system/quest-cards/card-COMMUNITY_DAILY.png',  'image/png', 'card-COMMUNITY_DAILY.png'),
    ('system', 'system/quest-cards/card-COMMUNITY_WEEKLY.png', 'image/png', 'card-COMMUNITY_WEEKLY.png'),
    ('system', 'system/quest-cards/card-MAINT_DAILY.png',      'image/png', 'card-MAINT_DAILY.png'),
    ('system', 'system/quest-cards/card-MAINT_WEEKLY.png',     'image/png', 'card-MAINT_WEEKLY.png'),
    ('system', 'system/quest-cards/card-MARKET_DAILY.png',     'image/png', 'card-MARKET_DAILY.png'),
    ('system', 'system/quest-cards/card-MARKET_WEEKLY.png',    'image/png', 'card-MARKET_WEEKLY.png'),
    ('system', 'system/quest-cards/card-MIXED_DAILY.png',      'image/png', 'card-MIXED_DAILY.png'),
    ('system', 'system/quest-cards/card-DELIVERY_DAILY.png',   'image/png', 'card-DELIVERY_DAILY.png'),
    ('system', 'system/quest-cards/card-ONBOARDING.png',       'image/png', 'card-ONBOARDING.png'),
    -- SEASON (8)
    ('system', 'system/quest-cards/card-TET_SEASON.png',            'image/png', 'card-TET_SEASON.png'),
    ('system', 'system/quest-cards/card-HUNG_KINGS_SEASON.png',     'image/png', 'card-HUNG_KINGS_SEASON.png'),
    ('system', 'system/quest-cards/card-REUNIFICATION_SEASON.png',  'image/png', 'card-REUNIFICATION_SEASON.png'),
    ('system', 'system/quest-cards/card-GHOST_SEASON.png',          'image/png', 'card-GHOST_SEASON.png'),
    ('system', 'system/quest-cards/card-MID_AUTUMN_SEASON.png',     'image/png', 'card-MID_AUTUMN_SEASON.png'),
    ('system', 'system/quest-cards/card-RAIN_SEASON.png',           'image/png', 'card-RAIN_SEASON.png'),
    ('system', 'system/quest-cards/card-NEW_YEAR_SEASON.png',       'image/png', 'card-NEW_YEAR_SEASON.png'),
    ('system', 'system/quest-cards/card-SAIGON_BDAY_SEASON.png',    'image/png', 'card-SAIGON_BDAY_SEASON.png'),
    -- MYTHIC (5)
    ('system', 'system/quest-cards/card-THE_LEGEND_M.png',          'image/png', 'card-THE_LEGEND_M.png'),
    ('system', 'system/quest-cards/card-SAIGON_GHOST_M.png',        'image/png', 'card-SAIGON_GHOST_M.png'),
    ('system', 'system/quest-cards/card-IRON_PHOENIX_M.png',        'image/png', 'card-IRON_PHOENIX_M.png'),
    ('system', 'system/quest-cards/card-STORM_KING_M.png',          'image/png', 'card-STORM_KING_M.png'),
    ('system', 'system/quest-cards/card-SAIGON_ANCESTOR_M.png',     'image/png', 'card-SAIGON_ANCESTOR_M.png')
ON CONFLICT DO NOTHING;

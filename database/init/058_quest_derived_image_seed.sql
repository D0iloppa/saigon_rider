-- ================================================================
-- 058_quest_derived_image_seed.sql
-- 메인(카드) 이미지에서 생성한 썸네일·배너 파생 파일을 contents 에 등록하고
-- 각 퀘스트의 thumbnail/banner 슬롯에 매핑한다.
--   원본:  system/quest-cards/card-{CODE}.png   (메인)
--   파생:  system/quest-cards/thumb-{CODE}.png  (썸네일 480x300)
--          system/quest-cards/banner-{CODE}.png (배너 1200x400)
-- 파일 생성: backend/scripts/generate_quest_derived_images.py (imgproxy crop)
-- card_code 산출 로직은 app/quest_card_map.py / quest-card-map.ts 와 동일.
-- ================================================================

-- 1) 파생 파일 contents 행 등록 (카드 행에서 파생, 중복 방지)
INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
SELECT 'system', replace(c.file_path, '/card-', '/thumb-'), 'image/png', replace(c.original_filename, 'card-', 'thumb-')
FROM contents c
WHERE c.owner_type = 'system'
  AND c.file_path LIKE 'system/quest-cards/card-%'
  AND NOT EXISTS (SELECT 1 FROM contents t WHERE t.file_path = replace(c.file_path, '/card-', '/thumb-'));

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
SELECT 'system', replace(c.file_path, '/card-', '/banner-'), 'image/png', replace(c.original_filename, 'card-', 'banner-')
FROM contents c
WHERE c.owner_type = 'system'
  AND c.file_path LIKE 'system/quest-cards/card-%'
  AND NOT EXISTS (SELECT 1 FROM contents b WHERE b.file_path = replace(c.file_path, '/card-', '/banner-'));

-- 2) 퀘스트 슬롯 매핑 — mission_code→cardCode 해석 후 thumb/banner 파생 파일에 연결.
--    이미 개별 연결(IS NOT NULL)된 슬롯은 건드리지 않는다(관리자 override 보존).
WITH resolved AS (
    SELECT q.id,
        CASE
            WHEN q.rarity = 'M' THEN
                CASE
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'GHOST|NIGHT'       THEN 'SAIGON_GHOST_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'PHOENIX|REBIRTH'   THEN 'IRON_PHOENIX_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'STORM|RAIN|TYPHOON' THEN 'STORM_KING_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'ANCESTOR|ULTIMATE|1975' THEN 'SAIGON_ANCESTOR_M'
                    ELSE 'THE_LEGEND_M'
                END
            WHEN q.mission_code IS NULL OR q.mission_code = '' THEN 'RIDING_DAILY'
            WHEN split_part(q.mission_code, '-', 1) = 'O' THEN 'ONBOARDING'
            WHEN split_part(q.mission_code, '-', 1) = 'S' THEN
                CASE split_part(q.mission_code, '-', 2)
                    WHEN 'TET' THEN 'TET_SEASON'
                    WHEN 'SPRING' THEN 'HUNG_KINGS_SEASON'
                    WHEN 'SUM' THEN 'REUNIFICATION_SEASON'
                    WHEN 'RAIN' THEN 'RAIN_SEASON'
                    WHEN 'INDEP' THEN 'GHOST_SEASON'
                    WHEN 'MID' THEN 'MID_AUTUMN_SEASON'
                    WHEN 'DRY' THEN 'SAIGON_BDAY_SEASON'
                    WHEN 'XMAS' THEN 'NEW_YEAR_SEASON'
                    ELSE 'TET_SEASON'
                END
            WHEN split_part(q.mission_code, '-', 1) = 'A' THEN 'MIXED_DAILY'
            WHEN split_part(q.mission_code, '-', 2) = 'DL' THEN 'DELIVERY_DAILY'
            WHEN split_part(q.mission_code, '-', 2) = 'RD' THEN
                'RIDING_' || CASE split_part(q.mission_code, '-', 1)
                    WHEN 'D' THEN 'DAILY' WHEN 'W' THEN 'WEEKLY' WHEN 'M' THEN 'MONTHLY' ELSE 'DAILY' END
            ELSE
                (CASE split_part(q.mission_code, '-', 2)
                    WHEN 'CM' THEN 'COMMUNITY' WHEN 'MT' THEN 'MAINT'
                    WHEN 'MK' THEN 'MARKET' WHEN 'MX' THEN 'MIXED' ELSE 'MIXED' END)
                || '_' ||
                (CASE split_part(q.mission_code, '-', 1)
                    WHEN 'D' THEN 'DAILY' WHEN 'W' THEN 'WEEKLY' WHEN 'M' THEN 'WEEKLY' ELSE 'DAILY' END)
        END AS card_code
    FROM quests q
)
UPDATE quests q
SET thumbnail_content_id = c.id
FROM resolved r
JOIN contents c
    ON c.owner_type = 'system'
   AND c.file_path = 'system/quest-cards/thumb-' || r.card_code || '.png'
WHERE q.id = r.id
  AND q.thumbnail_content_id IS NULL;

WITH resolved AS (
    SELECT q.id,
        CASE
            WHEN q.rarity = 'M' THEN
                CASE
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'GHOST|NIGHT'       THEN 'SAIGON_GHOST_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'PHOENIX|REBIRTH'   THEN 'IRON_PHOENIX_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'STORM|RAIN|TYPHOON' THEN 'STORM_KING_M'
                    WHEN upper(coalesce(q.mission_code, '')) ~ 'ANCESTOR|ULTIMATE|1975' THEN 'SAIGON_ANCESTOR_M'
                    ELSE 'THE_LEGEND_M'
                END
            WHEN q.mission_code IS NULL OR q.mission_code = '' THEN 'RIDING_DAILY'
            WHEN split_part(q.mission_code, '-', 1) = 'O' THEN 'ONBOARDING'
            WHEN split_part(q.mission_code, '-', 1) = 'S' THEN
                CASE split_part(q.mission_code, '-', 2)
                    WHEN 'TET' THEN 'TET_SEASON'
                    WHEN 'SPRING' THEN 'HUNG_KINGS_SEASON'
                    WHEN 'SUM' THEN 'REUNIFICATION_SEASON'
                    WHEN 'RAIN' THEN 'RAIN_SEASON'
                    WHEN 'INDEP' THEN 'GHOST_SEASON'
                    WHEN 'MID' THEN 'MID_AUTUMN_SEASON'
                    WHEN 'DRY' THEN 'SAIGON_BDAY_SEASON'
                    WHEN 'XMAS' THEN 'NEW_YEAR_SEASON'
                    ELSE 'TET_SEASON'
                END
            WHEN split_part(q.mission_code, '-', 1) = 'A' THEN 'MIXED_DAILY'
            WHEN split_part(q.mission_code, '-', 2) = 'DL' THEN 'DELIVERY_DAILY'
            WHEN split_part(q.mission_code, '-', 2) = 'RD' THEN
                'RIDING_' || CASE split_part(q.mission_code, '-', 1)
                    WHEN 'D' THEN 'DAILY' WHEN 'W' THEN 'WEEKLY' WHEN 'M' THEN 'MONTHLY' ELSE 'DAILY' END
            ELSE
                (CASE split_part(q.mission_code, '-', 2)
                    WHEN 'CM' THEN 'COMMUNITY' WHEN 'MT' THEN 'MAINT'
                    WHEN 'MK' THEN 'MARKET' WHEN 'MX' THEN 'MIXED' ELSE 'MIXED' END)
                || '_' ||
                (CASE split_part(q.mission_code, '-', 1)
                    WHEN 'D' THEN 'DAILY' WHEN 'W' THEN 'WEEKLY' WHEN 'M' THEN 'WEEKLY' ELSE 'DAILY' END)
        END AS card_code
    FROM quests q
)
UPDATE quests q
SET banner_content_id = c.id
FROM resolved r
JOIN contents c
    ON c.owner_type = 'system'
   AND c.file_path = 'system/quest-cards/banner-' || r.card_code || '.png'
WHERE q.id = r.id
  AND q.banner_content_id IS NULL;

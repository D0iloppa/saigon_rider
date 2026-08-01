-- ================================================================
-- 064_quest_csv_field.sql
-- 퀘스트에 정적 SVG 카드(v4 카탈로그)를 id로 매핑하는 `csv` 필드 추가.
-- 값 = 카드코드(예: RIDING_DAILY) → 프론트가 sprite 의 #card-{csv} 로 렌더.
-- 기존 이미지(PNG/contents) 구조는 건드리지 않는다(가산적).
-- 배정 로직은 057/058(quest-card-map.ts / quest_card_map.py)와 동일하게
-- mission_code/rarity 에서 카드코드를 해석한다. 모든 퀘스트 전수 배정.
-- ================================================================

BEGIN;

ALTER TABLE quests ADD COLUMN IF NOT EXISTS csv VARCHAR(40);
COMMENT ON COLUMN quests.csv IS '정적 SVG 카드 id(카드코드). 프론트 sprite #card-{csv} 렌더. 이미지(PNG)와 별개.';

UPDATE quests q SET csv = (
    CASE
        WHEN q.rarity = 'M' THEN
            CASE
                WHEN upper(coalesce(q.mission_code, '')) ~ 'GHOST|NIGHT'        THEN 'SAIGON_GHOST_M'
                WHEN upper(coalesce(q.mission_code, '')) ~ 'PHOENIX|REBIRTH'    THEN 'IRON_PHOENIX_M'
                WHEN upper(coalesce(q.mission_code, '')) ~ 'STORM|RAIN|TYPHOON'  THEN 'STORM_KING_M'
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
    END
)
WHERE csv IS NULL;

COMMIT;

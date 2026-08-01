-- ================================================================
-- 057_quest_image_slots.sql
-- 퀘스트 이미지 3종 슬롯: 썸네일(리스트)/메인(상세)/배너(홈·이벤트).
-- thumbnail_content_id 는 기존(썸네일). main/banner 신규 추가.
-- 모두 contents 테이블 중개(owner_type='system', contents/system 하위).
-- ================================================================

ALTER TABLE quests
    ADD COLUMN IF NOT EXISTS main_content_id   UUID REFERENCES contents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS banner_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;

-- ── 기존 데이터 마이그레이션 ───────────────────────────────────────
-- 메인(상세) 슬롯만 mission_code→cardCode 로 해석한 공유 카드아트 contents 행에 연결한다.
-- 썸네일·배너는 비워둔다(NULL) → 출력 시 메인에서 crop 파생(_to_out). 관리자가 슬롯별 업로드로 override 가능.
-- card_code 산출 로직은 app/quest_card_map.py / quest-card-map.ts 와 동일.
-- 이미 개별 연결된 메인(IS NOT NULL)은 건드리지 않는다.

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
SET main_content_id = c.id
FROM resolved r
JOIN contents c
    ON c.owner_type = 'system'
   AND c.file_path = 'system/quest-cards/card-' || r.card_code || '.png'
WHERE q.id = r.id
  AND q.main_content_id IS NULL;

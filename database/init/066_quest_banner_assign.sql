-- ================================================================
-- 066_quest_banner_assign.sql
-- 신규 배너 16장(ghibli 8 시간/날씨 + quest 8 장소)을 전 퀘스트 카드에 배정.
-- 방식(C): 회전(rotation) 기반 전수 배정으로 16장 모두 사용 보장 →
--          시간/날씨/장소가 명확한 퀘스트는 테마 매핑으로 override.
-- 슬롯 3종(thumbnail=리스트/월드맵, main=상세, banner=홈) 모두 같은 배너로 연결.
-- imgproxy rs:fill(cover)이 카드 비율(8:5)로 자동 크롭 → 사전 파생 불필요.
-- 기존 card-*.png(이미지 폴백)·csv 컬럼은 건드리지 않음.
-- ================================================================

BEGIN;

-- 1) 배너 contents 등록 (멱등)
INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
SELECT 'system', 'system/quest-banners/' || fn, 'image/png', fn
FROM (VALUES
  ('ghibli_banner_01_morning_2.png'),('ghibli_banner_02_midday_2.png'),
  ('ghibli_banner_03_sunset_2.png'),('ghibli_banner_04_postrain_2.png'),
  ('ghibli_banner_05_night_2.png'),('ghibli_banner_06_foggy_dawn_2.png'),
  ('ghibli_banner_07_cloudy_windy_2.png'),('ghibli_banner_08_rainy_2.png'),
  ('quest_banner_01_morning_riverside_1.png'),('quest_banner_02_downtown_noon_2.png'),
  ('quest_banner_03_sunset_harbor_2.png'),('quest_banner_04_rainy_alley_2.png'),
  ('quest_banner_05_night_market_2.png'),('quest_banner_06_park_suburban_2.png'),
  ('quest_banner_07_plaza_fountain_2.png'),('quest_banner_08_hilltop_road_2.png')
) AS v(fn)
WHERE NOT EXISTS (SELECT 1 FROM contents c WHERE c.file_path = 'system/quest-banners/' || v.fn);

-- 2) 회전 기반 전수 배정 (idx = (행번호-1) % 16) — 16장 모두 균등 사용 보장
WITH bmap AS (
  SELECT v.idx, c.id AS cid
  FROM (VALUES
    (0,'system/quest-banners/ghibli_banner_01_morning_2.png'),
    (1,'system/quest-banners/ghibli_banner_02_midday_2.png'),
    (2,'system/quest-banners/ghibli_banner_03_sunset_2.png'),
    (3,'system/quest-banners/ghibli_banner_04_postrain_2.png'),
    (4,'system/quest-banners/ghibli_banner_05_night_2.png'),
    (5,'system/quest-banners/ghibli_banner_06_foggy_dawn_2.png'),
    (6,'system/quest-banners/ghibli_banner_07_cloudy_windy_2.png'),
    (7,'system/quest-banners/ghibli_banner_08_rainy_2.png'),
    (8,'system/quest-banners/quest_banner_01_morning_riverside_1.png'),
    (9,'system/quest-banners/quest_banner_02_downtown_noon_2.png'),
    (10,'system/quest-banners/quest_banner_03_sunset_harbor_2.png'),
    (11,'system/quest-banners/quest_banner_04_rainy_alley_2.png'),
    (12,'system/quest-banners/quest_banner_05_night_market_2.png'),
    (13,'system/quest-banners/quest_banner_06_park_suburban_2.png'),
    (14,'system/quest-banners/quest_banner_07_plaza_fountain_2.png'),
    (15,'system/quest-banners/quest_banner_08_hilltop_road_2.png')
  ) AS v(idx, path)
  JOIN contents c ON c.owner_type='system' AND c.file_path = v.path
),
numbered AS (
  SELECT id AS qid, ((row_number() OVER (ORDER BY id) - 1) % 16)::int AS idx FROM quests
)
UPDATE quests q
SET thumbnail_content_id = bmap.cid, main_content_id = bmap.cid, banner_content_id = bmap.cid
FROM numbered n JOIN bmap ON bmap.idx = n.idx
WHERE q.id = n.qid;

-- 3) 테마 override (시간/날씨/장소 명확) — 일반→특수 순서로, 뒤 UPDATE가 우선.
--    슬롯 3종을 해당 배너로 지정.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- (배너 파일, 매칭 정규식)  : 일반적인 것 먼저, 더 구체적인 건 뒤에
    ('quest_banner_06_park_suburban_2.png',  '공원|교외'),
    ('quest_banner_07_plaza_fountain_2.png', '광장|분수'),
    ('quest_banner_01_morning_riverside_1.png','강변|강 건너|리버'),
    ('quest_banner_03_sunset_harbor_2.png',  '항구|다리'),
    ('quest_banner_08_hilltop_road_2.png',   '언덕|장거리|롱 슬로우|주말 장거리'),
    ('ghibli_banner_07_cloudy_windy_2.png',  '폭염|흐림|바람'),
    ('ghibli_banner_06_foggy_dawn_2.png',    '새벽|골든아워|안개'),
    ('quest_banner_02_downtown_noon_2.png',  '점심|정오'),
    ('quest_banner_03_sunset_harbor_2.png',  '노을|일몰|저녁'),
    ('quest_banner_04_rainy_alley_2.png',    '우중|폭우|장마|몬순|우비|빗물|비 라이딩|첫 비'),
    ('ghibli_banner_05_night_2.png',         '야간|밤'),
    ('quest_banner_05_night_market_2.png',   '야시장|시장')
  ) AS t(fn, pat)
  LOOP
    UPDATE quests q
    SET thumbnail_content_id = c.id, main_content_id = c.id, banner_content_id = c.id
    FROM contents c
    WHERE c.owner_type='system' AND c.file_path = 'system/quest-banners/' || r.fn
      AND (coalesce(q.title_ko,'') ~ r.pat OR coalesce(q.mission_code,'') ~ r.pat);
  END LOOP;
END $$;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — 가챠 확률 리밸런스 (천장 보유 가챠 고등급 하향)
-- 발행일: 2026-06-05
-- 의존성: sre-gacha-seed.sql (gacha_definition 시드 선행)
--
-- 배경: 천장(pity)이 있는 가챠인데 고등급(L/M) 확률이 높아, 천장 도달 전에
--       전설(L)이 너무 자주 나옴. 등급순 1/3/5/10/나머지 스케일로 하향.
--   - M(Mythic)=1%, L(Legendary)=3%, E(Epic)=5%, R(Rare)=나머지
--   - LEGEND_PULL은 C/R이 없어 E가 나머지를 흡수
-- 대상: GC_PREMIUM_PULL, SEASON_PULL, LEGEND_PULL
-- 제외: PREMIUM_PULL(이미 L 2%), BASIC_PULL(천장 없음·고등급 없음)
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- GC_PREMIUM_PULL: R50 E40 L9 M1 → R91 E5 L3 M1
UPDATE gacha_definition
   SET drop_table = jsonb_set(
         drop_table, '{weighted}',
         '[
           {"rarity": "R", "weight": 91},
           {"rarity": "E", "weight": 5},
           {"rarity": "L", "weight": 3},
           {"rarity": "M", "weight": 1}
         ]'::jsonb)
 WHERE gacha_code = 'GC_PREMIUM_PULL';

-- SEASON_PULL: R60 E30 L9 M1 → R91 E5 L3 M1
UPDATE gacha_definition
   SET drop_table = jsonb_set(
         drop_table, '{weighted}',
         '[
           {"rarity": "R", "weight": 91},
           {"rarity": "E", "weight": 5},
           {"rarity": "L", "weight": 3},
           {"rarity": "M", "weight": 1}
         ]'::jsonb)
 WHERE gacha_code = 'SEASON_PULL';

-- LEGEND_PULL: E70 L25 M5 → E96 L3 M1
UPDATE gacha_definition
   SET drop_table = jsonb_set(
         drop_table, '{weighted}',
         '[
           {"rarity": "E", "weight": 96},
           {"rarity": "L", "weight": 3},
           {"rarity": "M", "weight": 1}
         ]'::jsonb)
 WHERE gacha_code = 'LEGEND_PULL';

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT gacha_code, drop_table->'weighted'
--     FROM gacha_definition
--    WHERE gacha_code IN ('GC_PREMIUM_PULL','SEASON_PULL','LEGEND_PULL')
--    ORDER BY sort_order;
-- ──────────────────────────────────────────────────────────────────────────

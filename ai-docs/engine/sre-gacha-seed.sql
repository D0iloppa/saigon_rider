-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — 가챠 5종 시드
-- 발행일: 2026-05-18
-- 의존성: migration-step3-gacha-shop.sql 선행
--
-- 가챠 설계 원칙:
--   - GP 가챠 (BASIC, PREMIUM): 라이딩으로 모은 골드 소모, 무한 반복 가능
--   - GC 가챠 (GC_PREMIUM, LEGEND): 시즌·정복 보상으로 모은 크리스탈, 희소
--   - SEASON 가챠: 시즌 한정 컬렉션 전용, 시즌 종료 시 천장 리셋
--   - 천장: PREMIUM 이상 모두 적용 (도박성 보호 — 리니지 강화실패 누적 보호 느낌)
--   - 10연차: 보장 등급 1개 + 가격 10% 할인 (충동구매 유도)
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO gacha_definition (
  gacha_code, display_name, description,
  cost_currency, cost_per_pull, cost_per_10_pull,
  collection_filter, drop_table,
  pity_threshold, pity_guarantee_rarity, pity_resets_with_season,
  status, is_listed, sort_order
) VALUES

-- ─── 1. BASIC_PULL — 일반 뽑기 (GP, 천장 없음) ───
-- 가장 저렴. 라이딩 1km당 RIDE_KM 10 ~ 디스카운트로 약 25 GP, 즉 8km 정도면 1회 가능
('BASIC_PULL',
  'Garage 일반 뽑기',
  'Common~Rare 위주. 일상 라이딩으로 모은 GP를 소소하게 굴리는 재미',
  'GP', 200, 1800,    -- 10연차는 10% 할인
  NULL,
  '{
    "weighted": [
      {"rarity": "C", "weight": 70},
      {"rarity": "R", "weight": 28},
      {"rarity": "E", "weight": 2}
    ],
    "guaranteed_at_10": "R",
    "duplicate_policy": "REFUND_GP"
  }'::jsonb,
  NULL, NULL, FALSE,
  'ACTIVE', TRUE, 10),

-- ─── 2. PREMIUM_PULL — 고급 뽑기 (GP, 천장 100회) ───
-- 일일 GP 캡 250 기준 6일 모아야 1회. 본격적인 아바타 꾸미기용
('PREMIUM_PULL',
  'Garage 프리미엄 뽑기',
  'Rare~Epic 위주, 가끔 Legendary. 100연 천장 보장으로 도박성 완화',
  'GP', 1500, 13500,
  NULL,
  '{
    "weighted": [
      {"rarity": "R", "weight": 65},
      {"rarity": "E", "weight": 33},
      {"rarity": "L", "weight": 2}
    ],
    "guaranteed_at_10": "E",
    "duplicate_policy": "REFUND_GP"
  }'::jsonb,
  100, 'L', FALSE,
  'ACTIVE', TRUE, 20),

-- ─── 3. GC_PREMIUM_PULL — 크리스탈 뽑기 (GC, 천장 80회) ───
-- 시즌·주년 보상 GC로 진행. Mythic까지 가능
('GC_PREMIUM_PULL',
  '크리스탈 뽑기',
  'Rare~Mythic. 시즌으로 모은 크리스탈을 굴리는 큰 한 방. 80연 Legendary 천장',
  'GC', 30, 270,
  NULL,
  '{
    "weighted": [
      {"rarity": "R", "weight": 91},
      {"rarity": "E", "weight": 5},
      {"rarity": "L", "weight": 3},
      {"rarity": "M", "weight": 1}
    ],
    "guaranteed_at_10": "E",
    "duplicate_policy": "REFUND_GC"
  }'::jsonb,
  80, 'L', FALSE,
  'ACTIVE', TRUE, 30),

-- ─── 4. SEASON_PULL — 시즌 한정 뽑기 (GC, 천장 60회, 시즌 리셋) ───
-- 현재 활성 시즌의 컬렉션만 드랍. 시즌 종료 시 천장 카운터 리셋
-- collection_filter는 시즌 변경 시 운영자가 UPDATE하거나, season 활성화 트리거로 자동
('SEASON_PULL',
  '시즌 한정 뽑기',
  '현재 시즌 컬렉션 전용. 시즌 종료 시 천장 리셋. 60연 Legendary 보장',
  'GC', 25, 225,
  'TET_FESTIVAL',           -- 초기값. 시즌 변경 시 UPDATE 필요
  '{
    "weighted": [
      {"rarity": "R", "weight": 91},
      {"rarity": "E", "weight": 5},
      {"rarity": "L", "weight": 3},
      {"rarity": "M", "weight": 1}
    ],
    "guaranteed_at_10": "E",
    "duplicate_policy": "REFUND_GC"
  }'::jsonb,
  60, 'L', TRUE,
  'ACTIVE', TRUE, 40),

-- ─── 5. LEGEND_PULL — 전설 뽑기 (GC, 천장 50회) ───
-- 가장 비싸지만 Mythic 확률 5%. 진성 컬렉터 / 자랑하기용
('LEGEND_PULL',
  '전설 뽑기',
  'Epic~Mythic 전용. 가장 비싼 만큼 Mythic 5%. 50연 Mythic 천장 (찐 도박)',
  'GC', 80, 720,
  NULL,
  '{
    "weighted": [
      {"rarity": "E", "weight": 96},
      {"rarity": "L", "weight": 3},
      {"rarity": "M", "weight": 1}
    ],
    "guaranteed_at_10": "L",
    "duplicate_policy": "REFUND_GC"
  }'::jsonb,
  50, 'M', FALSE,
  'ACTIVE', TRUE, 50)

ON CONFLICT (gacha_code) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────
-- 검증
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT gacha_code, cost_currency || ' ' || cost_per_pull AS cost,
--        pity_threshold, pity_guarantee_rarity
--   FROM gacha_definition ORDER BY sort_order;
-- 기대: 5행
--
-- 1년 운영 시뮬레이션 (1유저 모든 미션 클리어 가정):
--   - GP 발행 181,820 → BASIC_PULL ~900회 또는 PREMIUM_PULL ~120회
--   - GC 발행 1,835   → GC_PREMIUM_PULL ~60회 또는 SEASON_PULL ~73회 또는 LEGEND_PULL ~22회

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 운영 노트
-- ──────────────────────────────────────────────────────────────────────────
-- 1. SEASON_PULL의 collection_filter는 시즌 변경 시 수동 UPDATE 필요:
--    UPDATE gacha_definition SET collection_filter = 'NEON_SAIGON'
--    WHERE gacha_code = 'SEASON_PULL';
--
-- 2. 시즌 종료 시 SEASON_PULL의 천장 카운터 리셋 (배치):
--    UPDATE user_gacha_pity SET pity_count = 0, season_scope = NULL
--     WHERE gacha_code = 'SEASON_PULL';
--    -- 또는 expire_season_boxes()처럼 별도 함수에서 일괄 처리
--
-- 3. 신규 가챠 추가는 INSERT만 하면 됨. is_listed=FALSE로 숨김 등록 후
--    starts_at 시점에 노출되도록 운영.
-- ──────────────────────────────────────────────────────────────────────────

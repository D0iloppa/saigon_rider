-- 퀘스트 카드 타입 컬럼 추가 + CHECKPOINT 좌표 컬럼
-- BFF Quest 모델에 DISTANCE / CHECKPOINT 분기를 위한 컬럼.
-- target_distance_km 의 CHECK 제약은 CHECKPOINT 호환을 위해 완화 (>= 0).
-- [DBG] 디버그 퀘스트 2건 멱등 시드 — 출시 시점에 데이터만 제거.

DO $$ BEGIN
  CREATE TYPE quest_card_type AS ENUM ('DISTANCE', 'CHECKPOINT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS card_type   quest_card_type NOT NULL DEFAULT 'DISTANCE',
  ADD COLUMN IF NOT EXISTS target_lat  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS target_lng  NUMERIC(9,6);

-- 기존 CHECK (target_distance_km > 0) 를 카드 타입 인지형으로 교체
ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_target_distance_km_check;
ALTER TABLE quests
  ADD CONSTRAINT quests_card_payload_chk CHECK (
    (card_type = 'DISTANCE'   AND target_distance_km > 0)
    OR
    (card_type = 'CHECKPOINT' AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
  );

-- ── [DBG] 시드 (멱등) ────────────────────────────────────────
INSERT INTO quests (
  id, period, badge, required_level,
  card_type, target_distance_km, target_lat, target_lng,
  reward_exp, reward_gold, is_active,
  title_ko, title_vi, title_en,
  description_ko, description_vi, description_en
)
SELECT
  '00000000-0000-0000-0000-0000000d8001'::uuid,
  'DAILY', NULL, 1,
  'DISTANCE', 5.00, NULL, NULL,
  100, 50, TRUE,
  '[DBG] 5KM 라이딩', '[DBG] Đi 5KM', '[DBG] 5KM Ride',
  '디버그용 — 누적 5km 라이딩 시 완료', NULL, 'Debug — complete after 5km ride'
WHERE NOT EXISTS (
  SELECT 1 FROM quests WHERE id = '00000000-0000-0000-0000-0000000d8001'::uuid
);

INSERT INTO quests (
  id, period, badge, required_level,
  card_type, target_distance_km, target_lat, target_lng,
  reward_exp, reward_gold, is_active,
  title_ko, title_vi, title_en,
  description_ko, description_vi, description_en
)
SELECT
  '00000000-0000-0000-0000-0000000d8002'::uuid,
  'DAILY', NULL, 1,
  'CHECKPOINT', 0.10, 37.210000, 127.090000,
  100, 50, TRUE,
  '[DBG] 테스트 장소 접근하기', '[DBG] Tới điểm thử', '[DBG] Reach Test Spot',
  '디버그용 — (37.21, 127.09) 100m 이내 접근 시 완료', NULL, 'Debug — reach within 100m of (37.21, 127.09)'
WHERE NOT EXISTS (
  SELECT 1 FROM quests WHERE id = '00000000-0000-0000-0000-0000000d8002'::uuid
);

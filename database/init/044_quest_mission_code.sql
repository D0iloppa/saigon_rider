-- ===========================================================
-- 044_quest_mission_code.sql
-- quests 테이블에 mission_code / rarity 컬럼 추가.
-- 25개 SVG sprite 카드 매핑 키로 사용 (quest-card-map.ts).
-- ===========================================================

ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS mission_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rarity CHAR(1) NOT NULL DEFAULT 'C';

ALTER TABLE quests
  DROP CONSTRAINT IF EXISTS quests_rarity_chk;

ALTER TABLE quests
  ADD CONSTRAINT quests_rarity_chk
  CHECK (rarity IN ('C', 'R', 'E', 'L', 'M'));

CREATE INDEX IF NOT EXISTS idx_quests_mission_code ON quests (mission_code);

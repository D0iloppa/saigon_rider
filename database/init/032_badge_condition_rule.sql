-- 032: Badge 테이블 확장 — JSONB 조건식 + 다국어 + 아이콘 contents + 활성 플래그
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS condition_rule  JSONB         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS name_ko         VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS name_vi         VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS name_en         VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_ko  TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_vi  TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_en  TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS icon_content_id UUID          DEFAULT NULL REFERENCES contents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN       NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN badges.condition_rule IS '{"operator":"AND","conditions":[{"metric":"QUEST_CLEAR_COUNT","op":">=","value":10}]}';

-- 퀘스트 수행 이력 중복 방지: period_key 컬럼 + unique 인덱스
-- DAILY: '2026-05-15' | WEEKLY: '2026-W20' | EVENT: 'ONCE'

ALTER TABLE user_quests
  ADD COLUMN IF NOT EXISTS period_key VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_quest_period
  ON user_quests (user_id, quest_id, period_key)
  WHERE status = 'COMPLETED';

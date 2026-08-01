-- ================================================================
-- 067_quest_count_event.sql
-- agg='count_event' 검증타입(COUNT_EVENT) 종단 1줄기.
--   · BFF enum quest_card_type 에 'COUNT_EVENT' 추가
--   · quests.criteria JSONB 추가 (action_code/target_count 등 목표 파라미터 SoT)
--   · quests_card_payload_chk 를 COUNT_EVENT 인지형으로 확장
--   · [DBG] 시드 1건 — SHARE_SNS(피드 공유) 1회 시 완료
--     (SHARE_SNS 는 action_definition.daily_count_limit=1 이라 하루 1회만 PROCESSED.
--      count_event 는 PROCESSED 이벤트만 카운트하므로 target_count 는 캡 이하로 설계할 것.)
--
-- 검증 흐름:
--   BFF feed.create → engine_client.post_event(SHARE_SNS)
--   → engine /v1/events → event_bus.process_event(PROCESSED)
--   → quest_tracker.dispatch_event(SHARE_SNS) → CountEventValidator
--   → progress.count += 1, count >= target_count 시 완료 → 보상 지급.
--
-- 주의(enum): ALTER TYPE ADD VALUE 는 트랜잭션 밖(autocommit)에서 실행해야
--   직후 CHECK 제약이 새 값을 참조할 수 있다. BEGIN/COMMIT 으로 감싸지 말 것.
-- ================================================================

ALTER TYPE quest_card_type ADD VALUE IF NOT EXISTS 'COUNT_EVENT';

ALTER TABLE quests ADD COLUMN IF NOT EXISTS criteria JSONB;

-- payload chk 를 COUNT_EVENT 까지 허용하도록 교체 (멱등)
ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_card_payload_chk;
ALTER TABLE quests
  ADD CONSTRAINT quests_card_payload_chk CHECK (
    (card_type = 'DISTANCE'    AND target_distance_km > 0)
    OR
    (card_type = 'CHECKPOINT'  AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
    OR
    (card_type = 'COUNT_EVENT' AND criteria IS NOT NULL)
  );

-- ── [DBG] 시드 (멱등) — SHARE_SNS 3회 ────────────────────────
INSERT INTO quests (
  id, period, badge, required_level,
  card_type, target_distance_km, criteria,
  reward_exp, reward_gold, is_active,
  title_ko, title_vi, title_en,
  description_ko, description_vi, description_en
)
SELECT
  '00000000-0000-0000-0000-0000000d8003'::uuid,
  'DAILY', NULL, 1,
  'COUNT_EVENT', 0.01, '{"action_code": "SHARE_SNS", "target_count": 1}'::jsonb,
  100, 50, TRUE,
  '[DBG] 피드 1회 공유', '[DBG] Chia sẻ 1 lần', '[DBG] Share once',
  '디버그용 — 피드를 1회 공유하면 완료(SHARE_SNS 일일캡 1)', NULL, 'Debug — complete after sharing feed once'
WHERE NOT EXISTS (
  SELECT 1 FROM quests WHERE id = '00000000-0000-0000-0000-0000000d8003'::uuid
);

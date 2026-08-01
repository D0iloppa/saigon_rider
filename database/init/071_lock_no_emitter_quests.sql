-- ================================================================
-- 071_lock_no_emitter_quests.sql
-- 미구현 기능 의존(=BFF emitter 없는 action_code) count 기반 퀘스트 일괄 잠금.
-- emitter 가 없으면 이벤트가 발행되지 않아 영원히 미완료 → 출시 전까지 비활성.
-- 유지: emitter 존재하는 action_code (SHARE_SNS, QUEST_COMPLETE, RIDE_KM, INFO_*).
-- emitter 연결 시 동일 조건 역산으로 재활성화.
-- (거래 의존분은 070 에서 선잠금 — 이미 비활성이라 중복 영향 없음.)
-- ================================================================

UPDATE quests SET is_active = FALSE
WHERE is_active = TRUE
  AND card_type IN ('COUNT_EVENT','COUNT_DISTINCT')
  AND COALESCE(criteria->>'action_code','') NOT IN (
    'SHARE_SNS','RIDE_KM','QUEST_COMPLETE',
    'INFO_FLOOD_REPORT','INFO_FLOOD_PHOTO','INFO_FLOOD_CONFIRM',
    'INFO_GAS_NEARBY_VIEW','INFO_GAS_WAIT_REPORT',
    'INFO_WEATHER_VIEW','INFO_FAVORITE_LOCATION',
    'INFO_REPAIR_PHOTO','INFO_REPAIR_PRICE','INFO_REPAIR_REVIEW'
  );

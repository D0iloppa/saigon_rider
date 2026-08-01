-- ================================================================
-- 069_quest_count_distinct.sql
-- agg='count_distinct' 검증타입(COUNT_DISTINCT) 추가 + 정비소 비교류 재분류.
--   · BFF enum quest_card_type 에 'COUNT_DISTINCT' 추가
--     (엔진 enum quest_card_type_enum 은 alembic sre048 이 소유 — init 계층은 건드리지 않음)
--   · quests_card_payload_chk 를 COUNT_DISTINCT 인지형으로 확장
--   · "정비소 비교"류를 COUNT_DISTINCT 로 재분류
--     criteria: {action_code, distinct_key(=payload 식별필드), target_count}
--
-- 의미: 같은 정비소를 여러 번 인증해도 1개로만 집계, 서로 다른 정비소 N곳이면 완료.
-- emitter(MAINTENANCE_RECEIPT) 가 payload.shop_id 를 실어야 집계됨(현재 미연결 → 진행도만).
--
-- 주의(enum): ALTER TYPE ADD VALUE 는 트랜잭션 밖(autocommit)에서 실행. BEGIN/COMMIT 금지.
-- ================================================================

ALTER TYPE quest_card_type ADD VALUE IF NOT EXISTS 'COUNT_DISTINCT';

ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_card_payload_chk;
ALTER TABLE quests
  ADD CONSTRAINT quests_card_payload_chk CHECK (
    (card_type = 'DISTANCE'       AND target_distance_km > 0)
    OR
    (card_type = 'CHECKPOINT'     AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
    OR
    (card_type = 'COUNT_EVENT'    AND criteria IS NOT NULL)
    OR
    (card_type = 'COUNT_DISTINCT' AND criteria IS NOT NULL)
  );

-- 정비소 2곳 비교 / 정비소 비교 → 서로 다른 정비소(shop_id) 2곳
UPDATE quests SET card_type='COUNT_DISTINCT',
  criteria='{"action_code": "MAINTENANCE_RECEIPT", "distinct_key": "shop_id", "target_count": 2}'::jsonb
WHERE mission_code IN ('W-MT-06','W-MT-09') AND is_active=TRUE;

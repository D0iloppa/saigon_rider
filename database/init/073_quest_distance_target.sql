-- ================================================================
-- 073_quest_distance_target.sql
-- Phase 1 (위치/거리 재분류) — 순수 거리 라이딩 퀘스트 target 현실화.
-- DISTANCE 1km 스텁(placeholder) 중, 2차 의미(사진/횟수/위치/그룹/시간대/
-- 영수증)가 없는 "주행 거리"형만 기간별 기본 스킴으로 보정.
--   스킴: 첫라이딩 1km(유지) / DAILY 5km / 통근왕복 10km / 롱슬로우 15km /
--         WEEKLY 30km / EVENT·월간 50km
-- card_type 은 DISTANCE 그대로 유지(=재분류 아님, target 만 변경). mission_code 보존.
-- 유지(변경 없음): O-RD-01 첫 라이딩(1km), D-RD-23 오늘의 1km(제목 리터럴).
-- 이관(미터치): 위치형(랜드마크/District)→Phase 3, 시간대형(새벽/야간)→후속,
--   사진/횟수/그룹/일수/영수증→Phase 2/3. 제안서:
--   ai-docs/engine/quest-reclassification-proposal.md
-- ================================================================

UPDATE quests SET target_distance_km=5.00  WHERE mission_code='D-RD-01' AND is_active=TRUE;  -- 주행거리 기록 (DAILY)
UPDATE quests SET target_distance_km=10.00 WHERE mission_code='D-RD-09' AND is_active=TRUE;  -- 통근 왕복
UPDATE quests SET target_distance_km=15.00 WHERE mission_code='D-RD-19' AND is_active=TRUE;  -- 롱 슬로우
UPDATE quests SET target_distance_km=5.00  WHERE mission_code='D-MK-01' AND is_active=TRUE;  -- 시장 라이딩 (DAILY 주행)
UPDATE quests SET target_distance_km=30.00 WHERE mission_code='A-MX-07' AND is_active=TRUE;  -- 통근 풀패스 (WEEKLY 주행)

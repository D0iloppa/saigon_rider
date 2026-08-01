-- ================================================================
-- 062_quest_event_validator_activate.sql
-- 061에서 전용 일러스트를 배정한 EVENT 퀘스트 3종을, 구현된 검증기
-- (DISTANCE / CHECKPOINT — 둘 다 이미 엔진 registry 등록·구동 중)로
-- 매핑하고 활성화한다. 신규 enum/검증기/엔진 재시작 불필요.
--
--   S-SPRING-05 봄 카페 투어   → CHECKPOINT (Cộng Cà Phê 중심부 좌표 근접)
--   W-RD-21     호치민 모든 District → CHECKPOINT (Bitexco/District 1 — 배정 아트와 일치)
--   S-RAIN-04   야간 우중 라이딩  → DISTANCE 5km + 야간 수행시간대(19:00~23:00)
--
-- 검증 흐름: BFF user_quests.start-ride 가 card_type 으로 criteria 구성
--   (CHECKPOINT→{target_lat,target_lng}, DISTANCE→{target_distance_m})
--   → engine CheckpointValidator/DistanceValidator 가 GPS 신호로 판정.
-- 시간대 게이트(available_from/to)는 start-ride 시점 BFF 검사.
--
-- 한계(데이터 소스 부재로 미반영, 후속):
--   · 우중(rain): 엔진에 날씨/강수 신호 소스 없음 → '야간'만 시간대로 강제,
--     'rain' 의도는 미검증(테마). 후속: weather EventSignal 인입 + RainValidator.
--   · '모든 District': 단일 CHECKPOINT 로 대체(배정 아트=District 1 정복).
--     충실 구현은 MULTI_CHECKPOINT 신규 card_type+validator 필요(후속).
--
-- 멱등: card_type/좌표/시간대/is_active 일괄 SET. quests_card_payload_chk 충족
--   (CHECKPOINT→target_lat/lng NOT NULL, DISTANCE→target_distance_km>0).
-- ================================================================

BEGIN;

-- 카페 투어 → CHECKPOINT (Cộng Cà Phê 인근, HCMC 1군)
UPDATE quests SET
    card_type  = 'CHECKPOINT',
    target_lat = 10.776530,
    target_lng = 106.700910,
    is_active  = TRUE
WHERE mission_code = 'S-SPRING-05';

-- 호치민 District(=District 1 정복) → CHECKPOINT (Bitexco Financial Tower)
UPDATE quests SET
    card_type  = 'CHECKPOINT',
    target_lat = 10.771700,
    target_lng = 106.704300,
    is_active  = TRUE
WHERE mission_code = 'W-RD-21';

-- 야간 우중 라이딩 → DISTANCE 5km + 야간 시간대(자정 미교차)
UPDATE quests SET
    card_type      = 'DISTANCE',
    available_from = '19:00',
    available_to   = '23:00',
    is_active      = TRUE
WHERE mission_code = 'S-RAIN-04';

COMMIT;

-- =====================================================
-- 158: flood_risk_daily 에 is_stale 플래그 추가
--   predict_flood_risk 잡이 외부 제공자(OpenWeather) 조회 실패 시 해당 구역
--   행을 0.0(안전)으로 덮어쓰지 않고 보존한다 — 이때 is_stale=TRUE 로 표시해
--   소비 API(get_map_data)가 "데이터 없음"과 "제공자 장애로 알 수 없음(오래된
--   snapshot)"을 구분해 내려줄 수 있게 한다.
-- =====================================================

ALTER TABLE flood_risk_daily ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

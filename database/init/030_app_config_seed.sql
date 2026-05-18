-- =============================================================
-- 030_app_config_seed.sql
-- app_config 초기 시드 — 서비스 설정값
-- =============================================================

INSERT INTO app_config (group_name, key, value, description)
VALUES
  ('quest', 'recommend_max_count', '3', '월드맵 추천 퀘스트 최대 표시 개수 (1~5)')
ON CONFLICT (group_name, key) DO NOTHING;

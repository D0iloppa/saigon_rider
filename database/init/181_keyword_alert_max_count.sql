-- =============================================================
-- 181_keyword_alert_max_count.sql
-- 마켓 키워드 알림 사용자당 최대 개수 app_config 시드
-- =============================================================

INSERT INTO app_config (group_name, key, value, description)
VALUES ('market', 'keyword_alert_max_count', '20', '키워드 알림 최대 개수 (사용자당, 1~100)')
ON CONFLICT (group_name, key) DO NOTHING;

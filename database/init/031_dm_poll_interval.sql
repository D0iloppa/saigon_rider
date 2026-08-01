-- =============================================================
-- 031_dm_poll_interval.sql
-- DM 미읽음 폴링 주기 app_config 시드
-- =============================================================

INSERT INTO app_config (group_name, key, value, description)
VALUES ('dm', 'unread_poll_interval', '30', 'DM 미읽음 폴링 주기 (초, 10~300)')
ON CONFLICT (group_name, key) DO NOTHING;

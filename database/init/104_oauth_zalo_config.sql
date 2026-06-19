-- 마이그 104: Zalo Login OAuth 설정
-- 실제 값은 런타임 UPDATE로 주입:
--   UPDATE app_config SET value='4386386707555387397' WHERE group_name='oauth' AND key='zalo_app_id';
--   UPDATE app_config SET value='BFLK7CEbwKqDi1MwnLnk' WHERE group_name='oauth' AND key='zalo_app_secret';
-- ON CONFLICT DO NOTHING — 실값 덮어쓰기 방지

INSERT INTO app_config (group_name, key, value, description) VALUES
  ('oauth', 'zalo_app_id',     'CHANGE_ME', 'Zalo App ID (숫자 19자리)'),
  ('oauth', 'zalo_app_secret', 'CHANGE_ME', 'Zalo Application private key — runtime UPDATE only')
ON CONFLICT (group_name, key) DO NOTHING;

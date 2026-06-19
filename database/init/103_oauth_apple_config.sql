-- 마이그 103: Apple Sign In server-side OAuth 설정
-- BFF가 code → token 교환에 필요한 키 추가.
-- 실제 값은 런타임 UPDATE로 주입:
--   UPDATE app_config SET value='XW649V7JXK' WHERE group_name='oauth' AND key='apple_key_id';
--   UPDATE app_config SET value='3QRB73494R' WHERE group_name='oauth' AND key='apple_team_id';
--   UPDATE app_config SET value='com.saigonrider.web' WHERE group_name='oauth' AND key='apple_services_id';
--   UPDATE app_config SET value='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----' WHERE group_name='oauth' AND key='apple_private_key';
-- ON CONFLICT DO NOTHING — 실값 덮어쓰기 방지

INSERT INTO app_config (group_name, key, value, description) VALUES
  ('oauth', 'apple_team_id',     'CHANGE_ME', 'Apple Developer Team ID (10자리)'),
  ('oauth', 'apple_services_id', 'CHANGE_ME', 'Apple Services ID — Sign In with Apple client_id (web redirect flow)'),
  ('oauth', 'apple_key_id',      'CHANGE_ME', 'Apple .p8 Key ID (10자리)'),
  ('oauth', 'apple_private_key', 'CHANGE_ME', 'Apple .p8 private key PEM — \\n 이스케이프 포함 단일 문자열 (runtime UPDATE only)')
ON CONFLICT (group_name, key) DO NOTHING;

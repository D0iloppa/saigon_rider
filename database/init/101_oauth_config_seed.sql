-- 마이그 101: OAuth app_config seed (CHANGE_ME placeholder만 커밋)
-- 실제 값은 런타임 UPDATE로 주입: UPDATE app_config SET value='...' WHERE group_name='oauth' AND key='...';
-- ON CONFLICT DO NOTHING — 사용자가 넣은 실값을 재배포 때 placeholder로 덮지 않음

INSERT INTO app_config (group_name, key, value, description) VALUES
  ('oauth', 'google_client_id_web',     'CHANGE_ME', 'Google ID token audience (web client)'),
  ('oauth', 'google_client_id_ios',     'CHANGE_ME', 'Google iOS client id'),
  ('oauth', 'google_client_id_android', 'CHANGE_ME', 'Google Android client id'),
  ('oauth', 'apple_client_id',          'CHANGE_ME', 'Apple Sign in audience (bundle/services id)'),
  ('oauth', 'facebook_app_id',          'CHANGE_ME', 'Facebook app id'),
  ('oauth', 'facebook_app_secret',      'CHANGE_ME', 'Facebook app secret (runtime update only — never commit real value)')
ON CONFLICT (group_name, key) DO NOTHING;

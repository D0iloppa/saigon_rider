-- 마이그 102: Google server-side OAuth 설정 추가
-- native @capacitor/browser redirect flow에서 BFF가 code → token 교환 시 필요.
-- 실제 값은 런타임 UPDATE로 주입: UPDATE app_config SET value='...' WHERE group_name='oauth' AND key='google_client_secret_web';
-- ON CONFLICT DO NOTHING — 실값 덮어쓰기 방지

INSERT INTO app_config (group_name, key, value, description) VALUES
  ('oauth', 'google_client_secret_web', 'CHANGE_ME', 'Google OAuth web client secret — BFF server-side code exchange 전용 (runtime UPDATE only)')
ON CONFLICT (group_name, key) DO NOTHING;

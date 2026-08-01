-- ================================================================
-- 093_translate_config.sql
-- 실시간 번역 키를 app_config(DB)에서 관리 (어드민 런타임 교체용).
--   해석 순서: env TRANSLATE_API_KEY 우선 → 이 DB 값 폴백.
--   ⚠️ 시크릿. 클라 /app-config 화이트리스트에 없으므로 노출 안 됨.
-- ================================================================

INSERT INTO app_config (group_name, key, value, description) VALUES
    ('translate', 'api_key',  '',       '실시간 번역 API 키 (비우면 stub=원문 반환). env TRANSLATE_API_KEY 가 우선. 클라 미노출 시크릿.'),
    ('translate', 'provider', 'google', '번역 provider 식별자 (google = Google Cloud Translation v2)')
ON CONFLICT (group_name, key) DO NOTHING;

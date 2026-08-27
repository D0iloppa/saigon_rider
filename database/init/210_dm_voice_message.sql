-- ================================================================
-- 210_dm_voice_message.sql
-- 워키토키(토글 음성메시지) Phase A / A-2 — DM 음성메시지 스키마 확장
--   · dm_messages.message_type = 'voice' 는 기존 자유 문자열 컬럼 재사용
--     (appointment/price_offer 선례와 동일 — CHECK 제약 없음, 마이그레이션 불필요)
--   · audio_content_id UUID FK → contents 신규 추가 (image_content_id 재사용 안 함)
--   · meta(JSONB) 저장 규약: { durationMs, waveform?: number[] } (파형은 선택)
-- 모두 nullable → 기존 DM 코드 경로 무영향
-- ================================================================

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS audio_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dm_messages_audio_content ON dm_messages (audio_content_id);

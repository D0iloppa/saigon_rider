-- ================================================================
-- 086_dm_marketplace_context.sql
-- 거래 채팅 (SGR-287) — DM에 매물 컨텍스트 + 메시지 타입 가산(additive)
--   · dm_conversations.context_type/context_id : 대화 ↔ 매물 연결
--   · dm_messages.message_type/meta            : 약속·시스템 메시지
-- 모두 nullable·기본값 → 기존 DM 코드 경로 무영향
-- ================================================================

ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS context_type VARCHAR(20);
ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS context_id   UUID;

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS meta         JSONB;

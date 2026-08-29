-- ================================================================
-- 217_dm_conversation_notice.sql
-- 대화방 공지 (카톡식) — 방마다 활성 공지 1건.
--   · 활성 1건만 유지하면 되므로 별도 테이블(+부분 유니크 인덱스 + 히스토리 정리 정책) 대신
--     dm_conversations 컬럼 3개가 가장 단순하다.
--   · notice_message_id ON DELETE SET NULL — 원본 메시지가 하드 삭제되면 공지도 함께 사라진다.
--     소프트삭제(deleted_at)는 서버가 조회 시 필터한다.
--   · direct 방은 애플리케이션에서 400 으로 막는다 — CHECK 제약은 걸지 않는다(체인 사고 회피).
-- 매 배포 재실행 안전(멱등).
-- ================================================================

ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS notice_message_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notice_set_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notice_set_at     TIMESTAMPTZ;

-- ================================================================
-- 215_dm_message_sync.sql
-- DM 텍스트 채팅 고도화 (수정·삭제·공감·답장 + updated_at 워터마크 동기화)
--   · updated_at — 신규/수정/소프트삭제/공감변경을 하나의 폴링 커서로 전달하는 워터마크.
--     insert 시 DEFAULT now(), 이후 변경은 애플리케이션이 명시적으로 bump 한다.
--     (기존 행은 마이그레이션 시점 now() 로 채워진다 — 클라이언트 로컬 캐시가
--      아직 없는 시점이라 초도 동기화에 영향 없음)
--   · edited_at / deleted_at — 수정 표기·소프트 삭제(하드 삭제 아님)
--   · reply_to_message_id + reply_preview — 답장 앵커. 원본이 보관기간 만료로
--     지워져도 렌더 가능하도록 작성 시점 스냅샷(JSONB: senderId/senderNickname/content)
--     을 함께 저장한다. FK 는 SET NULL — 원본 삭제 후에도 답장 자체는 남는다.
--   · dm_message_reactions — Slack 스타일 공감(고정 팔레트). 사용자·이모지당 1회.
-- 모두 nullable/기본값 → 기존 DM 코드 경로 무영향. 매 배포 재실행 안전(멱등).
-- ================================================================

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL;

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS reply_preview JSONB;

-- 폴링 커서(conversation_id + updated_at > :after) 전용 인덱스
CREATE INDEX IF NOT EXISTS idx_dm_messages_conv_updated ON dm_messages (conversation_id, updated_at);

CREATE TABLE IF NOT EXISTS dm_message_reactions (
    message_id  UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 같은 사람이 같은 메시지에 같은 이모지를 두 번 누를 수 없다 (토글)
    PRIMARY KEY (message_id, user_id, emoji)
);

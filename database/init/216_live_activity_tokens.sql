-- ================================================================
-- 216_live_activity_tokens.sql
-- iOS Live Activity 원격 갱신용 푸시토큰 (ai-docs/task/active/260829_live_activity_task.md Phase 3)
--   · ActivityKit 은 Activity 마다 별도 푸시토큰을 발급한다 — 기기 FCM 토큰과 다르며 FCM 으로는
--     보낼 수 없다(engine 이 APNs 에 직접 전송). 앱이 Activity 를 만들 때 이 테이블에 등록하고,
--     약속 상태가 바뀌면 noti_worker 가 (kind, subject_id) 로 토큰을 찾아 content-state 를 밀어넣는다.
--   · locale — 카드 문구는 서버가 만들어 보내므로 등록 시점의 앱 언어를 함께 저장한다.
--   · 사용자·종류·대상당 1행(UNIQUE). 만료/무효 토큰(APNs 410)은 워커가 삭제한다.
-- 매 배포 재실행 안전(멱등).
-- ================================================================

CREATE TABLE IF NOT EXISTS live_activity_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        VARCHAR(16) NOT NULL,          -- 'deal' (경로안내는 로컬 갱신만 — 토큰 불필요)
    subject_id  UUID NOT NULL,                 -- kind='deal' → marketplace_appointments.id
    push_token  TEXT NOT NULL,
    locale      VARCHAR(8) NOT NULL DEFAULT 'vi',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT live_activity_tokens_user_kind_subject_uq UNIQUE (user_id, kind, subject_id)
);

CREATE INDEX IF NOT EXISTS live_activity_tokens_subject_idx ON live_activity_tokens (kind, subject_id);

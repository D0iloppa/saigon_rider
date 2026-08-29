-- ================================================================
-- 222_location_share_standalone.sql
-- 위치공유를 약속(marketplace_appointments)과 독립적으로도 쓸 수 있게 확장 (대표 지시 2026-08-29:
-- "약속을 잡지 않아도 위치공유는 가능해야하고, 위치공유와 약속은 독립적").
--
-- appointment_id 를 nullable 로 바꾸고 conversation_id 를 추가한다. 약속 기반 공유(appointment_id
-- NOT NULL)는 기존 정밀도 매트릭스(exact 창)를 그대로 쓰고, 독립 공유(appointment_id NULL)는
-- 세션 TTL(1시간, 시작시점 기준)만으로 자동 종료한다 — 두 정책은 `backend/app/routers/market.py`
-- 에서 별개 엔드포인트로 분리돼 있어 기존 약속 기반 로직/테스트는 손대지 않는다.
--
-- 재실행 멱등: ALTER ... DROP NOT NULL / ADD COLUMN IF NOT EXISTS / 조건부 백필 전부 안전.
-- ================================================================

ALTER TABLE marketplace_location_shares ALTER COLUMN appointment_id DROP NOT NULL;

ALTER TABLE marketplace_location_shares
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE;

UPDATE marketplace_location_shares s
SET conversation_id = a.conversation_id
FROM marketplace_appointments a
WHERE s.appointment_id = a.id AND s.conversation_id IS NULL;

ALTER TABLE marketplace_location_shares ALTER COLUMN conversation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_location_shares_conversation
    ON marketplace_location_shares (conversation_id);

-- 독립 공유(appointment_id IS NULL)는 대화당 사용자별 1행만 — 약속 기반 unique 제약과는 별개.
CREATE UNIQUE INDEX IF NOT EXISTS ux_mkt_location_shares_standalone
    ON marketplace_location_shares (conversation_id, user_id) WHERE appointment_id IS NULL;

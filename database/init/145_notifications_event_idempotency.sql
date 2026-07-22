-- FD-5: Redis stream 재전달 시 알림 row/push 중복 방지.
-- 하나의 매물 이벤트가 여러 수신자에게 알림을 만들 수 있어 event 단독이 아닌 recipient 복합키를 사용한다.
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_source_event_user
    ON notifications (source_event_id, user_id)
    WHERE source_event_id IS NOT NULL;

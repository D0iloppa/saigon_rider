-- FD-6: producer transactional outbox.
-- 요청 핸들러가 도메인 변경과 같은 트랜잭션으로 이벤트를 적재하고, noti_worker relay 가
-- Redis stream(noti:events)으로 발행한다. Redis 순단·커밋~발행 사이 프로세스 종료로 인한
-- 알림 이벤트 유실을 막는다. 재발행 시에도 소비자 멱등키를 이 row.id 로 고정해 중복을 막는다.
CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_notification_outbox_unpublished
    ON notification_outbox (id) WHERE published_at IS NULL;

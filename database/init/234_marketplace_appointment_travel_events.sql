-- P4-2: 약속 당사자의 출발/도착 알림 사실. 원시 위치는 보관하지 않는다.
-- `(appointment_id, actor_id, kind)` 하나가 한 번의 불변 사용자 사실이며, recipient_id 는
-- 같은 1:1 약속의 상대방만 application guard가 넣는다.
CREATE TABLE IF NOT EXISTS marketplace_appointment_travel_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES marketplace_appointments(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('departure', 'arrival')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (appointment_id, actor_id, kind)
);

CREATE INDEX IF NOT EXISTS ix_marketplace_appointment_travel_events_actor
    ON marketplace_appointment_travel_events (appointment_id, actor_id);

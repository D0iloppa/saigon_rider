-- 237: F-X-01 FR-1/FR-2(260919 리뷰킷 v10 승인안) — 취소 사유 기록 + 교착(PAYMENT_REPORTED)
-- 양측 합의 취소 요청 테이블. 거래당 PENDING 요청은 1건만 허용한다.
ALTER TABLE marketplace_appointments
    ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(32);

ALTER TABLE marketplace_transactions
    ADD COLUMN IF NOT EXISTS stall_notice_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS marketplace_transaction_cancel_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES marketplace_appointments(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AGREED', 'REJECTED', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 거래당 활성 요청 1건(요소 표 근거) — 부분 유니크 인덱스로 DB 레벨 보장.
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_transaction_cancel_requests_pending
    ON marketplace_transaction_cancel_requests (appointment_id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS ix_marketplace_transaction_cancel_requests_expiry
    ON marketplace_transaction_cancel_requests (status, expires_at);

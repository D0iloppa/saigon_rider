-- 256: 관리자 메일함 수신확인(읽음 추적 픽셀) — 그룹웨어 DESIGN-MAIL-read-receipt.md 의 receipts 테이블 + mailbox 컬럼.
-- 발송 시 To/Cc 수신자별 1행(R8). IP/User-Agent 는 저장하지 않는다(D2). 멱등.
CREATE TABLE IF NOT EXISTS admin_mail_read_receipts (
    id              BIGSERIAL PRIMARY KEY,
    message_id      VARCHAR(255) NOT NULL,   -- 발송 메일 Message-ID (수신자별 사본·Sent 사본이 공유)
    mailbox         VARCHAR(255) NOT NULL,   -- 발신 메일함 주소 (partner@/support@)
    recipient_email VARCHAR(255) NOT NULL,
    token           UUID NOT NULL UNIQUE,    -- 픽셀 URL 토큰 (UUID v4, R9)
    subject         TEXT,
    sent_at         TIMESTAMPTZ NOT NULL,    -- D3 사전스캔 필터 기준 시각
    first_opened_at TIMESTAMPTZ,
    open_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_mail_read_receipts_message_id ON admin_mail_read_receipts (message_id);
CREATE INDEX IF NOT EXISTS idx_admin_mail_read_receipts_mailbox_sent ON admin_mail_read_receipts (mailbox, sent_at DESC);

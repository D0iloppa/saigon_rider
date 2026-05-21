-- 034: 고객센터 — support_tickets + support_replies

CREATE TABLE IF NOT EXISTS support_tickets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    body            TEXT        NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                                CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
    has_unread_reply BOOLEAN    NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_replies (
    id              BIGSERIAL   PRIMARY KEY,
    ticket_id       UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_type     VARCHAR(10) NOT NULL CHECK (author_type IN ('user','admin')),
    body            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_replies_ticket  ON support_replies(ticket_id);

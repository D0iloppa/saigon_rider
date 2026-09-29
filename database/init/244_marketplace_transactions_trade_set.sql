-- 244: 결제는 거래 세트 소유(F-N-02 FR-7 ④⑤, 260929) — 약속은 결제를 게이트하지 않는다.
-- marketplace_transactions 를 세트당 1건(trade_set_id)으로 재키잉한다. appointment_id 는 nullable 레거시로 남긴다.
-- 멱등: IF NOT EXISTS / pg_constraint 확인. 세트에 매칭되지 않는 옛 행은 trade_set_id NULL(읽기 전용 레거시).

-- 1) 자체 id PK (appointment_id PK 를 대체)
ALTER TABLE marketplace_transactions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE marketplace_transactions SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE marketplace_transactions ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'marketplace_transactions'::regclass
          AND conname = 'marketplace_transactions_pkey'
          AND pg_get_constraintdef(oid) LIKE '%(appointment_id)%'
    ) THEN
        ALTER TABLE marketplace_transactions DROP CONSTRAINT marketplace_transactions_pkey;
        ALTER TABLE marketplace_transactions ADD CONSTRAINT marketplace_transactions_pkey PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE marketplace_transactions ALTER COLUMN appointment_id DROP NOT NULL;

-- 레거시 약속 키 조회용 (NULL 은 유니크 대상 아님)
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_transactions_appointment
    ON marketplace_transactions (appointment_id) WHERE appointment_id IS NOT NULL;

-- 2) trade_set_id + 백필(같은 방의 세트 중 listing_id 를 담은 것, ACTIVE 우선 · 최신순)
ALTER TABLE marketplace_transactions
    ADD COLUMN IF NOT EXISTS trade_set_id UUID REFERENCES trade_sets(id) ON DELETE CASCADE;

-- 한 세트에 여러 옛 거래가 매칭되면(항목별 약속이 따로 있던 경우) 결제 진행이 가장 앞선 1건만 잇는다.
UPDATE marketplace_transactions t
SET trade_set_id = m.set_id
FROM (
    SELECT DISTINCT ON (c.set_id) c.tx_id, c.set_id
    FROM (
        SELECT DISTINCT ON (x.id) x.id AS tx_id, ts.id AS set_id, x.payment_status, x.updated_at
        FROM marketplace_transactions x
        JOIN trade_sets ts ON ts.conversation_id = x.conversation_id
        JOIN trade_set_items i ON i.set_id = ts.id AND i.listing_id = x.listing_id
        WHERE x.trade_set_id IS NULL
        ORDER BY x.id, (ts.status = 'ACTIVE') DESC, ts.created_at DESC
    ) c
    ORDER BY c.set_id,
             CASE c.payment_status WHEN 'PAYMENT_CONFIRMED' THEN 0 WHEN 'PAYMENT_REPORTED' THEN 1 ELSE 2 END,
             c.updated_at DESC
) m
WHERE t.id = m.tx_id
  AND NOT EXISTS (SELECT 1 FROM marketplace_transactions o WHERE o.trade_set_id = m.set_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_transactions_trade_set
    ON marketplace_transactions (trade_set_id) WHERE trade_set_id IS NOT NULL;

-- 3) 합의 취소 요청 — transaction_id 로 재키잉
ALTER TABLE marketplace_transaction_cancel_requests
    ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES marketplace_transactions(id) ON DELETE CASCADE;

UPDATE marketplace_transaction_cancel_requests r
SET transaction_id = t.id
FROM marketplace_transactions t
WHERE r.transaction_id IS NULL AND t.appointment_id = r.appointment_id;

ALTER TABLE marketplace_transaction_cancel_requests ALTER COLUMN appointment_id DROP NOT NULL;

DROP INDEX IF EXISTS ux_marketplace_transaction_cancel_requests_pending;
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_transaction_cancel_requests_pending_tx
    ON marketplace_transaction_cancel_requests (transaction_id)
    WHERE status = 'PENDING' AND transaction_id IS NOT NULL;

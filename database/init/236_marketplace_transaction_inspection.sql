-- 236: A buyer may report a manual payment only after confirming an in-person
-- item inspection. This is an acknowledgement, not a platform verification.
ALTER TABLE marketplace_transactions
    ADD COLUMN IF NOT EXISTS buyer_inspected_at TIMESTAMPTZ;

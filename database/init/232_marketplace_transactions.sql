-- 232: Marketplace transaction procedure and manual-payment acknowledgement.
-- The payment state records human acknowledgement only. It never marks an
-- appointment COMPLETED or a listing SOLD and does not claim PSP verification.
CREATE TABLE IF NOT EXISTS marketplace_transactions (
    appointment_id UUID PRIMARY KEY REFERENCES marketplace_appointments(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd >= 0),
    payment_method VARCHAR(40) NOT NULL DEFAULT 'zalopay_qr_manual',
    payment_status VARCHAR(24) NOT NULL DEFAULT 'AWAITING_PAYMENT'
        CHECK (payment_status IN ('AWAITING_PAYMENT', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED')),
    buyer_reported_at TIMESTAMPTZ,
    seller_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (buyer_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS ix_marketplace_transactions_conversation
    ON marketplace_transactions (conversation_id, created_at DESC);

-- Existing accepted/completed direct appointments receive the same immutable
-- price snapshot used for newly accepted deals. The latest accepted offer is
-- scoped to both the conversation and listing.
INSERT INTO marketplace_transactions (
    appointment_id, conversation_id, listing_id, buyer_id, seller_id,
    amount_vnd, payment_method, payment_status, created_at, updated_at
)
SELECT
    a.id,
    a.conversation_id,
    a.listing_id,
    CASE WHEN c.participant_1 = l.seller_id THEN c.participant_2 ELSE c.participant_1 END,
    l.seller_id,
    COALESCE(offer.amount, l.agreed_price_vnd, l.price_vnd),
    'zalopay_qr_manual',
    'AWAITING_PAYMENT',
    a.updated_at,
    a.updated_at
FROM marketplace_appointments a
JOIN marketplace_listings l ON l.id = a.listing_id
JOIN dm_conversations c ON c.id = a.conversation_id
LEFT JOIN LATERAL (
    SELECT po.amount
    FROM marketplace_price_offers po
    WHERE po.conversation_id = a.conversation_id
      AND po.listing_id = a.listing_id
      AND po.status = 'ACCEPTED'
    ORDER BY po.updated_at DESC
    LIMIT 1
) offer ON TRUE
WHERE a.status IN ('ACCEPTED', 'COMPLETED')
  AND c.conversation_type = 'direct'
  AND c.context_type = 'listing'
  AND c.context_id = a.listing_id
  AND c.participant_1 <> c.participant_2
  AND l.seller_id IN (c.participant_1, c.participant_2)
ON CONFLICT (appointment_id) DO NOTHING;

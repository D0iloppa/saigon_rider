-- 241: 거래 세트(trade_sets/trade_set_items) — 세트 + 판매자 명시 상태 변경 모델
-- (ai-docs/review/260928_trade-request-flow-design.md §3 권고 모델, §6 MVP)
-- 방 하나(구매자 1 · 판매자 1)에서 한 번에 거래하는 매물 묶음을 표현한다. 이중 예약/판매는
-- trade_set_items 의 부분 유니크(listing_id WHERE status IN (RESERVED, COMPLETED))가 막는다.

CREATE TABLE IF NOT EXISTS trade_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 방당 ACTIVE 세트는 하나 (종결 후 [물품추가] = 새 세트, §3.1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_sets_active_per_conversation
    ON trade_sets (conversation_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS trade_set_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES trade_sets(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'INQUIRY'
        CHECK (status IN ('INQUIRY', 'RESERVED', 'COMPLETED', 'REMOVED', 'CANCELLED')),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, listing_id)
);

-- 이중 판매 방지 — 한 매물이 동시에 두 세트에서 예약중/거래완료일 수 없다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_set_items_active_listing
    ON trade_set_items (listing_id) WHERE status IN ('RESERVED', 'COMPLETED');

CREATE INDEX IF NOT EXISTS ix_trade_set_items_set ON trade_set_items (set_id, created_at);

-- d1: 예약중 매물 "취소되면 알림 받기" opt-in 구독 (§3.6 #14)
CREATE TABLE IF NOT EXISTS listing_availability_subscriptions (
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,
    PRIMARY KEY (listing_id, user_id)
);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LISTING_AVAILABLE';

-- 백필 1: dm_conversation_listings 가 있는 1:1 대화마다 ACTIVE 세트 하나.
-- dm_conversations.context_id 는 FK 가 아니라 삭제된 매물을 가리킬 수 있어(240 이 겪은 문제와
-- 동일 원인) live marketplace_listings 와 JOIN 한 결과만 쓴다. 구매자 = 그 매물의 판매자가
-- 아닌 참가자.
INSERT INTO trade_sets (id, conversation_id, buyer_id, seller_id, status, created_at, updated_at)
SELECT DISTINCT ON (c.id)
    gen_random_uuid(),
    c.id,
    CASE WHEN c.participant_1 = l.seller_id THEN c.participant_2 ELSE c.participant_1 END,
    l.seller_id,
    'ACTIVE',
    COALESCE(c.last_message_at, NOW()),
    COALESCE(c.last_message_at, NOW())
FROM dm_conversations c
JOIN dm_conversation_listings dcl ON dcl.conversation_id = c.id
JOIN marketplace_listings l ON l.id = dcl.listing_id
WHERE c.conversation_type = 'direct'
  AND l.seller_id IN (c.participant_1, c.participant_2)
  AND (CASE WHEN c.participant_1 = l.seller_id THEN c.participant_2 ELSE c.participant_1 END) IS NOT NULL
ORDER BY c.id, dcl.linked_at ASC
ON CONFLICT DO NOTHING;

-- 백필 2: 그 대화에 연결된 매물들을 항목으로 — 매물/약속 상태로 항목 상태를 정한다.
INSERT INTO trade_set_items (id, set_id, listing_id, status, added_by, created_at, updated_at)
SELECT DISTINCT ON (dcl.conversation_id, dcl.listing_id)
    gen_random_uuid(),
    ts.id,
    l.id,
    CASE
        WHEN completed_appt.id IS NOT NULL THEN 'COMPLETED'
        WHEN accepted_appt.id IS NOT NULL AND l.status = 'RESERVED' THEN 'RESERVED'
        ELSE 'INQUIRY'
    END,
    ts.buyer_id,
    dcl.linked_at,
    dcl.linked_at
FROM dm_conversation_listings dcl
JOIN trade_sets ts ON ts.conversation_id = dcl.conversation_id AND ts.status = 'ACTIVE'
JOIN marketplace_listings l ON l.id = dcl.listing_id
LEFT JOIN LATERAL (
    SELECT a.id FROM marketplace_appointments a
    WHERE a.conversation_id = dcl.conversation_id AND a.listing_id = l.id AND a.status = 'ACCEPTED'
    LIMIT 1
) accepted_appt ON TRUE
LEFT JOIN LATERAL (
    SELECT a.id FROM marketplace_appointments a
    WHERE a.conversation_id = dcl.conversation_id AND a.listing_id = l.id AND a.status = 'COMPLETED'
    LIMIT 1
) completed_appt ON TRUE
ORDER BY dcl.conversation_id, dcl.listing_id, dcl.linked_at DESC
ON CONFLICT DO NOTHING;

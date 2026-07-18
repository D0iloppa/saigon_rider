-- ================================================================
-- 126_reports_unified.sql
-- T&S(Trust & Safety) 관리자 콘솔 리메이크 — 통합 신고 테이블.
--   · reports : LISTING/USER/DM 3종 신고를 단일 테이블로 통합 (admin 큐 일원화)
--   · target_type 별 필수 FK 를 CHECK 로 강제, 대상×신고자 중복신고는 부분 유니크 인덱스로 가드.
--   · marketplace_listing_reports(093) 의 기존 데이터를 LISTING 신고로 백필. 원본 테이블은 동결 보존.
-- 멱등: IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ================================================================

CREATE TABLE IF NOT EXISTS reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type      VARCHAR(12) NOT NULL CHECK (target_type IN ('LISTING','USER','DM')),
    reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id       UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    conversation_id  UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
    reason           VARCHAR(30) NOT NULL,
    note             TEXT,
    status           VARCHAR(12) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','REVIEWING','RESOLVED','REJECTED')),
    resolution_note  TEXT,
    handled_by       VARCHAR(50),
    handled_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (target_type <> 'LISTING' OR listing_id IS NOT NULL),
    CHECK (target_type <> 'DM'      OR conversation_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_listing_once ON reports (listing_id, reporter_id)       WHERE target_type = 'LISTING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_user_once    ON reports (reported_user_id, reporter_id) WHERE target_type = 'USER';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_dm_once      ON reports (conversation_id, reporter_id)  WHERE target_type = 'DM';
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports (reported_user_id, created_at DESC);

-- 093 marketplace_listing_reports 백필 (LISTING 신고). seller_id = 084 실제 컬럼명 확인 완료.
INSERT INTO reports (target_type, reporter_id, reported_user_id, listing_id, reason, note, status, created_at)
SELECT 'LISTING', r.reporter_id, l.seller_id, r.listing_id, r.reason, r.note,
       CASE r.status WHEN 'REVIEWED' THEN 'RESOLVED' WHEN 'DISMISSED' THEN 'REJECTED' ELSE 'PENDING' END,
       r.created_at
FROM marketplace_listing_reports r JOIN marketplace_listings l ON l.id = r.listing_id
ON CONFLICT DO NOTHING;

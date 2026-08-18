-- ================================================================
-- 194_listing_paper_status.sql
-- 016_PLATFORM_MASTER_SUPPLEMENT.md §4-6 #41 — 서류·명의 추적 (오토바이 특화).
--   · marketplace_listings.paper_status / plate_province : 선택 표시 필드(D-28=(a) — 강제
--     입력 아님). NULL = 미확인(미기재). 값이 있으면 등록증 명의 일치(MATCH)/불일치
--     (MISMATCH)/미보유(NONE) 중 하나 — 명의 불일치가 핵심 위험 신호(§4-6①).
--   · title_transfer_reminder_log : 거래 완료(SOLD) 후 명의이전 D+7/D+25 리마인더
--     (D-35=(a)) 중복 발송 방지용 발송 이력. 앵커는 이 테이블이 아니라 기존
--     listing_state_log(#36, init/191)의 SOLD 전이 시각을 쓴다.
--   · notification_type 에 TITLE_TRANSFER 추가(112/115/127/142 와 동일 패턴).
-- ⚠ L-6 법무 미확인: 명의이전 절차·기한·과태료 조문은 2차 출처 기반이다. 체크리스트
--   문구(프론트 i18n)에 "관할 기관 확인 요망" 고지를 반드시 포함한다.
-- 멱등: IF NOT EXISTS.
-- ================================================================

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS paper_status VARCHAR(10);
ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_paper_status_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_paper_status_check
    CHECK (paper_status IS NULL OR paper_status IN ('MATCH', 'MISMATCH', 'NONE'));

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS plate_province VARCHAR(80);

CREATE TABLE IF NOT EXISTS title_transfer_reminder_log (
    id            BIGSERIAL PRIMARY KEY,
    listing_id    UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    reminder_type VARCHAR(4) NOT NULL CHECK (reminder_type IN ('D7', 'D25')),
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (listing_id, reminder_type)
);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TITLE_TRANSFER';

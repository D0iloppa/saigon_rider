-- 238: F-X-02 FR-1(260919 리뷰킷 v10 승인안) — 신고 규격 통일. 신고 시점 스냅샷을
-- JSON으로 남긴다(DM 신고는 최근 50개 메시지 id+본문, 그 외는 필요 시 확장).
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS snapshot JSONB;

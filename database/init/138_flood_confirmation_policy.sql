-- P1-13: 최초 제보는 PENDING이며, 현장 확인표에는 투표 위치를 보존한다.
ALTER TABLE flood_report ALTER COLUMN confidence_score SET DEFAULT 0;

ALTER TABLE flood_confirmation
    ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7),
    ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7);

-- 기존 확인표는 위치 증거가 없으므로 NULL로 보존하며 새 quorum 계산에서 제외한다.

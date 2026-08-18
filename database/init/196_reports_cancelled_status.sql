-- ================================================================
-- 196_reports_cancelled_status.sql
-- R-3(017 §12-B) — 신고 취소. 하드 삭제 대신 status='CANCELLED' 소프트 취소로 행을 보존한다
--   (R-5 신고자 기각률 집계·재신고 방지 UNIQUE 인덱스가 행 존재에 의존하기 때문).
-- 🔴 162 사고 재발 방지: 제약의 최종 정의는 가장 나중 마이그레이션이 소유한다 — 126의
--   reports_status_check 를 여기서 DROP 후 5값 전체로 재정의한다. 과거 파일은 건드리지 않는다.
-- 멱등: DROP CONSTRAINT IF EXISTS + ADD, 컬럼은 ADD COLUMN IF NOT EXISTS.
-- ================================================================

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('PENDING','REVIEWING','RESOLVED','REJECTED','CANCELLED'));

-- 신고자 본인이 취소한 시각. handled_at(운영자 처리 시각)과 의미가 달라 별도 컬럼으로 둔다.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

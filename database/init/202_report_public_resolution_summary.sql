-- ================================================================
-- 202_report_public_resolution_summary.sql
-- R-2(260819 W3, 신고 피드백 루프) — 신고자에게 처리 결과 사유를 통보하되, 내부 메모
--   (resolution_note)는 절대 노출하지 않는다. 어드민이 종결(RESOLVED/REJECTED) 시
--   선택 입력하는 공개용 요약 사유를 별도 컬럼으로 둔다 — resolution_note 와 분리해야
--   내부 메모가 실수로 새어나가는 구조를 막을 수 있다.
-- 멱등: ADD COLUMN IF NOT EXISTS.
-- ================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS public_resolution_summary TEXT;

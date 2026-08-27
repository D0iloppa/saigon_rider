-- ================================================================
-- 206_business_review_hidden_reason_code.sql
-- O-1(260827 community-enhancement §7) — hidden_reason(자유텍스트)을 사장님에게 그대로
--   노출하면 신고자를 특정할 단서가 섞일 위험이 있다(대표 미결 보고, 이제 확정). 원문은
--   계속 admin 전용으로 남기고, 오너에게는 이 코드를 i18n 매핑한 문구만 내려준다.
-- 기존 자유텍스트 데이터 마이그레이션은 하지 않는다(과설계 금지) — 이 컬럼 도입 이전에
--   숨겨진 건은 NULL 로 남고, 오너 화면은 NULL 을 일반 문구로 폴백 처리한다.
-- 멱등: ADD COLUMN IF NOT EXISTS.
-- ================================================================

ALTER TABLE business_review ADD COLUMN IF NOT EXISTS hidden_reason_code VARCHAR(20);

-- ================================================================
-- 200_business_review_moderation.sql
-- 후기 조치 + 작성자 통보 + 이의제기 세트 (대표 지적 2026-08-18):
--   업체가 정당한 1점 후기를 "악성리뷰"로 신고해도 운영자가 조치할 수단이 없었다.
--   marketplace_listing.moderated_at(admin_api/listings.py _apply_moderation)과 같은 원리로
--   새 테이블 대신 business_review 에 컬럼만 추가한다.
-- hidden_by 는 Report.handled_by(String(50))와 동일하게 admin username 문자열로 저장한다 —
--   root 관리자는 .env 정적 계정이라 UUID 가 아닐 수 있어(listings.py _admin_uuid 사고 회피) FK 대신 문자열.
-- M1(탐지≠차단): 이 마이그레이션은 조치 컬럼만 추가한다 — 신고가 이 컬럼을 자동으로 채우는
--   트리거/기본값은 없다. 숨김은 운영자가 admin_api/reviews.py 의 명시적 조치로만 일어난다.
-- 멱등: ADD COLUMN IF NOT EXISTS.
-- ================================================================

ALTER TABLE business_review ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE business_review ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE business_review ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(50);

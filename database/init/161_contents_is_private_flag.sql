-- ================================================================
-- 161_contents_is_private_flag.sql
--
-- F-06 잔여: 민감 content(사업자등록증·간판 등 검증 문서) 판정을 매 GET 마다
-- business_profile 역참조(biz_license_content_id/signboard_content_id)로 하던 방식은
-- ① 업로드~검증 제출 전까지 공개 ② 검증 반려로 참조가 끊기면 재공개 ③ 매 조회마다 추가
-- 쿼리라는 구멍이 있었다. contents 자체에 비공개 플래그를 두고 업로드 시점에 지정한다.
--
-- 백필: 이미 business_profile 에 연결된(참조된) 문서 content 는 회귀 없이 계속
-- 비공개로 남아야 하므로 is_private=TRUE 로 마킹한다.
--
-- 멱등(ADD COLUMN IF NOT EXISTS) — 147/151/158 패턴 미러.
-- ================================================================

ALTER TABLE contents
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE contents
SET is_private = TRUE
WHERE id IN (
  SELECT biz_license_content_id FROM business_profile WHERE biz_license_content_id IS NOT NULL
  UNION
  SELECT signboard_content_id FROM business_profile WHERE signboard_content_id IS NOT NULL
)
AND is_private = FALSE;

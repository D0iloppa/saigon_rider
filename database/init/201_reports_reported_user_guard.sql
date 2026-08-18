-- ================================================================
-- 201_reports_reported_user_guard.sql
--
-- init/199 가 BIZ 신고(대상이 유저가 아니라 업체)를 위해 reports.reported_user_id 를
-- nullable 로 완화했다. 그 결과 **"모든 신고에는 대상 유저가 있다"는 불변식이 BIZ 뿐 아니라
-- 전 타입에서 사라졌다** — DB 가 더 이상 막아주지 않는다.
--
-- admin_api/reports.py 는 reported_user_id 로 집계·조인을 여러 곳에서 한다
-- (신고 누적 카운트, 유저 브리프 조인 등). 비-BIZ 신고에 NULL 이 들어가면
-- 에러 없이 통계만 조용히 어긋난다.
--
-- → BIZ 예외만 허용하고 나머지는 원래대로 필수로 되돌린다.
--   (199 를 수정하지 않는다 — 제약의 최종 정의는 가장 나중 마이그레이션이 소유한다.
--    162 에서 과거 파일이 구 정의를 다시 못박아 부팅이 막힌 사고가 있었다.)
--
-- 멱등: DROP ... IF EXISTS 후 재생성.
-- ================================================================

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reported_user_required_check;
ALTER TABLE reports ADD CONSTRAINT reports_reported_user_required_check
    CHECK (target_type = 'BIZ' OR reported_user_id IS NOT NULL);

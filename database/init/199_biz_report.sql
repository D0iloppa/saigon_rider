-- ================================================================
-- 199_biz_report.sql
-- 소비자 → 업체 신고 창구 (대표 지적 2026-08-18) — 실측 권력 비대칭 갭:
--   업체→후기 O, 업체→소비자 O, 소비자→후기 O, 소비자→업체 X.
-- 016 §8-2 P-IMPERSONATE(사칭 업체, SEV1)의 유입 경로로 "신고·문의"가 이미 문서에 적혀 있었지만
-- 실제 신고 버튼이 없었다. 또한 016 §8-4 Decree 85/2021 은 전자상거래 플랫폼에 소비자 불만
-- 접수 창구를 의무화한다(L-3 앱 내 명시 의무는 법무 확인 대기) — 이 마이그레이션은 단순 UX 갭이
-- 아니라 컴플라이언스 리스크 해소도 겸한다.
-- 새 인프라 없이 통합 reports 테이블에 BIZ 를 합류시킨다(126/144/198 과 동일 패턴:
-- target_type CHECK 확장 + FK 컬럼 + 부분 유니크 인덱스).
--
-- 🔴 162 사고 재발 방지: reports_target_type_check 의 최종 정의는 가장 나중 마이그레이션이
--   소유한다 — 198 의 CHECK 를 여기서 DROP 후 7값 전체(BIZ 포함)로 재정의한다.
--   과거 파일(126/144/198)은 건드리지 않는다.
-- 🔴 W8 사고 재발 방지(2026-08-19): 144/198 은 이 제약을 NOT VALID 로만 재정의해 재실행 시
--   중간 단계 데이터 위반을 피한다 — 실제 전체 검증(모든 기존 행 재검사)은 여기, 최종 소유자인
--   199 에서만 일어난다(NOT VALID 미부여). 새 target_type 값을 또 추가하는 후속 마이그레이션이
--   생기면 그 파일이 새 최종 소유자가 되고, 이 ADD 에도 NOT VALID 를 붙여야 한다.
--
-- reported_user_id 완화: business_profile.user_id 는 관리자 직접등록 프로필에서 NULL 일 수 있다
-- (init/168). 기존 reports.reported_user_id 는 NOT NULL 이었으나, 오너 미연결 업체도 신고 대상이
-- 될 수 있어야 하므로 이 마이그레이션에서 NULL 허용으로 완화한다. 기존 LISTING/USER/DM/POST/
-- COMMENT/REVIEW 신고는 전부 채워서 계속 넣으므로 영향 없음.
--
-- M1(탐지≠차단): 이 마이그레이션은 신고 접수 인프라만 추가한다 — 업체 자동 숨김/제재 컬럼·트리거는
-- 두지 않는다. 판정은 운영자가 기존 reports 처리 플로우로 한다.
-- 멱등: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + ADD / CREATE UNIQUE INDEX IF NOT EXISTS.
-- ================================================================

ALTER TABLE reports ALTER COLUMN reported_user_id DROP NOT NULL;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS business_profile_id UUID REFERENCES business_profile(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('LISTING','USER','DM','POST','COMMENT','REVIEW','BIZ'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_biz_check;
ALTER TABLE reports ADD CONSTRAINT reports_biz_check CHECK (target_type <> 'BIZ' OR business_profile_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_biz_once ON reports (business_profile_id, reporter_id) WHERE target_type = 'BIZ';

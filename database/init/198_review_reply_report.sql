-- ================================================================
-- 198_review_reply_report.sql
-- 업체 후기 생애주기 갭 ③④ (대표 지적 2026-08-18, 016 §8-2 P-BAD-REVIEW):
--   ③ 사장님 댓글(답글) — business_review 에 컬럼 2개만 추가(후기당 1개, 새 테이블 불필요).
--   ④ 후기 신고 — 새 인프라 없이 통합 reports 테이블에 REVIEW 를 합류시킨다
--     (126/144/196 과 동일 패턴: target_type CHECK 확장 + FK 컬럼 + 부분 유니크 인덱스).
-- 🔴 162 사고 재발 방지: reports_target_type_check 의 최종 정의는 가장 나중 마이그레이션이
--   소유한다 — 144 의 CHECK 를 여기서 DROP 후 6값 전체(REVIEW 포함)로 재정의한다.
--   과거 파일(126/144)은 건드리지 않는다.
-- M1(탐지≠차단): 이 마이그레이션은 신고 접수 인프라만 추가한다 — 후기 자동 숨김 트리거/컬럼은
--   두지 않는다. 판정은 운영자가 기존 reports 처리 플로우로 한다.
-- 멱등: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + ADD / CREATE UNIQUE INDEX IF NOT EXISTS.
-- ================================================================

-- ③ 사장님 댓글(답글) — business_review 종속 컬럼 2개 (init/123)
ALTER TABLE business_review ADD COLUMN IF NOT EXISTS owner_reply TEXT;
ALTER TABLE business_review ADD COLUMN IF NOT EXISTS owner_replied_at TIMESTAMPTZ;

-- ④ 후기 신고 — reports 테이블에 REVIEW 합류
ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES business_review(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('LISTING','USER','DM','POST','COMMENT','REVIEW'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_review_check;
ALTER TABLE reports ADD CONSTRAINT reports_review_check CHECK (target_type <> 'REVIEW' OR review_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_review_once ON reports (review_id, reporter_id) WHERE target_type = 'REVIEW';

-- ================================================================
-- 185_issue_ops_taxonomy.sql
--
-- 013_ISSUE_OPS_SYSTEM_4PERSONA.md / 016_PLATFORM_MASTER_SUPPLEMENT.md §8 (L5 이슈)
-- #25(통합 이슈 인테이크) · #26(사고 유형·결과 코드) · #27(업체 전용 이슈 채널) 지원.
--
-- D-27 = (a): 신규 incident 테이블을 만들지 않고 기존 support_tickets(문의)를 확장하고,
-- reports(신고)와는 어드민 API 계층에서 병합(뷰가 아니라 애플리케이션 UNION — 규모상
-- DB VIEW 도입 이득이 없다는 판단, admin_api/issues.py 참조)한다.
--
-- 변경 내용:
-- 1) support_tickets: category(013 §8-2 taxonomy 코드) · severity(SEV1~4) · source(유입 채널) ·
--    persona(4관점) · result_code(#26 처리 결과 코드) · contract_context(#27 계약 컨텍스트 자동첨부)
--    추가. 값 카탈로그는 DB CHECK 가 아니라 백엔드(schemas.py)가 SoT — 기존 event_type/reason
--    관례 승계.
-- 2) support_tickets.user_id: EXTERNAL(외부 수기 등록, 예: 규제기관 공문·앱스토어 리뷰) 채널은
--    앱 사용자가 아닐 수 있어 NOT NULL 을 완화한다.
-- 3) reports: result_code 추가 — #26 B4 원칙("결과 코드 없이 종결 불가")을 신고 큐에도 동일 적용.
--    severity 는 신규 컬럼을 만들지 않는다 — 기존 reason 값에서 파생(admin_api/reports.py
--    `_REASON_SEV` 매핑, "신규 코드 아님" 원칙 — 016 §8-3).
--
-- 멱등(IF NOT EXISTS). ================================================================

ALTER TABLE support_tickets
    ADD COLUMN IF NOT EXISTS category         VARCHAR(30),
    ADD COLUMN IF NOT EXISTS severity         VARCHAR(10),
    ADD COLUMN IF NOT EXISTS source           VARCHAR(20) NOT NULL DEFAULT 'APP',
    ADD COLUMN IF NOT EXISTS persona          VARCHAR(10) NOT NULL DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS result_code      VARCHAR(30),
    ADD COLUMN IF NOT EXISTS contract_context JSONB;

COMMENT ON COLUMN support_tickets.category IS
    '013 §8-2 taxonomy 코드(예: P-NOSERVE, S-HIJACK) — schemas.IssueCategory 가 SoT, DB CHECK 없음';
COMMENT ON COLUMN support_tickets.severity IS
    'SEV1~4 — #26. category 로부터 기본값 파생 가능(schemas.ISSUE_CATEGORY_SEVERITY), 트리아지 시 재지정 가능';
COMMENT ON COLUMN support_tickets.source IS
    '유입 채널: APP(신고/문의) · BIZ(업체 전용 채널, #27) · EXTERNAL(외부 수기 등록, #25)';
COMMENT ON COLUMN support_tickets.persona IS
    '013 §2 4관점: USER · BIZ · OPS';
COMMENT ON COLUMN support_tickets.result_code IS
    '#26 처리 결과 코드 — RESOLVED 전이 시 미입력이면 422(admin_api/support.py 서버 강제)';
COMMENT ON COLUMN support_tickets.contract_context IS
    '#27 — BIZ 채널 제출 시 계약ID·지면(placement)·기간(starts_at/ends_at) 자동 첨부(JSONB)';

-- EXTERNAL 채널(외부 수기 등록)은 신고자/문의자가 앱 사용자가 아닐 수 있다.
ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS result_code VARCHAR(30);

COMMENT ON COLUMN reports.result_code IS
    '#26 처리 결과 코드 — RESOLVED/REJECTED 전이 시 미입력이면 422(admin_api/reports.py 서버 강제)';

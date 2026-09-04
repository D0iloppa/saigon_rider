-- 226: 이슈 담당자 배정 — support_tickets / reports 양쪽에 assignee_username.
-- FK 를 걸지 않는 이유: root 는 .env 정적 계정이라 admin_accounts 행이 없다.
-- AdminAuditLog.admin_username / UserSanction.admin_username / reports.handled_by 와 같은 문자열 관례.
-- reports.handled_by(종결 처리자)와 별개 — 배정(누가 볼 것인가)과 처리(누가 끝냈는가)는 다른 사실.
-- NULL = 미배정. 양쪽 모두 두어야 admin_api/issues.py 통합 큐의 "내 담당" 필터가 성립한다.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assignee_username VARCHAR(50);
ALTER TABLE reports         ADD COLUMN IF NOT EXISTS assignee_username VARCHAR(50);

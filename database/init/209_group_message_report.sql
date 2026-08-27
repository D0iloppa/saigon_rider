-- ================================================================
-- 209_group_message_report.sql
-- P5-5(260827 community-enhancement, Q-3 확정): 그룹 대화 신고는 방 전체가 아니라
-- 특정 메시지 단위. 통합 reports 테이블에 GROUP_MESSAGE 대상을 합류시킨다
-- (144/198/199 와 동일 패턴: target_type CHECK 확장 + FK 컬럼 + 부분 유니크 인덱스).
--
-- 🔴 162/W8 사고 재발 방지: reports_target_type_check 의 최종 정의는 가장 나중
--   마이그레이션이 소유한다 — 199 의 CHECK 를 여기서 DROP 후 8값 전체(GROUP_MESSAGE 포함)로
--   재정의한다(NOT VALID 없음 — 이 파일이 새 최종 소유자). 199 는 소유권을 넘겨주므로 이
--   마이그레이션에서 그 ADD CONSTRAINT 에 NOT VALID 를 붙인다(§10 규약 3번). 과거 파일
--   (126/144/198)은 건드리지 않는다.
--
-- 신고 대상 메시지는 기존 dm_messages 재사용(203_group_conversation.sql — 그룹/오픈톡방도
-- dm_conversations/dm_messages 를 conversation_type 으로 분기해 재사용, 별도 그룹메시지
-- 테이블 없음). reported_user_id 는 메시지 작성자(sender_id)로 채워 넣는다.
-- 멱등: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + ADD / CREATE UNIQUE INDEX IF NOT EXISTS.
-- ================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS group_message_id UUID REFERENCES dm_messages(id) ON DELETE CASCADE;

-- 이 파일이 새 최종 소유자 — NOT VALID 없이 기존 행 전부 검증. 199 는 소유권을 넘겨주므로
-- 그 ADD CONSTRAINT 에는 이 마이그레이션에서 NOT VALID 를 붙인다(아래 199 패치 참조).
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('LISTING','USER','DM','POST','COMMENT','REVIEW','BIZ','GROUP_MESSAGE'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_group_message_check;
ALTER TABLE reports ADD CONSTRAINT reports_group_message_check
    CHECK (target_type <> 'GROUP_MESSAGE' OR group_message_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_group_message_once
    ON reports (group_message_id, reporter_id) WHERE target_type = 'GROUP_MESSAGE';

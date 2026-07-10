-- SGR-312 BP-3: 비즈니스 계정 심사 결과 통지용 enum 값 추가
-- link 규약: 'biz&id=<profile_id>' (기존 'dm&id=<conv_id>' 규약 확장, 112_notifications_keyword_link.sql 참조)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BIZ';

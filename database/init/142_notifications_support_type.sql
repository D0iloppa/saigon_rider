-- FD-2/12: 고객센터 답변 인앱 알림용 enum 값 추가.
-- link 규약: 'support&id=<ticket_id>' (기존 'dm&id=', 'market&id=', 'biz&id=' 규약 확장, 112 참조)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'SUPPORT';

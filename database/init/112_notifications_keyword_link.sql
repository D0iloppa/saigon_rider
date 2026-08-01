-- P2 noti_worker: 키워드 알림 인앱 저장용 enum 값 + 알림함 클릭 이동용 딥링크 컬럼
-- link 규약: DM = 'dm&id=<conv_id>', 마켓 매물 = 'market&id=<listing_id>' (기존 push navigateTo 와 동일)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'KEYWORD';

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS link VARCHAR(200);

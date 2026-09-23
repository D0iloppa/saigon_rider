-- 239: 찜 매물 가격 인하 알림(noti_worker PRICE_DROP)이 DB enum 에 없어 알림 insert 가 실패하던 문제 보완.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PRICE_DROP';

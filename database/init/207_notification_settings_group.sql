-- P4-3: 그룹 새 글 알림 토글. 173_notification_settings_chat.sql 과 동일 패턴.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_settings' AND column_name = 'group_post'
  ) THEN
    ALTER TABLE notification_settings
      ADD COLUMN group_post BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

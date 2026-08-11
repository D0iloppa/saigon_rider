DO $$
BEGIN
  -- chat 컬럼이 없으면 추가하고 기존 사용자의 설정을 승계한다.
  -- 이전에 DM 푸시를 social 필드로 게이트했기 때문에,
  -- social=false인 사용자가 기본값 true로 인해 다시 푸시를 받는 회귀를 방지한다.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_settings' AND column_name = 'chat'
  ) THEN
    ALTER TABLE notification_settings
      ADD COLUMN chat BOOLEAN NOT NULL DEFAULT true;

    UPDATE notification_settings
    SET chat = social
    WHERE chat = true AND social = false;
  END IF;
END $$;

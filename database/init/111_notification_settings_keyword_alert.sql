ALTER TABLE notification_settings
    ADD COLUMN IF NOT EXISTS keyword_alert BOOLEAN NOT NULL DEFAULT true;

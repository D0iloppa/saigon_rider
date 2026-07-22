ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;

UPDATE users
SET session_expires_at = NOW() + INTERVAL '180 days'
WHERE passcode_hash IS NOT NULL
  AND session_expires_at IS NULL;

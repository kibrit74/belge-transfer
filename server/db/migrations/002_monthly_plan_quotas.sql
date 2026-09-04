ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
UPDATE users SET plan = 'standard' WHERE plan = 'member';
ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'standard';
ALTER TABLE users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'standard', 'plus', 'corporate'));

ALTER TABLE transfer_batches DROP CONSTRAINT IF EXISTS transfer_batches_status_check;
ALTER TABLE transfer_batches ADD CONSTRAINT transfer_batches_status_check
  CHECK (status IN ('pending', 'completed', 'failed'));
ALTER TABLE transfer_batches
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS transfer_batches_monthly_quota_idx
  ON transfer_batches(user_id, direction, status, created_at DESC);

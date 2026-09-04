CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'member' CHECK (plan IN ('member', 'corporate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('live_qr', 'secure_package', 'qr_video')),
  direction TEXT NOT NULL CHECK (direction IN ('send', 'receive')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  file_count INTEGER NOT NULL CHECK (file_count BETWEEN 1 AND 15),
  total_size_bytes BIGINT NOT NULL CHECK (total_size_bytes >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES transfer_batches(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 15),
  extension VARCHAR(16) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  UNIQUE (batch_id, ordinal)
);

CREATE INDEX IF NOT EXISTS sessions_active_token_idx ON sessions(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS transfer_batches_user_date_idx ON transfer_batches(user_id, created_at DESC);

-- 90 günlük saklama kuralı. Zamanlanmış görev bu sorguyu günlük çalıştırabilir.
DELETE FROM transfer_batches WHERE created_at < NOW() - INTERVAL '90 days';

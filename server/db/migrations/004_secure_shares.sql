CREATE TABLE IF NOT EXISTS secure_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  encrypted_payload BYTEA NOT NULL,
  access_code_verifier TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  max_downloads INTEGER NOT NULL CHECK (max_downloads IN (1, 3)),
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  delete_after_open BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS secure_shares_expiry_idx ON secure_shares(expires_at);

DELETE FROM secure_shares
WHERE expires_at <= NOW() OR download_count >= max_downloads;

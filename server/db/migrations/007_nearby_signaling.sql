CREATE TABLE nearby_rooms (
  id uuid PRIMARY KEY,
  code varchar(6) NOT NULL UNIQUE,
  host_token_hash char(64) NOT NULL,
  guest_token_hash char(64),
  status varchar(12) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'joined', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);

CREATE INDEX nearby_rooms_expires_at_idx ON nearby_rooms (expires_at);

CREATE TABLE nearby_signals (
  room_id uuid NOT NULL REFERENCES nearby_rooms(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  sender_role varchar(5) NOT NULL CHECK (sender_role IN ('host', 'guest')),
  kind varchar(8) NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'ready', 'close')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, sender_role, sequence)
);

CREATE INDEX nearby_signals_room_sequence_idx ON nearby_signals (room_id, sequence);

ALTER TABLE transfer_batches DROP CONSTRAINT IF EXISTS transfer_batches_method_check;
ALTER TABLE transfer_batches
  ADD CONSTRAINT transfer_batches_method_check
  CHECK (method IN ('live_qr', 'nearby', 'secure_package', 'qr_video'));

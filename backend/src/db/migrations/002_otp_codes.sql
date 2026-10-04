-- ==========================================================================
-- One-time codes sent to a phone (password reset by mobile number).
-- A 6-digit code is short, so it is protected three ways: only a keyed hash
-- is stored, it expires in minutes, and it dies after a few wrong attempts.
-- ==========================================================================
CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('PASSWORD_RESET')),
  channel     text NOT NULL CHECK (channel IN ('SMS')),
  destination text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id, purpose, created_at DESC);

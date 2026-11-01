-- Log in / sign up with a code sent by email (owner, 2026-10-31: "login ko simple karna hai"). One row per 6-digit
-- code sent to an email address. The address may not have an account yet: a correct code then leads to a new
-- customer account, so the code is kept by email, not by user. Only a keyed hash of the code is stored. A code
-- works once, for a few minutes, with a limited number of tries (the same settings as the password-reset codes).
CREATE TABLE IF NOT EXISTS login_codes (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (email, created_at DESC);

-- "Continue with Google" / "Continue with Facebook" (owner, 2026-10-26). A customer account can be reached through
-- Google (its "sub", the person's fixed Google id) or Facebook (the person's id for FrameX's app). The first social login
-- with an email that already has a customer account joins it; a new email makes a new customer account (no password,
-- no phone: the delivery address carries the phone). Only adds two columns; nothing existing changes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_key ON users (facebook_id) WHERE facebook_id IS NOT NULL;

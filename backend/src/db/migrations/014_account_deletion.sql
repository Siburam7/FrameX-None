-- A customer can delete their own account (owner's rules, 2026-10-20): the login and every personal detail go, the
-- order records stay for tax without a name or an address. The users row itself stays (orders and custom paintings
-- refer to it), emptied, switched off for good and marked here. Only adds a column; nothing existing changes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

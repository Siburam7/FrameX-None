-- Shops FrameX features, for example as a paid promotion (owner, 2026-10-21): an admin switches it on in
-- Admin -> Shops -> the shop -> Featured, optionally until a day. A featured shop comes first in the shop lists when
-- the visitor hasn't shared a location, and carries a "Featured" label. Only adds columns; nothing existing changes.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS featured_until timestamptz;

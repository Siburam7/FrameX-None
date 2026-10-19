-- FrameX Studio designs saved in the customer's ACCOUNT (until now only in one browser), so they open on any device.
-- Only adds a table; nothing existing changes.
--
--   config     the Studio's whole configuration (studio-engine.js), photo slots naming the browser's own photo ids
--   photos     { slot: uploadId }: the account's uploaded originals for those slots, so another device can fetch them.
--              A photo a saved design uses is kept (not swept as "unused", not deleted from the photo list)
--   thumbnail  a small picture of the design (a data: URL made in the browser), for the list
CREATE TABLE IF NOT EXISTS saved_designs (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       text NOT NULL,
  mode        text NOT NULL,
  template_id text,
  product_id  text,
  config      jsonb NOT NULL,
  photos      jsonb NOT NULL DEFAULT '{}'::jsonb,
  thumbnail   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_designs_user_idx ON saved_designs (user_id, updated_at DESC);

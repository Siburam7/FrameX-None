-- ==========================================================================
-- FrameX — customer photos, gift wrapping, shop fulfilment and shop products.
--
--   users ──1:n── uploads                       a customer's original photos (private files)
--   cart_items.photos                            which upload fills which photo space of a line
--   order_items ──1:n── order_item_photos ──> uploads
--                                                the photos an order line is printed from
--   order_items.fulfilment_status                where the shop is with making that line
--   orders.gift_wrap / gift_wrap_fee             the gift-wrapping choice and its charge
--   catalog_products.source / owner_shop_id      products a shop created in its dashboard
--   shops ──1:n── media_files                    product pictures a shop uploaded (public)
--
-- Nothing existing is removed or rewritten: every change adds a table or a
-- column with a default, so orders, carts, shops and products made before this
-- migration keep working as they are.
-- ==========================================================================

-- A customer's original photo, exactly as it was uploaded (never resized or
-- re-encoded). The file itself lives in the upload folder under storage_key and
-- is only ever sent through a short-lived signed link.
CREATE TABLE uploads (
  id            uuid PRIMARY KEY,
  -- An account that is deleted takes its unused photos with it. A photo that belongs to an
  -- order is held by order_item_photos (and the order holds the account).
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  storage_key   text NOT NULL UNIQUE,
  original_name text NOT NULL,
  -- Type, size and pixel dimensions are read from the file's own bytes by the server.
  mime_type     text NOT NULL,
  format        text NOT NULL CHECK (format IN ('jpeg', 'png', 'webp')),
  bytes         bigint NOT NULL CHECK (bytes > 0),
  width         integer NOT NULL CHECK (width > 0),
  height        integer NOT NULL CHECK (height > 0),
  orientation   smallint,                           -- EXIF orientation (1-8) when the file carries one
  sha256        text NOT NULL,                      -- proves the stored file is the uploaded file
  -- UPLOADED = waiting in a cart or a draft, ATTACHED = part of an order (kept), DELETED = file removed
  status        text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'ATTACHED', 'DELETED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  attached_at   timestamptz,
  deleted_at    timestamptz
);
CREATE INDEX uploads_user_idx ON uploads (user_id, created_at DESC);
CREATE INDEX uploads_unused_idx ON uploads (created_at) WHERE status = 'UPLOADED';

-- [{ "slot": "photo1", "uploadId": "<uuid>", "placement": { "x", "y", "zoom" } | null }, ...]
ALTER TABLE cart_items ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE order_items
  -- What kind of product the line is (photo-frame, custom-frame, template, home-decor, ...).
  ADD COLUMN product_type text,
  -- How many customer photos the line needs. NULL = ordered before photos were uploaded to FrameX.
  ADD COLUMN photos_required integer CHECK (photos_required >= 0),
  -- The shop's own progress on this line (separate from the order's status, which FrameX moves).
  ADD COLUMN fulfilment_status text NOT NULL DEFAULT 'NEW'
    CHECK (fulfilment_status IN ('NEW', 'ACCEPTED', 'IN_PRODUCTION', 'READY', 'HANDED_OVER')),
  ADD COLUMN fulfilment_note text,
  ADD COLUMN fulfilment_updated_at timestamptz,
  ADD COLUMN fulfilment_updated_by uuid;

CREATE TABLE order_item_photos (
  id            uuid PRIMARY KEY,
  order_item_id uuid NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  upload_id     uuid NOT NULL REFERENCES uploads (id),
  slot          text NOT NULL,                      -- photo1, photo2, ...
  position      integer NOT NULL,
  placement     jsonb,                              -- where the customer placed the photo, when the product offers that
  UNIQUE (order_item_id, slot)
);
CREATE INDEX order_item_photos_order_idx ON order_item_photos (order_id);
CREATE INDEX order_item_photos_upload_idx ON order_item_photos (upload_id);

-- Gift wrapping: chosen at checkout, charged once per order.
ALTER TABLE orders
  ADD COLUMN gift_wrap boolean NOT NULL DEFAULT false,
  ADD COLUMN gift_wrap_fee integer NOT NULL DEFAULT 0 CHECK (gift_wrap_fee >= 0);
ALTER TABLE orders DROP CONSTRAINT orders_total_adds_up;
ALTER TABLE orders ADD CONSTRAINT orders_total_adds_up CHECK (total = subtotal - discount + tax + shipping_fee + cod_fee + gift_wrap_fee);
ALTER TABLE orders ADD CONSTRAINT orders_gift_wrap_fee_needs_wrap CHECK (gift_wrap OR gift_wrap_fee = 0);

-- A shop may switch gift wrapping off for everything it sells.
ALTER TABLE shops ADD COLUMN gift_wrap boolean NOT NULL DEFAULT true;

-- Products a shop created in its dashboard live in the same table as the
-- catalogue file's products, so the cart, checkout and orders treat them alike.
--   source = 'site'  imported from the website's catalogue files on every start
--   source = 'shop'  created and managed by owner_shop_id through the API
ALTER TABLE catalog_products
  ADD COLUMN source text NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'shop')),
  ADD COLUMN owner_shop_id uuid REFERENCES shops (id),
  -- The shop's own status for the product: draft, pending_review, published, unpublished.
  ADD COLUMN listing_status text,
  ADD CONSTRAINT catalog_products_shop_has_owner CHECK ((source = 'shop') = (owner_shop_id IS NOT NULL));
CREATE INDEX catalog_products_owner_idx ON catalog_products (owner_shop_id) WHERE owner_shop_id IS NOT NULL;

-- Product pictures uploaded by a shop. Public (they are shown on product pages),
-- served at /media/<id> and /media/<id>/thumb.
CREATE TABLE media_files (
  id          uuid PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES shops (id),
  storage_key text NOT NULL UNIQUE,
  thumb_key   text UNIQUE,
  kind        text NOT NULL DEFAULT 'view',
  mime_type   text NOT NULL,
  bytes       bigint NOT NULL CHECK (bytes > 0),
  width       integer NOT NULL CHECK (width > 0),
  height      integer NOT NULL CHECK (height > 0),
  created_by  uuid REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_files_shop_idx ON media_files (shop_id, created_at DESC);

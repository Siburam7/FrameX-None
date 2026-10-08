-- ==========================================================================
-- FrameX — catalogue + cart.
--
--   catalog_products    what can be bought, with the complete product record.
--   catalog_templates   the personalised design templates of FrameX Studio.
--       Both are imported from the website's catalogue files when the server
--       starts (see src/services/catalog-service.js). The cart reads products
--       and prices from these tables, never from the browser.
--
--   users ──1:1── carts ──1:n── cart_items ──> catalog_products / catalog_templates
--       A cart belongs to exactly one account (carts.user_id is UNIQUE).
--       There is no cart without an account.
-- ==========================================================================

CREATE TABLE catalog_products (
  id          text PRIMARY KEY,                 -- catalogue id, e.g. "p-001"
  slug        text NOT NULL,
  name        text NOT NULL,
  shop_ref    text NOT NULL,                    -- catalogue shop id, e.g. "shop-001"
  shop_name   text NOT NULL,
  -- ACTIVE   = visible, and its shop is active
  -- INACTIVE = hidden in the catalogue, or its shop is inactive
  -- REMOVED  = no longer in the catalogue (kept so carts can say so)
  status      text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'REMOVED')),
  data        jsonb NOT NULL,                   -- the product record (sizes, prices, options...)
  source_hash text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_products_shop_idx ON catalog_products (shop_ref);

CREATE TABLE catalog_templates (
  id          text PRIMARY KEY,                 -- e.g. "tpl-001"
  title       text NOT NULL,
  status      text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'REMOVED')),
  data        jsonb NOT NULL,
  source_hash text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE carts (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id            uuid PRIMARY KEY,
  cart_id       uuid NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  -- PRODUCT = a listed product with a choice of options
  -- STUDIO  = a FrameX Studio design (template, single photo, or a customised product)
  kind          text NOT NULL CHECK (kind IN ('PRODUCT', 'STUDIO')),
  product_id    text REFERENCES catalog_products (id),
  template_id   text REFERENCES catalog_templates (id),
  -- Same product + same options + same note = the same line (quantities add up).
  line_key      text NOT NULL,
  quantity      integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  selection     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- option ids: size, colour, print, front cover
  customization jsonb,                                -- STUDIO: the complete design
  design_ref    text,                                 -- STUDIO: the design's id
  thumbnail     text,                                 -- STUDIO: small preview picture
  note          text NOT NULL DEFAULT '',
  title         text NOT NULL,                        -- name when added (shown if the product is later removed)
  unit_price    integer NOT NULL CHECK (unit_price >= 0),  -- price snapshot in whole rupees, set by the server
  currency      text NOT NULL DEFAULT 'INR',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, line_key),
  CHECK ((kind = 'PRODUCT' AND product_id IS NOT NULL) OR (kind = 'STUDIO' AND customization IS NOT NULL))
);
CREATE INDEX cart_items_cart_idx ON cart_items (cart_id, created_at);

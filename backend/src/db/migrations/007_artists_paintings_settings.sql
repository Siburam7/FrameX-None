-- Art & Artists, custom paintings paid in two parts, notifications, reviews,
-- platform settings, and what a second payment gateway (Cashfree) needs.
-- Nothing existing is removed or rewritten: new tables, new columns with
-- defaults, and two CHECK constraints widened.

/* ---------------------------------------------------------------- Artists */

CREATE SEQUENCE artist_code_seq START 1001;

-- "Join as an artist": a request for FrameX to review. It creates no login.
CREATE TABLE artist_applications (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL,
  city          text NOT NULL,
  state         text NOT NULL,
  art_styles    text,
  mediums       text,
  experience    text,
  portfolio_url text,
  message       text,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note   text,
  reviewed_by   uuid REFERENCES users (id),
  reviewed_at   timestamptz,
  artist_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artist_applications_status_idx ON artist_applications (status, created_at DESC);
CREATE INDEX artist_applications_email_idx ON artist_applications (lower(email));

CREATE TABLE artists (
  id             uuid PRIMARY KEY,
  artist_code    text NOT NULL UNIQUE,               -- FRX-ART-1001; also the seller reference on their order lines
  username       text NOT NULL,                      -- shown as @username
  name           text NOT NULL,
  bio            text,
  experience     text,
  specialties    jsonb NOT NULL DEFAULT '[]'::jsonb,
  mediums        jsonb NOT NULL DEFAULT '[]'::jsonb,
  styles         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Public location is the city and (if the artist wants) the area. A street address is never stored here.
  city           text NOT NULL,
  area           text,
  state          text NOT NULL,
  country        text NOT NULL DEFAULT 'IN',
  show_area      boolean NOT NULL DEFAULT true,
  email          text,                               -- contact for FrameX; never public
  phone          text,                               -- never public
  photo_media    uuid,
  cover_media    uuid,
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  custom_enabled boolean NOT NULL DEFAULT true,      -- takes custom painting requests
  is_demo        boolean NOT NULL DEFAULT false,
  application_id uuid REFERENCES artist_applications (id),
  created_by     uuid REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX artists_username_key ON artists (lower(username));
CREATE INDEX artists_city_idx ON artists (lower(city));
ALTER TABLE artist_applications ADD CONSTRAINT artist_applications_artist_fk FOREIGN KEY (artist_id) REFERENCES artists (id);

-- An artist logs in with their own account, like a shop does.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'SHOP', 'ADMIN', 'ARTIST'));
ALTER TABLE users ADD COLUMN artist_id uuid REFERENCES artists (id);
ALTER TABLE users ADD CONSTRAINT users_artist_role CHECK ((role = 'ARTIST') = (artist_id IS NOT NULL));
CREATE INDEX users_artist_idx ON users (artist_id) WHERE artist_id IS NOT NULL;

-- Public pictures (profile photo, artwork pictures) use the same store as shops' product pictures.
ALTER TABLE media_files ALTER COLUMN shop_id DROP NOT NULL;
ALTER TABLE media_files ADD COLUMN artist_id uuid REFERENCES artists (id);
ALTER TABLE media_files ADD CONSTRAINT media_files_one_owner CHECK ((shop_id IS NOT NULL) <> (artist_id IS NOT NULL));
CREATE INDEX media_files_artist_idx ON media_files (artist_id, created_at DESC) WHERE artist_id IS NOT NULL;

/* ---------------------------------------------------------------- Artworks
   An artist's finished work. Customers only see it once FrameX has approved
   it; an approved artwork is also a row in catalog_products (source 'artist'),
   so the cart, checkout, stock and orders treat it like any other product. */

CREATE TABLE artworks (
  id               text PRIMARY KEY,                 -- "aw-..."; the same id in catalog_products once approved
  artist_id        uuid NOT NULL REFERENCES artists (id),
  title            text NOT NULL,
  slug             text NOT NULL,
  status           text NOT NULL CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'INACTIVE')),
  price            integer NOT NULL CHECK (price >= 0),   -- whole rupees
  data             jsonb NOT NULL,                   -- description, medium, size, pictures, ...
  rejection_reason text,
  reviewed_by      uuid REFERENCES users (id),
  reviewed_at      timestamptz,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artworks_artist_idx ON artworks (artist_id, updated_at DESC);
CREATE INDEX artworks_status_idx ON artworks (status, submitted_at);

ALTER TABLE catalog_products DROP CONSTRAINT catalog_products_source_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_source_check CHECK (source IN ('site', 'shop', 'artist'));
ALTER TABLE catalog_products ADD COLUMN owner_artist_id uuid REFERENCES artists (id);
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_artist_has_owner CHECK ((source = 'artist') = (owner_artist_id IS NOT NULL));
CREATE INDEX catalog_products_artist_idx ON catalog_products (owner_artist_id) WHERE owner_artist_id IS NOT NULL;

/* ---------------------------------------------------------------- Custom paintings */

-- The artist's price list: a size and kind of work at a fixed price.
CREATE TABLE painting_services (
  id          uuid PRIMARY KEY,
  artist_id   uuid NOT NULL REFERENCES artists (id),
  title       text NOT NULL,                         -- e.g. "Pencil drawing"
  art_type    text NOT NULL,
  medium      text,
  size        text NOT NULL,                         -- e.g. "12 x 16 in"
  price       integer NOT NULL CHECK (price > 0),    -- whole rupees
  description text,
  est_days    integer CHECK (est_days BETWEEN 1 AND 365),
  active      boolean NOT NULL DEFAULT true,
  removed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX painting_services_artist_idx ON painting_services (artist_id, price);

CREATE SEQUENCE painting_request_seq START 100001;

/* One request = one painting. Its status only moves along these lines
   (enforced in painting-service.js):
     PENDING_ARTIST_RESPONSE -> DECLINED | ADVANCE_PAYMENT_PENDING | CANCELLED
     ADVANCE_PAYMENT_PENDING -> ADVANCE_PAID (verified payment only) | CANCELLED
     ADVANCE_PAID            -> PAINTING_IN_PROGRESS
     PAINTING_IN_PROGRESS    -> REMAINING_PAYMENT_PENDING
     REMAINING_PAYMENT_PENDING -> READY_FOR_DISPATCH (verified payment only)
     READY_FOR_DISPATCH      -> SHIPPED -> DELIVERED
   Money and refunds are tracked beside the status, not inside it. */
CREATE TABLE painting_requests (
  id               uuid PRIMARY KEY,
  request_number   text NOT NULL UNIQUE,             -- CP-100001
  user_id          uuid NOT NULL REFERENCES users (id),
  artist_id        uuid NOT NULL REFERENCES artists (id),
  service_id       uuid REFERENCES painting_services (id) ON DELETE SET NULL,
  service          jsonb NOT NULL,                   -- the service as it was when requested
  price            integer NOT NULL CHECK (price > 0),
  currency         text NOT NULL DEFAULT 'INR',
  advance_percent  integer NOT NULL CHECK (advance_percent BETWEEN 1 AND 99),
  advance_amount   integer NOT NULL CHECK (advance_amount > 0),
  balance_amount   integer NOT NULL CHECK (balance_amount > 0),
  instructions     text NOT NULL DEFAULT '',
  status           text NOT NULL CHECK (status IN ('PENDING_ARTIST_RESPONSE', 'DECLINED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID',
                     'PAINTING_IN_PROGRESS', 'REMAINING_PAYMENT_PENDING', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  payment_status   text NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'ADVANCE_PAID', 'FULLY_PAID')),
  refund_status    text NOT NULL DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'REFUND_PENDING', 'REFUNDED')),
  refund_note      text,
  amount_paid      integer NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  shipping_address jsonb NOT NULL,
  customer_name    text NOT NULL,
  customer_email   text NOT NULL,
  customer_phone   text,
  decline_reason   text,
  cancel_reason    text,
  dispatch_note    text,
  idempotency_key  text NOT NULL,
  responded_at     timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  shipped_at       timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CONSTRAINT painting_requests_split_adds_up CHECK (advance_amount + balance_amount = price),
  CONSTRAINT painting_requests_paid_within_price CHECK (amount_paid <= price)
);
CREATE INDEX painting_requests_user_idx ON painting_requests (user_id, created_at DESC);
CREATE INDEX painting_requests_artist_idx ON painting_requests (artist_id, status, created_at DESC);

-- The customer's reference photos (private originals in "uploads").
CREATE TABLE painting_request_photos (
  id         uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES painting_requests (id) ON DELETE CASCADE,
  upload_id  uuid NOT NULL REFERENCES uploads (id),
  position   integer NOT NULL,
  UNIQUE (request_id, upload_id)
);
CREATE INDEX painting_request_photos_upload_idx ON painting_request_photos (upload_id);

-- The two payments of a painting: ADVANCE and BALANCE. One row per attempt.
CREATE TABLE painting_payments (
  id                 uuid PRIMARY KEY,
  request_id         uuid NOT NULL REFERENCES painting_requests (id) ON DELETE CASCADE,
  stage              text NOT NULL CHECK (stage IN ('ADVANCE', 'BALANCE')),
  attempt            integer NOT NULL,
  provider           text NOT NULL,
  status             text NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  amount             integer NOT NULL CHECK (amount > 0),
  currency           text NOT NULL DEFAULT 'INR',
  gateway_order_id   text,
  gateway_session    text,
  gateway_payment_id text,
  instrument         text,
  failure_code       text,
  failure_reason     text,
  verified_via       text,                            -- 'checkout', 'webhook', 'reconcile'
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, stage, attempt)
);
-- A stage can only ever be paid once.
CREATE UNIQUE INDEX painting_payments_one_paid_idx ON painting_payments (request_id, stage) WHERE status = 'PAID';
CREATE INDEX painting_payments_gateway_order_idx ON painting_payments (provider, gateway_order_id);
CREATE UNIQUE INDEX painting_payments_gateway_payment_idx ON painting_payments (provider, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

CREATE TABLE painting_events (
  id            uuid PRIMARY KEY,
  request_id    uuid NOT NULL REFERENCES painting_requests (id) ON DELETE CASCADE,
  status        text,
  detail        text,
  actor_user_id uuid,
  actor_role    text,                                 -- CUSTOMER, ARTIST, ADMIN or SYSTEM
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX painting_events_request_idx ON painting_events (request_id, created_at);

/* ---------------------------------------------------------------- Customer photos: what each one is for */

ALTER TABLE uploads ADD COLUMN role text NOT NULL DEFAULT 'PRINT_ASSET'
  CHECK (role IN ('PRINT_ASSET', 'TEMPLATE_SLOT_IMAGE', 'CUSTOMER_REFERENCE_IMAGE'));

/* ---------------------------------------------------------------- Orders: who sells each line, what kind of order it is */

ALTER TABLE orders ADD COLUMN order_type text NOT NULL DEFAULT 'STANDARD_PRODUCT_ORDER'
  CHECK (order_type IN ('STANDARD_PRODUCT_ORDER', 'PERSONALIZED_PRODUCT_ORDER', 'TEMPLATE_ORDER', 'ARTWORK_ORDER', 'MIXED_ORDER'));
-- What the gateway hands the browser to open its checkout (Cashfree's payment session). Not a secret; expires with the order.
ALTER TABLE orders ADD COLUMN gateway_session text;
ALTER TABLE order_items ADD COLUMN seller_type text NOT NULL DEFAULT 'SHOP' CHECK (seller_type IN ('FRAME_X_STUDIO', 'SHOP', 'ARTIST'));
ALTER TABLE order_items ADD COLUMN artist_id uuid REFERENCES artists (id);
CREATE INDEX order_items_artist_idx ON order_items (artist_id) WHERE artist_id IS NOT NULL;

-- Lines ordered before this migration: a line whose seller is not a shop on FrameX was sold by FrameX itself.
UPDATE order_items i SET seller_type = 'FRAME_X_STUDIO'
 WHERE NOT EXISTS (SELECT 1 FROM shops s WHERE s.catalog_ref = i.shop_ref OR s.shop_code = i.shop_ref);

-- Orders placed before this migration: lines made from the customer's photos are personalised orders.
UPDATE orders o SET order_type = 'PERSONALIZED_PRODUCT_ORDER'
 WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND (i.kind = 'STUDIO' OR coalesce(i.photos_required, 0) > 0));

/* ---------------------------------------------------------------- Notifications (in the account, beside the emails) */

CREATE TABLE notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text,                                    -- a page of the website, e.g. "painting.html?id=CP-100001"
  ref        text NOT NULL DEFAULT '',                -- what it is about; (user, kind, ref) is stored once
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

/* ---------------------------------------------------------------- Reviews
   Only someone who received the thing can review it: source_type / source_id
   name the delivered order or painting the review comes from. */

CREATE TABLE reviews (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('PRODUCT', 'SHOP', 'ARTIST', 'ARTWORK')),
  target_id   text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('ORDER', 'PAINTING')),
  source_id   text NOT NULL,                          -- order number or request number
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text NOT NULL DEFAULT '',
  author_name text NOT NULL,
  status      text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id, source_id)
);
CREATE INDEX reviews_target_idx ON reviews (target_type, target_id, created_at DESC) WHERE status = 'PUBLISHED';

/* ---------------------------------------------------------------- Platform settings
   Values a FrameX admin can change without touching the server's environment.
   A key that is not here keeps the value from the environment (config.js). */

CREATE TABLE platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

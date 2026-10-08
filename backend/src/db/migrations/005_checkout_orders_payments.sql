-- ==========================================================================
-- FrameX — checkout, orders and payments.
--
--   users ──1:n── addresses
--   users ──1:n── orders ──1:n── order_items      a snapshot of what was bought
--                   │──1:n── payments             one row per payment attempt
--                   │──1:n── refunds
--                   │──1:n── order_events         the order's history
--                   └──1:n── order_notifications  which emails were sent (each once)
--   payment_events                                every gateway webhook, once
--
-- Money is stored in whole rupees (integers), like catalogue and cart prices.
-- An order's ORDER status and its PAYMENT status are two separate columns.
-- Nothing about a card is ever stored: no number, no expiry, no CVV.
-- ==========================================================================

-- Units taken by orders since the catalogue's stock number last changed.
-- Available stock = the catalogue's stock - stock_reserved.
ALTER TABLE catalog_products ADD COLUMN stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0);

CREATE TABLE addresses (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text NOT NULL,
  line1       text NOT NULL,          -- house / flat / street
  line2       text,                   -- area / locality
  landmark    text,
  city        text NOT NULL,
  state       text NOT NULL,
  postal_code text NOT NULL,
  country     text NOT NULL DEFAULT 'IN',
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id, created_at);
CREATE UNIQUE INDEX addresses_one_default_idx ON addresses (user_id) WHERE is_default;

-- Order numbers customers see: FX-100001, FX-100002, ...
CREATE SEQUENCE order_number_seq START 100001;

CREATE TABLE orders (
  id                 uuid PRIMARY KEY,
  order_number       text NOT NULL UNIQUE,
  user_id            uuid NOT NULL REFERENCES users (id),
  -- Sent by the browser with "place order". The same key always answers with
  -- the same order, so a double click or a refresh can't create a second one.
  idempotency_key    text NOT NULL,

  -- ORDER status: where the order is on its way to the customer.
  status             text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED')),
  -- PAYMENT status: where the money is. Changed only by the server after it
  -- has verified the gateway's answer (or, for COD, on delivery).
  payment_method     text NOT NULL CHECK (payment_method IN ('COD', 'ONLINE')),
  payment_status     text NOT NULL CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  payment_gateway    text,            -- e.g. 'razorpay'; NULL for COD
  gateway_order_id   text,
  gateway_payment_id text,            -- the payment that paid this order
  payment_instrument text,            -- what the gateway says was used: upi, card, netbanking, wallet...

  -- All amounts are worked out by the server.
  currency           text NOT NULL DEFAULT 'INR',
  subtotal           integer NOT NULL CHECK (subtotal >= 0),      -- items at list price
  discount           integer NOT NULL CHECK (discount >= 0),      -- product discounts
  tax                integer NOT NULL CHECK (tax >= 0),
  tax_percent        numeric(5, 2) NOT NULL DEFAULT 0,
  shipping_fee       integer NOT NULL CHECK (shipping_fee >= 0),
  cod_fee            integer NOT NULL CHECK (cod_fee >= 0),
  total              integer NOT NULL CHECK (total >= 0),
  amount_refunded    integer NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
  item_count         integer NOT NULL CHECK (item_count >= 1),

  -- The address as it was when the order was placed (later edits don't change it).
  address_id         uuid REFERENCES addresses (id) ON DELETE SET NULL,
  shipping_address   jsonb NOT NULL,
  customer_name      text NOT NULL,
  customer_email     text NOT NULL,
  customer_phone     text,

  stock_held         boolean NOT NULL DEFAULT true,   -- false once the order's stock was given back
  expires_at         timestamptz,                     -- PENDING_PAYMENT: when an unpaid order is cancelled
  cancel_reason      text,
  placed_at          timestamptz,
  paid_at            timestamptz,
  cancelled_at       timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, idempotency_key),
  CONSTRAINT orders_total_adds_up CHECK (total = subtotal - discount + tax + shipping_fee + cod_fee),
  CONSTRAINT orders_cod_has_no_gateway CHECK (payment_method <> 'COD' OR payment_gateway IS NULL)
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_unpaid_idx ON orders (expires_at) WHERE status = 'PENDING_PAYMENT';
CREATE UNIQUE INDEX orders_gateway_order_idx ON orders (payment_gateway, gateway_order_id) WHERE gateway_order_id IS NOT NULL;

CREATE TABLE order_items (
  id              uuid PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  position        integer NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('PRODUCT', 'STUDIO')),
  product_id      text REFERENCES catalog_products (id),
  template_id     text REFERENCES catalog_templates (id),
  -- The seller of this item, for fulfilment (and later for settling with shops).
  shop_ref        text NOT NULL,
  shop_name       text NOT NULL,
  -- Snapshot: what the customer bought, as it was then.
  name            text NOT NULL,
  image           text,
  size            text,
  color           text,
  options         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- readable option lines
  selection       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- option ids
  customization   jsonb,                                -- STUDIO: the complete design
  design_ref      text,
  design_summary  jsonb,                                -- STUDIO: readable summary, text, photo count
  note            text NOT NULL DEFAULT '',
  quantity        integer NOT NULL CHECK (quantity >= 1),
  unit_list_price integer NOT NULL CHECK (unit_list_price >= 0),
  unit_discount   integer NOT NULL CHECK (unit_discount >= 0),
  unit_price      integer NOT NULL CHECK (unit_price >= 0),
  line_total      integer NOT NULL CHECK (line_total >= 0),
  cart_item_id    uuid,                                 -- the cart line it came from (removed once the order is placed)
  CONSTRAINT order_items_price_adds_up CHECK (unit_price = unit_list_price - unit_discount AND line_total = unit_price * quantity)
);
CREATE INDEX order_items_order_idx ON order_items (order_id, position);
CREATE INDEX order_items_shop_idx ON order_items (shop_ref);

-- One row per payment attempt. Failed and abandoned attempts stay for the record.
CREATE TABLE payments (
  id                 uuid PRIMARY KEY,
  order_id           uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  attempt            integer NOT NULL,
  provider           text NOT NULL,                     -- 'razorpay', or 'cod'
  method_requested   text,                              -- what the customer picked: upi, card, netbanking, wallet
  status             text NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  amount             integer NOT NULL CHECK (amount >= 0),
  currency           text NOT NULL DEFAULT 'INR',
  amount_refunded    integer NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
  gateway_order_id   text,
  gateway_payment_id text,
  instrument         text,                              -- reported by the gateway
  failure_code       text,
  failure_reason     text,
  verified_via       text,                              -- 'checkout', 'webhook', 'reconcile', 'delivery'
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt)
);
CREATE INDEX payments_gateway_order_idx ON payments (provider, gateway_order_id);
-- A gateway payment belongs to exactly one attempt.
CREATE UNIQUE INDEX payments_gateway_payment_idx ON payments (provider, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

CREATE TABLE refunds (
  id                uuid PRIMARY KEY,
  order_id          uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  payment_id        uuid NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  provider          text NOT NULL,
  gateway_refund_id text,
  amount            integer NOT NULL CHECK (amount > 0),
  status            text NOT NULL CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  reason            text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_order_idx ON refunds (order_id, created_at);
CREATE UNIQUE INDEX refunds_gateway_idx ON refunds (provider, gateway_refund_id) WHERE gateway_refund_id IS NOT NULL;

-- Every webhook the gateway sends, stored once (UNIQUE), so a repeated
-- delivery is recognised and changes nothing. Only ids, status, amount and
-- method are kept: no card, bank or contact details.
CREATE TABLE payment_events (
  id                 uuid PRIMARY KEY,
  provider           text NOT NULL,
  event_id           text NOT NULL,
  event_type         text NOT NULL,
  gateway_order_id   text,
  gateway_payment_id text,
  order_id           uuid,
  summary            jsonb NOT NULL DEFAULT '{}'::jsonb,
  result             text,
  processed_at       timestamptz,
  received_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE INDEX payment_events_order_idx ON payment_events (order_id);

-- The order's history, shown to the customer and to admins.
CREATE TABLE order_events (
  id            uuid PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('ORDER', 'PAYMENT', 'REFUND', 'NOTE')),
  status        text,
  detail        text,
  actor_user_id uuid,
  actor_role    text,                -- CUSTOMER, ADMIN, or SYSTEM (gateway, timer)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

-- One row per email about an order. The UNIQUE key is what stops a second
-- "payment received" email when the gateway repeats a webhook.
CREATE TABLE order_notifications (
  id         uuid PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  ref        text NOT NULL DEFAULT '',
  recipient  text NOT NULL,
  delivered  boolean,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind, ref)
);

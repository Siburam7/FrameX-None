/* ==========================================================================
   Analytics for the admin dashboard.

   Three additions. Nothing existing is changed or removed.

   1. analytics_events: what visitors looked at (pages, products, templates,
      searches). Rows come from the website ONLY for visitors who allowed
      analytics there, and carry no name, email, phone, address or account id:
      visitor_id is a random id the visitor's own browser made after they said
      yes. source 'server' rows are written by the backend itself when a
      logged-in customer adds something to their cart (no visitor id at all).

   2. auth_events: one row per login and per failed login, for the security
      figures of the dashboard. A failed attempt keeps the account it was
      aimed at (when there is one) and the reason, never what was typed.

   3. orders.is_test / painting_requests.is_test: true when the order was
      paid (or is to be paid) with a payment gateway in TEST mode, or when an
      admin marked it as a test. Test orders are reported separately and are
      never counted as sales. Rows that existed before this file have NULL
      here until the server starts once (analytics-service.js -> labelOlderOrders).
   ========================================================================== */

CREATE TABLE analytics_events (
  id           uuid PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL CHECK (source IN ('web', 'server')),
  name         text NOT NULL,              -- page_view, view_item, view_template, search, add_to_cart, begin_checkout, ...
  visitor_id   text,                       -- random, made in the browser after consent; NULL for server rows
  session_id   text,                       -- one visit (ends after 30 minutes without activity)
  page         text,                       -- kind of page: home, product, templates, ...
  path         text,                       -- "/product.html" (never the query string or the part after #)
  landing      boolean NOT NULL DEFAULT false,   -- the first page of a visit
  referrer     text,                       -- the HOST the visit came from, e.g. "google.com"
  channel      text,                       -- direct, search, social, referral, campaign, email, paid
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  item_type    text,                       -- product, template, artwork, artist, shop, category
  item_id      text,
  item_name    text,
  category     text,
  query        text,                       -- search words, with anything that looks like an email or a phone number removed
  value        integer,                    -- whole rupees, where it applies
  device       text,                       -- mobile, tablet, desktop
  logged_in    boolean
);
CREATE INDEX analytics_events_time_idx ON analytics_events (occurred_at);
CREATE INDEX analytics_events_name_idx ON analytics_events (name, occurred_at);
CREATE INDEX analytics_events_item_idx ON analytics_events (item_type, item_id, occurred_at) WHERE item_id IS NOT NULL;

CREATE TABLE auth_events (
  id           uuid PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('LOGIN', 'LOGIN_FAILED')),
  user_id      uuid REFERENCES users (id) ON DELETE SET NULL,   -- the account, when the attempt matched one
  role         text,
  account_type text,                       -- which login form: customer or shop
  reason       text,                       -- LOGIN_FAILED: INVALID_CREDENTIALS, ACCOUNT_DISABLED, ...
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_time_idx ON auth_events (created_at);
CREATE INDEX auth_events_kind_idx ON auth_events (kind, created_at);

ALTER TABLE orders ADD COLUMN is_test boolean;
ALTER TABLE orders ALTER COLUMN is_test SET DEFAULT false;
ALTER TABLE orders ADD COLUMN test_note text;
ALTER TABLE painting_requests ADD COLUMN is_test boolean;
ALTER TABLE painting_requests ALTER COLUMN is_test SET DEFAULT false;

-- The reports ask for rows by date.
CREATE INDEX orders_created_idx ON orders (created_at);
CREATE INDEX orders_paid_idx ON orders (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX payments_created_idx ON payments (created_at);
CREATE INDEX refunds_created_idx ON refunds (created_at);
CREATE INDEX users_created_idx ON users (created_at);
CREATE INDEX painting_requests_created_idx ON painting_requests (created_at);
CREATE INDEX painting_payments_paid_idx ON painting_payments (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX cart_items_updated_idx ON cart_items (updated_at);

-- Payouts: where FrameX sends a shop's or an artist's money (a bank account or a UPI ID), and every payout FrameX
-- has made. Only adds tables; nothing existing is changed.
--
--   payout_accounts   one per shop or artist. The account number / UPI ID is kept sealed (AES-256-GCM, the key is
--                     PAYOUT_ENCRYPTION_KEY in the environment, see lib/sealed.js); `hint` is what pages show.
--   payouts           one payment FrameX made (by bank transfer or UPI, outside the site), with how it was worked out:
--                     the seller's online sales and their part of delivery, gift wrap and tax on those orders, less
--                     FrameX's commission on all their sales (Cash on Delivery included: that cash is with the seller)
--                     and the payout charge.
--   payout_lines      what a payout paid for: an order line or a custom painting. Each can be paid out only once.

CREATE TABLE IF NOT EXISTS payout_accounts (
  id           uuid PRIMARY KEY,
  shop_id      uuid UNIQUE REFERENCES shops (id),
  artist_id    uuid UNIQUE REFERENCES artists (id),
  method       text NOT NULL CHECK (method IN ('BANK', 'UPI')),
  holder_name  text NOT NULL,
  details      text NOT NULL,   -- sealed JSON: { accountNumber, ifsc, bankName } or { upiId }
  hint         text NOT NULL,   -- "HDFC0001234 · ••••4821" or "as•••@okaxis"
  updated_by   uuid REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_accounts_one_owner CHECK ((shop_id IS NULL) <> (artist_id IS NULL))
);

CREATE SEQUENCE IF NOT EXISTS payout_number_seq START 100001;

CREATE TABLE IF NOT EXISTS payouts (
  id                 uuid PRIMARY KEY,
  payout_number      text NOT NULL UNIQUE,             -- PO-100001
  shop_id            uuid REFERENCES shops (id),
  artist_id          uuid REFERENCES artists (id),
  sales              integer NOT NULL CHECK (sales >= 0),          -- the seller's items, all payment methods
  online_sales       integer NOT NULL CHECK (online_sales >= 0),   -- of which paid online (the money FrameX holds)
  extras             integer NOT NULL DEFAULT 0 CHECK (extras >= 0), -- their part of delivery, gift wrap and tax, online orders
  commission_percent numeric(5, 2) NOT NULL,
  commission         integer NOT NULL CHECK (commission >= 0),
  fee_percent        numeric(5, 2) NOT NULL,
  fee                integer NOT NULL CHECK (fee >= 0),            -- the payout charge
  amount             integer NOT NULL CHECK (amount > 0),          -- what was sent
  method             text NOT NULL CHECK (method IN ('BANK', 'UPI')),
  account_hint       text NOT NULL,
  reference          text NOT NULL,                                -- the bank's UTR or the UPI reference
  note               text,
  paid_by            uuid NOT NULL REFERENCES users (id),
  paid_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payouts_one_owner CHECK ((shop_id IS NULL) <> (artist_id IS NULL)),
  CONSTRAINT payouts_adds_up CHECK (amount = online_sales + extras - commission - fee)
);
CREATE INDEX IF NOT EXISTS payouts_shop_idx ON payouts (shop_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS payouts_artist_idx ON payouts (artist_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS payout_lines (
  id                  uuid PRIMARY KEY,
  payout_id           uuid NOT NULL REFERENCES payouts (id),
  order_item_id       uuid UNIQUE REFERENCES order_items (id),
  painting_request_id uuid UNIQUE REFERENCES painting_requests (id),
  ref                 text NOT NULL,                  -- FX-100023 or CP-100004
  amount              integer NOT NULL,              -- the seller's sale on this line
  CONSTRAINT payout_lines_one_thing CHECK ((order_item_id IS NULL) <> (painting_request_id IS NULL))
);
CREATE INDEX IF NOT EXISTS payout_lines_payout_idx ON payout_lines (payout_id);

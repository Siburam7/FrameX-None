-- WhatsApp messages (owner, 2026-11-01): what the admin used to send by hand from their own WhatsApp now goes
-- by itself, from the FrameX business number (WhatsApp Business API through Fast2SMS, Meta-approved templates):
-- order updates to customers who said yes at checkout (orders.whatsapp_updates), the new-order alert to each shop
-- and artist of an order, and "approved" to a new shop or artist. Each message is kept in whatsapp_messages, one
-- row per (kind, ref, phone): the same news is never sent twice, and the admin can see what went and what failed.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_updates boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id          uuid PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('ORDER_UPDATE', 'SELLER_NEW_ORDER', 'ACCOUNT_APPROVED')),
  ref         text NOT NULL,
  phone       text NOT NULL,
  template    text NOT NULL,
  status      text NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'SENT', 'FAILED', 'NOT_SENT')),
  request_id  text,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref, phone)
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_created_idx ON whatsapp_messages (created_at);

-- Log in / sign up with a code by SMS (owner, 2026-11-01). A customer may join with a mobile number only: the email
-- is optional ("Email optional (skip kar sakein)"), so users.email may now be empty. login_codes.email holds the
-- address a code went to: an email address, or a mobile number written +91XXXXXXXXXX (never mixed up: an email
-- never starts with "+").
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

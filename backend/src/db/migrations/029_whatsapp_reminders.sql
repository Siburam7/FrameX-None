-- WhatsApp cart reminders and the "payment not finished" reminder (owner, 2026-11-09). Only new columns and a wider
-- list of message kinds: nothing existing changes.
--
-- 1. A customer's yes to offers and cart reminders on WhatsApp (Meta: marketing messages only to people who said yes):
--    the account page's switch, or the checkout tick "Send order updates and reminders to my WhatsApp". The number it
--    was given for, and when.
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_offers boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_offers_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_offers_at timestamptz;

-- 2. A cart is reminded on WhatsApp once per state (like reminded_at for the email): a cart changed later can be
--    reminded again.
ALTER TABLE carts ADD COLUMN IF NOT EXISTS wa_reminded_at timestamptz;

-- 3. Each reminder kept for the admin's figures says how it went (the daily limits count each channel apart).
ALTER TABLE cart_reminders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'EMAIL';
ALTER TABLE cart_reminders DROP CONSTRAINT IF EXISTS cart_reminders_channel_ok;
ALTER TABLE cart_reminders ADD CONSTRAINT cart_reminders_channel_ok CHECK (channel IN ('EMAIL', 'WHATSAPP'));

-- 4. WhatsApp messages: the cart reminder is a new kind.
ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_kind_check;
ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_kind_check CHECK (kind IN ('ORDER_UPDATE', 'SELLER_NEW_ORDER', 'ACCOUNT_APPROVED', 'CART_REMINDER'));

-- 5. An online order still unpaid some minutes after its payment started gets ONE reminder before it runs out.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reminded_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_unpaid_reminder_idx ON orders (expires_at) WHERE status = 'PENDING_PAYMENT' AND payment_reminded_at IS NULL;

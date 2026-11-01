-- Cart reminder emails (owner, 2026-10-31): a customer whose cart was left untouched for a day gets ONE email that
-- reminds them of it (with a coupon when the admin chose one). A cart is reminded once per state: carts.reminded_at
-- is set when the email goes; a cart changed after that can be reminded again. A customer can say "no more cart
-- reminders" (users.cart_reminders_off). Each email sent is kept in cart_reminders, for the admin's figures
-- ("came back and ordered") and the daily limit.
ALTER TABLE carts ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cart_reminders_off boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS cart_reminders (
  id          uuid PRIMARY KEY,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  cart_id     uuid,
  items       integer NOT NULL CHECK (items >= 0),
  value       integer NOT NULL CHECK (value >= 0),
  coupon_code text,
  how         text NOT NULL CHECK (how IN ('AUTO', 'ADMIN')),
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cart_reminders_sent_idx ON cart_reminders (sent_at);
CREATE INDEX IF NOT EXISTS cart_reminders_user_idx ON cart_reminders (user_id, sent_at);

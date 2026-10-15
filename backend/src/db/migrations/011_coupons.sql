-- Coupons: a code the customer types at checkout for a percentage off the items of the order.
-- Only adds a table and two columns; nothing existing is changed.
--
--   code            what the customer types, in capitals (XUSE10)
--   title           what the checkout shows ("Diwali offer: flat 10% off ...")
--   percent_off     the percentage taken off the items total (after each product's own discount)
--   min_order       the items total (after product discounts) needed for the coupon, in rupees
--   max_discount    the most the coupon can take off, in rupees; empty = no limit
--   starts_at       from when it can be used; empty = straight away
--   ends_at         until when it can be used; empty = until it is switched off
--   active          false = switched off
--   per_user_limit  how many orders one customer can use it on; empty = no limit
CREATE TABLE IF NOT EXISTS coupons (
  code text PRIMARY KEY,
  title text NOT NULL,
  percent_off integer NOT NULL CHECK (percent_off > 0 AND percent_off <= 90),
  min_order integer NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  max_discount integer CHECK (max_discount IS NULL OR max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  per_user_limit integer CHECK (per_user_limit IS NULL OR per_user_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The coupon an order used, and how much it took off (in rupees; 0 = none).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount integer NOT NULL DEFAULT 0;
-- The total still has to add up, now with the coupon taken off (every existing order has coupon_discount = 0).
ALTER TABLE orders DROP CONSTRAINT orders_total_adds_up;
ALTER TABLE orders ADD CONSTRAINT orders_total_adds_up CHECK (total = subtotal - discount - coupon_discount + tax + shipping_fee + cod_fee + gift_wrap_fee);
ALTER TABLE orders ADD CONSTRAINT orders_coupon_needs_code CHECK (coupon_discount >= 0 AND (coupon_discount = 0 OR coupon_code IS NOT NULL));

-- The Diwali coupon the owner asked for: flat 10% off on orders of ₹399 and more, code XUSE10.
INSERT INTO coupons (code, title, percent_off, min_order)
VALUES ('XUSE10', 'Diwali offer: flat 10% off on orders of ₹399 and more', 10, 399)
ON CONFLICT (code) DO NOTHING;

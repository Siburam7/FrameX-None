-- FrameX's pricing plan (owner, 2026-11-02). Only new columns: nothing existing changes.
--
-- 1. What the shop receives for one unit of an order line. A shop names its own price; the customer pays FrameX's
--    listing price (product-model.js applyListingRule / sellerUnit). The shop is paid this amount for every
--    delivered line, paid online or by Cash on Delivery (the courier hands the cash to FrameX). NULL = a line from
--    before, or a product not under the listing rule: its payout works as before (the line total less the
--    commission; Cash on Delivery collected by the seller).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_unit_amount integer;

-- 2. The online payment discount taken off the order (Admin -> Settings "Online payment discount"; 0 when the
--    customer chose Cash on Delivery or there was none).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_discount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD CONSTRAINT orders_online_discount_ok CHECK (online_discount >= 0);
ALTER TABLE orders DROP CONSTRAINT orders_total_adds_up;
ALTER TABLE orders ADD CONSTRAINT orders_total_adds_up CHECK (total = subtotal - discount - coupon_discount - online_discount + tax + shipping_fee + cod_fee + gift_wrap_fee);

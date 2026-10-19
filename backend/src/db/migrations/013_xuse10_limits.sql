-- The Diwali coupon XUSE10 with the owner's limits (decided 2026-10-19): at most ₹499 off an order, once per
-- customer, no end date (it runs until an admin switches it off). The owner wants the limits NOT shown to customers
-- in advance (2026-10-20): the title doesn't say them ("flat" is dropped, since the discount has a maximum); the
-- checkout explains when a limit applies.
-- Only a coupon that still has the values of migration 011 is changed: limits an admin set later are kept.
UPDATE coupons
   SET max_discount = 499,
       per_user_limit = 1,
       title = 'Diwali offer: 10% off on orders of ₹399 and more'
 WHERE code = 'XUSE10'
   AND max_discount IS NULL
   AND per_user_limit IS NULL;

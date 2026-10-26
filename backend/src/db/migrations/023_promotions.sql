-- Promotions (owner, 2026-10-26): the home page's picture banners and the slim promotion strips, managed in
-- Admin -> Promotions instead of in the code. Each one is a picture (a laptop and a phone picture, words drawn in),
-- a link, the place it is shown, an order, on / off, optional first and last day, and an optional rule that hides it
-- (a coupon that has ended, or the first-order free delivery switched off).
-- A picture is either part of the website (laptop_src / phone_src: assets/img/...) or uploaded in the admin panel
-- (laptop_key / phone_key: the file storage, public area, a WebP made by the server).
-- The 5 banners and 6 strips that are on the site today are put in, so nothing changes for visitors.
CREATE TABLE IF NOT EXISTS promotions (
  id          uuid PRIMARY KEY,
  placement   text NOT NULL CHECK (placement IN ('home-banners', 'home-after-banners', 'home-after-recommended',
                'home-after-shops', 'shop-after-shops', 'product-before-related', 'decor-after-featured')),
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  link        text NOT NULL DEFAULT '',
  laptop_src  text,
  phone_src   text,
  laptop_key  text UNIQUE,
  phone_key   text UNIQUE,
  position    integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  starts_on   date,
  ends_on     date,
  hide_when   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promotions_placement_idx ON promotions (placement, position);

INSERT INTO promotions (id, placement, title, link, laptop_src, phone_src, position, hide_when) VALUES
  ('5f0c0001-0000-4000-8000-000000000001', 'home-banners', 'Diwali offer: 10% off on orders of ₹399 and more. Use code XUSE10 at checkout. Shop now.', 'shop.html',
   'assets/img/home/banners/banner-1-diwali-laptop.webp', 'assets/img/home/banners/banner-1-diwali-phone.webp', 1, 'COUPON:XUSE10'),
  ('5f0c0001-0000-4000-8000-000000000002', 'home-banners', 'Art & Artists: make your photo your wall’s canvas. Free delivery on your first order. Create now.', 'wall-art-studio.html',
   'assets/img/home/banners/banner-2-art-laptop.webp', 'assets/img/home/banners/banner-2-art-phone.webp', 2, 'FIRST_ORDER_FREE'),
  ('5f0c0001-0000-4000-8000-000000000003', 'home-banners', 'Gift a memory, not just a frame: birthday, anniversary or wedding. Shop gift frames.', 'shop.html?category=gifts#collection',
   'assets/img/home/banners/banner-3-gift-laptop.webp', 'assets/img/home/banners/banner-3-gift-phone.webp', 3, ''),
  ('5f0c0001-0000-4000-8000-000000000004', 'home-banners', 'Collect it nearby or get it at your door: every frame comes from a named local shop. Find a shop.', '#shops',
   'assets/img/home/banners/banner-4-delivery-laptop.webp', 'assets/img/home/banners/banner-4-delivery-phone.webp', 4, ''),
  ('5f0c0001-0000-4000-8000-000000000005', 'home-banners', 'Wall art that makes it home: posters, prints and multi-panel sets. Shop wall art.', 'home-decor.html',
   'assets/img/home/banners/banner-5-decor-laptop.webp', 'assets/img/home/banners/banner-5-decor-phone.webp', 5, ''),
  ('5f0c0002-0000-4000-8000-000000000001', 'home-after-banners', 'Diwali Frame Fest: flat 10% off on orders of ₹399 and more with code XUSE10. Shop now.', 'shop.html',
   'assets/img/promo/strip-1-diwali-fest-laptop.webp', 'assets/img/promo/strip-1-diwali-fest-phone.webp', 1, 'COUPON:XUSE10'),
  ('5f0c0002-0000-4000-8000-000000000002', 'shop-after-shops', 'Free delivery on your first FrameX order. Shop now.', '#collection',
   'assets/img/promo/strip-2-free-delivery-laptop.webp', 'assets/img/promo/strip-2-free-delivery-phone.webp', 1, 'FIRST_ORDER_FREE'),
  ('5f0c0002-0000-4000-8000-000000000003', 'product-before-related', 'New: FrameX Studio. Design your frame in 1 minute with your photo, your size, seen live. Start now.', 'studio.html',
   'assets/img/promo/strip-3-studio-laptop.webp', 'assets/img/promo/strip-3-studio-phone.webp', 1, ''),
  ('5f0c0002-0000-4000-8000-000000000004', 'home-after-recommended', 'Featured shop (ad): Mithus Frame, custom photo frames, pickup or home delivery. Visit shop.', 'shop-detail.html?id=FRX-SHOP-1001',
   'assets/img/promo/strip-4-featured-shop-laptop.webp', 'assets/img/promo/strip-4-featured-shop-phone.webp', 1, ''),
  ('5f0c0002-0000-4000-8000-000000000005', 'home-after-shops', 'Own a frame shop? Sell on FrameX: only 3% commission, register free. Register.', 'partner.html',
   'assets/img/promo/strip-5-sell-on-framex-laptop.webp', 'assets/img/promo/strip-5-sell-on-framex-phone.webp', 1, ''),
  ('5f0c0002-0000-4000-8000-000000000006', 'decor-after-featured', 'Gift a memory: birthday, anniversary or wedding. Their favourite photo, framed by a local shop. Shop now.', 'shop.html?category=gifts#collection',
   'assets/img/promo/strip-6-gift-laptop.webp', 'assets/img/promo/strip-6-gift-phone.webp', 1, '')
ON CONFLICT (id) DO NOTHING;

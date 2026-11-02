# FrameX — Product Requirements (PRD)

> Living document. Update it whenever a feature, rule or decision changes (see `rules.md` → "Project docs").
> Last updated: 2026-10-20 (F-11, F-13, F-14).

## 1. What FrameX is

FrameX (https://shopframex.in) is an online marketplace for **photo frames, wall art and paintings**. It connects
customers with **local frame shops** and **artists**: customers order a frame made from their own photo, ready-made
home decor, or a custom painting; the shop or artist makes and delivers it; FrameX takes payment, keeps the order
records and pays the sellers.

## 2. Who uses it

| Role | What they do |
| --- | --- |
| **Customer** | Browses without an account; signs up / logs in at the first "Add to cart". Uploads photos, customises frames, orders, pays (online or Cash on Delivery), follows orders, reviews delivered items. |
| **Shop** (local frame shop) | Applies through "Register Your Shop" (no login needed to apply). After FrameX approves, gets a shop login. Manages its products, stock and orders, downloads customers' original photos for its own orders, adds a payout account. |
| **Artist** | Applies through "Join as an artist" (`join-artist.html`, no login needed). After approval: profile, artworks, custom-painting requests, payout account. |
| **Care** (FrameX Care staff) | Made by an admin (Admin → Care team). Log in with their email; the admin panel shows them only Live chats and Orders: they answer chats and change customers' orders (cancel, refund, status, size, delivery address). Customers see their first name. |
| **Admin** (FrameX staff) | Approves shops / artists / products, manages orders, refunds, payouts, platform settings, analytics. |

One account = one role. An email can belong to only one account, so a shop or artist login needs an email different
from the person's customer account (owner's decision, 2026-10-17).

## 3. Features and their real status

Status words: **Built** = code + automated tests; **Live-proven** = seen working on the live site;
**Not proven** = built but never verified with the real service.

| Area | What it does | Status |
| --- | --- | --- |
| Catalogue | Shops, products, categories, Home Decor (multi-panel sets), templates, search | Built, live |
| Finding shops | Home + Shop page: without a location 3 / all "recommended" shops (featured first, then shops with products, order changes daily); with a location the nearest (Home: top 3 + "View more shops near you"); one search box (shop name, area, city, PIN; else the place's nearby shops); location kept for the tab, used at once when allowed before; Admin → Shops → Featured (optional end day) for paid promotions, labelled "Featured" | Built, live since 2026-10-21 (live check: 1 shop, Mithus Frame, 19.5 km from Dhenkanal centre) |
| Product page | Gallery, options with live price, required photo upload, specs | Built, live |
| FrameX Studio / Wall-art studio / Templates | Customise a frame, split a photo across 2-5 panels, photo templates. Size is the first step, then the photo; a custom size (width × height, inches or cm, 4–40 in) is priced from the standard sizes by area | Built, live. "Save design" in the account (any device) live since 2026-10-20. Custom size + size-first live 2026-11-02 (main c270c7a) |
| Add a frame (shops + admin) | 4 steps: model photos + frame front (background removed automatically, photo space found / adjusted) + full PNG for View on My Wall; details with a sizes table; Frame Components layers; check & publish. Admin "All frames" for every shop. Customers see their photo inside the real frame (product page, cart, order, wall) | Built 2026-10-27, local |
| Promotions | Home picture banners + slim promotion strips (Home ×3, Shop, Product, Home Decor) managed in Admin → Promotions: upload laptop / phone picture, link, order, on / off, first / last day, hide when a coupon ends | Built 2026-10-26, local |
| Cart reminder emails | A customer who leaves items in the cart for 24 h gets one email (cart, coupon, "Complete your order"), 9 am to 9 pm, at most 100 a day; can be turned off from the email or the account page; admin can send one by hand | Built 2026-10-31, local |
| Admin Overview / Analytics | Today's figures, things to do, 7-day sales, latest orders, carts left, low stock; funnel, customers, when people order, reminders | Built 2026-10-31, local |
| Accounts | Login box (2026-10-31): no login / sign-up page; a box over the current page: Google, or an email + a 6-digit code (a new email gives its name, guessed from the email, and becomes an account); "Log in using password" keeps the password form (old accounts, shops, artists, staff); password reset by email (and SMS when configured); "Continue with Google / Facebook" for customers | Built, live; SMS not configured. Google / Facebook built 2026-10-26, local, off until the ids are set |
| Cart | Account-only, stored in the database, prices set by the server | Built, live |
| Checkout | Address → summary → payment; Buy Now; coupons (XUSE10) | Built, live |
| Coupons (admin) | Admin → Coupons: create / change / switch off codes with %, minimum order, maximum discount, uses per customer, start / last day; XUSE10 = 10% from ₹399, max ₹499, once per customer | Built, live since 2026-10-20 |
| Payments | Razorpay (live keys on Render), Cashfree adapter | Razorpay live payment + refund **proven 2026-10-21** (FX-100014, ₹354, UPI, refunded); Cashfree tested only against a stand-in |
| Cash on Delivery, gift wrap | Configurable fees | Built, live |
| Orders | Order pages, emails, shop fulfilment steps, admin orders, refunds recorded by admin | Built, live |
| Customer photos | Stored unchanged, private, short-lived signed links only. JPG, PNG, WebP, HEIC (iPhone), AVIF | Built, live (Backblaze B2 bucket). HEIC / AVIF built 2026-10-25, local |
| Art & Artists | Artists, artworks, custom paintings paid 40% / 60%. Easy 4-step "Add artwork" (artwork photo + the original photo it was drawn from, shown to buyers as a Before / After slider; sizes with prices, delivery time, submit → FrameX approves); admin adds for any artist in All frames → Artworks | Built; not used live yet. 4-step editor built 2026-10-27, Before / After 2026-10-28, Art & Artists opens on the artworks 2026-10-28, local |
| Payouts | Bank / UPI payout accounts (sealed), payouts recorded by admin with UTR, 2% payout charge | Built, live code; payout key set on Render 2026-10-21: accounts can be saved (live log READY) |
| Emails | Password reset, orders, applications… from `FrameX <support@shopframex.in>` (Brevo, domain authenticated: DKIM shopframex.in), "orange line" design, logo on a white badge for dark mode | Built, live since 2026-10-20 |
| Support inbox | Mail to `support@shopframex.in` (any `@shopframex.in`) is forwarded by ImprovMX (free) to `support.framex@gmail.com`; replies go out from that Gmail until "Send mail as" is set up (architecture §9) | Live since 2026-10-20 |
| Help chat | Logged-in customers write to FrameX from a button on every customer page (topics, "about this order"); Admin → Chats answers, closes, reopens; both sides emailed; visitors are sent to log in or to the Contact page | Built 2026-10-23, live since 2026-10-23 |
| FrameX Care live chat | 8 quick answers without AI (real orders, live fees, real stock); "Connect with FrameX Care" 10am–8pm → a care person accepts within 2 minutes → live chat with their first name; otherwise leave a message; rating. Care desk = Admin → Live chats; CARE logins (made in Admin → Care team) see only Live chats + Orders and can change orders (size, address, cancel, refund) | Built 2026-10-24, local (not deployed); dearer size on a paid-online order not built |
| New-order alerts | Email to each seller, WhatsApp button for admin; since 2026-11-01 also an automatic WhatsApp to the shop / artist | Email live; automatic WhatsApp built locally (migration 026), waits for Meta template approval + the Fast2SMS key on Render |
| Login with mobile number | Login box: Google on top, a toggle "Phone number | Email" (phone first), "Log in using password" below: a 6-digit code by SMS (APITxT); a new number gives a name and, optionally, an email; existing numbers log straight in; email codes and Google unchanged | Built locally 2026-11-01 (migration 026), waits for the APITxT account + key |
| WhatsApp order updates | Customer ticks "Send order updates to my WhatsApp" at checkout (ticked by default, remembered when unticked; shown only while WhatsApp is set up): placed, payment failed, shipped, out for delivery, delivered, cancelled, refunds. New shops / artists hear "approved" (no link). Admin → Settings: 3 switches + service status + latest messages | Built locally 2026-11-01, not live |
| Analytics | Consent-based visitor stats + admin reports; GA4 optional | Built; GA4 ID not set |
| View on My Wall | Camera / AR preview of a frame at its real size: Android Chrome = WebXR (finds the wall); iPhone / iPad = Apple's AR Quick Look (3D model made on the phone, nothing uploaded); elsewhere the simple camera view (size estimated). Inside Instagram / Facebook / WhatsApp… it says to open the page in Safari / Chrome; a phone without AR gets a plain error | Android tried live by the owner (one phone found no wall); iPhone Quick Look live 2026-11-01 (main 3db81de), not yet tried on a real iPhone |
| Suggestions | Home "Highly recommended frames": most ordered in the last 30 days first, then most viewed (30 days), then the chosen frames; frames only, at most 2 lines on a laptop. Home Decor and Art & Artists: their own row of popular wall art / artworks above their tiles. Product page: Similar products, You may also like, Recently viewed (sideways rows), More products for you (frames, wall art, artworks; more as you scroll). Header: transparent at the top; search grows (hover / tap) with results under it, closes after 10 s empty | Live 2026-11-01 (main 8af6d15) |
| Listing price from the shop's price | A shop types its own price per size; customers see FrameX's listing price (markup + a delivery share for the box size, ending in 9; free delivery); the shop's editor shows "Customer pays" live; approval emails the shop both prices + how to reach FrameX Care; payouts pay the shop its own price (COD too, no commission); "Pay online" takes a % off the items | Live code 2026-11-02 (main bb0ca4f, migration 028); OFF until the numbers are typed in Admin → Settings |
| Order tracking | Staff add the courier + tracking number (and link) on the admin order page; the customer sees "Track your parcel" on the order page, in the shipped email and WhatsApp | Live 2026-11-02 (main bb0ca4f, migration 027); not yet used on a real order |
| My data | Account → Your data: download everything as one JSON file; customers delete their own account (password + DELETE, not while an order is under way; bills kept for tax without the person) | Built, live since 2026-10-20 |
| Dark mode | Light (default) / Dark / Device, chosen on the account page | Built |
| Backups | `npm run db:backup` / `db:restore`; manual `pg_dump` of production | A production `pg_dump` was taken and restore-tested on 2026-10-19; `backup-live-db.bat` ran against Neon on 2026-10-20 (before the deploy) |

## 4. Business rules (decided by the owner)

- **Customer photo is mandatory** for every product made from a photo (page AND server). Templates and sets need all
  their photos. Ready-made Home Decor never asks for a photo.
- **Originals are never enhanced**, resized or re-encoded. Required notice where a photo is added: "Your uploaded image
  will be printed in the same original quality you provide…". No "may not print sharply" warnings.
  A HEIC / AVIF photo (shops can't print those) also gets ONE full-quality JPEG copy — same pixels, nothing enhanced —
  which is shown and printed; the original stays as uploaded and can be downloaded (owner, 2026-10-25).
- **Review photos** are kept as uploaded but SHOWN as a medium copy (WebP, 1600 px) so pages stay fast (owner, 2026-10-25).
  This is not a print, so the "never resized" rule for order photos is not affected.
- **Photos are private**: only signed links for the customer, admin and the shop making that order line.
- **No guest cart**, nothing about the cart in browser storage; the server sets every price.
- **Payment is only "paid" after the server verifies it** with the gateway. A frontend redirect is not proof.
- **Custom paintings**: no payment before the artist accepts; advance 40% (configurable), remaining 60% before dispatch.
- **Payouts are manual**: FrameX pays by bank transfer / UPI outside the site and records the reference (UTR).
  Payout charge 2% (configurable). Commission rates are set in admin Settings.
- **Fees** (owner's values, admin can change): delivery ₹49, free from ₹699, first order free delivery; COD ₹29;
  tax 18% (check with a CA: only GST-registered sellers may charge GST).
- **No fake data in production**: no invented reviews, offers, statistics or delivery claims.
- **Banners and offers must be factual.**
- **Order photos** are deleted 15 days after the order is finished (2026-10-20).
- **Shop products need FrameX approval** before they go on sale (admin setting, 2026-10-20).
- **Listing price** (owner, 2026-11-02): the shop names its own price and receives it in full; FrameX lists the product
  at that price + a markup + a delivery share for the box size (free delivery for the customer), rounded up to end in 9.
  The numbers are Admin settings, written only in the private costs.md (never in the public repository). Paying online
  gives a small % off the items; Cash on Delivery has its fee. At approval the shop is told the customer prices.

## 5. Open decisions (owner has not decided)

- Artworks: COD and gift wrap off (my placeholder); custom paintings without delivery charge / tax (placeholder).
- Refunds of cancelled custom paintings are manual (placeholder).
- Gift-wrap fee ₹49 and frame build details in `js/edit.js` are placeholders.
- Whether to keep the Razorpay adapter once Cashfree is proven (both kept today).

## 6. Not in scope today

Multi-role accounts, guest checkout, automatic payouts, WhatsApp Business API sending, 3D/film hero, native apps.

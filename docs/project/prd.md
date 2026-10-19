# FrameX — Product Requirements (PRD)

> Living document. Update it whenever a feature, rule or decision changes (see `rules.md` → "Project docs").
> Last updated: 2026-10-20 (account deletion).

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
| **Admin** (FrameX staff) | Approves shops / artists / products, manages orders, refunds, payouts, platform settings, analytics. |

One account = one role. An email can belong to only one account, so a shop or artist login needs an email different
from the person's customer account (owner's decision, 2026-10-17).

## 3. Features and their real status

Status words: **Built** = code + automated tests; **Live-proven** = seen working on the live site;
**Not proven** = built but never verified with the real service.

| Area | What it does | Status |
| --- | --- | --- |
| Catalogue | Shops, products, categories, Home Decor (multi-panel sets), templates, search | Built, live |
| Product page | Gallery, options with live price, required photo upload, specs | Built, live |
| FrameX Studio / Wall-art studio / Templates | Customise a frame, split a photo across 2-5 panels, photo templates | Built, live; Studio "Save design" is browser-only |
| Accounts | Sign-up, login, password reset by email (and SMS when configured) | Built, live; SMS not configured |
| Cart | Account-only, stored in the database, prices set by the server | Built, live |
| Checkout | Address → summary → payment; Buy Now; coupons (XUSE10) | Built, live |
| Coupons (admin) | Admin → Coupons: create / change / switch off codes with %, minimum order, maximum discount, uses per customer, start / last day; XUSE10 = 10% from ₹399, max ₹499, once per customer | Built locally 2026-10-20, not deployed |
| Payments | Razorpay (live keys on Render), Cashfree adapter | Razorpay live payment **not proven**; Cashfree tested only against a stand-in |
| Cash on Delivery, gift wrap | Configurable fees | Built, live |
| Orders | Order pages, emails, shop fulfilment steps, admin orders, refunds recorded by admin | Built, live |
| Customer photos | Stored unchanged, private, short-lived signed links only | Built, live (Backblaze B2 bucket) |
| Art & Artists | Artists, artworks, custom paintings paid 40% / 60% | Built; not used live yet |
| Payouts | Bank / UPI payout accounts (sealed), payouts recorded by admin with UTR, 2% payout charge | Built, live code; **payout key not set on Render**, so accounts can't be saved yet |
| New-order alerts | Email to each seller, WhatsApp button for admin | Built, live |
| Analytics | Consent-based visitor stats + admin reports; GA4 optional | Built; GA4 ID not set |
| View on My Wall | Camera / AR preview of a frame | Built; never tried on a real phone |
| My data | Account → Your data: download everything as one JSON file; customers delete their own account (password + DELETE, not while an order is under way; bills kept for tax without the person) | Built locally 2026-10-20, not deployed |
| Dark mode | Light (default) / Dark / Device, chosen on the account page | Built |
| Backups | `npm run db:backup` / `db:restore`; manual `pg_dump` of production | Local tools built (not deployed); a production `pg_dump` was taken and restore-tested on 2026-10-19 |

## 4. Business rules (decided by the owner)

- **Customer photo is mandatory** for every product made from a photo (page AND server). Templates and sets need all
  their photos. Ready-made Home Decor never asks for a photo.
- **Originals are never enhanced**, resized or re-encoded. Required notice where a photo is added: "Your uploaded image
  will be printed in the same original quality you provide…". No "may not print sharply" warnings.
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

## 5. Open decisions (owner has not decided)

- Artworks: COD and gift wrap off (my placeholder); custom paintings without delivery charge / tax (placeholder).
- Refunds of cancelled custom paintings are manual (placeholder).
- Gift-wrap fee ₹49 and frame build details in `js/edit.js` are placeholders.
- Product moderation is off (a shop's product goes live without review).
- Photo retention for completed orders (kept forever today; Privacy Notice doesn't say).
- Whether to keep the Razorpay adapter once Cashfree is proven (both kept today).

## 6. Not in scope today

Multi-role accounts, guest checkout, automatic payouts, WhatsApp Business API sending, 3D/film hero, native apps.

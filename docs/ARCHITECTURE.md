# FrameX — Architecture

FrameX is a multi-shop, local photo-frame marketplace. This document describes how the
**frontend in this repository** is prepared for the rest of the system. Nothing here is a
backend. Where something is future work it says so.

```
Customer website  ──►  API  ──►  Backend  ──►  Database  ◄──  Admin Panel
   (this repo)       (contract      (not built)   (not built)    (not built)
                     defined below)
```

## 0. Pages and routing

Static multi-page site. Detail pages are addressed by query string (`product.html?id=p-001`,
`shop-detail.html?id=shop-002`) so they work on GitHub Pages with no rewrite rules. When a real
backend exists, ids come from the database and the same URLs keep working. Header, footer and overlays
are rendered by `ui/chrome.js`; `main.js` runs the page-specific modules chosen by `<body data-page>`.

## 1. How the frontend gets its data

Every UI module reads data through one object, `FrameX.api`
(`assets/js/api/api.js`). It has two interchangeable providers with **identical method
names and response shapes**:

| Provider | File | Used when |
|---|---|---|
| Seed provider | `api/seed-provider.js` | `config.dataMode = "seed"` (today). Reads `assets/data/*.seed.js` and filters/sorts in the browser. |
| HTTP provider | `api/http-provider.js` | `config.dataMode = "api"`. Calls `config.apiBaseUrl` (`/api/v1`). |

Connecting a backend means: build the endpoints in section 3, change `dataMode` in
`assets/js/config.js`, delete the seed files. No UI code changes.

> The HTTP provider's URL building is unit-tested. It has **not** been exercised against a
> real server because none exists yet.

Products, shops, categories, prices, images and stock are **not** written in `index.html`.
Editing `assets/data/*.seed.js` changes the site; the Admin Panel will do the same through
the database.

## 2. Data model

Money is whole rupees in the seed data. **In the real database store integer paise** and
convert at the edge, to avoid floating-point errors.

### Shop
```jsonc
{
  "id": "shop-001", "name": "FrameX Studio", "slug": "framex-studio",
  "logo": null, "coverImage": "https://…", "description": null,
  "address": { "line1": null, "area": "Mathakarogola", "city": "Dhenkanal", "state": "Odisha", "postalCode": "759024" },
  "location": { "latitude": 20.65, "longitude": 85.6 },       // required for distance; null = no distance shown
  "phone": null,
  "openingHours": { "mon": ["10:00","20:00"], "sun": null },  // null day = closed, null object = not published
  "fulfilment": ["pickup", "shop_delivery"],                  // see §6
  "rating": { "average": 4.6, "count": 128 },                 // null until real reviews exist
  "isActive": true
}
```
The API response adds `productCount` and, when `lat`/`lng` are sent, `distanceKm`.
**Never expose commission settings in public shop payloads.**

### Product
```jsonc
{
  "id": "p-001", "shopId": "shop-001", "name": "Ace of Us", "slug": "ace-of-us",
  "description": "…", "categoryIds": ["photo-frames", "wedding"],
  "image": "https://…", "images": ["https://…"],
  "price": 799, "currency": "INR", "discountPercent": 10,
  "sizes": ["12 × 16 in", "16 × 20 in"], "material": "Walnut-finish wood",
  "stock": 20, "isAvailable": true, "isVisible": true,
  "isFeatured": false, "isRecommended": false, "isNew": false,
  "createdAt": "…", "updatedAt": "…"
}
```
Derived on the client (`services/pricing.js`): final price = `price − discountPercent`;
availability = `out_of_stock` if `isAvailable` is false or `stock ≤ 0`, `low_stock` if
`stock ≤ config.lowStockThreshold`, else `in_stock`.
The API response adds `shopName`.

**Per-size pricing** is not modelled yet. When needed, replace `sizes: string[]` with
`variants: [{ id, label, price, stock }]`; cart lines already store the chosen size.

### Category
`{ id, name, image, sortOrder }` — the API adds `productCount` so empty categories can be hidden from filters.

### Cart line (client only, `localStorage`)
`{ key, productId, shopId, shopName, name, image, size, note, unitPrice, qty }`. The key is `productId::size::note`, so identical configurations merge and different notes stay separate.
`unitPrice` is a **display snapshot**. The backend must re-price every line at checkout.
Lines are grouped by shop because a marketplace creates **one order per shop**.

### Order (future, backend)
`{ id, customerId, shopId, items[], fulfilment, status, subtotal, deliveryFee, total, paymentStatus, createdAt, history[] }`.

## 3. API contract

Base: `/api/v1`. All `GET`, JSON. List endpoints return `{ items, total, page, limit }`.

| Endpoint | Query params | Notes |
|---|---|---|
| `/site` | – | brand, contact, social, offer, stats |
| `/categories` | – | includes `productCount` |
| `/shops` | `q, sort=recommended\|nearest\|rating, lat, lng, page, limit` | server computes `distanceKm` when `lat`/`lng` are present |
| `/shops/:id` | – | 404 → `null` |
| `/products` | `shopId, category, q, sort=recommended\|price_asc\|price_desc\|newest\|name, inStock, isFeatured, isRecommended, page, limit` | only `isVisible` products of active shops |
| `/products/:id` | – | |
| `/reviews`, `/community`, `/faq`, `/gallery` | – | |

Future write endpoints (auth required, not in this repo): cart validation, `POST /orders`,
`GET /orders/:id`, payments webhook, customer profile/addresses/wishlist.

For 100+ shops and 1000+ products: paginate (already supported), index `shopId`,
`categoryIds`, `isVisible`; use full-text search for `q`; serve images from object storage + CDN
with responsive sizes.

## 4. Admin Panel mapping

The Admin Panel is a separate app writing to the same database. What each admin action changes:

| Admin action | Field(s) | Customer site effect |
|---|---|---|
| Add / delete product | product row | appears / disappears in grid, rails, search |
| Change image | `image`, `images` | all cards, modal, cart thumbnails (new lines) |
| Change name / description | `name`, `description` | cards, modal |
| Change price / discount | `price`, `discountPercent` | ₹599 → ₹699 shows everywhere on next load, no code edit |
| Change category / size / material | `categoryIds`, `sizes`, `material` | filters, modal specs |
| Change stock | `stock` | "Only N left" / "Out of stock" |
| Mark In / Out of stock | `isAvailable` | card greyed, button disabled |
| Hide / show | `isVisible` | removed from every listing |
| Feature / recommend | `isFeatured`, `isRecommended` | hero rail / "Highly Recommended" |
| Manage shops | shop row | shop cards, "View shop" filtering |
| Manage categories | category row | category tiles + filter chips |

Panel sections planned: Dashboard, Products, Categories, Shops, Orders, Customers, Delivery,
Payments, Commission, Offers, Settings. Shop owners get a scoped subset (own products,
own orders, earnings).

## 5. Orders

Statuses live in `assets/js/core/constants.js`.

```
placed → confirmed → preparing → ready → out_for_delivery → delivered
                                  └── pickup orders skip out_for_delivery
terminal / exceptional: cancelled · refunded · failed
```
For pickup, `ready` reads "Ready for pickup" and `delivered` reads "Collected"
(`orderStatusLabel`). The site currently shows this flow as an **explainer only** — it does
not display real orders.

**The backend owns status transitions**; the frontend only renders them.

## 6. Fulfilment / delivery

`FULFILMENT_METHODS` (constants.js): `pickup`, `shop_delivery`, `delivery_partner`,
`platform_delivery`. Each shop lists the methods it supports in `fulfilment`.
`platform_delivery` (a FrameX-employed team) is **defined but disabled** — the product does
not assume FrameX has its own riders. Delivery fee and ETA come from the shop or the courier
integration at checkout; the cart drawer says "Set by the shop at checkout" and never invents a fee.

## 7. Commission (backend only)

Not implemented in the frontend and must not be: it is financial logic that belongs on the
server, and public endpoints must not leak it.

```
Product ₹800 · commission 10% → FrameX ₹80 · shop ₹720
```
Suggested resolution order per order line: **shop-specific rule → category rule → marketplace
default**; each rule is `percent` or `fixed`. Store the resolved commission on the order line
at order time so later rule changes don't rewrite history. Admin reporting: total orders,
sales, commission, shop earnings, delivery charges, refunds, net revenue.

## 8. Location & distance

`services/location.js` is real: it asks the browser for permission and computes haversine
distance between two coordinate pairs. It is **only** used when both the visitor and the
shop have coordinates. No distance is ever typed into the data or estimated. The seed shops
have `null` coordinates, so today the UI shows the honest message *"Distances will appear once
shops add their map coordinates."* For many shops, move the calculation to the server
(PostGIS / geo index) and return `distanceKm` — the UI already displays whatever the API returns.

## 9. Auth & payments (future)

Customer, shop-owner and admin roles with separate sessions; the frontend's "Sign up" and
"Share your story" buttons currently show a "coming soon" notice. Payment gateway integration
should sit behind the backend (`POST /orders` → payment intent → webhook); the cart's Checkout
button emits a `framex:checkout-requested` DOM event carrying the per-shop groups, which is the
hook for a real checkout flow.

## 10. Roadmap status

| Phase | Status |
|---|---|
| 1 Professional UI | ✅ done |
| 2 Responsive / mobile | ✅ done (tested 320 – 2560 px) |
| 3 Animations | ✅ done |
| 4 Product / shop data structure | ✅ done (seed + API contract) |
| 5 Admin Panel | ⬜ not started |
| 6 Backend + database | ⬜ not started |
| 7 Authentication | ⬜ not started |
| 8 Orders + payments | ⬜ not started (cart + explainer only) |
| 9 Delivery integration | ⬜ not started |
| 10 Commission & marketplace management | ⬜ not started (design in §7) |

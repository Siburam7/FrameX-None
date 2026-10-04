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

| Provider      | File                   | Used when                                                                                           |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| Seed provider | `api/seed-provider.js` | `config.dataMode = "seed"` (today). Reads `assets/data/*.seed.js` and filters/sorts in the browser. |
| HTTP provider | `api/http-provider.js` | `config.dataMode = "api"`. Calls `config.apiBaseUrl` (`/api/v1`).                                   |

Connecting a backend means: build the endpoints in section 3, change `dataMode` in
`assets/js/config.js`, delete the seed files. No UI code changes.

> The HTTP provider's URL building is unit-tested. It has **not** been exercised against a
> real server because none exists yet.

Products, shops, categories, prices, images and stock are **not** written in `index.html`.
In seed mode they all live in one hand-edited file, `js/edit.js` (shops, products, categories, frame colours and the home page lists).
Editing `assets/data/*.seed.js` changes the site; the Admin Panel will do the same through
the database.

## 2. Data model

Money is whole rupees in the seed data. **In the real database store integer paise** and
convert at the edge, to avoid floating-point errors.

### Shop

```jsonc
{
  "id": "shop-001",
  "name": "FrameX Studio",
  "slug": "framex-studio",
  "logo": null,
  "coverImage": "https://…",
  "description": null,
  "address": {
    "line1": null,
    "area": "Mathakarogola",
    "city": "Dhenkanal",
    "state": "Odisha",
    "postalCode": "759024",
  },
  "location": { "latitude": 20.65, "longitude": 85.6 }, // required for distance; null = no distance shown
  "phone": null,
  "openingHours": { "mon": ["10:00", "20:00"], "sun": null }, // null day = closed, null object = not published
  "fulfilment": ["pickup", "shop_delivery"], // see §6
  "rating": { "average": 4.6, "count": 128 }, // null until real reviews exist
  "isActive": true,
}
```

The API response adds `productCount` and, when `lat`/`lng` are sent, `distanceKm`.
**Never expose commission settings in public shop payloads.**

### Product

```jsonc
{
  "id": "p-001",
  "shopId": "shop-001",
  "name": "Ace of Us",
  "slug": "ace-of-us",
  "description": "…",
  "categoryIds": ["photo-frames", "wedding"],
  "image": "https://…",
  "images": ["https://…"],
  "price": 799,
  "currency": "INR",
  "discountPercent": 10,
  // sizeOptions, when present, drives the visual size selector + live price on product.html.
  // `sizes` (plain label strings) is still used by search/cards; it's derived from sizeOptions
  // for the 10 named frame styles. A product with no sizeOptions falls back to one entry per
  // `sizes` label with priceDelta 0 (see services/pricing.js:sizeOptions()).
  "sizeOptions": [
    {
      "id": "s",
      "label": "Small",
      "dimensions": "8 × 10 in",
      "priceDelta": -150,
    },
    {
      "id": "m",
      "label": "Medium",
      "dimensions": "12 × 16 in",
      "priceDelta": 0,
    },
    {
      "id": "l",
      "label": "Large",
      "dimensions": "16 × 20 in",
      "priceDelta": 250,
    },
    {
      "id": "xl",
      "label": "Extra Large",
      "dimensions": "20 × 24 in",
      "priceDelta": 450,
    },
  ],
  "sizes": ["Small", "Medium", "Large", "Extra Large"],
  // IDs into the FRAME COLOURS list in js/edit.js. Optional — omit for a product with one fixed colour.
  "colors": ["walnut", "black", "natural-wood"],
  "material": "Walnut-finish wood",
  "stock": 20,
  "isAvailable": true,
  "isVisible": true,
  "isFeatured": false,
  "isRecommended": false,
  "isNew": false,
  "createdAt": "…",
  "updatedAt": "…",
}
```

Derived on the client (`services/pricing.js`): `priceForSize(product, sizeId)` = `(price + that
size's priceDelta) − discountPercent%`; `finalPrice()` uses the default (Medium) size;
`startingPrice()` uses the cheapest size, for "From ₹X" card labels. Availability =
`out_of_stock` if `isAvailable` is false or `stock ≤ 0`, `low_stock` if `stock ≤
config.lowStockThreshold`, else `in_stock`. The API response adds `shopName`.

**Frame colour** is visualized with a CSS frame mock-up (border colour + a wood/metal-tinted
gradient keyed off each colour's `texture`), not per-colour photography, and the product page
says so next to the preview. Add real per-colour photography later by giving each colour its own
image and swapping the mock-up for an `<img>` swap.

### Category

`{ id, name, image, sortOrder, kind? }` — the API adds `productCount` so empty categories can be hidden from filters.
Categories with `kind: "style"` (classic, modern, wooden, luxury, minimal, decorative) are the frame-style collections shown as the home page "Shop by category" gallery; the others appear there as "shop by occasion" links.

### Cart line (client only, `localStorage`)

`{ key, productId, shopId, shopName, name, image, size, color, note, unitPrice, qty }`. The key is
`productId::size::color::note`, so an identical size+colour+note configuration merges into one line
and anything different (including just the note) stays a separate line. `unitPrice` is priced via
`priceForSize()` at the moment the item is added — a display snapshot; the backend must re-price at
checkout.
`unitPrice` is a **display snapshot**. The backend must re-price every line at checkout.
Lines are grouped by shop because a marketplace creates **one order per shop**.

### Order (future, backend)

`{ id, customerId, shopId, items[], fulfilment, status, subtotal, deliveryFee, total, paymentStatus, createdAt, history[] }`.

## 3. API contract

Base: `/api/v1`. All `GET`, JSON. List endpoints return `{ items, total, page, limit }`.

| Endpoint                                     | Query params                                                                                                                  | Notes                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/site`                                      | –                                                                                                                             | brand, contact, social, offer, stats                      |
| `/categories`                                | –                                                                                                                             | includes `productCount`                                   |
| `/shops`                                     | `q, sort=recommended\|nearest\|rating, lat, lng, page, limit`                                                                 | server computes `distanceKm` when `lat`/`lng` are present |
| `/shops/:id`                                 | –                                                                                                                             | 404 → `null`                                              |
| `/products`                                  | `shopId, category, q, sort=recommended\|price_asc\|price_desc\|newest\|name, inStock, isFeatured, isRecommended, page, limit` | only `isVisible` products of active shops                 |
| `/products/:id`                              | –                                                                                                                             |                                                           |
| `/reviews`, `/community`, `/faq`, `/gallery` | –                                                                                                                             |                                                           |

Future write endpoints (auth required, not in this repo): cart validation, `POST /orders`,
`GET /orders/:id`, payments webhook, customer profile/addresses/wishlist.

For 100+ shops and 1000+ products: paginate (already supported), index `shopId`,
`categoryIds`, `isVisible`; use full-text search for `q`; serve images from object storage + CDN
with responsive sizes.

## 4. Admin Panel mapping

The Admin Panel is a separate app writing to the same database. What each admin action changes:

| Admin action                      | Field(s)                           | Customer site effect                                    |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Add / delete product              | product row                        | appears / disappears in grid, rails, search             |
| Change image                      | `image`, `images`                  | all cards, modal, cart thumbnails (new lines)           |
| Change name / description         | `name`, `description`              | cards, modal                                            |
| Change price / discount           | `price`, `discountPercent`         | ₹599 → ₹699 shows everywhere on next load, no code edit |
| Change category / size / material | `categoryIds`, `sizes`, `material` | filters, modal specs                                    |
| Change stock                      | `stock`                            | "Only N left" / "Out of stock"                          |
| Mark In / Out of stock            | `isAvailable`                      | card greyed, button disabled                            |
| Hide / show                       | `isVisible`                        | removed from every listing                              |
| Feature / recommend               | `isFeatured`, `isRecommended`      | hero rail / "Highly Recommended"                        |
| Manage shops                      | shop row                           | shop cards, "View shop" filtering                       |
| Manage categories                 | category row                       | category tiles + filter chips                           |

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
have `null` coordinates, so today the UI shows the honest message _"Distances will appear once
shops add their map coordinates."_ For many shops, move the calculation to the server
(PostGIS / geo index) and return `distanceKm` — the UI already displays whatever the API returns.

## 9. Auth & payments (future)

Customer, shop-owner and admin roles with separate sessions; the frontend's "Sign up" and
"Share your story" buttons currently show a "coming soon" notice. Payment gateway integration
should sit behind the backend (`POST /orders` → payment intent → webhook); the cart's Checkout
button emits a `framex:checkout-requested` DOM event carrying the per-shop groups, which is the
hook for a real checkout flow.

## 10. Roadmap status

| Phase                                  | Status                                 |
| -------------------------------------- | -------------------------------------- |
| 1 Professional UI                      | ✅ done                                |
| 2 Responsive / mobile                  | ✅ done (tested 320 – 2560 px)         |
| 3 Animations                           | ✅ done                                |
| 4 Product / shop data structure        | ✅ done (seed + API contract)          |
| 5 Admin Panel                          | ⬜ not started                         |
| 6 Backend + database                   | ⬜ not started                         |
| 7 Authentication                       | ⬜ not started                         |
| 8 Orders + payments                    | ⬜ not started (cart + explainer only) |
| 9 Delivery integration                 | ⬜ not started                         |
| 10 Commission & marketplace management | ⬜ not started (design in §7)          |

## Personalised templates

Data: `js/templates.js` (categories, occasions, print sizes, templates). Pages:
`templates.html` (browse), `template.html?t=<slug>` (details), FrameX Studio (below) is the customizer; `template-customize.html` only redirects to it.

| Layer         | File                                                                                          | Future replacement                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Template data | `js/templates.js` via `api.getTemplates/getTemplate/getTemplateCategories/getTemplateOptions` | `GET /templates`, `/templates/:slug`, `/template-categories`, `/template-options` (http-provider already maps these) |
| Layout engine | `assets/js/services/template-engine.js`                                                       | Same layout JSON rendered server-side at print resolution                                                            |
| Photo storage | `assets/js/services/upload-service.js` (IndexedDB, this browser only)                         | Upload originals to object storage; `prepare()` returns remote id + URL                                              |

Pretty URLs (`/templates/<slug>`) need a server rewrite to `template.html?t=<slug>`; the page already sets a canonical URL, title and description from the template.

## FrameX Studio (`studio.html`)

One customization engine for every entry point: `?template=<slug>` (Templates), `?mode=photo` (Create Your Frame), `?product=<id>` (Customize This Frame on a product page), `?design=<id>` (a saved design).

| Layer                                                                                        | File                                                                   | Notes / future replacement                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue: frame types, colours, finishes, border, mat, sizes, front cover, fonts, prices    | `js/studio.js`                                                         | Placeholder data. `GET /studio/catalog` (already mapped in http-provider)                                                                                                                                                                      |
| Rules: context and capabilities, defaults, normalize, geometry, pricing, validation, summary | `assets/js/services/studio-engine.js`                                  | Pure functions on one config object. Prices are only added up in `price()`; the server must re-price at checkout                                                                                                                               |
| Preview renderer (screen)                                                                    | `studio-engine.js` renderPreview() and `assets/css/studio.css`         | Layers: frame, inner edge, mat(s), printed border, artwork or photo, text, cover. Positions come from `geometry()` in normalized units (print area = 1000 units wide), so a production renderer can draw the same geometry at print resolution |
| Artwork                                                                                      | `assets/js/services/template-engine.js`                                | Template layouts, photo crop (fill / fit / crop, zoom, focal point, rotate), text styles, background override                                                                                                                                  |
| Per-template rules                                                                           | `studio: { ... }` on a template in `js/templates.js`                   | Hides options a design does not support                                                                                                                                                                                                        |
| Photos                                                                                       | `assets/js/services/upload-service.js`                                 | IndexedDB on this device. Replace with uploads to storage                                                                                                                                                                                      |
| Drafts and saved designs                                                                     | localStorage `framex.studioDrafts.v1` and `assets/js/store/designs.js` | Per-account designs API                                                                                                                                                                                                                        |
| Cart line                                                                                    | `cart.addStudio()`                                                     | Stores productType, full config, price breakdown, summary, design id and shop                                                                                                                                                                  |

## Product system (product pages + shop products)

Every product, whether it comes from `js/edit.js` or from a shop's dashboard, is turned into ONE flexible model by `assets/js/services/product-model.js` (`normalize()`). The UI never assumes a field exists: each product-page section is rendered only when the product has data for it.

| Layer                                                                                                                                                                                                                                         | File                                                                                                                   | Notes / future replacement                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product model: schema, vocabularies (view types, print materials, covers, components, quality fields, statuses), legacy conversion, pricing (`quote`), Studio capabilities (`studioOptions`), validation (`validateForPublish`), claim filter | `services/product-model.js`                                                                                            | Same rules run on the server; the server re-prices at checkout                                                                                                                                                                                                 |
| Product / shop services                                                                                                                                                                                                                       | `services/product-service.js` (`productService`, `shopService`, `pricingService` in the model)                         | UI only talks to these                                                                                                                                                                                                                                         |
| Data provider                                                                                                                                                                                                                                 | `api/seed-provider.js` (catalogue + this device's dashboard records, `framex.shopProducts.v1`), `api/http-provider.js` | `GET /products` (filters: category, material, frameType, finish, size, priceMin, priceMax, customizable), `GET /products/facets`, `GET /products/:idOrSlug`, `GET /shops/:id/products?include=all`, `GET/PUT/DELETE /shop/products/:id`, `GET /products/slugs` |
| Media                                                                                                                                                                                                                                         | `services/media-service.js`                                                                                            | Validates type / size / minimum resolution, stores large + thumbnail copies in IndexedDB as `media:<id>`. Replace with `POST /media` (upload) returning https URLs                                                                                             |
| ProductPage                                                                                                                                                                                                                                   | `ui/product-page.js`                                                                                                   | Used by `product.html` and by the wizard preview (`render(..., { preview: true })`)                                                                                                                                                                            |
| ProductGallery                                                                                                                                                                                                                                | `ui/product-gallery.js`                                                                                                | Views, crossfade, zoom, fullscreen lightbox, optional 360° (8+ frames, loaded only when opened)                                                                                                                                                                |
| Sections                                                                                                                                                                                                                                      | `ui/product-sections.js`                                                                                               | ComponentBreakdown, MaterialSection, Quality, BackView, ProductViews, SpecificationTable, Customization, Shop, Video, Reviews                                                                                                                                  |
| ProductWizard / ProductEditor                                                                                                                                                                                                                 | `ui/product-wizard.js`                                                                                                 | 9 steps; drafts auto-save; edits to live products are held in `framex.shopEditor.v1` until "Save changes"                                                                                                                                                      |
| ImageUploader                                                                                                                                                                                                                                 | `ui/image-uploader.js`                                                                                                 | Upload, preview, view type, alt text, set main, reorder (buttons / drag), delete                                                                                                                                                                               |
| ShopProductManager (dashboard)                                                                                                                                                                                                                | `ui/shop-dashboard.js`, `shop-dashboard.html`                                                                          | Hash routes `#/products`, `#/products/new`, `#/products/<id>/edit?step=`, `#/orders`, `#/inventory`, `#/profile`, `#/settings`                                                                                                                                 |
| Styles                                                                                                                                                                                                                                        | `css/product.css` (container queries, so the preview matches the live page), `css/shop-admin.css`                      |                                                                                                                                                                                                                                                                |

URLs: a static host can't serve `/products/:slug`, so product pages use `product.html?slug=<slug>` (the canonical link and JSON-LD use it too). With a server, rewrite `/products/:slug` to the same page.

Statuses: `draft` → `published` / `unpublished`; with `config.productModeration = true`, publishing becomes `pending_review` until FrameX approves it. Only published products reach customers.

Data safety: shop-entered quality information is always `shop_claimed`; `sanitizeShopInput()` resets `quality.verification` on every shop save, and `validateForPublish()` blocks "FrameX Verified", "Certified" and "Best Quality". Only the FrameX backend may set `verification.status = "framex_verified"`.

FrameX Studio: `studio.html?product=<id>` builds its context from `productModel.studioOptions(product)`: only that product's frame colours, sizes (any width × height, in or cm), orientations, mat / border colours and widths, front covers (at the shop's prices), print materials and caption text. Options chosen on the product page come along as `&size=&color=&print=&cover=`.

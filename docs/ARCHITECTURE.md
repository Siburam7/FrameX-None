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

### Cart (backend, one per account)

There is no guest cart and no cart in `localStorage`. `users ──1:1── carts ──1:n── cart_items` in the
backend database; the website (`assets/js/store/cart.js`) only keeps a display copy of the server's last
answer. A line as the website receives it:

`{ id, kind: "product" | "studio", productId, templateId, name, image, shopId, shopName, size, color, options[],
note, quantity, maxQuantity, unitPrice, lineTotal, available, issue, priceChange, design }`

The website sends ids and a quantity (or a Studio design); the server looks the product up in
`catalog_products`, checks the options and stock, and prices the line with the website's own
`productModel.cartLine()` / `studioEngine.price()`, loaded on the server by `backend/src/catalog/site-engine.js`.
The same product + options + note merges into one line; anything different is its own line. Every read
re-prices and re-checks each line. Lines are grouped by shop because a marketplace creates **one order per shop**.
See `backend/README.md` → "Cart".

### Order (backend)

Implemented (see "Checkout, orders and payments" in `backend/README.md`). As the website receives one:

`{ orderNumber, status, paymentMethod, paymentStatus, subtotal, discount, tax, shippingFee, giftWrap, giftWrapFee, codFee,
total, shippingAddress, items[], needsPhotos, photoCount, events[], … }`, and each item:

`{ id, kind, productId, templateId, shopId, shopName, name, image, size, color, options[], note, quantity, unitPrice,
lineTotal, design, productType, photosRequired, photos: [{ slot, id, name, format, width, height, bytes, placement }],
photosMissing, fulfilment: { status, note, updatedAt } }`.

An order line keeps its own copy of what was bought, and the link to the customer's original photos
(`order_item_photos`). `fulfilment` is where the shop that makes the line says it is
(`NEW → ACCEPTED → IN_PRODUCTION → READY → HANDED_OVER`); the order's own status stays with FrameX.

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

The cart, checkout, orders and payments are implemented in the FrameX backend (`/api/cart`, `/api/addresses`,
`/api/checkout`, `/api/orders`, `/api/payments/webhook/<gateway>`; see `backend/README.md`).
Also implemented there: customer photos (`/api/uploads`, `/api/files/<token>`), gift wrapping (part of the checkout
quote), a shop's own products and orders (`/api/shops/:shopCode/products | media | orders`,
`/api/catalog/shop-products`). Not built yet: customer profile extras, wishlist on the server. Older notes below:
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
(`orderStatusLabel`). The Services page shows this flow as an explainer. Real orders (`order.html`,
`orders.html`, the admin and shop dashboards) use the backend's own statuses:
`PENDING_PAYMENT → PLACED → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, or
`CANCELLED` / `RETURNED`.

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

## 9. Auth (done in Step 1) & payments (future)

Customer, shop and admin accounts are implemented by the backend in `backend/` (see "Step 1 backend" at the end
of this document). Payment gateway integration should sit behind the backend (`POST /orders` → payment intent →
webhook); the cart's Checkout button emits a `framex:checkout-requested` DOM event carrying the per-shop groups,
which is the hook for a real checkout flow.

## 10. Roadmap status

| Phase                                  | Status                                 |
| -------------------------------------- | -------------------------------------- |
| 1 Professional UI                      | ✅ done                                |
| 2 Responsive / mobile                  | ✅ done (tested 320 – 2560 px)         |
| 3 Animations                           | ✅ done                                |
| 4 Product / shop data structure        | ✅ done (seed + API contract)          |
| 5 Admin Panel                          | 🟡 shops, orders, customer photos, shop products |
| 6 Backend + database                   | ✅ accounts, shops, cart, orders, payments, photos, shop products |
| 7 Authentication                       | ✅ done (Step 1)                       |
| 8 Orders + payments                    | ✅ checkout, Cashfree (tested against a stand-in; needs sandbox keys for a real test payment), Razorpay adapter kept, COD, gift wrapping |
| 9 Art & Artists                        | ✅ artists, artwork approval, custom paintings paid in two parts, reviews, notifications, search, admin settings |
| 9 Delivery integration                 | ⬜ not started                         |
| 10 Commission & marketplace management | ⬜ not started (design in §7)          |

## Design system

One visual language for every customer-facing page. It was taken from Home Decor (the page the owner chose as
the benchmark) and moved into the shared stylesheets, so Home Decor and the rest of the site read the same rules.
Three files hold it; page stylesheets only add layout that is really their own.

| File | What it defines |
| ---- | --------------- |
| `assets/css/tokens.css` | Colour, the type scale, spacing, section rhythm, radius, shadow, motion |
| `assets/css/base.css` | Sections and their surfaces, and **every heading level** (one rule per level, listing the classes that use it) |
| `assets/css/components.css` | Buttons, chips, badges, form controls, the page hero, the collection card, the product card and its grid, the feature-card shell, the panel shell, the closing panel, the promo band |
| `assets/css/mobile.css` | **Phones only.** Every rule sits inside `@media (max-width: 639px)`, and the file is the last stylesheet on every page. It sets the same tokens one step smaller (card text, prices, headings, gutter, section spacing, header height) and makes the product card, shop card, buttons, chips and footer compact, so a phone shows a shopping-app layout (two compact cards per row) instead of the desktop one squeezed. Tablet, laptop and desktop never read it: change their look in the files above, and a phone-only tweak here |

**Type.** Two families: `--font-display` (Sora) for headings and prices, `--font-body` (Plus Jakarta Sans) for
everything else. Sizes and weights are tokens; a component file never sets a heading size.

| Level | Token | Weight | Used for |
| ----- | ----- | ------ | -------- |
| H1 | `--text-h1` (2.1 to 4rem) | 800 | the headline in a page hero (`.page-hero__title`) |
| H2 | `--text-h2` (1.75 to 2.5rem) | 600 | section headings (`.section-title`) |
| Title | `--text-title` (1.5 to 2.25rem) | 700 | the title of a task screen: product, design, checkout, orders, account, studio, customiser |
| H2 small | `--text-h2-sm` | 700 | section headings inside a task screen (`.section-title--sm`, `.pp-section__title`) |
| H3 | `--text-h3` | 700 | a block inside a section |
| H4 | `--text-h4` | 700 | panel and feature-card headings |
| Card | `--text-card`, `--text-label`, `--text-price` | 700 | product name, the uppercase label above it, the price |
| Body / small | `--text-base`, `--text-sm`, `--text-xs` | 400 | text, secondary text, fine print |

To give a new heading its level, add its class to the matching list in `base.css`; do not write a font size next to it.

**Spacing.** `--space-xs` 4, `-sm` 8, `-md` 12, `-lg` 16, `-xl` 24, `-2xl` 32, `-3xl` 48 (px). A section has
`--section-gap` above and below; its heading block sits `--section-head-gap` above the content; card grids use
`--grid-gap` (12, 16 from 640px, 20 from 1000px).

**Radius.** `--radius-md` cards and panels, `--radius-lg` collection cards and large pictures, `--radius-xl`
large panels, `--radius-pill` buttons, chips, badges and search / filter controls, `--radius-sm` small tiles.

**Page shapes.**

- A page that opens with a headline uses `.page-hero`: the light band (white fading to `--surface-soft`) with breadcrumb, a small `.eyebrow` label,
  the H1 (a `<span>` inside it takes the amber `--text-gradient`), a lead and optional actions, facts and a wall of three
  framed pieces. Home, Home Decor, Shop, Templates, Services, Gallery, About, Our Story, Contact, FAQ, Partner and
  the legal pages all use it.
- Below it, `.section` blocks alternate white and the soft light grey (`.section--warm`; `.section--dark` is the same soft surface now: the site has no dark sections), each with
  `.section-head` (`.eyebrow`, `.section-title`, `.section-lead`).
- A section that points to another part of the site is a promo band: `.promo-band__grid` with the words
  (`.promo-band__copy`: eyebrow, title, lead, two buttons) on one side and `.promo-band__wall`, four labelled
  pictures, on the other. The home page has one, "Home Decor & Wall Art".
  Blocks that carry the same `data-match-height` value are given the height of the tallest one by `matchHeights()`
  in `ui/site.js` (for two bands that must stay level; the home page no longer needs it).
- The home page below its hero is laid out like a shopping site (`layout-hero.css`, "shopping-site layout"): the
  page is the soft colour and each section is a white `.shelf` inside a `.shelf-section`, with its title on the left
  and its "see all" link on the right. Categories are circles (`.shelf--cats`), three `.promo-tile` banners lead to
  FrameX Studio, templates and the multi-panel customiser, and product rows scroll sideways.
- A task screen (product, design, FrameX Studio, wall-art customiser, checkout, orders, account, log in) starts
  with the slim breadcrumb row `.page-banner` and a Title. Studio, customiser, checkout, orders and account sit on
  the warm background with white panels (the panel shell in `components.css`).

**Cards.**

- `.product-card` in `.product-grid` (2 / 3 / 4 columns) is the one product card: picture (4:5), uppercase label,
  name, price row (`<span>From</span><strong>price</strong><s>was</s><em>% off</em>`), one quiet meta line, actions.
  `templates.productCard` renders photo frames (label = the shop), `decorUI.card` wall art (label = the collection),
  `templateUI.card` personalised designs (same card; the picture area is the design on a mat).
  `.product-grid--rail` turns a short row into a sideways swipe below 1000px.
- `.collection-card` in `.collection-grid`: a picture with its name over a dark fade (wall-art collections, frame categories).
- Feature cards (`.service-card`, `.method-card`, `.how-step`, `.journey__step`, `.review-card`, `.community-card`,
  `.cg-card`, `.shop-card`) share one shell: white, hairline border, card radius.

**Buttons.** Primary `.btn--primary` (amber, the main action of a screen), secondary `.btn--dark` (the main action
of a card), outline `.btn--outline`, ghost `.btn--ghost`; on dark surfaces `.btn--light` and `.btn--outline-dark`.
Something the customer makes their own (a design, a photo set) uses the primary button; a ready-made product uses the dark one.

**Motion.** Short fades, slides and lifts from the motion tokens; cards lift 4px and their picture scales slightly.
Everything respects `prefers-reduced-motion` (the global rule in `base.css`).

**Home page hero.** `index.html` + `assets/js/ui/hero.js` + the hero block in `assets/css/layout-hero.css`. The slides
are data: `heroSlides` in `assets/data/site.seed.js` (one per part of the catalogue: label, headline, lead, two
buttons, three pictures, the colour of the glow). The first slide is also in the HTML so it shows before scripts run.
It moves on every 6 seconds; it waits while the pointer is on a button or picture, while keyboard focus is inside it
and while the tab is in the background; it has previous / next / pause buttons, tabs, arrow keys and swipe; with
reduced motion it does not move by itself. Slide titles are `<h2>`; the page keeps one visually hidden `<h1>`.

## Home Decor & Wall Art

A second product range beside frames. It is **not** a second shop system: the products live in the same catalogue,
open in the same product page, and go through the same cart, checkout, payments and orders.

| Piece | File | Notes |
| ----- | ---- | ----- |
| Catalogue | `js/decor.js` | 20 collections (categories `hd-<id>` under the main category `home-decor`) and one short entry per design. Section 5 of the file expands each entry into the same product shape as `js/edit.js` (sizes with prices, frame colours, matte / glossy finish, typed views, components, specifications) plus a `decor` block: `{ collection, collections, panelCount, stagger, format, customPhoto, credit, original }`. The backend loads this file too (`backend/src/catalog/site-engine.js`) |
| Page | `home-decor.html` + `assets/js/ui/decor-page.js` | Reads products with `api.getProducts({ category: "home-decor" })` and filters in the page. `FrameX.decorUI.card()` renders a wall-art product as the shared `.product-card`; the product page reuses it for related wall art. The page's hero, sections, collection cards, chips, grid and toolbar are the shared design system (see above); `assets/css/decor.css` only holds the custom-photo block and the customiser |
| Product page | `product.html` (unchanged page) | Loads `js/decor.js`, so a wall-art slug resolves like any product. For wall art the breadcrumb and "more like this" point back to Home Decor; a custom-photo product shows "Customize & Create" instead of Add to cart |
| Customiser | `wall-art-studio.html` + `assets/js/ui/decor-studio.js` | One photo, 2 to 5 panels. Geometry is one function (`layoutOf`) used for the live preview and for the cart thumbnail. The draft (choices + a preview copy of the photo in IndexedDB) survives a reload or a login |
| Rules shared with the backend | `FrameX.decorRules` at the end of `js/decor.js` | `cleanCustomization()` and `describe()`: one definition of what a custom order may contain |
| Pictures | `assets/img/decor/`, drawn by `tools/decor/` | `hd-<id>.webp` (card / front), `-room.webp`, `-set.webp` for sets, plus shared frame back / corner views. See `tools/decor/README.md` |

Only the pages that need the wall-art catalogue load `js/decor.js` (`home-decor.html`, `product.html`,
`wall-art-studio.html`), so the Shop page and the home page lists show exactly the frames they showed before.
Cart lines and orders are described by the backend, so every other page can show wall art in the cart without it.

Future backend work: real photo upload for custom sets (today the order asks for the photo on WhatsApp),
and ratings once reviews exist (`rating: { average, count }` on a product is already displayed when present).

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
| Photos                                                                                       | `assets/js/services/upload-service.js`, `assets/js/ui/photo-uploader.js` | The original file and a preview copy wait in this browser; the original is uploaded to the backend unchanged (see "Customer photos, gift wrapping and shop products")                                                                          |
| Drafts and saved designs                                                                     | localStorage `framex.studioDrafts.v1` and `assets/js/store/designs.js` | Per-account designs API                                                                                                                                                                                                                        |
| Cart line                                                                                    | `cart.addStudio()` → `POST /api/cart/items`                           | Sends the design's config; the backend validates it, prices it and stores it in the account's cart                                                                                                                                                     |

## Product system (product pages + shop products)

Every product, whether it comes from `js/edit.js` or from a shop's dashboard, is turned into ONE flexible model by `assets/js/services/product-model.js` (`normalize()`). The UI never assumes a field exists: each product-page section is rendered only when the product has data for it.

| Layer                                                                                                                                                                                                                                         | File                                                                                                                   | Notes / future replacement                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product model: schema, vocabularies (view types, print materials, covers, components, quality fields, statuses), legacy conversion, pricing (`quote`), Studio capabilities (`studioOptions`), validation (`validateForPublish`), claim filter | `services/product-model.js`                                                                                            | Same rules run on the server; the server re-prices at checkout                                                                                                                                                                                                 |
| Product / shop services                                                                                                                                                                                                                       | `services/product-service.js` (`productService`, `shopService`, `pricingService` in the model)                         | UI only talks to these                                                                                                                                                                                                                                         |
| Data provider                                                                                                                                                                                                                                 | `api/seed-provider.js` (catalogue file + the shop products handed over by `api/shop-directory.js`), `api/http-provider.js`  | `GET /products` (filters: category, material, frameType, finish, size, priceMin, priceMax, customizable), `GET /products/facets`, `GET /products/:idOrSlug`, `GET /shops/:id/products?include=all`, `GET/PUT/DELETE /shop/products/:id`, `GET /products/slugs` |
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

## View on My Wall (Live Demo)

A customer looks at the frame they chose on their own wall through the camera. It is a separate module: the pages
only hand it a description of what the customer has on screen and get nothing back. It never touches the cart, the
design or the order.

| Layer | File | Notes |
| ----- | ---- | ----- |
| Entry (on the three pages, 7 KB) | `assets/js/services/live-demo.js` (`FrameX.liveDemo`) | `available()`: secure page + a camera on the device. `mount(host, { getSpec })` adds the button, hidden until a camera is known. `open()` loads everything below on first use. `track()` announces the analytics events |
| What to show | `livedemo/ld-subject.js` | Turns a page's description into a **subject**: real width, height and depth in metres, and one painted picture per piece. Kinds: `studio` (a Studio design), `product` (a product page's size, colour, photo and crop), `decor` (ready-made wall art and panel sets), `panels` (one photo across panels) |
| The painter | `livedemo/ld-paint.js` | Redraws on a canvas exactly what the Studio preview and the template engine show in HTML: moulding, mats, printed border, the photo with its crop, a template's slots, shapes and words. It reads the same `geometry()` and the same catalogue, so there is one definition of a frame |
| The 3D picture | `livedemo/ld-render.js` | One small WebGL renderer for both modes: the front, the four sides (frame depth), a soft shadow on the wall. Falls back to a flat 2D drawing if the device has no WebGL |
| AR mode | `livedemo/ld-xr.js` | WebXR `immersive-ar` with `hit-test` (required), `anchors`, `dom-overlay` and `light-estimation` (used when the phone has them). States: scanning → floor seen → wall detected → placed → tracking lost. Real size, anchored to the wall |
| Camera mode | `livedemo/ld-camera.js` | `getUserMedia` (back camera) under the same renderer. No wall detection. Size on screen is worked out from the real size, an assumed lens angle (60° on the long side) and the distance the customer picks (1 to 4 m; it starts at 2 m, or farther when a wide set would not fit). With the phone's motion sensor ("Stick to wall") the frame stays in place when the phone is turned |
| The screen | `livedemo/ld-view.js` (`FrameX.liveDemoView`), `css/livedemo.css` | Full-screen dialog: first card (what will happen, privacy line), hints, tools, every error panel. Gestures: drag, pinch, two-finger twist (snaps to straight); mouse drag, wheel, Shift + wheel; arrow keys, + and −, [ and ], R |
| Maths | `livedemo/ld-math.js` | Matrices, rays, the wall's pose, phone-sensor angles to a camera rotation |

**Which products.** `productModel.liveDemoSupport(product)` → `{ ok, kind, reasons }`. Three steps: the product type
(frames, templates, wall art and panel sets are on by default; gifts, other decor and artists' originals are off);
the product's own switch `liveDemo.enabled` (`true` / `false` / `null` = follow the type); and what can really be
drawn at its real size: a size with measurements and either a frame the Studio engine can draw around one photo, or
the wall art's artwork picture (`decor.art`, drawn by `tools/decor` into `assets/img/decor/art/`). A product that
fails the last step has no button, whatever the switch says. A shop sets the switch in its product editor; the backend
keeps only `enabled` from a shop (`sanitizeShopInput`).

**What is honest about size.** AR mode uses the phone's own measurement of the room, so the frame is its real size.
Camera mode cannot measure anything: it says "Approximate size for a wall about N m away". The words "exact" or
"real size" are never shown in camera mode. A product page shows the product as its page sells it (every listed
colour, the frame turned to suit the photo, the product's own mat colour); the Studio shows the design as the Studio
preview shows it.

**3D models later.** `liveDemo.model` on a product is reserved for a `.glb` file and already travels in the subject
(`subject.model`). Today nothing reads it: `ld-render.js` draws the painted box. A model loader goes in
`ld-render.js` (`setSubject`), and neither the pages, the engines nor the product data have to change. Apple's AR
Quick Look (USDZ) would be a third engine next to `ld-xr.js` and `ld-camera.js`.

**Privacy.** The camera is requested only after the customer presses "Open camera" on the first card. The stream is shown
on the screen and nowhere else: no recording, no upload, no analytics picture. Close, Escape, leaving the page or
putting the browser in the background stops the camera. "Save photo" (camera mode) builds one JPEG on the device and
hands it to the device's share sheet or downloads folder.

**Analytics.** `FrameX.liveDemo.track(name, detail)` dispatches `framex:analytics` on `document` and pushes to
`window.dataLayer` when a page has one. Events: `live_demo_opened`, `camera_permission_granted`,
`camera_permission_denied`, `surface_detected`, `frame_placed`, `frame_repositioned`, `live_demo_closed`,
`live_demo_add_to_cart`. No analytics service is connected: the events are announced and nothing listens yet.

**Requirements and limits.**

- A secure page: `https://` or `localhost`. On plain `http://` (for example a phone opening the computer's address
  on the home network) the browser gives no camera and the button stays hidden.
- AR mode needs WebXR with hit-test: Chrome on an Android phone that has Google Play Services for AR. iPhones and
  iPads have no WebXR in Safari or Chrome, so they use camera mode.
- A laptop with a webcam shows the button too (camera mode with the mouse).
- Not shown: products made from several photos, arched frames, frames FrameX has no drawing for, out-of-stock products.
- **Tested** in desktop Chrome with a simulated camera, simulated touch and motion sensors, and a simulated WebXR
  phone that reports walls, floors, anchors, light and tracking loss: the button, both modes, placing, drag, pinch,
  twist, reset, distance, save, close and re-open, the design and photo staying unchanged, add to cart afterwards,
  permission refused, no camera, camera lost, files failing to load, landscape, and the pages on a laptop without a
  camera being pixel-identical to before. **Not tested: a real phone.** The first run on an Android phone (AR) and an
  iPhone (camera mode) still has to be done; expect the lens-angle assumption to need tuning per device.

## Analytics and the admin dashboard

Two kinds of numbers, kept apart on purpose.

**Business figures** (orders, sales, refunds, payments, sellers, paintings, accounts, logins, carts) are read from
the database by `backend/src/services/admin-analytics-service.js`. The website sends nothing for them. An order is
paid when the server has verified its payment or a Cash on Delivery order was delivered; test orders (`orders.is_test`)
are reported separately. See `backend/README.md` → "Analytics" for the definitions.

**Visitor statistics** come from the website, and only for visitors who allowed analytics.

| Layer | File | Notes |
| ----- | ---- | ----- |
| The question, consent, sending | `assets/js/services/analytics.js` (`FrameX.analytics`), on every page except the redirect page | States: not asked → `granted` / `denied` (`localStorage framex.consent.v1`). Nothing is sent or stored before a yes; events of the open page wait in memory and go out only after it. Do Not Track / Global Privacy Control = no, without asking. Staff pages and the password-reset page are never measured |
| What pages report | one line in each page module: `FrameX.analytics.track(name, {...})` | `page_view` (automatic), `view_item` (product page), `view_item_list` (a category in Shop or Home Decor), `view_template`, `view_artwork`, `view_artist`, `view_shop`, `search` (once typing stops), `begin_checkout`, `live_demo_opened`. `add_to_cart` and `purchase` go to Google only: FrameX counts those from the cart and the orders |
| FrameX's own store | `POST /api/analytics/events` → `backend/src/routes/analytics.js` → `services/analytics-service.js` → table `analytics_events` | Requires `consent: true`; cleans every field; drops unknown events, bots and admins; never keeps an IP address or an account. Batches of up to 20, sent with `fetch(..., { keepalive: true })` |
| Google Analytics 4 | the same module, `loadGoogle()` | Only with a Measurement ID (`/api/config` → `analytics.ga4MeasurementId`, from `GA4_MEASUREMENT_ID`) and only after a yes. Consent Mode: analytics granted, all advertising denied. The page address is sent without the part after `#` and with only the parameters that name a product or a template |
| Server-side records | `recordServerEvent` (cart additions, from `cart-service.js`), `recordAuthEvent` (logins and failed logins, from `auth-service.js`) | Never throw: a customer can always log in or add to the cart even if the record can't be written |
| Reports | `GET /api/admin/analytics/{overview,traffic,sales,catalog,sellers,paintings,accounts,live}` | ADMIN only. `?range=today\|7d\|30d\|90d` or a custom period of up to a year |
| The screen | `assets/js/ui/admin-analytics.js`, `assets/css/admin-analytics.css` | Draws what the API answers and nothing else: cards, one bar per hour or day (inline SVG, with the same numbers as a table), ranked lists. Loading, empty ("Nothing in this period") and error (Retry) states. `#/users/<id>` is one account's record |

**Adding an event.** Call `FrameX.analytics.track("my_event", {...})` where it happens; add its name to `FIRST_PARTY`
in `analytics.js` and to `WEB_EVENTS` in `analytics-service.js` if FrameX should keep it (otherwise it only goes to
Google, under its own name); add a query to `admin-analytics-service.js` and a card or list to `admin-analytics.js`
if the dashboard should show it.

**Limits.** Visitor figures only include visitors who said yes, so they are a floor, and a funnel step from
analytics is not a share of a step from the database (the screen says which is which). "On the site now" is kept in
the server's memory, so it is right for one server process. Google Analytics has not been run with a real
Measurement ID. GA4's own reports are not read back into the dashboard.

## Art & Artists and custom paintings

| Piece | Where | What it does |
| ----- | ----- | ------------ |
| Artists | `services/artist-service.js`, `routes/artists.js` | Applications, admin onboarding (artist + `ARTIST` login through a one-time link), the public directory (city / area only), the artist's own profile and pictures |
| Artworks | `services/artwork-service.js` | `PENDING_REVIEW → APPROVED / REJECTED`, pause, withdraw. An approved artwork is mirrored into `catalog_products` (source `artist`, product type `artwork` in `product-model.js`: ready-made, no customer photo), so the cart and checkout sell it unchanged |
| Custom paintings | `services/painting-service.js` | The price list, the request, accept / decline, and the state machine: one `move()` function with a map of the only allowed steps |
| Painting payments | `services/painting-payment-service.js` | The advance and the balance through the same gateway interface as orders; a stage is paid only with a payment the server got from the gateway; webhooks for a painting fall through from `payment-service.handleWebhook` |
| Settings | `services/settings-service.js` | Admin-changeable values (advance percent, fees) kept in `platform_settings` and written into the one `config` object the code already reads |
| Reviews, notifications, search | `services/review-service.js`, `notification-service.js`, `search-service.js` | Reviews only from delivered purchases; one notification per event (account + email); one search over what the public may see |
| Website | `ui/art-pages.js`, `ui/painting-pages.js`, `ui/artist-dashboard.js`, `ui/admin-art.js`, `ui/search-page.js`, `css/art.css` | The pages. `services/payments.js` opens Cashfree's window and then asks the backend what happened; it never treats the window's answer as proof |

## Customer photos, gift wrapping and shop products

### Four kinds of product, one rule

`productModel.PRODUCT_TYPES` (in `assets/js/services/product-model.js`) lists what can be sold and what each kind
requires of the customer. `productModel.photoRequirement(product, selection)` is the ONE answer to "does this need
the customer's photo, and how many": the product page, FrameX Studio, the shop dashboard and the backend all ask it
(the backend loads the same file through `backend/src/catalog/site-engine.js`), so a rule can't differ between them.

| Experience | Types | Photos | Where the customer adds them |
| --- | --- | --- | --- |
| A. Photo frame | `photo-frame`, `personalized` | 1 to 12 (a set: one per frame; a size can set its own number) | "Your photo" on the product page: one tile per photo, and for a single photo a preview of how it fits the chosen size (drag, zoom) |
| B. Customizable frame | `custom-frame`, or any frame with "Design in FrameX Studio" on | exactly 1 | FrameX Studio (`studio.html?product=<id>`): crop, position, zoom, rotate, frame colour, border, mat, live preview |
| C. Home Decor | `home-decor`, `wall-art`, `other`; a ready-made `multi-panel` set | 0: never asked for | none. The only exception is a "Your Photo — N Panel Split" set (`decor.customPhoto`), made in `wall-art-studio.html` |
| D. Templates | a template in `js/templates.js`; shop products of type `template` | one per photo space (2 to 12) | FrameX Studio in template mode: "Photo 1", "Photo 2", … each with its own upload, replace, crop, position and zoom |

Older catalogue entries without a `productType` are photo frames. Wall art says so itself (`decor`).
Without every required photo nothing can be added to the cart or bought: the page shows
`PHOTO_TEXT.missingOne` / `missingMany(n)`, and the backend answers `422 PHOTOS_REQUIRED` with the same words for
the cart, for Buy Now and when the order is placed.

### The customer's photo, from the page to the print

| Step | Where | What happens |
| --- | --- | --- |
| Choose | `ui/photo-uploader.js` (tiles), `services/upload-service.js` → `prepare()` | Type and size are checked. The **original file** is kept as it is (IndexedDB store `originals`) and a small **preview copy** is made for the screen (store `photos`). The two are never mixed up: only the original is ever uploaded |
| Upload | `uploadService.upload()` → `POST /api/uploads` (`FrameX.http.upload`: raw bytes, progress) | Starts by itself for a logged-in customer; a visitor's photo waits until they log in to order (`uploadService.forOrder()`). An account is needed because a photo belongs to the account that ordered it |
| Check + store | `backend/src/services/upload-service.js`, `lib/image-info.js`, `lib/storage.js` | Format and pixel size are read from the file's header; bytes counted, SHA-256 kept; the file is written unchanged under `UPLOAD_DIR/private/`. No resize, no re-encode, no enhancement anywhere |
| Cart | `cart_items.photos` = `[{ slot, uploadId, placement }]` | Only uploads of the same account count. A line whose photo is gone shows `PHOTOS_REQUIRED` instead of being ordered without it |
| Order | `order_item_photos`, `order_items.product_type / photos_required` | The photos are copied to the order line and marked `ATTACHED`: from then on they are kept |
| Fulfilment | signed links (`lib/file-links.js`) → `GET /api/files/<token>` | The customer, FrameX staff and the shop that makes that line get a link that lasts a few minutes. Shops reach a photo only through their own order line; staff and shop downloads are audited |

The words customers read about quality are in ONE place (`PHOTO_TEXT.quality`): "Your uploaded image will be printed in
the same original quality you provide. We do not artificially enhance or improve the image quality. For the best
print result, please upload a high-quality image." Pages show the file's own facts (name, pixels, size) and never a
judgement of how it will print.

### Gift wrapping

An order-level choice at checkout (`ui/checkout-page.js`: "Would you like to gift wrap this order?"). The fee and
whether it can be chosen come from the backend's quote (`giftWrap: { available, fee, reason, selected }`); the page
adds nothing up. It is unavailable when any item's product (`giftWrap: false`) or shop (`shops.gift_wrap`) doesn't
offer it. `orders.gift_wrap` / `gift_wrap_fee` keep the answer; the total constraint in the database includes it.

### Shop products and shop orders

| Layer | File | Notes |
| --- | --- | --- |
| Shop's products in the backend | `backend/src/services/shop-product-service.js`, `routes/shop-dashboard.js` | `catalog_products` rows with `source = 'shop'`, `owner_shop_id`, `listing_status`. The record is rebuilt by `sanitizeShopInput()` (type rules, no verification claims) and validated for publishing on the server |
| Product pictures | `media_files` + `UPLOAD_DIR/public/`, served at `/media/<id>[/thumb]` | A product stores `media:<id>` references; only the owning shop's uploads are accepted |
| Website catalogue | `api/shop-directory.js` → `GET /api/catalog/shop-products` → `seedProvider.setShopProducts()` | Shop products join the catalogue-file products for listing, search, filters and product pages |
| Dashboard | `ui/shop-dashboard.js`, `ui/product-wizard.js`, `services/product-service.js`, `services/media-service.js` | Products for every shop ("What do you want to sell?" first), Orders (own lines, original photos, progress), Inventory, profile with the gift-wrap switch |
| A shop's orders | `backend/src/services/shop-order-service.js` | Orders with a line whose `shop_ref` is the shop's catalogue link or Shop ID; own lines only; no customer email, no payment references |
| Platform's last word | `admin.html#/products` → `POST /api/admin/products/:id/listing`; `PRODUCT_MODERATION` | FrameX approves (when moderation is on) or takes a product off sale. A shop that is not approved + active sells nothing |

What a shop controls: what it sells and all of that product's content and price. What stays with the platform:
payments, authentication, the order structure, file storage and its access rules, the product types and their
validation, and (not built) commission.

## Step 1 backend: accounts, roles, shop onboarding, nearby shops

A separate service in `backend/` (Node.js + Express + PostgreSQL). The website remains a static site and reaches it
over HTTPS; while `PRODUCTION_API_URL` in `assets/js/config.js` is empty the site runs without it. Run, configure and
deploy instructions and the endpoint list are in `backend/README.md`.

| Concern | Where | Notes |
|---|---|---|
| Settings | `backend/src/config.js`, `backend/.env` | Environment variables only. Production refuses to start without `AUTH_SECRET`, a database and `CORS_ORIGINS` |
| Database | `backend/src/db/` | PostgreSQL. `DATABASE_URL` → `pg`; empty → embedded PGlite for local work. Schema: `migrations/001_init.sql` |
| Passwords | `backend/src/lib/passwords.js` | scrypt, per-password salt, parameters stored with the hash |
| Sessions | `backend/src/middleware/auth.js`, `services/auth-service.js` | Server-side sessions; random token, hash stored; httpOnly cookie (or bearer token for cross-site hosting) |
| Roles | `requireRole`, `requireOwnShop` | CUSTOMER / SHOP / ADMIN, read from the database on every request. Shop routes also match the Shop ID in the URL to the session's shop |
| One-time links | `auth_tokens` table | Password reset (60 min) and shop account setup (72 h): random, hashed, expiring, single-use |
| Shop onboarding | `services/shop-service.js`, `routes/admin.js` | application (PENDING → UNDER_REVIEW → APPROVED / REJECTED) → admin approval creates shop + Shop ID (`FRX-SHOP-1001`…) + SHOP login awaiting password setup |
| Nearby shops | `nearbyShops()` + `lib/geo.js` | Indexed latitude / longitude box, then Haversine in SQL. Only APPROVED + ACTIVE shops. Radius options in `config.nearby` |
| Place search | `lib/geocoder.js` | OpenStreetMap Nominatim behind `GET /api/geo/search`; replaceable provider; off → text matching |
| Password recovery | `services/auth-service.js`, `otp_codes` table | `recovery/start` (find account, masked options) → `recovery/send` (6-digit code by email or SMS) → `recovery/verify` → one-time reset token. Codes: hashed, 10 min, 5 tries, 30 s resend wait, 5 per hour. Customers and shops only; admins reset from the command line |
| Email | `lib/mailer.js` | `brevo` (default) / `resend` / `gmail` / `smtp` / `none`. No provider = "Email service is not configured."; nothing is simulated. `dev` = explicit test mode with a mailbox at `/dev/mailbox` (never in production) |
| SMS | `lib/sms.js` | `fast2sms` (default) / `2factor` / `twilio` / `none`. Same rules as email |
| Audit | `audit_logs` table, `lib/audit.js` | actor, action, target, time, written in the same transaction as the change |
| Catalogue | `catalog/site-engine.js`, `services/catalog-service.js` | The website's catalogue files are imported into `catalog_products` / `catalog_templates` on every start; the website's pricing code runs on the server in an isolated context |
| Checkout | `services/checkout-service.js`, `routes/checkout.js` | Server-side quote (items, discount, tax, delivery, COD fee, total). Place order: one transaction, stock taken with row locks, `UNIQUE (user_id, idempotency_key)` so one checkout makes one order |
| Orders | `services/order-service.js`, `routes/orders.js`, `routes/admin.js` | Order status and payment status are separate columns. Items are snapshots. History in `order_events`; emails once each via `order_notifications` |
| Payments | `payments/index.js` (gateway interface), `payments/cashfree.js`, `payments/razorpay.js`, `services/payment-service.js` | An order becomes PAID only in `confirmPaid()`, reached with a payment the server got from the gateway (signature + status check, verified webhook, or reconcile). Attempts, retries, refunds, expiry of unpaid orders. Webhook stored once per event id |
| Cart | `services/cart-service.js`, `routes/cart.js` | One cart per account, found from the session's user id (no cart id from the browser). Server-side names, options, stock limits and prices; re-checked on every read; `POST /cart/validate` before checkout |

Data model (Step 1):

```
users (id, name, email, phone, password_hash, role, status, shop_id → shops)      role: CUSTOMER | SHOP | ADMIN
shops (id, shop_code, catalog_ref, name, owner, contact, address…, latitude, longitude,
       approval_status: PENDING|APPROVED|REJECTED, active_status: ACTIVE|INACTIVE, fulfilment, is_demo, application_id)
shop_applications (id, shop + owner + contact + address, status, review_note, reviewed_by → users, shop_id → shops)
sessions (id, user_id → users, token_hash, expires_at, revoked_at)
auth_tokens (id, user_id → users, purpose: PASSWORD_RESET|ACCOUNT_SETUP, token_hash, expires_at, used_at)
audit_logs (id, actor_user_id → users, action, target_type, target_id, metadata, created_at)
catalog_products (id, slug, name, shop_ref, shop_name, status: ACTIVE|INACTIVE|REMOVED, data jsonb)
catalog_templates (id, title, status, data jsonb)
carts (id, user_id → users UNIQUE)                                                 one cart per account
cart_items (id, cart_id → carts, kind: PRODUCT|STUDIO, product_id → catalog_products, template_id → catalog_templates,
            line_key, quantity, selection jsonb, customization jsonb, design_ref, thumbnail, note, title, unit_price)
addresses (id, user_id → users, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default)
orders (id, order_number FX-100001…, user_id → users, idempotency_key, status, payment_method: COD|ONLINE, payment_status,
        payment_gateway, gateway_order_id, gateway_payment_id, payment_instrument, subtotal, discount, tax, shipping_fee,
        cod_fee, total, amount_refunded, shipping_address jsonb (snapshot), customer_*, stock_held, expires_at, …)
order_items (id, order_id → orders, kind, product_id, template_id, shop_ref, shop_name, name, image, size, color, options,
             selection, customization, quantity, unit_list_price, unit_discount, unit_price, line_total)        snapshot
payments (id, order_id → orders, attempt, provider, method_requested, status, amount, gateway_order_id,
          gateway_payment_id, instrument, failure_reason, verified_via)                       one row per attempt
refunds (id, order_id, payment_id → payments, gateway_refund_id, amount, status: PENDING|PROCESSED|FAILED, reason)
payment_events (provider, event_id UNIQUE, event_type, gateway ids, summary jsonb, result, processed_at)   webhooks
order_events (order_id, kind: ORDER|PAYMENT|REFUND|NOTE, status, detail, actor_role)                        history
order_notifications (order_id, kind, ref UNIQUE together, recipient, delivered)                             emails
catalog_products.stock_reserved                                             units taken by orders
```

Later tables (orders, payments, reviews, notifications) reference `users.id`, `shops.id` and the cart's lines;
authentication and authorization do not change.

Website side:

| Piece | File |
|---|---|
| Backend address + session mode | `assets/js/config.js` (`backend.url`, `backend.session`) |
| HTTP client (base URL, session, CSRF header, friendly errors) | `assets/js/api/client.js` → `FrameX.http` |
| Auth state (`loading`, `authenticated`, `user`, `role`) + page guard | `assets/js/store/auth.js` → `FrameX.auth`, event `framex:auth-change` |
| Shops + nearby from the backend, catalogue fallback | `assets/js/api/shop-directory.js` (wraps `FrameX.api.getShops / getShop`) |
| Nearby UI: permission states, radius, manual location | `assets/js/ui/shops.js`, `assets/js/services/location.js` |
| Login / sign-up / forgot / reset | `assets/js/ui/auth-pages.js` |
| Login / sign-up dialog (asked for by "Add to cart" and the cart icon) | `assets/js/ui/auth-gate.js` → `FrameX.authGate.require()`; mounts the same forms |
| Cart: server-backed store, pending "add" during login | `assets/js/store/cart.js` → `FrameX.cart`, event `framex:cart-change` |
| Cart drawer, badge, pre-checkout check | `assets/js/ui/cart-drawer.js` |
| Checkout page: address, summary, payment method, place order | `checkout.html`, `assets/js/ui/checkout-page.js` (amounts only from `/api/checkout/quote`) |
| "Buy Now": one item straight to checkout, cart untouched | `assets/js/services/buy-now.js` → `FrameX.buyNow.start()`, then `checkout.html?buy=1` |
| Opening the gateway's checkout and handing its answer to the backend | `assets/js/services/payments.js` → `FrameX.payments` (one adapter per gateway) |
| Order confirmation, order details, your orders | `order.html`, `orders.html`, `assets/js/ui/orders-page.js` |
| Admin: orders, status changes, refunds | `assets/js/ui/admin-orders.js` (inside `admin.html`) |
| Account, partner application, admin dashboard | `assets/js/ui/account-page.js`, `partner-page.js`, `admin-page.js` |
| Shop dashboard (SHOP only) | `assets/js/ui/shop-dashboard.js` |

Until products move to the database, a backend shop is linked to its catalogue products by `shops.catalog_ref`
(a shop id from `js/edit.js`), set by an admin.

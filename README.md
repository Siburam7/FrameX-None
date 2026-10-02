# FrameX — photo-frame marketplace (frontend)

Multi-page, responsive site in plain HTML, CSS and JavaScript. No build step, no dependencies.
Works from the file system (double-click `index.html`) and on GitHub Pages under a repository sub-path,
because every link and asset path is **relative**.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, featured-frames showcase (auto-scroll + arrows + drag), category gallery, shops preview, custom-frame section, how it works, community + reviews (sample), frame guide |
| `shop.html` | All shops + full product catalogue (search, category, sort, in-stock, load more). Supports `?category=` `?q=` `?shop=` |
| `shop-detail.html?id=<shopId>` | One shop: profile, hours, services, its frames |
| `product.html?id=<productId>` | **Product experience:** real photo + a CSS frame-colour/size visualizer, size selector (Small/Medium/Large/XL with live price), colour swatches, real-world size comparison (hand / A4 sheet), photo-preview upload with zoom/move/reset, live order summary, quantity, tabs, shop card, related frames |
| `about.html` `services.html` `gallery.html` `contact.html` `faq.html` | Content pages |
| `our-story.html` | Brand story, philosophy, team/development credit |
| `terms-of-use.html` `privacy-notice.html` | Legal pages with a table of contents (draft — see disclaimers on each page) |

Header, footer, cart drawer and toasts are rendered from **one template** (`assets/js/ui/chrome.js`),
so navigation is never copy-pasted between pages. Each page only sets `<body data-page="...">`.

## Run / test locally

`python3 -m http.server` in this folder, open http://localhost:8000 (needed for "Use my location";
browsers block geolocation on `file://`). Fonts load from Google Fonts; system fonts are the fallback.

## What works (real)

Responsive layout 320-2560 px; cart (add / remove / quantity / per-shop grouping / saved on device),
wishlist, product search + filters + sort, shop pages.

**Product page customization** (the 10 named frame styles): a Small/Medium/Large/Extra-Large size
selector with a real, live price update per size (`sizeOptions` + `priceDelta` in the product data);
a frame-colour selector with a CSS-rendered preview (wood/metal-tinted frame border around your photo
or the product photo) — swatches always carry a text name, never colour alone; a real-world size
comparison against an average hand span and an A4 sheet; a photo-preview uploader with zoom, 4-way
move and reset, validated for type/size, kept in the browser only; and a live "Your frame" summary
(product / size / colour / photo / quantity / price) before Add to Cart. Keyboard-accessible tabs /
accordion / menu, contact-form validation, location permission + real haversine distance (only when a
shop has coordinates).

## Not connected (labelled as such on the site)

- **Checkout, payments, orders, accounts, reviews submission** - show "coming soon" / "not connected".
- **Contact form** - validates, then opens the visitor's email app *only if* an email is set in
  `site.seed.js`; otherwise says plainly the message was **not** sent. It never fakes success.
- **Photo upload** - the product page previews a photo on the visitor's device only; nothing is uploaded,
  saved, or added to the cart (stated on the page). Needs a backend (file storage + order attachment).
- **Frame colour + size selectors** - now real, for the 10 named frame styles. The colour preview is a
  CSS mock-up (not a photograph of each finish) and says so on the page. Per-size price differences
  (`priceDelta`) are a frontend placeholder until a shop sets its own per-size pricing.
- **Delivery fees, commission** - never calculated in the frontend.

## Where to change things

| Change | Edit |
|---|---|
| Products, prices, stock, sizes, colours, images | `assets/data/products.seed.js` (10 named styles use `sizeOptions` + `colors`; see the comment at the top of the file) |
| Frame colour palette (hex + finish) | `assets/data/frame-colors.seed.js` |
| Shops (address, hours, coordinates, ratings, logo) | `assets/data/shops.seed.js` |
| Categories | `assets/data/categories.seed.js` |
| Phone / WhatsApp / email, social links, hero numbers | `assets/data/site.seed.js` |
| FAQ, gallery, reviews, community tiles | `faq.seed.js`, `gallery.seed.js`, `reviews.seed.js`, `community.seed.js` |
| Colours, fonts, spacing | `assets/css/tokens.css` |
| Switch to a real backend | `assets/js/config.js` -> `dataMode: "api"` (see `docs/ARCHITECTURE.md`) |

## Placeholders needing real business information

- **Prices, discounts, stock, sizes, materials, product descriptions** are placeholders (descriptions are empty on purpose).
- **"Photo Frame Shop B / C"** are sample shops (badged "Sample shop"). "FrameX Studio" only has the address from the old site.
- **Hero numbers (500+ / 1K+ / 50+), reviews and their names** came from the old site and cannot be verified here;
  reviews and community photos are badged as samples. Replace or remove before launch.
- **About page** story/team is a marked placeholder. **FAQ** policies (cancel before production, 7-day damage claims)
  come from the old site - confirm them. Delivery times and COD were deliberately removed (shop-dependent, not connected).
- **Contact details and social links** are empty until filled in `site.seed.js`.
- The old "Flat 25% off, code FRAMEX25" banner was removed: the cart has no promo-code logic, so it would have been a false promise.
- Community videos from the old site were not reused (they appear to be another company's content).

## Assets - please check rights

Step images 3-4 (AI-generated) show visible Canon branding; some category/frame photos look like retail catalogue images.

## Structure

```
index.html shop.html shop-detail.html product.html about.html services.html gallery.html contact.html faq.html
assets/css   tokens base components chrome layout-hero(home) catalog story overlays footer-faq pages pdp(product+shop detail)
assets/js    config main | core (dom qs constants) | services (pricing location shop-utils)
             api (seed-provider http-provider api) | store (cart wishlist) | ui (one small module per feature)
assets/data  *.seed.js  (stand-in for the database)
assets/img assets/video   optimised media
docs/ARCHITECTURE.md
```

## GitHub Pages

Push the folder contents to the repository root (or a `/docs` folder). No root-relative (`/...`) URLs are used,
file names are lower-case, and detail pages use query strings (`product.html?id=...`), so refresh and deep links
work without server rewrites.

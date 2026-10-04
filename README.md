# FrameX — photo-frame marketplace (frontend)

Multi-page, responsive site in plain HTML, CSS and JavaScript. No build step, no dependencies.
Works from the file system (double-click `index.html`) and on GitHub Pages under a repository sub-path,
because every link and asset path is **relative**.

## Pages

| File                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                                                          | Home: hero, featured-frames showcase (auto-scroll + arrows + drag), category gallery, shops preview, custom-frame section, how it works, community + reviews (sample), frame guide                                                                                                                                                                                                                                 |
| `shop.html`                                                           | All shops + full product catalogue (search, category, sort, in-stock, load more). Supports `?category=` `?q=` `?shop=`                                                                                                                                                                                                                                                                                             |
| `shop-detail.html?id=<shopId>`                                        | One shop: profile, hours, services, its frames                                                                                                                                                                                                                                                                                                                                                                     |
| `product.html?slug=<slug>` (or `?id=`)                                | **Product page** built from the product data: gallery (front / side / back / close-up… views, zoom, fullscreen, optional 360°), size / colour / print / cover options with live price, Customize This Product (FrameX Studio), and only the sections the shop filled in: Frame Components (exploded view), Print Materials, Quality, Back View, Product Views, Specifications, Customization, Video, Shop, Reviews |
| `about.html` `services.html` `gallery.html` `contact.html` `faq.html` | Content pages                                                                                                                                                                                                                                                                                                                                                                                                      |
| `templates.html` `template.html?t=<slug>`                             | Personalised templates: browse and details. Data in `js/templates.js`                                                                                                                                                                                                                                                                                                                                              |
| `studio.html`                                                         | FrameX Studio: customise a template, a single photo or a listed frame (frame, colour, border, mat, size, finish, crop, text) with live preview and price. Options and prices in `js/studio.js`                                                                                                                                                                                                                     |
| `shop-dashboard.html` | **Shop dashboard** (SHOP login required): Shop ID, status, location, shop profile, account. Products / Orders / Inventory are Step 2 areas; the product tools work today only for shops linked to the catalogue file and save in the browser |
| `login.html` `signup.html` `forgot-password.html` `reset-password.html` `account.html` | **Accounts** (need the backend): customer sign-up, customer / shop login, password reset, shop password setup, account page |
| `partner.html` | **Partner With FrameX**: a shop applies to be listed. Creates an application, never a login |
| `admin.html` | **Admin dashboard** (ADMIN login required): shop applications, approve / reject, shops, activate / deactivate, locations, shop credentials, activity log |
| `customer-gallery.html`                                               | Customer photos + reviews, and a share form (saved in the visitor's browser only until a backend exists)                                                                                                                                                                                                                                                                                                           |
| `our-story.html`                                                      | Brand story, philosophy, team/development credit                                                                                                                                                                                                                                                                                                                                                                   |
| `terms-of-use.html` `privacy-notice.html`                             | Legal pages with a table of contents (draft — see disclaimers on each page)                                                                                                                                                                                                                                                                                                                                        |

Header, footer, cart drawer and toasts are rendered from **one template** (`assets/js/ui/chrome.js`),
so navigation is never copy-pasted between pages. Each page only sets `<body data-page="...">`.

## Backend (Step 1: accounts, roles, shop onboarding, nearby shops)

The site is still static and still deploys to GitHub Pages. Accounts and nearby-shop search are provided by a separate
Node.js + PostgreSQL service in [`backend/`](backend/README.md):

```bash
cd backend
npm install
npm run seed:dev   # optional demo data + demo logins
npm start          # http://localhost:4000  (serves the website too)
```

**Password reset needs an email provider and an SMS provider.** Until their API keys are in `backend/.env`, no
email or text message is sent and the Forgot password page says "Email service is not configured." /
"SMS service is not configured." Setup steps (Brevo for email, Fast2SMS for SMS) are in
[`backend/README.md`](backend/README.md) → "Email" and "SMS"; `npm run doctor` in `backend/` shows what is missing.

On Windows you can also double-click **`start-backend.bat`** in the project folder. Keep its window open while you
use the site: when the backend is not running, the login pages say "Accounts aren't available right now".

- `assets/js/config.js` → `PRODUCTION_API_URL` is the deployed backend's address. While it is empty the site works
  exactly as before (no accounts; shops from `js/edit.js`).
- With a backend, shop lists and every distance come from it (`GET /api/shops/nearby`); products still come from
  `js/edit.js` until Step 2.
- Full guide (configuration, admin creation, deployment, API): [`backend/README.md`](backend/README.md).

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
- **Contact form** - validates, then opens the visitor's email app _only if_ an email is set in
  `site.seed.js`; otherwise says plainly the message was **not** sent. It never fakes success.
- **Photo upload** - the product page previews a photo on the visitor's device only; nothing is uploaded,
  saved, or added to the cart (stated on the page). Needs a backend (file storage + order attachment).
- **Frame colour + size selectors** - now real, for the 10 named frame styles. The colour preview is a
  CSS mock-up (not a photograph of each finish) and says so on the page. Per-size price differences
  (`priceDelta`) are a frontend placeholder until a shop sets its own per-size pricing.
- **Delivery fees, commission** - never calculated in the frontend.

## Where to change things

| Change                                                      | Edit                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Products, prices, stock, sizes, colours, images             | `js/edit.js` → PRODUCTS (each field is explained in the comment above the list) |
| Frame colour palette (hex + finish)                         | `js/edit.js` → FRAME COLOURS                                                    |
| Shops (address, hours, coordinates, ratings, logo)          | `js/edit.js` → SHOPS                                                            |
| Shops, products, categories, frame colours, home page lists | `js/edit.js` (the one file to edit)                                             |
| Phone / WhatsApp / email, social links, hero numbers        | `assets/data/site.seed.js`                                                      |
| FAQ, gallery, reviews, community tiles                      | `faq.seed.js`, `gallery.seed.js`, `reviews.seed.js`, `community.seed.js`        |
| Colours, fonts, spacing                                     | `assets/css/tokens.css`                                                         |
| Switch to a real backend                                    | `assets/js/config.js` -> `dataMode: "api"` (see `docs/ARCHITECTURE.md`)         |

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
file names are lower-case, and detail pages use query strings (`product.html?slug=...`), so refresh and deep links
work without server rewrites.

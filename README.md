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
| `product.html?slug=<slug>` (or `?id=`)                                | **Product page** built from the product data: gallery (front / side / back / close-up… views, zoom, fullscreen, optional 360°), size / colour / print / cover options with live price, **"Your photo"** (required for every product that is made from the customer's photo: one upload space per photo, and a preview of how a single photo fits the chosen size), Customize This Product (FrameX Studio), and only the sections the shop filled in: Frame Components (exploded view), Print Materials, Quality, Back View, Product Views, Specifications, Customization, Personalization, What's included, Video, Shop, Reviews |
| `home-decor.html` | **Home Decor & Wall Art**: featured collections, 20 category chips, trending, multi-panel frames (2 to 5 panels), custom photo wall art, premium collections, and a searchable grid of every piece. Supports `?c=<collection>` `?q=` `?panels=` `?sort=`. Products open in the normal product page and use the normal cart and checkout. Data in `js/decor.js` |
| `wall-art-studio.html?product=<id>` | **Wall-art customiser**: one photo split across 2, 3, 4 or 5 framed panels with a live preview (layout, spacing, size, frame colour and thickness, matte / glossy, drag to position, zoom). Adds the set to the cart or goes straight to checkout. The original photo is uploaded with the order, unchanged |
| `about.html` `services.html` `gallery.html` `contact.html` `faq.html` | Content pages                                                                                                                                                                                                                                                                                                                                                                                                      |
| `templates.html` `template.html?t=<slug>`                             | Personalised templates: browse and details. Data in `js/templates.js`                                                                                                                                                                                                                                                                                                                                              |
| `studio.html`                                                         | FrameX Studio: customise a template, a single photo or a listed frame (frame, colour, border, mat, size, finish, crop, text) with live preview and price. Options and prices in `js/studio.js`                                                                                                                                                                                                                     |
| `shop-dashboard.html` | **Shop dashboard** (SHOP login required): Shop ID, status, location, shop profile (incl. whether the shop gift wraps), account. **Products**: every shop creates and manages what it sells ("What do you want to sell?": photo frame, custom frame, home decor, wall art, multi-panel set, personalized, template-based, other), saved in its account on the backend. **Orders**: the orders that contain its products, its own items only, with the customer's original photos to download and a progress step per item. **Inventory**: stock and availability |
| `login.html` `signup.html` `forgot-password.html` `reset-password.html` `account.html` | **Accounts** (need the backend): customer sign-up, customer / shop login, password reset, shop password setup, account page |
| `partner.html` | **Partner With FrameX**: a shop applies to be listed. Creates an application, never a login |
| `admin.html` | **Admin dashboard** (ADMIN login required): shop applications, approve / reject, shops, activate / deactivate, locations, shop credentials, orders (status, refunds, the customer's original photos, gift wrapping), shop products (approve, take off sale), activity log |
| `customer-gallery.html`                                               | Customer photos + reviews, and a share form (saved in the visitor's browser only until a backend exists)                                                                                                                                                                                                                                                                                                           |
| `our-story.html`                                                      | Brand story, philosophy, team/development credit                                                                                                                                                                                                                                                                                                                                                                   |
| `terms-of-use.html` `privacy-notice.html`                             | Legal pages with a table of contents (draft — see disclaimers on each page)                                                                                                                                                                                                                                                                                                                                        |

Header, footer, cart drawer and toasts are rendered from **one template** (`assets/js/ui/chrome.js`),
so navigation is never copy-pasted between pages. Each page only sets `<body data-page="...">`.

## Backend (accounts, shops, cart, checkout, orders, payments)

The site is still static and still deploys to GitHub Pages. Accounts, nearby-shop search, the cart, checkout, orders
and payments are provided by a separate Node.js + PostgreSQL service in [`backend/`](backend/README.md):

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

**The cart belongs to an account and lives in the database.** There is no guest cart and nothing about the cart is
stored in the browser. Visitors browse freely; the first "Add to cart" opens the login / sign-up dialog and the chosen
item is added right after. The server reads products from its own tables and sets every price itself
([`backend/README.md`](backend/README.md) → "Cart").

**Checkout and payments.** Customers order either through the cart ("Add to cart" → Checkout) or directly
("Buy Now" on a product or in FrameX Studio: that one item only, the cart is untouched). `checkout.html` (address → summary → payment), `order.html` (confirmation and order
details), `orders.html` (your orders) and the admin's Orders section. Every amount is calculated by the server. Online
payment goes through a payment gateway (Cashfree Payments) and an order is marked paid only after the server has verified the
payment with the gateway; Cash on Delivery is configurable. **Online payment needs Cashfree keys in `backend/.env`**
(test mode first); until then checkout offers Cash on Delivery only. See
[`backend/README.md`](backend/README.md) → "Checkout, orders and payments".

**Art & Artists.** `art.html` (the artist directory and approved artworks, "Join as an artist"), `artist.html`
(profile, gallery, custom painting price list and request form), `artwork.html` (one artwork, bought through the
normal checkout), `painting.html` / `paintings.html` (a customer's custom painting requests: the artist's answer, the
advance, the remaining amount, delivery, review), `artist-dashboard.html` (for artists) and new sections in the admin
dashboard (artists, artwork approvals, custom paintings, reviews, accounts, settings). A custom painting takes no
payment until the artist accepts; then 40% (configurable) before the artist starts and the rest when it is finished.
See [`backend/README.md`](backend/README.md) → "Art & Artists" and "Custom paintings". `search.html` searches
products, templates, shops, artists and artworks.

- `assets/js/config.js` → `PRODUCTION_API_URL` is the deployed backend's address. While it is empty the published
  site has no accounts, **and therefore no cart**: visitors can browse and contact FrameX, but "Add to cart" explains
  that accounts aren't switched on. Deploy the backend to make the cart work on the published site.
- With a backend, shop lists and every distance come from it (`GET /api/shops/nearby`). Products come from two
  places: the catalogue file (`js/edit.js`, `js/decor.js`), and the products shops create in their dashboard, which
  live in the backend and join the catalogue (`GET /api/catalog/shop-products`).
- Full guide (configuration, admin creation, deployment, API): [`backend/README.md`](backend/README.md).

**The customer's photo.** A product that is made from the customer's own photo (a photo frame, a FrameX Studio design,
a template, a "your photo" wall-art set) can't be added to the cart or bought without it; a product that needs several
photos needs all of them. The website checks this, and the backend checks it again whatever the website sends. The
**original file** is uploaded to the backend and stored byte for byte: it is never resized, re-encoded or "enhanced"
(what the page shows is a separate preview copy). It is private: there is no public address for it, and it is only sent
through signed links that last a few minutes, to the customer, to FrameX staff and to the shop that makes that order
line. Ready-made Home Decor needs no photo. See [`backend/README.md`](backend/README.md) → "Customer photos".

**Gift wrapping.** Checkout asks "Would you like to gift wrap this order?". The charge (`GIFT_WRAP_FEE` in
`backend/.env`) is the backend's, is shown as its own line before the customer pays, and is stored with the order.
A shop can switch it off for itself or for one product; the question is then shown switched off, with the reason.

**Shops decide what they sell; the platform keeps its rules.** A shop manages its own products (type, details,
pictures, price, sizes, stock, delivery notes, gift wrapping, how many photos a customer adds). Payments, accounts,
the order structure, file storage and the rules of each product type (a photo frame always needs the customer's photo)
are the platform's and are applied by the backend to everything a shop saves.

## Run / test locally

`python3 -m http.server` in this folder, open http://localhost:8000 (needed for "Use my location";
browsers block geolocation on `file://`). Fonts load from Google Fonts; system fonts are the fallback.

## What works (real)

Responsive layout 320-2560 px; cart (add / remove / quantity / per-shop grouping / saved to the account, needs the backend),
wishlist, product search + filters + sort, shop pages.

**Product page customization** (the 10 named frame styles): a Small/Medium/Large/Extra-Large size
selector with a real, live price update per size (`sizeOptions` + `priceDelta` in the product data);
a frame-colour selector with a CSS-rendered preview (wood/metal-tinted frame border around your photo
or the product photo) — swatches always carry a text name, never colour alone; a real-world size
comparison against an A4 sheet; the customer's own photo (required for a frame: uploaded with the
order, with a preview of how it fits the chosen size, drag to position, zoom). Keyboard-accessible tabs /
accordion / menu, contact-form validation, location permission + real haversine distance (only when a
shop has coordinates).

**View on My Wall (Live Demo)**: a customer sees the frame they chose (their size, frame colour, mat, their own
photo and crop, a template's layout and words, or a wall-art design and its panels) on their own wall through
the camera, moves, resizes and turns it, and goes back to the page with nothing changed. The button is on a
product page's picture, in FrameX Studio and in the wall-art customiser, and only on a device with a camera and
only for products that can be drawn at their real size. Two modes, chosen by what the phone can do:

- **AR mode** (Android phones with Google's AR in Chrome, through the browser's WebXR API): the phone finds the
  wall itself, the frame stays fixed to it while the customer walks around, and its size is the real size.
- **Camera mode** (every other device with a camera, iPhones included): the frame is drawn on top of the live
  camera picture and the customer places it. Its size is an **estimate** for a wall "about N metres away", and the
  screen says so. Nothing in this mode pretends to detect a wall.

The camera is asked for only when the customer presses the button, is switched off on Close, and no picture is
recorded or sent anywhere ("Save photo" makes a file on the customer's own device). Details and limits:
`docs/ARCHITECTURE.md` → "View on My Wall (Live Demo)".

**Analytics and the admin dashboard** (needs the backend): `admin.html` → Analytics shows, for today / 7 / 30 /
90 days or two dates you choose: orders created, paid and cancelled, gross sales, refunds and net revenue, Cash on
Delivery, each payment gateway's successful, failed and pending payments, shops' and artists' sales, popular
products, templates and artworks, custom painting requests and payments, registrations, logins and failed logins,
items added to carts and abandoned carts. All of that is read from the database's verified records; a browser
returning from a payment page counts for nothing, and test payments are shown separately and never as sales.
**Visitor statistics** (visitors, page and product views, searches, where visits came from, "on the site now") are
collected only from visitors who press "Allow analytics" in a small question shown once; Google Analytics 4 can be
switched on with one setting and is loaded only after that same yes. Accounts → an account shows the customer's
contact details and order history. Details: `backend/README.md` → "Analytics".

## Not connected (labelled as such on the site)

- **Reviews submission, custom sizes** - show "coming soon" / "not connected". (Accounts, the cart, checkout,
  orders and payments are real and need the backend: see above.)
- **Contact form** - validates, then opens the visitor's email app _only if_ an email is set in
  `site.seed.js`; otherwise says plainly the message was **not** sent. It never fakes success.
- **Customer photos need the backend.** Without it a visitor can still choose and preview a photo, but can't order.
  Files are kept on the backend's own disk (`UPLOAD_DIR`): on a host without a persistent disk they are lost on a
  restart, so set one up before taking real orders (see `backend/README.md` → "Customer photos").
- **Frame colour + size selectors** - now real, for the 10 named frame styles. The colour preview is a
  CSS mock-up (not a photograph of each finish) and says so on the page. Per-size price differences
  (`priceDelta`) are a frontend placeholder until a shop sets its own per-size pricing.
- **Delivery fees, tax, gift wrapping, Cash on Delivery fee** - calculated by the backend at checkout, never in the
  frontend. **Commission** is not built.
- **Google Analytics 4** is built but has never sent a real hit: no Measurement ID was available while it was
  built. The tests check that Google's tag is added only after a visitor allows analytics, and what the page hands
  to it; they block Google's servers. Set `GA4_MEASUREMENT_ID` and check GA4's "Realtime" report once.
- **Visitor figures are a floor.** They only include visitors who allowed analytics, and the dashboard says so.
  Orders, sales and accounts are exact. There are no guest orders: every order belongs to an account.
- **View on My Wall** needs `https://` (or `localhost`): browsers give no camera to a plain `http://` page, so the
  button does not appear there. It was built and tested in desktop Chrome with a simulated camera, simulated phone
  sensors and a simulated AR phone; **it has not been tried on a real phone yet** (see the test list in
  `docs/ARCHITECTURE.md`). Not built: 3D models of frames (the product field for one exists), Apple's AR Quick Look,
  frames made from several photos, arched frames.

## Where to change things

| Change                                                      | Edit                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Products, prices, stock, sizes, colours, images             | `js/edit.js` → PRODUCTS (each field is explained in the comment above the list) |
| Frame colour palette (hex + finish)                         | `js/edit.js` → FRAME COLOURS                                                    |
| Shops (address, hours, coordinates, ratings, logo)          | `js/edit.js` → SHOPS                                                            |
| Shops, products, categories, frame colours, home page lists | `js/edit.js` (the one file to edit)                                             |
| Home Decor: collections, wall-art products, prices, what the page features | `js/decor.js` (one line per product; then `cd tools/decor && npm run build` to draw its pictures) |
| What a catalogue frame is made of (print, front cover, back, what's included, care) | `js/edit.js` → section 3b `BUILD` presets, used by a product with `build: BUILD.wood` |
| Which products need the customer's photo, and how many | `js/edit.js` → `productType` / `photos` on a product (the rules per type: `assets/js/services/product-model.js` → `PRODUCT_TYPES`) |
| Gift-wrapping charge; delivery, tax, COD fee; largest photo | `backend/.env` (`GIFT_WRAP_FEE`, `SHIPPING_FEE`, `TAX_PERCENT`, `COD_FEE`, `UPLOAD_MAX_MB`) |
| A shop's own products | the shop dashboard (`shop-dashboard.html` → Products); FrameX can take one off sale in `admin.html` → Shop products |
| Phone / WhatsApp / email, social links, hero numbers        | `assets/data/site.seed.js`                                                      |
| Home page hero slides (headline, text, buttons, pictures)   | `assets/data/site.seed.js` → `heroSlides` (the first slide is also written in `index.html`) |
| FAQ, gallery, reviews, community tiles                      | `faq.seed.js`, `gallery.seed.js`, `reviews.seed.js`, `community.seed.js`        |
| Colours, fonts, heading sizes, spacing, radius              | `assets/css/tokens.css` (one place for the whole site; see "Design system" in `docs/ARCHITECTURE.md`) |
| How the site looks on a phone (card size, text size, spacing) | `assets/css/mobile.css` (phones only, up to 639px wide; laptop and desktop never use it) |
| Which products show "View on My Wall" | automatic by product type; `liveDemo: false` on a product in `js/edit.js` or a design in `js/decor.js` switches one off; a shop chooses Automatic / On / Off in its dashboard (product editor → Customization). Rules: `liveDemoSupport()` in `assets/js/services/product-model.js` |
| The words of the Live Demo (hints, errors, buttons) | `assets/js/livedemo/ld-view.js` → `TEXT` |
| Camera mode's assumptions (lens angle, the distances offered) | `assets/js/livedemo/ld-camera.js` → `FOV_LONG_DEG`, `DISTANCES` |
| Google Analytics 4 on / off | `GA4_MEASUREMENT_ID` in `backend/.env` (or `analytics.ga4MeasurementId` in `assets/js/config.js` for a site without the backend). Visitor statistics altogether: `ANALYTICS_ENABLED` |
| The analytics question's words; what the website sends | `assets/js/services/analytics.js` (`showBanner`, `FIRST_PARTY`, `googleEvent`); what the server keeps: `backend/src/services/analytics-service.js` |
| What the admin reports count, and how | `backend/src/services/admin-analytics-service.js` (the top of the file says where each figure comes from); the screen: `assets/js/ui/admin-analytics.js` |
| Switch to a real backend                                    | `assets/js/config.js` -> `dataMode: "api"` (see `docs/ARCHITECTURE.md`)         |

## Placeholders needing real business information

- **Prices, discounts, stock, sizes, materials, product descriptions** are placeholders.
- **What each catalogue frame is made of** (`js/edit.js` → `BUILD`: lustre photo paper 260 gsm, 2 mm acrylic or glass,
  MDF backing, sawtooth hanger, what's included, care) and its **finish and moulding width / depth** are placeholders
  written so the product pages are complete. Replace them with what each shop really uses.
- **The gift-wrapping charge** (₹49 unless `GIFT_WRAP_FEE` says otherwise) is a placeholder: set your own.
- **The privacy notice and terms** now describe the photo upload (what is stored, who can open it, deletion of unused
  photos after about 30 days = `UPLOAD_UNUSED_DAYS`). They are drafts: have them checked, and keep them in step with
  those settings.
- **"Photo Frame Shop B / C"** are sample shops (badged "Sample shop"). "FrameX Studio" only has the address from the old site.
- **Hero numbers (500+ / 1K+ / 50+), reviews and their names** came from the old site and cannot be verified here;
  reviews and community photos are badged as samples. Replace or remove before launch.
- **About page** story/team is a marked placeholder. **FAQ** policies (cancel before production, 7-day damage claims)
  come from the old site - confirm them. Delivery times and COD were deliberately removed (shop-dependent, not connected).
- **Contact details and social links** are empty until filled in `site.seed.js`.
- The old "Flat 25% off, code FRAMEX25" banner was removed: the cart has no promo-code logic, so it would have been a false promise.
- Community videos from the old site were not reused (they appear to be another company's content).

- **Home Decor prices, discounts, stock and material details** (`js/decor.js`) are placeholders until the shop confirms them.
  No ratings or reviews are invented: a wall-art card shows stars only when a product has real reviews.

## Assets - please check rights

**Home Decor artwork** (`assets/img/decor/`) is safe to sell: every picture is drawn by the code in `tools/decor/`
(original FrameX designs, no film, game, anime, car-brand or team artwork), except 22 public-domain paintings that
The Metropolitan Museum of Art and the Art Institute of Chicago publish under CC0; each of those products names the
artist and the museum. Stock-photo sites (Unsplash, Pexels, Pixabay) were deliberately not used for product art:
their licences don't allow selling unaltered copies as prints. Fonts used in the artwork are open-licensed (see `tools/decor/README.md`).

**Photo-frame pictures.** The picture of "A4 White Texture Frame Set of 4" (a snapshot of empty frames lying on grass)
was replaced by a drawn one (`tools/decor/frames.mjs`), and the catalogue frames now show a drawn "frame corner" and
"back of the frame" view after their own photo (`look` in `js/edit.js`). These are illustrations, labelled as such in
their alt text, not photographs of a shop's product: replace them when shops provide real photos.

Step images 3-4 (AI-generated) show visible Canon branding; some category/frame photos look like retail catalogue images.

## Structure

```
index.html shop.html shop-detail.html product.html about.html services.html gallery.html contact.html faq.html
assets/css   tokens base components = the design system (type, spacing, hero, cards, buttons) | chrome layout-hero(home) catalog
             story overlays footer-faq pages pdp(shop detail) product templates studio decor auth checkout = page layout only
assets/js    config main | core (dom qs constants) | services (pricing location shop-utils)
             api (seed-provider http-provider api) | store (cart wishlist) | ui (one small module per feature)
assets/data  *.seed.js  (stand-in for the database)
assets/img assets/video   optimised media
docs/ARCHITECTURE.md
js/decor.js  Home Decor catalogue | tools/decor  draws its product pictures (not needed to run the site)
assets/js/livedemo   "View on My Wall": loaded only when a customer opens it (entry: assets/js/services/live-demo.js)
assets/js/services/analytics.js   the analytics question, FrameX's own visitor statistics, Google Analytics 4 (all only after a yes)
assets/js/ui/admin-analytics.js + assets/css/admin-analytics.css   the admin's Analytics screen and the account record
```

## GitHub Pages

Push the folder contents to the repository root (or a `/docs` folder). No root-relative (`/...`) URLs are used,
file names are lower-case, and detail pages use query strings (`product.html?slug=...`), so refresh and deep links
work without server rewrites.

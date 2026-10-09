# FrameX backend

Accounts, roles, shop onboarding, nearby-shop search, the cart, checkout, orders and payments for the FrameX website.
The website stays a static site (GitHub Pages); this is a separate Node.js service it talks to over HTTPS.

- **Stack:** Node.js 20+ · Express 5 · PostgreSQL
- **What it does:** customer sign-up / login / logout, forgot and reset password, shop applications, admin approval and shop account creation, shop and admin dashboards' APIs, nearby shops with real distances, audit log, **the catalogue in the database and one cart per account**
- **Also:** delivery addresses, checkout with server-side totals, orders, online payment through a payment gateway (Razorpay), Cash on Delivery, refunds, order emails
- **And:** the customer's original photos (stored unchanged, private, sent only through short-lived signed links), gift wrapping, the products each shop creates and manages itself, and each shop's own orders with the photos it has to print
- **What it does not do yet:** object storage for files (they are kept on the server's own disk), splitting payments between shops, commission, video files for products

## Run it locally

You need Node.js 20.12 or newer. No database install is needed: without `DATABASE_URL` the server uses an embedded PostgreSQL (PGlite) stored in `backend/.data/`.

```bash
cd backend
npm install
npm run seed:dev      # optional: demo shops + demo logins (prints random passwords once)
npm start             # http://localhost:4000
```

Then open **http://localhost:4000/** — the server also serves the website, so everything is on one address.

You can keep using VS Code Live Server instead (`http://127.0.0.1:5500`): the website automatically calls the backend on port 4000 of the same machine. Both ways are tested.

| Address | What |
|---|---|
| `http://localhost:4000/` | the website |
| `http://localhost:4000/api/health` | is the API up? |

`npm run dev` restarts the server when a file changes. `npm test` runs the API tests. `npm run doctor` says whether email and SMS can really be delivered and what is missing.

On Windows, double-clicking `start-backend.bat` in the project folder does the install and start for you. The backend is an ordinary program: it runs as long as that window is open and needs no editor or other tool.

> The embedded database can be opened by one process at a time. Stop the server before running `npm run seed:dev` or `npm run admin:create` (they tell you if you forget).

## Forgot password: how it works

1. The visitor enters the **email, mobile number or Shop ID** on the account.
2. The page offers what that account has, masked: **Send code to Email** `s*****@gmail.com` and/or **Send code to Mobile** `******4321`.
3. FrameX sends a **6-digit code** through the email or SMS provider. The email also carries a one-time **Reset Password** button.
4. The visitor types the code (or follows the button) and chooses a new password. Every other session of that account is signed out.

Customers and shops both use it (a shop is reached at its login's email / phone, or the shop's phone). **Admins are excluded**: an admin password is reset from the command line with `npm run admin:create`.

**Nothing is sent, and nothing pretends to be sent, until a provider is configured.** A fresh install has neither email nor SMS: the page then says "Email service is not configured." / "SMS service is not configured." and the start-up banner and `npm run doctor` name the missing settings. A code is never returned by the API, never shown on the page and never written to the log.

## Email (Brevo)

Password-reset codes and links, and shop-setup links, are sent through a transactional email provider. The default is **Brevo** (free plan available, HTTPS API, works with a single verified sender address).

1. Create an account at https://www.brevo.com.
2. Verify the sender: **Senders, Domains & Dedicated IPs → Senders → Add a sender**, and confirm the email Brevo sends to that address. (For the best inbox placement use an address on a domain you own and authenticate the domain there; a single verified address is enough to start.)
3. Create an API key: your name (top right) → **SMTP & API → API keys → Generate a new API key**.
4. Put these in `backend/.env` (copy `backend/.env.example` if the file does not exist yet):

   ```
   EMAIL_PROVIDER=brevo
   EMAIL_PROVIDER_API_KEY=<the key>
   EMAIL_FROM="FrameX <the-verified-address>"
   ```

5. Restart the backend, then:

   ```bash
   npm run doctor                          # checks the key with Brevo (sends nothing)
   npm run email:test -- you@example.com   # sends one real message; prints Brevo's answer
   ```

`email:test` reports success only when Brevo accepts the message and returns a message id; otherwise it prints the provider's reason (wrong key, unverified sender...). Acceptance by the provider is not yet arrival: check the inbox (and spam) once.

Other providers: `EMAIL_PROVIDER=resend` (same two settings; Resend only sends from a domain you own), `gmail` (a Gmail address + Google App Password; run `npm run email:setup` or `setup-email.bat`; low volume), `smtp` (`SMTP_*`).

## SMS (Fast2SMS)

Codes to a mobile number need an SMS provider account with credit; each SMS costs money. The default is **Fast2SMS** (India).

1. Create an account at https://www.fast2sms.com and add credit to the wallet. Complete any verification the dashboard asks for before the OTP route is enabled.
2. Copy the API key: **Dev API**.
3. Put these in `backend/.env`:

   ```
   SMS_PROVIDER=fast2sms
   SMS_API_KEY=<the key>
   ```

4. Restart the backend, then:

   ```bash
   npm run doctor                    # checks the key and shows the wallet balance (sends nothing)
   npm run sms:test -- 9876543210    # sends one real code to that number (costs one SMS)
   ```

Without `SMS_SENDER_ID` / `SMS_TEMPLATE_ID` the code goes out on Fast2SMS's own OTP route, which needs no DLT registration of your own. Indian telecom rules (TRAI DLT) require a registered sender and template for branded messages: once you have them, set `SMS_SENDER_ID` and `SMS_TEMPLATE_ID` and FrameX uses your DLT route instead.

Other providers: `SMS_PROVIDER=2factor` (2Factor.in, `SMS_API_KEY`, optional `SMS_TEMPLATE_ID` = template name), `twilio` (`TWILIO_*`; India needs DLT registration with Twilio). MSG91 is deliberately not supported: its API answers "success" even for an invalid key, so a failed delivery could not be told from a real one.

## One-time code rules

| Rule | Value | Setting |
|---|---|---|
| Length | 6 digits, from the system's secure random generator | |
| Lifetime | 10 minutes | `OTP_EXPIRY_MINUTES` |
| Wrong tries | 5, then the code is dead | `OTP_MAX_ATTEMPTS` |
| Resend wait | 30 seconds | `OTP_RESEND_SECONDS` |
| Codes per account | 5 per hour | `OTP_MAX_PER_HOUR` |
| Storage | keyed hash only (HMAC with `AUTH_SECRET`); a new code cancels the old one; a used code is dead | |
| If the provider refuses | the code is deleted and the page says the message could not be sent | |

## Test mode (development only)

To try the flow on your own computer without a provider, set `EMAIL_PROVIDER=dev` and/or `SMS_PROVIDER=dev` yourself. **Nothing is sent.** Messages are kept at `http://localhost:4000/dev/mailbox`, the start-up banner says "DEVELOPMENT MAILBOX ONLY - nothing is really sent", and the website shows a striped "Development mode: nothing was really sent" notice. It is never the default, and a production server refuses to start with it.

## Cart

**There is no guest cart.** Anyone can browse; a cart exists only for a logged-in account and lives in the database. Nothing about the cart is kept in the browser.

```
users ──1:1── carts ──1:n── cart_items ──> catalog_products / catalog_templates
```

- **Whose cart:** the cart is found from the session's user id. No address or body carries a cart id, so there is no id to change to reach someone else's cart. An item id is only looked for inside the caller's own cart: another customer's item id answers `404`, exactly like one that doesn't exist.
- **What the browser sends:** a product id, option ids (size, colour, print, front cover), a quantity and a note; or a complete FrameX Studio design. For a product that is made from the customer's photo, also `photos`: the ids of the uploaded originals, one per photo space (see "Customer photos"). Anything else in the body (`price`, `unitPrice`, `userId`, `cartId`, `discount`…) is never read.
- **The customer's photo is required where the product needs one.** `productModel.photoRequirement()` (the website's own code, loaded by the server) says how many photos a product needs. Without every one of them the item is refused with `422 PHOTOS_REQUIRED` and the words the customer reads ("Please upload your photo to continue. Your photo is required to create this personalized frame." / "Please upload all 3 required photos to continue."). A photo id only counts when it is an upload of the same account. The same check runs for "Buy Now" and again when the order is placed.
- **What the server decides:** the name, the option labels, whether it can be ordered, the most one line may hold (20, or the stock if lower) and the price. It reads the product from the database and prices it with the website's own pricing code (see below). A Studio design is rebuilt field by field, checked against what its template or product allows, and priced from its options.
- **Every read re-checks:** a product that was hidden, removed, sold out or re-priced shows up as such the next time the cart is read. `POST /api/cart/validate` is the check before checkout: it reports unavailable items, quantities above stock and changed prices. A changed price is reported once and then becomes the line's price.
- **Logging in to add:** when a visitor presses "Add to cart" the website opens its login / sign-up dialog and adds the item right after. The chosen item waits in that browser tab (`sessionStorage`) only while the visitor is logging in; it is never shown or counted as a cart.

### Home Decor: custom-photo wall art

Wall-art products are ordinary catalogue products, so the cart, checkout, stock and orders treat them like any frame. The only special case is a "Your Photo — N Panel Split" product: its cart line also carries a **customisation** (`{ layout, spacing, border, photo: { name, width, height, x, y, zoom } }`) and a small preview picture.

- The server never stores what the browser sent as-is. `FrameX.decorRules.cleanCustomization()` in `js/decor.js` (the same code the customiser page uses, loaded through the site engine) rebuilds it: unknown choices are refused with `422 CUSTOMIZATION_INVALID`, numbers are clamped, the file name is trimmed and stripped. A custom-photo product without photo details can't be added or bought.
- For every other product a `customization` or `thumbnail` in the request is ignored.
- The price is the product's price for the chosen size and finish, worked out by the server as always. Layout, spacing and frame thickness don't change it.
- The customer's photo **is uploaded** (see "Customer photos") and is required: the line carries `photos: { photo1: <upload id> }`. The photo's name and pixel size in the customisation are taken from the uploaded file, not from the browser. The order stores the layout, where the picture sits (`x`, `y`, `zoom`), the preview and the link to the original.
- `COD_ALLOW_CUSTOM_DESIGNS=false` also switches Cash on Delivery off for these sets.

### Where products come from

The website's catalogue files are the single source: `js/edit.js` (shops, products), `js/decor.js` (Home Decor & Wall Art products), `js/templates.js` (design templates), `js/studio.js` (Studio options and prices). On every start the server imports products and templates into `catalog_products` and `catalog_templates` (`[db] Catalogue: 17 products and 21 templates…`). Items that left the files are marked `REMOVED`, not deleted, so a cart can say "no longer available".

The server also loads the website's pricing code (`assets/js/services/product-model.js`, `studio-engine.js`) in an isolated context (`src/catalog/site-engine.js`). The price a customer sees and the price the server charges are therefore computed by the same code, and only the server's counts.

Because of this **the backend must be deployed together with the website's `js/` and `assets/js/` folders** (deploy the whole repository, not only `backend/`), or `CATALOG_DIR` must point at a folder that contains them. The server refuses to start, with a clear message, if they are missing. Restart the backend after editing the catalogue files.

Products a shop creates in its dashboard are a second source: they are saved straight into `catalog_products` (`source = 'shop'`) through the shop API, and the catalogue import never touches them. See "Shop products".

## Customer photos

A product that is made from the customer's own photo is printed from that photo, so the photo has to reach FrameX intact.

```
users ──1:n── uploads ──< order_item_photos >── order_items       which photo goes in which space of which order line
cart_items.photos  [{ slot, uploadId, placement }]                 the same, while the item is still in a cart
```

- **Upload:** `POST /api/uploads` (logged in). The request body is the file itself (its raw bytes, not a form), with `Content-Type` and an `X-File-Name` header. JPEG, PNG and WebP are accepted, up to `UPLOAD_MAX_MB` (50) and 30 000 px on a side, so 4K and camera originals pass.
- **Nothing the browser says is trusted.** The server reads the file's real format and pixel size from the file's own header (`src/lib/image-info.js`), counts the bytes itself and keeps a SHA-256 of them. A file that isn't one of those formats is refused with `415` and "Please upload a supported image format (JPG, PNG or WebP)."; anything that goes wrong on the way answers "We couldn't upload your image. Please try again.".
- **The original is never changed.** It is written to disk byte for byte. Nothing in the backend resizes, re-encodes, sharpens or "enhances" a customer photo, and there is no thumbnail of it on the server: the small picture in a cart or an order is a separate preview the browser made. The tests compare the stored file and every download with the uploaded bytes.
- **Private by construction.** Files are kept under `UPLOAD_DIR/private/` with random names; nothing in that folder is served as a static file. The only way to a file is `GET /api/files/<token>`: the token is signed with `AUTH_SECRET`, names one upload and expires after `UPLOAD_LINK_SECONDS` (300). A link is only made for
  - the customer who uploaded the photo (`POST /api/uploads/:id/link`, `POST /api/orders/:n/photos/:uploadId/link`),
  - FrameX staff, for a photo of any order (`POST /api/admin/orders/:n/photos/:uploadId/link`),
  - the shop that makes the order line the photo belongs to (`POST /api/shops/:shopCode/orders/:n/photos/:uploadId/link`), and only while the order is active.
  Any other id, order or shop answers `404`, exactly like one that doesn't exist. Every link made for staff or a shop is written to the audit log (`ORDER_PHOTO_ACCESSED`).
- **Kept with the order.** When an order is placed its photos are marked `ATTACHED` and are never cleaned up. A photo that never reached an order and is in no cart is deleted after `UPLOAD_UNUSED_DAYS` (30); the clean-up runs every 6 hours. Keep the privacy notice in step with that number.
- **Where the files live.** `UPLOAD_DIR`, by default `backend/.data/uploads` (ignored by Git). **In production this must be a disk that survives restarts and redeploys**, or every uploaded photo is lost when the service restarts. Back the folder up together with the database: an order row without its file can't be printed. `src/lib/storage.js` is the one file to replace to keep files in object storage (S3, R2…) instead; that is not built.
- **Orders placed before this existed** have no photos (`photos_required` is empty on their lines): they still show the old "send your photos" note.

## Gift wrapping

Checkout asks "Would you like to gift wrap this order?". The charge is per order: `GIFT_WRAP_FEE` (whole rupees, default 49; `0` = free), switched off entirely with `GIFT_WRAP_ENABLED=false`.

- The quote says whether it can be chosen, what it costs and whether it is in the total: `giftWrap: { available, fee, reason, selected }` and `giftWrapFee`. It is **not available** when any item's product has `giftWrap: false`, its shop switched gift wrapping off (`shops.gift_wrap`), or the product / shop is listed in `GIFT_WRAP_BLOCKED_PRODUCTS` / `GIFT_WRAP_BLOCKED_SHOPS`; `reason` then names the item.
- The total is `subtotal - discount + tax + delivery + gift wrapping + COD fee` (a database check constraint says the same). The gift-wrapping charge is part of the amount sent to the payment gateway and of the Cash on Delivery amount.
- "Place order" sends `giftWrap: true | false` with the total the customer saw. Asking for it when it isn't available answers `409 GIFT_WRAP_UNAVAILABLE`; a total that doesn't include it answers `409 TOTAL_CHANGED`.
- The order stores `gift_wrap` and `gift_wrap_fee`. The customer, FrameX staff and the shops that make the order all see it, and the confirmation email says so.

## Shop products

A shop decides what it sells. The platform decides the rules.

- **The shop manages** (shop dashboard → Products, `PUT /api/shops/:shopCode/products/:id`): the product type ("What do you want to sell?": photo frame, custom frame, template-based, personalized, home decor, wall art, multi-panel set, other), name, description, category, pictures by view (front, side, back, corner, close-up, in a room…), prices, sizes, frame and print details, front cover, back, components, what's included, care, stock, delivery notes, whether it can be gift wrapped and, where the type allows a choice, how many photos the customer adds.
- **The platform applies, whatever the browser sends:**
  - the product belongs to the logged-in shop (the shop is taken from the session, never from the address or the body);
  - the record is rebuilt by `productModel.sanitizeShopInput()`: the rules of the product type decide the customer-photo requirement (a photo frame always needs at least one photo; home decor and wall art never ask for one), and nothing a shop saves can say FrameX verified it;
  - publishing needs a complete product (`validateForPublish`), otherwise `422 PRODUCT_INCOMPLETE` with the list of what is missing; with `PRODUCT_MODERATION=true` a shop's first Publish waits as `pending_review` until a FrameX admin approves it;
  - prices are whole rupees within limits; pictures must be files that shop uploaded (`POST /api/shops/:shopCode/media`, served at `/media/<id>`) or the site's own; no `data:`, `javascript:` or outside addresses;
  - a product of a shop that is not approved and active is never on sale, and FrameX can take any product off sale (`POST /api/admin/products/:id/listing`);
  - "View on My Wall": a shop may send `liveDemo: { enabled: true | false | null }` (on, off, or follow the product type). Anything else in it is dropped: `liveDemo.model` (a 3D model file) is FrameX's to set. The switch cannot make a product showable that has no measured size or no frame that can be drawn; the website decides that with `productModel.liveDemoSupport()`. The camera feature itself runs entirely in the customer's browser: the backend receives no camera picture and has no endpoint for one.
- Shop products get ids like `lp-…` and carry `shop_ref` = the shop's catalogue link or its Shop ID, so the cart, checkout, stock and orders treat them exactly like catalogue-file products. The website reads the ones on sale from `GET /api/catalog/shop-products`.
- Pictures no product uses any more are removed after a week (`sweepUnusedMedia`). Video files are not stored: a product video is a YouTube or Vimeo link.

## Shop orders (fulfilment)

`GET /api/shops/:shopCode/orders` lists the orders that contain at least one line sold by that shop. A shop sees **only its own lines** of an order, never another shop's lines or amounts, and only once the order really exists for it (an online order still waiting for its payment is not shown). It gets the delivery name, phone and address it needs to hand the order over, not the customer's email or any payment reference.

For each of its lines the shop can download the customer's original photos (see "Customer photos") and say where it is: `PATCH /api/shops/:shopCode/orders/:n/items/:itemId { status, note }` with `NEW → ACCEPTED → IN_PRODUCTION → READY → HANDED_OVER`. That is recorded in the order's history, where the customer sees it. The order's own status (confirmed, shipped, delivered, refunds) stays with FrameX staff.

## Checkout, orders and payments

```
Cart ────────┐
             ├─> login -> delivery address -> order summary -> payment method -> pay / place order -> confirmation
Buy Now ─────┘
```

**Two ways to order.** *Checkout* orders the cart. *Buy Now* (on a product page or in FrameX Studio) orders that one item directly: the browser sends the same item description the cart accepts (`buyNow` in the quote and place-order requests), the server checks and prices it with the same code as a cart line, and the cart is left exactly as it was.

```
users ──1:n── addresses
users ──1:n── orders ──1:n── order_items      a snapshot of what was bought, at the price paid
                │              └──1:n── order_item_photos   the customer's originals for that line
                │──1:n── payments             one row per payment attempt (failed ones are kept)
                │──1:n── refunds
                │──1:n── order_events         the order's history
                └──1:n── order_notifications  which emails were sent (each once)
payment_events                                every gateway webhook, stored once
```

**Two statuses, never mixed.** The ORDER status is `PENDING_PAYMENT` (an online order waiting for its payment), then `PLACED → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, or `CANCELLED` / `RETURNED`. The PAYMENT status is `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` or `PARTIALLY_REFUNDED`.

**The server works out every amount.** `GET /api/checkout/quote` returns the items (from the cart, re-checked against the catalogue), the product discounts, tax, the delivery charge, gift wrapping (when chosen), the Cash on Delivery fee and the total. "Place order" sends only the address id, the way to pay, the total the customer was shown and a key for this checkout. The order is built from the cart in the database; if the total has changed since the customer saw it (a price changed), nothing is created and the page shows the new total first. Order items keep their own copy of the name, options, price and address, so later catalogue or address changes never alter an order.

**One checkout, one order.** The browser sends a key with "place order" (`UNIQUE (user_id, idempotency_key)`). A double click, a refresh or a retry with the same key answers with the same order. Stock is taken when the order is created (row locks, so two customers can't both get the last piece) and given back when an order is cancelled or an unpaid one runs out of time (`PAYMENT_PENDING_MINUTES`).

**Cash on Delivery.** The order is `PLACED` at once with payment `PENDING`; no gateway is involved. It becomes `PAID` when an admin marks the order delivered. `COD_*` settings switch it off, add a fee, cap the order value, or exclude PIN codes, shops, products or personalised designs.

**Online payment: only the server decides that an order is paid.**

1. The server creates the gateway's order for the server's own total and returns what the browser needs to open the gateway's checkout: the public key id, the gateway order id, the amount. Never a secret.
2. The customer pays in the gateway's window (UPI, card, net banking, wallet). Card numbers, CVV and UPI PINs never touch FrameX.
3. The browser hands the gateway's answer to `POST /api/orders/:n/payments/verify`. The server checks the **signature** with the key secret, then **asks the gateway** for that payment's status and amount. Only a captured payment for this order and exactly this amount marks it `PAID` and the order `PLACED`.
4. The gateway also calls the **webhook** (`POST /api/payments/webhook/razorpay`), signed with the webhook secret. It is verified over the raw body, stored once by its event id, and applied. A repeated delivery changes nothing.
5. "It failed" or "the window was closed" from the browser is only a hint: the server asks the gateway what really happened (a UPI payment can succeed after the window closes).

Whichever of 3, 4 or 5 arrives first places the order; the others find it done. One order, one `PAID` payment, one confirmation email, however often they repeat. After a verified payment, exactly the bought cart lines are removed from the cart.

**Retry.** A failed or abandoned payment leaves the order `PENDING_PAYMENT`. "Retry payment" opens a new attempt on the **same** order and the same gateway order (the gateway accepts one successful payment per order, so nobody pays twice). Every attempt stays in `payments` with its reason.

**Refunds.** Cancelling a paid online order refunds it in full through the gateway; an admin can also refund part of an order. `refund.processed` webhooks (also for refunds made in the gateway's dashboard) update the order. A payment that arrives after its order was cancelled is refunded automatically.

**Emails** go through the configured email provider: order placed (COD), payment received, payment failed, shipped, delivered, cancelled, refund started, refund completed. Each is recorded in `order_notifications` first, so a repeated webhook can't send it twice.

**Shops.** Every order item stores its shop (`shop_ref`, `shop_name`). FrameX collects the payment centrally; there are no split payments.

### Set up Cashfree (test mode first)

Cashfree Payments is the gateway FrameX uses. Everything that is specific to it is in `src/payments/cashfree.js`; the checkout, the orders, the custom-painting payments and the webhook route only use the interface in `src/payments/index.js`.

1. Create an account at https://www.cashfree.com/ and open the Merchant Dashboard in **Test** mode.
2. **Developers → API Keys.** Copy the App ID (client id) and the Secret Key.
3. Put them in `backend/.env` (never in chat, never in the repository):

   ```
   PAYMENT_PROVIDER=cashfree
   PAYMENT_MODE=test
   CASHFREE_CLIENT_ID=...
   CASHFREE_CLIENT_SECRET=...
   CASHFREE_API_VERSION=2025-01-01
   ```

4. Restart the backend and run `npm run doctor`: it checks the credentials with Cashfree.
5. Pay for a test order on the website with Cashfree's sandbox details (https://www.cashfree.com/docs/payments/online/resources/sandbox-environment). No real money moves.
6. **Webhook** (needs a public address, so usually on the deployed backend): **Developers → Webhooks → Add Webhook Endpoint**, URL `https://<backend>/api/payments/webhook/cashfree`, events *payment success*, *payment failed*, *payment user dropped* and *refund*. Cashfree signs each webhook with your API secret (`base64(HMAC-SHA256(timestamp + body))`); the backend checks that over the exact bytes received.
7. **Going live:** complete Cashfree's activation, copy the **Production** keys, set `PAYMENT_MODE=live`, and add the webhook in production too.

**How a Cashfree payment is verified.** Cashfree's checkout gives the browser no signature, so nothing the browser reports is ever proof. The server creates the Cashfree order for its own total and hands the browser only a *payment session id*. After the window closes the browser says "I'm back"; the server then asks Cashfree for that order's payments (`GET /orders/{id}/payments`) and accepts only a payment that is `SUCCESS`, for this order, for exactly this amount and currency. The signed webhook does the same from Cashfree's side. A retry reuses the same Cashfree order (one successful payment per order); an order Cashfree closed unpaid gets a fresh one.

### Razorpay (second adapter)

`PAYMENT_PROVIDER=razorpay` still works through the same interface: one payment system, one gateway active at a time. It is kept so an installation that was set up with Razorpay keys keeps taking payments until its Cashfree account is ready. To remove it: delete `src/payments/razorpay.js`, its entry in `src/payments/index.js` and `PAYMENT_PROVIDERS`, the `razorpay` entry in `assets/js/services/payments.js`, and `test/support/mock-razorpay.js` with the tests that use it.

### Set up Razorpay (test mode first)

1. Create an account at https://razorpay.com and open the Dashboard in **Test Mode**.
2. **Account & Settings → API Keys → Generate Test Key.** Copy the Key Id (`rzp_test_…`) and the Key Secret (shown once).
3. Put them in `backend/.env`:

   ```
   PAYMENT_PROVIDER=razorpay
   PAYMENT_MODE=test
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   ```

4. Restart the backend and run `npm run doctor`: it checks the key with Razorpay.
5. Pay for a test order on the website with Razorpay's test details (https://razorpay.com/docs/payments/payments/test-card-details/). In test mode a UPI payment to `success@razorpay` succeeds and one to `failure@razorpay` fails; no real money moves.
6. **Webhook** (needs a public address, so usually on the deployed backend): **Account & Settings → Webhooks → Add New Webhook**, URL `https://<backend>/api/payments/webhook/razorpay`, a secret of your choice (the same text goes in `RAZORPAY_WEBHOOK_SECRET`), events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `refund.failed`. Without the webhook payments still work; a payment finished after the customer closed the page is then noticed when they open the order again.
7. **Going live:** complete Razorpay's account activation, generate **Live** keys, set `PAYMENT_MODE=live` with the `rzp_live_…` key, and add the webhook in Live Mode too.

Set your own `SHIPPING_FEE`, `SHIPPING_FREE_ABOVE`, `TAX_PERCENT`, `COD_*` and `GIFT_WRAP_FEE` values before taking real orders: they default to 0 / on (gift wrapping: ₹49).

### What has and hasn't been tested

`npm test` runs 268 API tests against a real server and an in-memory PostgreSQL (26 of them, in `test/analytics.test.js`, are about the admin reports: see "Analytics"). 56 of them are in `test/art.test.js`: the backend's real Cashfree code against a stand-in for Cashfree's servers (`test/support/mock-cashfree.js`: same API, same headers, same webhook signature) for success, failure, a closed window, retry, an expired gateway order, wrong amount, unknown order, bad signature, duplicate webhook, refund, gift wrap in the amount, COD untouched and the gateway being down; artists (apply, approve, private contact details, search, listing); artworks (review before public, reject with reason, edit goes back to review, buy through the normal checkout, a sold original); the whole custom-painting flow (no payment before acceptance, decline, the 40% advance, no start before it is verified, wrong amount refused, the remaining 60% by signed webhook, dispatch, delivery, cancel and refund tracking, the waiting-time close); settings; reviews; notifications; search; accounts. **What it can't show is a payment going through Cashfree itself: that needs your sandbox credentials.** 48 of them are in `test/photos.test.js`: uploads (a 4K file kept byte for byte, type read from the bytes, non-images refused, size limit, forged and expired links), a photo frame without / with its photo, sets that need 4, 5 or 9 photos, FrameX Studio designs and a 3-photo template with 2 and with 3 photos, Home Decor without a photo, gift wrapping (yes, no, online amount, shop and product opt-outs), shop products (type rules, ownership, publishing, moderation, FrameX taking one off sale), and a shop's access to its own order lines and their original photos (and every other shop, customer and visitor being refused). It also checks that every catalogue frame carries its full product information and that every picture it names exists.

It runs the backend's real Razorpay code against a stand-in for Razorpay's servers (`test/support/mock-razorpay.js`: same API, same authentication, same signatures) through the checkout tests: UPI / card / net banking success and failure, COD, retry, refresh during payment, repeated callbacks and webhooks, forged signatures, wrong amounts, stock running out, price changes, cancellations, refunds, other users' orders. The real Razorpay API was called with an invalid key and answered "Authentication failed" on every endpoint used. **A payment through Razorpay itself has not been made**: that needs your Razorpay test keys (steps above).

Another gateway is one file in `src/payments/` with the functions listed in `src/payments/index.js`, plus a few lines in `assets/js/services/payments.js` to open its checkout.

## Art & Artists

A second kind of seller beside FrameX itself and the shops: `FRAME_X_STUDIO`, `SHOP`, `ARTIST` (stored on every order line as `seller_type`).

```
artist_applications ──> artists ──1:n── artworks ─────────> catalog_products (source 'artist', once approved)
                           │──1:1── users (role ARTIST)      so the cart, checkout, stock and orders need nothing special
                           │──1:n── painting_services       the custom painting price list
                           └──1:n── painting_requests ──1:n── painting_request_photos  (the customer's private originals)
                                          │──1:n── painting_payments   ADVANCE and BALANCE, one row per attempt
                                          └──1:n── painting_events     its history
```

**Becoming an artist.** There is no public artist sign-up, the same as for shops. Someone applies on the Art & Artists page (`POST /api/artists/applications`, creates no login); a FrameX admin approves, which creates the artist (`FRX-ART-1001`, an @username) and an `ARTIST` login that is finished through a one-time link. An admin can also add an artist directly, unlist one (their artworks go off sale and they get no new requests), and switch a login off.

**Privacy.** An artist's public location is the city, the state and (if they choose) the area. No street address is stored. Their phone number and email address are never in a public answer.

**Artworks are reviewed before anyone sees them.** Saving an artwork puts it in `PENDING_REVIEW`. An admin approves it (`APPROVED`: public and on sale) or rejects it with a reason the artist sees (`REJECTED`). Changing an artwork sends it back to review; the artist can pause an approved one (`INACTIVE`) and show it again without a new review, or withdraw it (`CANCELLED`). A withdrawn artwork is off the website and can't be edited, but its artist can send it for review again ("Send for review again" in the Withdrawn list): it goes back to `PENDING_REVIEW` and is public only after an admin approves it. Only an approved artwork of a listed artist is in the catalogue. Pictures must be that artist's own uploads; an original has a stock of 1; the price is whole rupees.

**Buying an artwork** uses the normal cart and checkout: it is a ready-made product with no customer photo. Decided by the platform: an artwork is paid online (no Cash on Delivery) and is not gift wrapped. The order is an `ARTWORK_ORDER`; its line carries the artist. The artist sees it under *Artwork orders* in their dashboard (the same fulfilment steps shops use) and never sees other sellers' lines.

## Custom paintings

Two separate experiences: a finished artwork is bought; a custom painting is *requested*, and money is only taken after the artist has said yes.

```
PENDING_ARTIST_RESPONSE ──decline──> DECLINED                 nothing was ever payable
        │ accept
ADVANCE_PAYMENT_PENDING ──verified advance payment──> ADVANCE_PAID
ADVANCE_PAID ──artist starts──> PAINTING_IN_PROGRESS ──artist marks completed──> REMAINING_PAYMENT_PENDING
REMAINING_PAYMENT_PENDING ──verified balance payment──> READY_FOR_DISPATCH ──> SHIPPED ──> DELIVERED
(CANCELLED from any step before SHIPPED; refunds are tracked beside the status: NONE / REFUND_PENDING / REFUNDED)
```

Every change goes through one function (`move()` in `painting-service.js`) that refuses any step not on this map. So an artist **cannot start before the advance is verified**, nothing is payable before the artist accepts, and nothing can be dispatched before the balance is verified: those arrows do not exist. The two payment steps can only be made by `painting-payment-service.js` with a payment the server got from the gateway.

**The split.** `advance = round(price × percent / 100)`, `balance = price − advance`, in whole rupees with integer arithmetic; the database also checks that they add up to the price. The percent is the platform setting when the request is made (default 40, `CUSTOM_PAINTING_ADVANCE_PERCENT`, or *Settings* in the admin dashboard) and is stored with the request, so changing the setting never changes an agreed request. Example: ₹7,000 at 40% is ₹2,800 now and ₹4,200 on completion.

**The request.** The customer picks a service from the artist's price list (a size and type at a fixed price), adds 1 to 5 reference photos, optional instructions and a delivery address. The price is the service's price on the server; nothing about money is read from the browser. The reference photos are the customer's private originals (role `CUSTOMER_REFERENCE_IMAGE`): the artist gets them only through short-lived signed links, only for their own request, and each download is logged. The customer's street address and phone number are shown to the artist only once the painting is fully paid and has to be sent.

**Payments.** `POST /api/paintings/:n/payments` opens an attempt for whatever is due (the advance or the balance): one gateway order per stage, reused for every retry, so a stage can't be paid twice (the database has a unique index for it too). After the window closes the server asks the gateway; a signed webhook does the same. A payment with another amount, currency or gateway order is refused. A repeated callback or webhook changes nothing.

**Refunds and cancelling.** A customer can cancel while nothing has been paid. After that only FrameX can cancel, and the request is marked `REFUND_PENDING`: no money is sent back automatically. *This is a business-policy TODO:* how much of the advance is returned when a request is cancelled after the artist has started, and who decides. Until that is decided an admin refunds by hand in the gateway's dashboard and records it (`POST /api/admin/paintings/:n/refund-recorded`). An accepted request whose advance is not paid within `CUSTOM_PAINTING_ADVANCE_DAYS` is closed.

**Not decided, so not automated:** delivery charge and tax for a custom painting (the artist's fixed price is the whole price), commission and payouts to artists (`PLATFORM_COMMISSION_PERCENT` is only recorded), and what happens if an artist can't finish (they contact FrameX; an admin cancels).

## Platform settings, reviews, notifications and search

**Settings.** A FrameX admin can change these in the dashboard without touching the server: the custom-painting advance percent, gift wrapping (on/off, fee), Cash on Delivery (on/off, fee), the delivery fee and the free-delivery threshold, the tax percent, and the commission percent (recorded only). A saved value is kept in `platform_settings` and replaces the environment's default; putting a setting "back to default" removes it. Each change is in the activity log. Keys and passwords are never settings.

**Reviews.** Only someone who received the thing can review it: a review names the delivered order or painting it comes from, and the server checks that it is the reviewer's own, was delivered, and really contained what is reviewed (a product, an artwork, a shop, an artist). One review per customer, target and purchase. FrameX never writes or edits a review; an admin can hide one.

**Notifications.** Every important step writes a notification to the user's account (`GET /api/notifications`) and, for the ones that matter most, an email through the configured provider: request sent, accepted, declined, advance paid, painting started, completed, fully paid, dispatched, delivered, cancelled; artwork approved or rejected; and the order events (the full order emails are unchanged). Each is stored once per event, so a repeated webhook can't notify twice.

**Search.** `GET /api/search?q=…` looks through products, templates, shops, artists and artworks, and only what the public may see, and answers with the first few of each kind (`search.html`). The Art & Artists page has its own search by name, username, style, medium and city.

## Analytics (admin dashboard)

`admin.html` → **Analytics** shows one period at a time (today, 7, 30 or 90 days, or two dates you choose). A day is a day in India time unless `ANALYTICS_UTC_OFFSET_MINUTES` says otherwise.

**Where each figure comes from**

| Figures | Source | Depends on visitors' consent? |
|---|---|---|
| Orders created / paid / cancelled, gross sales, refunds, net revenue, Cash on Delivery, each gateway's successful / failed / pending payments, shops, artists, custom paintings | the database: `orders`, `payments`, `refunds`, `payment_events`, `painting_requests`, `painting_payments` | no |
| Registered users, new registrations | `users` | no |
| Logins and failed logins | `auth_events` (written by the login itself) | no |
| Items added to carts; abandoned carts | `analytics_events` rows written by the cart on the server; the `carts` table | no |
| Visitors, visits, page views, product / category / template / artwork views, searches, where visits came from, "on the site now" | `analytics_events` rows sent by the website | **yes**: only visitors who pressed "Allow analytics" |

**What counts as paid.** An order is paid when `orders.paid_at` is set. That happens in two places only: the server verified the gateway's payment (the signed checkout answer, a signed webhook, or asking the gateway), or a Cash on Delivery order was marked delivered. A browser returning from the payment page changes nothing, and neither does anything Google Analytics is told. One order is one row, and every webhook is stored once by its own id (`payment_events`), so a payment reported five times is still one payment.

- **created**: orders made in the period, whatever happened to them later. **paid**: orders whose payment was verified in the period. **gross**: the money of the orders and painting payments paid in the period. **refunds**: gateway refunds that went through in the period, plus painting refunds an admin recorded. **net** = gross − refunds. Cancelled orders are counted on their own.
- **Test orders are never sales.** An order paid online while `PAYMENT_MODE=test` is labelled `is_test` when it is created; so is a painting request when a test payment starts. An admin can also mark any order as a test on its page ("Sales reports" → "Mark as a test order", written to the audit log), for example a Cash on Delivery order someone placed to try the shop. Test orders stay in every list, carry a "Test" tag, and are shown on their own line in the reports. Orders from before this label existed are labelled once at the next start: online orders are tests if the gateway is in test mode then; Cash on Delivery orders are left as real.

**Visitor statistics and consent.** The website asks every new visitor once ("Help us improve FrameX?"). Nothing is sent and no visitor number exists until they press "Allow analytics"; "No thanks" is remembered; a browser that sends Do Not Track or Global Privacy Control is treated as a no without asking; the choice can be changed on the Privacy Notice page. What is stored per event: its name, the page's path (never the query string), the product / template / category looked at, search words (anything that looks like an email address or phone number is removed, in the browser and again on the server), the referring site's host, campaign tags, the device kind, whether someone was logged in (not who), a random visitor number and a visit number. Not stored: IP address, account, name, email, phone, address, photos, payment details. Programs (search engines, link previews, headless browsers) and logged-in admins are left out. Because they need consent, visitor figures are a floor, not a head count; the dashboard says so next to them. Someone who scripts requests could inflate them; they can't touch the sales figures.

**Google Analytics 4 (optional).** Set `GA4_MEASUREMENT_ID=G-XXXXXXXXXX` (GA4 → Admin → Data streams → your web stream → Measurement ID) and restart. The website gets the ID from `GET /api/config` and loads Google's tag only after a visitor allows analytics, with advertising storage and signals denied. It sends `page_view`, `view_item`, `view_item_list`, `search`, `add_to_cart`, `begin_checkout` and `purchase` (once per order, from the confirmation page of an order the server reports as placed, never for a test order). The Measurement ID is public by nature; no Google secret is used anywhere. Without the backend, the same ID can be put in `assets/js/config.js` → `analytics.ga4MeasurementId`. GA4's own reports stay in GA4: the admin dashboard does not read them. The website sends no Content-Security-Policy today; if you add one, allow `https://www.googletagmanager.com` for scripts and `https://*.google-analytics.com` for connections, or the tag will be blocked. With `ANALYTICS_ENABLED=false` and no Measurement ID the website asks nothing and sends nothing at all.

**Customers.** `admin.html` → Accounts → an account shows its contact details, saved addresses, cart, and order history (ten orders a page, each with its number, items, payment status and delivery status). No password, hash, session or payment credential is in that answer. Opening a record is written to the audit log. Orders belong to accounts: there are no guest orders in FrameX.

**Housekeeping.** Visitor and login records older than `ANALYTICS_RETENTION_DAYS` (400) are deleted twice a day. Orders and payments are never deleted by this.

**Tested** (`test/analytics.test.js`, 26 tests): every money figure against a fixture worked out by hand for today / 7 / 30 / 90 days and custom periods; refunds, Cash on Delivery, gateway successes and failures, test orders, the same payment reported repeatedly, an admin marking an order as a test; custom painting figures; sellers and popular items; that nothing is stored without consent, that batches are cleaned, bots and admins left out, the 20-event limit, retention; logins and failed logins without what was typed; the customer record without any credential; and that every one of these endpoints refuses visitors (401) and customers (403). **Not tested: Google itself.** No real Measurement ID was available, so no hit was sent to Google; the tests check that the tag is added only after consent and what the page hands to it.

## Create an admin

There is no admin sign-up. Admins are created from the command line by someone with access to the server:

```bash
npm run admin:create                 # asks for name, email and a password (12+ characters)
# hosts without an interactive terminal:
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:create -- --from-env
```

Log in on the website's login page with that email, then open `admin.html`.

Running it again with the same email sets a new password for that admin (the old one is not needed, and it can't be read back from anywhere). On Windows, `set-admin-password.bat` in the project folder does the same by double-click (from the Windows folder, not from inside an editor): it stops the backend for a moment, asks the questions, and starts the backend again.

## Try every flow

| Flow | How |
|---|---|
| Customer | `signup.html` → create an account → `account.html` → Log out → `login.html` |
| Forgot password (email) | `forgot-password.html` → enter the email, mobile number or Shop ID → **Send code to Email** → type the code from the inbox, or use the button in the email → new password. Needs the email provider (or test mode) |
| Forgot password (mobile) | `forgot-password.html` → **Send code to Mobile** → type the code from the SMS → new password. Needs the SMS provider (or test mode) and a mobile number on the account |
| Shop applies | `partner.html` → send the form (no login is created) |
| Admin approves | log in as an admin → `admin.html` → Applications → open one → enter the shop's latitude / longitude → Approve. You get the **Shop ID** and a **one-time password link** |
| Shop logs in | open the one-time link → set a password → `login.html` → "Local shop" tab → Shop ID + password → shop dashboard |
| Nearby shops | Home or Shop page → "Use my location" (allow or block it), change the distance, or "Enter a location instead" |
| Photo frame | open a frame's product page → "Add to cart" without a photo is refused → add a photo under "Your photo" → Add to cart or Buy Now. The order page then lists the photo ("View original") |
| Template with several photos | `templates.html` → a template → Customize → add every photo ("Photo 1", "Photo 2", …) → Add to cart. One short is refused |
| Home Decor | `home-decor.html` → any ready-made piece → Add to cart: no photo is asked for |
| Gift wrapping | `checkout.html` → "Would you like to gift wrap this order?" → Yes: the charge appears as its own line before paying |
| A shop sells | shop dashboard → Products → Add product → "What do you want to sell?" → fill the steps → Publish. It is then in the catalogue under that shop |
| A shop makes an order | shop dashboard → Orders → open one → "Download original" for each customer photo → set the progress |
| FrameX staff | `admin.html` → Orders → an order: its photos ("Download original"), gift wrapping, each shop's progress. `admin.html` → Shop products: approve or take off sale |

`npm run seed:dev` creates a demo customer, a demo shop login (`FRX-SHOP-1001`) and a demo admin with random passwords printed once, plus demo shops in Odisha (one inactive, to show it stays hidden). Demo shops are flagged `is_demo` and labelled "Sample shop" on the site. The seed refuses to run in production. `npm run seed:dev -- --reset` removes and recreates the demo data.

## Configuration

Copy `.env.example` to `.env`. Nothing secret is in the code or in Git (`.env` and `.data/` are ignored).

| Variable | Needed | Purpose |
|---|---|---|
| `NODE_ENV` | production | `production` turns on strict checks and secure cookies |
| `PORT` | no | default `4000` |
| `DATABASE_URL` | production | PostgreSQL connection string. Empty = embedded database (development) |
| `DATABASE_SSL` | hosted DBs | `require` for Neon / Render / Supabase |
| `AUTH_SECRET` | production | 32+ random characters; keys the hashes of session and reset tokens |
| `SESSION_TTL_DAYS` | no | default `14` |
| `COOKIE_SAMESITE` | no | `lax` (default) / `none` |
| `AUTH_ALLOW_BEARER` | cross-site only | `true` to also hand the session token to the website (see "How the website connects") |
| `FRONTEND_URL` | production | the website's public address, no trailing slash (e.g. `https://siburam7.github.io/FrameX-None`); reset and setup links are built from it. Empty locally = links go back to the allowed site the request came from |
| `CORS_ORIGINS` | production | website origins allowed to call the API, comma separated |
| `SERVE_FRONTEND` | no | `true` to serve the website files from this server |
| `PAYMENT_PROVIDER` | for online payment | `razorpay` or `none` (default) |
| `PAYMENT_MODE` | with a gateway | `test` (default) or `live`; must match the kind of key |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | with `razorpay` | API keys. The secret is never sent to a browser |
| `RAZORPAY_WEBHOOK_SECRET` | recommended | the secret entered for the webhook at Razorpay |
| `PAYMENT_PENDING_MINUTES` | no | how long an unpaid online order keeps its stock (`30`) |
| `ANALYTICS_ENABLED` | no | `true` (default): the website may send visitor statistics for visitors who allow them. `false`: none are collected. Sales and order reports never depend on it |
| `GA4_MEASUREMENT_ID` | for Google Analytics | the GA4 web stream's Measurement ID, `G-XXXXXXXXXX`. Empty = GA4 is not used. Public, not a secret |
| `ANALYTICS_RETENTION_DAYS`, `ANALYTICS_UTC_OFFSET_MINUTES`, `ANALYTICS_ABANDONED_CART_HOURS` | no | how long visitor and login records are kept (`400`), the reports' day as minutes ahead of UTC (`330` = India), and after how many idle hours a cart with items counts as abandoned (`24`) |
| `TAX_PERCENT`, `SHIPPING_FEE`, `SHIPPING_FREE_ABOVE` | your rules | tax added at checkout, delivery charge, free-delivery threshold (all `0`) |
| `COD_ENABLED`, `COD_FEE`, `COD_MAX_ORDER_VALUE`, `COD_BLOCKED_PINCODES`, `COD_BLOCKED_SHOPS`, `COD_BLOCKED_PRODUCTS`, `COD_ALLOW_CUSTOM_DESIGNS` | your rules | Cash on Delivery: on/off, fee, limit and exclusions |
| `GIFT_WRAP_ENABLED`, `GIFT_WRAP_FEE`, `GIFT_WRAP_BLOCKED_SHOPS`, `GIFT_WRAP_BLOCKED_PRODUCTS` | your rules | gift wrapping: on (`true`), the charge per order (`49`), and where it is not offered |
| `UPLOAD_DIR` | **production** | folder for customer photos and shop product pictures. Default `backend/.data/uploads`. In production it must be on a disk that survives restarts |
| `UPLOAD_MAX_MB`, `UPLOAD_LINK_SECONDS`, `UPLOAD_MAX_WAITING`, `UPLOAD_UNUSED_DAYS` | no | largest photo (`50`), how long a download link works (`300`), photos one account may have waiting outside an order (`80`), days before an unused photo is deleted (`30`) |
| `PRODUCT_MODERATION` | no | `true` = a shop's first Publish waits for a FrameX admin (`false`) |
| `MEDIA_MAX_MB`, `MEDIA_MAX_PER_SHOP` | no | largest product picture (`12`) and how many pictures one shop may keep (`600`) |
| `CATALOG_DIR` | no | folder that holds the website's `js/` and `assets/js/` folders (the catalogue and pricing code). Default: the project folder, one level above `backend/` |
| `TRUST_PROXY` | hosted | `1` behind Render / Railway / Fly, so rate limits see the real client address |
| `EMAIL_PROVIDER` | for email | `brevo` (default when a key is set), `resend`, `gmail`, `smtp`, `none`. `dev` (test mode) is refused in production |
| `EMAIL_PROVIDER_API_KEY` | with `brevo` / `resend` | the provider's API key |
| `EMAIL_FROM` | with `brevo` / `resend` / `smtp` | sender, verified with the provider: `"FrameX <support@example.com>"` |
| `EMAIL_REPLY_TO` | no | where replies go |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | with `gmail` | Gmail address and Google App Password (set by `npm run email:setup`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | with `smtp` | any other SMTP server |
| `SMS_PROVIDER` | for SMS codes | `fast2sms`, `2factor`, `twilio`, `none` (default). `dev` (test mode) is refused in production |
| `SMS_API_KEY` | with `fast2sms` / `2factor` | the provider's API key |
| `SMS_SENDER_ID`, `SMS_TEMPLATE_ID` | no | your DLT-registered sender and template (Fast2SMS DLT route; 2Factor template name) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | with `twilio` | Twilio credentials |
| `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_SECONDS`, `OTP_MAX_PER_HOUR` | no | one-time code rules (`10`, `5`, `30`, `5`) |
| `ADMIN_NOTIFY_EMAIL` | no | gets a note when a shop or an artist applies, and receives the messages sent from the Contact page (empty = those messages go to the email of every admin account). Several addresses: separate them with a comma |
| `CONTACT_ALERTS_PER_HOUR` | no | Contact page: at most this many alert emails an hour (default 30); further messages are kept in admin → Messages without an email |
| `GEOCODER_PROVIDER` | no | `nominatim` (OpenStreetMap place search) or `none` |
| `GEOCODER_CONTACT_EMAIL` | with nominatim | required by Nominatim's usage policy |
| `MAP_PROVIDER_KEY` | no | reserved for a future map provider |
| `NEARBY_DEFAULT_RADIUS_KM`, `NEARBY_RADIUS_OPTIONS_KM` | no | the one place search distances are configured (`25`, `5,10,25,50`) |

A production server refuses to start without `AUTH_SECRET`, a database, `FRONTEND_URL` and `CORS_ORIGINS`, or with a `dev` provider. Missing email / SMS credentials do not stop it: accounts keep working and password reset reports "… service is not configured." until they are filled in.

The older names `EMAIL_PROVIDER_KEY` and `SMS_PROVIDER_KEY` are still read.

## Deploy

The website stays on GitHub Pages. The backend needs a host that runs Node.js, and a PostgreSQL database. One practical setup:

1. **Database:** create a free PostgreSQL database (for example Neon, Supabase or Render Postgres) and copy its connection string.
2. **Backend:** create a Node web service from this repository (for example on Render: the `render.yaml` in the repository root describes it). Deploy the **whole repository** (the server reads the website's catalogue files), build `cd backend && npm ci`, start `cd backend && npm start`.
3. **A disk for uploaded files.** Customer photos and shop product pictures are files, not database rows. Give the service a **persistent disk** (on Render: add a disk to the service; `render.yaml` shows where) and set `UPLOAD_DIR` to a folder on it, for example `/var/data/uploads`. Without one, every uploaded photo disappears when the service restarts or redeploys, and orders that need them can't be printed. `npm run doctor` warns when `UPLOAD_DIR` is not set in production.
4. **Environment variables** on the host (typed into the host's dashboard, never into Git): `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL=require`, `AUTH_SECRET`, `FRONTEND_URL` (the website's address, e.g. `https://siburam7.github.io/FrameX-None`), `CORS_ORIGINS` (its origin, e.g. `https://siburam7.github.io`), `SERVE_FRONTEND=false`, `TRUST_PROXY=1`, `AUTH_ALLOW_BEARER=true`, the email settings (`EMAIL_PROVIDER=brevo`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`) and the SMS settings (`SMS_PROVIDER=fast2sms`, `SMS_API_KEY`).
5. **First admin:** run `npm run admin:create -- --from-env` once in the host's shell with `ADMIN_EMAIL` / `ADMIN_PASSWORD` set, then remove those two variables.
6. **Website:** in `assets/js/config.js` set `PRODUCTION_API_URL` to the backend's address + `/api` and `session: "bearer"`, and push to GitHub.
7. **Check delivery** in the host's shell: `npm run doctor`, `npm run email:test -- you@example.com`, `npm run sms:test -- <your number>`. Then reset a password on the live website once by email and once by mobile.

```
visitor's browser ── GitHub Pages (static website)
        │  HTTPS, JSON
        ▼
backend API (Node.js host, always on) ──► PostgreSQL (hosted)
        ├──► Brevo     ──► the visitor's inbox
        └──► Fast2SMS  ──► the visitor's phone
```

Tables are created automatically on start (migrations in `src/db/migrations/`). A free web service that sleeps when idle makes the first request after a pause slow; an always-on plan avoids that.

This deployment path is documented, not yet exercised: the code was tested locally against the embedded PostgreSQL engine. The first deploy against a hosted PostgreSQL should be followed by the "Try every flow" table above.

## How the website connects

`assets/js/config.js` holds the backend address (`backend.url`) and the session mode (`backend.session`).

- **Cookie mode (default, recommended).** The session is an `httpOnly` cookie that page scripts cannot read. It needs the website and the API on the *same site*: `localhost`, or a custom domain such as `framex.in` + `api.framex.in`.
- **Bearer mode.** `*.github.io` and a backend host like `*.onrender.com` are *different sites*; Safari and Firefox block cookies between them. For that setup set `session: "bearer"` in `config.js` and `AUTH_ALLOW_BEARER=true` on the backend. The login response then includes the session token, the website keeps it in `sessionStorage` for the tab and sends it as an `Authorization` header. It works everywhere, but a script injected into the page could read the token, so move to a custom domain and cookie mode when you can.

Either way the token is random, only its hash is stored, it expires, and logging out or resetting the password revokes it on the server.

## API

All responses are JSON. Errors look like `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "email": "…" } } }` with status 400, 401, 403, 404, 409, 422, 429 or 500.
State-changing requests must send the header `X-FrameX-Client: web` (CSRF protection) and come from an allowed origin.

| Method and path | Who | What |
|---|---|---|
| `GET /api/health`, `GET /api/config` | anyone | status; nearby-search settings and feature flags |
| `POST /api/auth/signup` | anyone | create a **customer** account (the role can't be chosen) |
| `POST /api/auth/login` | anyone | `{ identifier, password, accountType: "customer" \| "shop" }` |
| `POST /api/auth/logout` | logged in | ends the session on the server |
| `GET /api/auth/me` | anyone | who is logged in |
| `POST /api/auth/recovery/start` | anyone | `{ identifier }` (email, mobile number or Shop ID) → `{ recoveryToken, channels: [{ type: "email" \| "sms", masked, available, reason }] }`; `404 ACCOUNT_NOT_FOUND`. Admin accounts are never found here |
| `POST /api/auth/recovery/send` | ticket holder | `{ recoveryToken, channel }` → sends a 6-digit code (email: also a one-time link). `503 EMAIL_NOT_CONFIGURED` / `SMS_NOT_CONFIGURED`, `502 EMAIL_SEND_FAILED` / `SMS_SEND_FAILED`, `429 OTP_COOLDOWN` / `OTP_LIMIT` (with `retryAfterSeconds`). The code is never in the response |
| `POST /api/auth/recovery/verify` | code holder | `{ recoveryToken, channel, code }` → one-time reset token (then `/reset-password`). `OTP_INVALID` (with tries left), `OTP_LOCKED` |
| `POST /api/auth/token-info`, `POST /api/auth/reset-password` | link holder | check / use a reset or shop-setup link |
| `POST /api/auth/change-password` | logged in | needs the current password |
| `GET` / `PATCH /api/users/me` | logged in | own profile (name, phone) |
| `GET /api/shops` | anyone | approved + active shops; `q`, `lat`, `lng`, `page`, `limit` |
| `GET /api/shops/nearby?lat=&lng=&radius=` | anyone | shops within the radius, nearest first, with `distanceKm` |
| `GET /api/shops/:ref` | anyone | one listed shop (Shop ID or catalogue reference) |
| `POST /api/shops/applications` | anyone | "Partner With FrameX" request. Creates no login |
| `GET /api/shops/:shopCode/dashboard`, `PATCH /api/shops/:shopCode/profile` | **SHOP**, own shop only | the shop's data; phone, description, pickup / delivery, `giftWrap` |
| `GET /api/shops/:shopCode/orders[?filter=open\|done]`, `GET …/orders/:n` | **SHOP**, own shop only | orders with a line of this shop; one order with this shop's own lines, their photos and who to hand them to |
| `PATCH /api/shops/:shopCode/orders/:n/items/:itemId` | **SHOP**, own line only | `{ status: NEW \| ACCEPTED \| IN_PRODUCTION \| READY \| HANDED_OVER, note? }` |
| `POST /api/shops/:shopCode/orders/:n/photos/:uploadId/link` | **SHOP**, own line only | a short-lived link to the customer's original photo. `404` for any other photo, `409 ORDER_NOT_ACTIVE` |
| `GET /api/shops/:shopCode/products`, `GET` / `PUT` / `DELETE …/products/:id` | **SHOP**, own products only | the shop's own products; `PUT` takes the whole product record (`status`: draft / published / unpublished). `422 PRODUCT_INCOMPLETE` |
| `POST /api/shops/:shopCode/media`, `POST …/media/:id/thumb` | **SHOP** | upload a product picture (raw bytes) and its small copy → `{ media: { id, ref: "media:<id>" } }` |
| `GET /media/:id`, `GET /media/:id/thumb` | anyone | a shop's product picture |
| `GET /api/catalog/shop-products` | anyone | the products listed shops have on sale (complete records) |
| `POST /api/uploads` | logged in | upload one customer photo: the body is the file; headers `Content-Type`, `X-File-Name` → `{ upload: { id, name, format, width, height, bytes, … } }`. `415 UPLOAD_UNSUPPORTED`, `413 UPLOAD_TOO_LARGE`, `409 UPLOAD_LIMIT` |
| `GET /api/uploads/:id`, `POST …/:id/link`, `DELETE …/:id` | logged in, own photo | what the server knows about it; a short-lived link (`{ download }`); remove a photo no cart line or order uses |
| `GET /api/files/:token` | link holder | the file a signed link names. No session: the token is the proof, and it expires |
| `GET /api/cart` | logged in | the caller's cart: `{ cart: { id, items, groups, count, subtotal, currency, hasIssues } }`. Each item has `name`, `image`, `shopName`, `size`, `color`, `options`, `note`, `quantity`, `maxQuantity`, `unitPrice`, `lineTotal`, `available`, `issue`, `priceChange`, `design` |
| `POST /api/cart/items` | logged in | add a product `{ productId, quantity?, selection?: { sizeId, colorId, printMaterialId, protection }, note?, photos?, thumbnail? }` or a Studio design `{ kind: "studio", design: { id, config, thumbnail? }, photos?, quantity? }` → `{ itemId, cart }`. `photos` = `{ photo1: "<upload id>" \| { uploadId, placement: { x, y, zoom } }, … }`. `404 PRODUCT_NOT_FOUND`, `409 PRODUCT_UNAVAILABLE / OUT_OF_STOCK / QUANTITY_LIMIT / CART_FULL`, `422 OPTION_UNAVAILABLE / DESIGN_INCOMPLETE / PHOTOS_REQUIRED` |
| `PATCH /api/cart/items/:itemId` | logged in, own item | `{ quantity }` (1 up to the line's limit) → `{ cart }` |
| `DELETE /api/cart/items/:itemId` | logged in, own item | remove one line → `{ cart }` |
| `DELETE /api/cart` | logged in | empty the caller's cart → `{ cart }` |
| `POST /api/cart/validate` | logged in | the check before checkout → `{ ok, issues: [{ code, message, itemId }], cart }` |
| `GET` / `POST /api/addresses`, `PATCH` / `DELETE /api/addresses/:id`, `POST …/:id/default` | logged in, own addresses | delivery addresses |
| `GET /api/checkout/quote?addressId=&paymentMethod=&giftWrap=` | logged in | the cart's items, subtotal, discount, tax, delivery, gift wrapping (`giftWrap: { available, fee, reason, selected }`, `giftWrapFee`), COD fee, total, and the ways to pay that are available |
| `POST /api/checkout/quote` | logged in | the same for "Buy Now": `{ addressId?, paymentMethod?, buyNow: { productId, quantity, selection, note } \| { kind: "studio", design, quantity } }` |
| `POST /api/checkout/orders` | logged in | `{ addressId, paymentMethod: "COD" \| "ONLINE", paymentChannel?, expectedTotal, idempotencyKey, giftWrap?, buyNow? }` → `{ order, payment }`. With `buyNow`, that one item is ordered instead of the cart. `409 TOTAL_CHANGED / CART_NOT_READY / OUT_OF_STOCK / COD_UNAVAILABLE / GIFT_WRAP_UNAVAILABLE`, `422 PHOTOS_REQUIRED`, `503 PAYMENT_NOT_CONFIGURED` |
| `GET /api/orders`, `GET /api/orders/:orderNumber` | logged in, own orders | list / one order with items (each with its `photos` and the shop's `fulfilment` step), gift wrapping, payments, refunds and history |
| `POST /api/orders/:n/photos/:uploadId/link` | owner | a short-lived link to one of the order's own photos |
| `POST /api/orders/:n/payments` | owner | "Retry payment": a new attempt on the same order |
| `POST /api/orders/:n/payments/verify` | owner | `{ gatewayOrderId, gatewayPaymentId, signature }` from the gateway's checkout; the server verifies it |
| `POST /api/orders/:n/payments/outcome` \| `/refresh` | owner | "failed / closed" hint, or "did it arrive?": the server asks the gateway |
| `POST /api/orders/:n/cancel` | owner | before production; a paid online order is refunded |
| `POST /api/payments/webhook/razorpay` | the gateway | signed by the gateway; no session |
| `GET /api/admin/orders`, `GET …/:n`, `POST …/:n/status`, `POST …/:n/refund` | **ADMIN** | all orders; move forward / cancel; refund |
| `POST /api/admin/orders/:n/photos/:uploadId/link` | **ADMIN** | a short-lived link to a customer's original photo of any order (audited) |
| `GET /api/admin/products[?status=]`, `POST /api/admin/products/:id/listing` | **ADMIN** | products shops created; `{ status: "published" \| "unpublished" }` approves one or takes it off sale |
| `GET /api/geo/search?q=` | anyone | place search for a typed location |
| `POST /api/contact` `{ name, email, phone?, subject, message }` | anyone (6 an hour per address) | a message from the Contact page: kept for admin → Messages, and an alert email goes to `ADMIN_NOTIFY_EMAIL` (or, when that is empty, to every active admin account) with the sender as Reply-To. Nothing is emailed to the sender. At most `CONTACT_ALERTS_PER_HOUR` (30) alerts an hour; later messages are still kept |
| `GET /api/admin/messages?status=&page=`, `POST /api/admin/messages/:id/status` `{ status: NEW \| READ }`, `DELETE /api/admin/messages/:id` | admin | read, mark and delete those messages |
| `GET /api/admin/overview` | **ADMIN** | counts |
| `GET /api/admin/applications[?status=]`, `GET …/:id` | **ADMIN** | applications |
| `POST /api/admin/applications/:id/review` \| `/reject` \| `/approve` | **ADMIN** | approve creates the shop, its Shop ID and its login |
| `GET` / `POST /api/admin/shops`, `GET` / `PATCH /api/admin/shops/:id` | **ADMIN** | list, add, view, edit (information and location) |
| `POST /api/admin/shops/:id/activate` \| `/deactivate` \| `/approval` | **ADMIN** | status |
| `POST /api/admin/shops/:id/credentials` \| `/account` | **ADMIN** | new one-time password link; enable / disable the login |
| `GET /api/admin/audit` | **ADMIN** | audit log |
| `GET /api/artists[?q=&style=&city=]`, `GET /api/artists/facets`, `GET /api/artists/:ref` | public | the artist directory; one artist (ID or username) with price list, approved artworks and reviews. Never a phone number, email or street address |
| `POST /api/artists/applications` | public | "Join as an artist": creates no login |
| `GET /api/artworks[?q=&artType=&artist=&sort=]`, `GET /api/artworks/:ref` | public | approved artworks only |
| `GET` / `PATCH /api/artist/profile`, `POST /api/artist/media`, `GET /api/artist/overview`, `GET /api/artist/earnings` | **ARTIST** | the artist's own profile, pictures and numbers |
| `GET /api/artist/artworks[?status=]`, `GET` / `PUT /api/artist/artworks/:id`, `POST …/:id/status` | **ARTIST**, own artworks | add or change (then `PENDING_REVIEW`); withdraw, pause, show again |
| `GET` / `POST /api/artist/services`, `PUT` / `DELETE /api/artist/services/:id` | **ARTIST**, own | the custom painting price list |
| `GET /api/artist/requests[?filter=]`, `GET …/:number`, `POST …/:number/respond` `{ decision: ACCEPT | DECLINE, reason }`, `POST …/:number/step` `{ step: start | complete | dispatch | deliver, note }`, `POST …/:number/photos/:uploadId/link` | **ARTIST**, own requests | custom painting requests; a step the state machine doesn't allow answers 409 |
| `GET /api/artist/orders`, `GET …/:orderNumber`, `PATCH …/:orderNumber/items/:itemId` | **ARTIST** | orders of the artist's artworks (their own lines only) |
| `POST /api/paintings` `{ artist, serviceId, uploadIds[], instructions, addressId, idempotencyKey }`, `GET /api/paintings`, `GET /api/paintings/:number` | logged in, own requests | send a custom painting request (no payment); list; one request |
| `POST /api/paintings/:number/payments` | logged in, own request | pay what is due now (advance or balance); 409 `PAINTING_NOT_PAYABLE` when nothing is |
| `POST /api/paintings/:number/payments/verify` | `/outcome` | `/refresh` | logged in, own request | the server asks the gateway what happened |
| `POST /api/paintings/:number/cancel` | `/delivered`, `POST …/photos/:uploadId/link` | logged in, own request | cancel before anything is paid; confirm delivery; a link to your own reference photo |
| `POST /api/payments/webhook/cashfree` | Cashfree (signed) | payment and refund news for orders and for painting payments |
| `GET /api/notifications`, `GET …/unread`, `POST …/read`, `POST …/:id/read` | logged in | the account's notifications |
| `GET /api/reviews?targetType=&targetId=`, `GET /api/reviews/latest` | public | published reviews |
| `GET /api/reviews/gallery?page=` | public | published reviews of the whole site with what was reviewed, the ones with a photo first (the Customer Gallery page) |
| `POST /api/reviews/:id/photo` (the picture's bytes), `DELETE /api/reviews/:id/photo` | the review's writer | add, replace or remove the one photo of a review (JPG, PNG or WebP) |
| `GET /media/review/:id` | public | that photo, only while the review is published |
| `GET /api/reviews/mine?sourceType=&sourceId=`, `POST /api/reviews` | logged in | what a delivered order or painting lets you review; write or change your review |
| `GET /api/search?q=[&kinds=]` | public | products, templates, shops, artists and artworks |
| `GET /api/admin/artist-applications`, `POST …/:id/approve` | `/reject` | **ADMIN** | approve creates the artist and their login |
| `GET` / `POST /api/admin/artists`, `GET` / `PATCH …/:id`, `POST …/:id/status` | `/credentials` | **ADMIN** | artists: add, edit, list or unlist, new setup link |
| `GET /api/admin/artworks[?status=]`, `POST …/:id/review` `{ decision, reason }`, `POST …/:id/visible` | **ADMIN** | approve, reject (reason required), hide or show |
| `GET /api/admin/paintings`, `GET …/:number`, `POST …/:number/cancel` | `/refund-recorded` | `/delivered` | **ADMIN** | every custom painting; cancel; record a refund made by hand |
| `GET` / `PATCH /api/admin/settings` | **ADMIN** | platform settings (`{ key: value }`; `null` = back to the server's default) |
| `GET /api/admin/reviews`, `POST …/:id/status` | **ADMIN** | hide or show a review |
| `GET /api/admin/users[?q=&role=&page=]`, `POST …/:id/status` `{ enabled }` | **ADMIN** | accounts, 30 a page; switch a customer, shop or artist login off or on (never an admin's) |
| `GET /api/admin/users/:id[?page=]` | **ADMIN** | one account: contact details, saved addresses, cart, order history (10 a page), painting requests. No credentials. Audited |
| `GET /api/admin/analytics/overview` \| `/traffic` \| `/sales` \| `/catalog` \| `/sellers` \| `/paintings` \| `/accounts` `?range=today\|7d\|30d\|90d` or `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` | **ADMIN** | the reports. A custom period is at most one year; a bad one answers 422 |
| `GET /api/admin/analytics/live` | **ADMIN** | visitors (who allowed analytics) heard from in the last 5 minutes |
| `POST /api/admin/orders/:n/test` `{ test, note }` | **ADMIN** | mark an order as a test (kept out of sales), or take the mark away. Audited |
| `POST /api/analytics/events` `{ consent: true, visitorId, sessionId, events[] }` | public | visitor statistics from the website. Stored only with `consent: true`; known events and field shapes only; at most 20 a batch; always answers 202 |

## Security notes

- Passwords: scrypt (N=32768, r=8, p=3) with a random salt per password. Never logged, never returned.
- Sessions and one-time links: 256-bit random tokens; the database stores only an HMAC of each. Reset links expire in 60 minutes, shop setup links in 72 hours, both work once.
- One-time codes (email and SMS): 6 digits, keyed hash only, 10 minutes, 5 tries, 30-second resend wait, 5 per account per hour, plus rate limits per network address. Never in an API response, never in the log. A failed provider call deletes the code.
- Public password reset covers customers and shops only. Admins reset from the command line.
- Cart: every route needs a session; the cart is chosen by the session's user id, never by an id from the browser; prices, names and availability come from the database, never from the request; quantities are checked against the limit and the stock on the server.
- Payments: the gateway secrets exist only in server environment variables; card numbers, CVV and UPI PINs never reach FrameX and are never stored; amounts come from the server, never from the browser; a payment is accepted only after the checkout signature AND the gateway's own status and amount check; webhooks are verified over the raw body and applied once; an order number only works for its owner.
- Customer photos: stored unchanged under random names outside any served folder; type, size and dimensions read from the file itself; reachable only through HMAC-signed links that name one file and expire in minutes; a link is only made after checking that the asker owns the photo, is staff, or is the shop that makes that order line; staff and shop downloads are audited; a linked file is sent with `nosniff`, `no-store` and a sandboxing Content-Security-Policy.
- Shop products: the owning shop comes from the session; the record is rebuilt by the platform's model (product-type rules, no verification claims); picture addresses are limited to that shop's own uploads and the site's own files.
- Roles are read from the database on every request. Shop routes also check that the Shop ID in the URL is the logged-in shop's own.
- Public sign-up can only create customers. Shops and admins cannot be created through any public endpoint.
- Rate limits on login, sign-up, password reset, applications and place search (in memory: use a shared store if you run several instances).
- Analytics: the reports are ADMIN-only and read-only. The public events endpoint stores nothing without the visitor's consent flag, keeps only known event names and field shapes, never an IP address or an account id, and is rate limited; text from it is escaped wherever the dashboard shows it. Failed logins keep the account aimed at and the reason, never what was typed. No analytics secret exists: the GA4 Measurement ID is public.
- Only approved + active shops are returned by public endpoints. Distances are computed in the database (Haversine, after an indexed latitude / longitude box), never in the browser.

## Layout

```
backend/
  src/server.js            start: config check, database, migrations, listen
  src/app.js               Express app: security, API routes, optional website files
  src/config.js            every setting, from environment variables
  src/db/                  database adapter (pg / PGlite), migrations
  src/catalog/             site-engine.js: the website's catalogue + pricing code, loaded on the server
  src/payments/            index.js (the gateway interface), razorpay.js
  src/lib/                 passwords, tokens, validation, errors, rate limit, security, mailer (email providers), sms (SMS providers), geocoder, geo, audit,
                           storage (files on disk), image-info (format + pixel size from a file's header), file-links (signed, expiring links)
  src/middleware/auth.js   session lookup, requireAuth / requireRole / requireOwnShop
  src/services/            auth-service.js, shop-service.js, catalog-service.js (import, lookups, stock), cart-service.js,
                           address-service.js, checkout-service.js (quote, gift wrapping, place order), order-service.js, payment-service.js,
                           upload-service.js (customer photos), shop-product-service.js (a shop's own products and pictures),
                           shop-order-service.js (a shop's own order lines and their photos)
                           analytics-service.js (what is recorded: visitor events with consent, cart additions, logins, test labels),
                           admin-analytics-service.js (the dashboard's reports, read-only), user-admin-service.js (accounts, a customer's record)
  src/routes/              auth, users, shops, shop-dashboard (a shop's orders, products, pictures), uploads, cart, addresses,
                           checkout, orders, admin, analytics (visitor statistics from the website), misc (health, config, geo, dev mailbox)
  scripts/                 create-admin, seed-dev, migrate, doctor, test-email, test-sms, setup-email (Gmail)
  test/api.test.js         API tests: accounts, shops, password reset (node --test)
  test/cart.test.js        API tests: catalogue import and the cart
  test/checkout.test.js    API tests: checkout, orders, payments, webhooks, refunds
  test/decor.test.js       API tests: Home Decor catalogue and custom-photo sets
  test/photos.test.js      API tests: customer photos, gift wrapping, shop products, shop orders
  test/analytics.test.js   API tests: visitor statistics and consent, the admin reports' figures, date filters, access control
  test/support/            mock-razorpay.js: a stand-in for Razorpay's servers; photos.js: test image files and uploads (tests only)
```

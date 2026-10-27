# FrameX — Architecture

> Living document. Update it whenever the structure, hosting or a service changes (see `rules.md` → "Project docs").
> Last updated: 2026-10-20 (F-04 live, email domain). Deeper references: `docs/ARCHITECTURE.md` (frontend data contract, Live Demo),
> `backend/README.md` (every backend feature, settings and API).

## 1. Overview

```
Visitor's browser
   │  shopframex.in  (GitHub Pages: static HTML / CSS / JS, repo Siburam7/FrameX-None, branch main)
   │  HTTPS + JSON
   ▼
FrameX API  framex-api.onrender.com  (Render web service, free plan, Node.js / Express 5)
   ├── PostgreSQL   Neon (free plan), branch "production", database neondb
   ├── File storage Backblaze B2 bucket (private, S3-compatible) — customer photos, product / review pictures
   ├── Payments     Razorpay (live keys) · Cashfree adapter (not configured live)
   ├── Email        Brevo, sender FrameX <support@shopframex.in> (see §9)
   └── SMS          Fast2SMS (not configured)
```

Free plan: the API sleeps after ~15 idle minutes and needs ~50 s to wake. The pages show the catalogue without the
API after 1.2 s; login, cart and checkout wait for it.
Keeping it awake (F-04, live 2026-10-20; UptimeRobot monitor set up by the owner 15:31): a pinger (UptimeRobot, every 5 min) calls `GET /api/ping`,
which answers without the database and is not a visitor (`app.js`). `lib/activity.js` remembers the last real
request; after `QUIET_AFTER_MINUTES` (15) without one, the database timers in `server.js` (unpaid orders every minute,
paintings hourly, tidy-ups) wait and run once when the next visitor comes, and `/api/health` answers
`checked: false` without a query, so Neon can still sleep (free plan 100 CU-hours/month; awake all month ≈ 180).

## 2. Frontend (repository root)

- Plain HTML / CSS / JavaScript, **no build step**. 38 pages (`*.html`), each sets `<body data-page>`, plus
  `404.html` (GitHub Pages shows it for any wrong address; `<base href="/">` keeps its links working there),
  `robots.txt` and `sitemap.xml` (public pages only; pages with `noindex` are never listed).
- `assets/js/` — `config.js` (API address, session mode), `api/` (HTTP client), `store/` (auth), `ui/` (page
  modules; header / footer / overlays from `ui/chrome.js`), `services/`, `livedemo/`.
- `assets/css/` — `tokens.css` (all colours, fonts, sizes), page and component styles, `mobile.css` (phone-only,
  linked last).
- `js/edit.js`, `js/decor.js`, `js/templates.js`, `js/studio.js` — catalogue and option data (the backend imports
  them into the database at start).
- `assets/vendor/libheif/` — libheif-js 1.23.5 (WebAssembly, LGPL-3.0, its LICENSE beside it): loaded only when a HEIC
  photo is chosen in a browser that can't open one, for the on-screen PREVIEW (`services/upload-service.js`). Needs
  'wasm-unsafe-eval' in the CSP.
- Each page carries a **Content-Security-Policy** `<meta>` (local, not yet deployed; test `backend/test/site-csp.test.js`).

## 3. Backend (`backend/`)

- Node.js, Express 5, ES modules. Entry `src/server.js` (start-up checks + log), `src/app.js` (routes).
- `src/routes/` — auth, users, addresses, cart, checkout, orders, uploads, shops, shop-dashboard, artists,
  paintings, admin, analytics, contact, support (help chat), care (FrameX Care desk), misc (`/api/health`, `/api/config`; `/api/ping` is in `app.js`). `GET /api/shops/:ref?optional=1`
  answers `{ shop: null }` for a catalogue shop that isn't on FrameX (the website asks that way; without the flag: 404).
  Admin coupons: `GET / POST /api/admin/coupons`, `PATCH /api/admin/coupons/:code` (no delete; audited).
  Saved Studio designs: `/api/designs` (the account's own, max 30; photos are the account's uploads). Own data:
  `GET /api/users/me/data`, `POST /api/users/me/delete`.
  Help chat: `/api/support` (logged-in CUSTOMER only: `GET /`, `GET /unread`, `POST /messages` max 2000
  characters, 30 per 10 minutes, optional own order number + topic; `POST /read`); admin `GET /api/admin/support`,
  `GET /api/admin/support/:id`, `POST …/:id/reply`, `POST …/:id/status` (audited). FrameX is emailed
  (ADMIN_NOTIFY_EMAIL, else the admins) at most once per 15 minutes per conversation; an answer is emailed to the
  customer's account address with a `/?chat=1` link. The website asks for new answers every 15 s only while the
  chat is open and the tab is in view (`assets/js/ui/help-chat.js`; admin screen `ui/admin-support.js`).
  FrameX Care live chat (2026-10-24, `services/care-service.js`, `lib/live-bus.js`): customer `POST /api/support/live`
  (WAITING, or NOBODY with reason HOURS / BUSY), `/live/cancel`, `/live/end`, `/live/rate`, `/typing`, `GET /stream`; care desk
  `/api/care` (CARE or ADMIN: `/stream`, `/queue`, `/presence`, `/threads[/:id[/accept|reply|typing|end|status]]`); Admin → Care team
  `GET/POST /api/admin/care-team`, `PATCH /api/admin/care-team/:id` (audited CARE_STAFF_*). Live updates are server-sent
  events kept in the server's memory (one Render instance); the website reads them with fetch (`FrameX.http.stream`) so
  bearer sessions work, and reconnects by itself. CARE_HOURS (default "10-20", India time) and CARE_WAIT_SECONDS (120).
  A waiting request runs out by a timer and on any read (`expireWaiting`). Care people log in on the customer tab with
  their email and land on `admin.html#/live` (the admin panel shows a CARE login only Live chats + Orders).
  Orders for admins and FrameX Care: `/api/admin/orders` is its own router (`staffOrders`, ADMIN or CARE) mounted
  before the admin-only guard; `/orders/:n/test` and `/order-updates` stay admin-only. Changing an order
  (`services/order-edit-service.js`): `GET …/items/:itemId/sizes`, `POST …/items/:itemId/size` { sizeId },
  `POST …/address` (address fields), `GET /api/admin/orders/_/states`. Audited as ORDER_EDITED; refunds / cancels by CARE
  are audited like an admin's.
- `src/services/` — business logic (cart, checkout, orders, payments, payouts, uploads, analytics, settings…).
- `src/db/` — `index.js` (PostgreSQL via `pg` when `DATABASE_URL` is set, else embedded PGlite in `backend/.data`),
  `migrations/001…023` (applied automatically at start, never reset; 013 XUSE10 limits, 014 `users.deleted_at`, 015 `saved_designs`, 016 product approval on, 017 `shops.featured` / `featured_until`, 018 help chat `support_threads` + `support_messages`, one open conversation per customer, 019 CARE role + `users.care_available`, live columns on `support_threads`, SYSTEM messages and `author_name`, 020 HEIC / AVIF:
  `uploads.print_key` + `print_bytes` (the JPEG copy, stored as `<key>-print`), formats heic and avif; 021 `reviews.photo_view_key` (the medium copy of a review photo, `<key>-thumb`); 022 `users.google_sub` + `users.facebook_id` (social login); 023 `promotions` (home banners + promotion strips, Admin → Promotions) — 022-023 local, not deployed), `backup.js`, `ssl.js` (local, not deployed).
- `src/payments/` — one payment system, gateway adapters `razorpay.js`, `cashfree.js`.
- `src/lib/` — security (CORS, CSRF, cookies), storage (disk or bucket), sealed (AES-256-GCM for payout details),
  frame-cutout.js (a frame's front picture: plain background outside + photo space inside made transparent, the space found),
  social-login.js (Google ID token via Google's keys; Facebook token via debug_token + appsecret_proof), mailer, sms, file links (signed URLs; `o:1` in a token = the original of a HEIC / AVIF photo), `heif.js` (HEIC via
  libheif-js, AVIF via sharp → one full-quality JPEG copy; `toView` → the medium WebP copy of a review photo, 1600 px;
  one at a time, max 60 MP).
- Tests: `node --test` (`npm test`), in-memory database, stand-in gateways and bucket (`test/support/`).
  GitHub runs them for every push and pull request (`.github/workflows/tests.yml`, Node 24, no secrets, never deploys).

## 4. Data

- 42 tables + `schema_migrations` (018 added 2); sequences for Shop IDs, order numbers, artist codes, painting requests, payouts.
- Tables refer to each other in circles (users ↔ shops ↔ shop applications, users ↔ artists).
- Prices, totals and payment state are computed and stored by the server only.

## 5. Sessions and security

- Session token is random; only its HMAC is stored. httpOnly + Secure + SameSite=Lax cookie on `/api`.
- Live site and API are different sites, so today the live site uses **bearer mode** (token in `localStorage`,
  `AUTH_ALLOW_BEARER=true`). Plan: API at `api.shopframex.in` → cookie mode automatically (code ready locally).
- CSRF: state-changing requests need `X-FrameX-Client` and an allowed Origin. CORS allow-list from `CORS_ORIGINS`.
- Payout bank / UPI details sealed with `PAYOUT_ENCRYPTION_KEY` (32 bytes). Customer photos only via signed links.

## 6. Environments

| Where | What |
| --- | --- |
| Owner's laptop | Backend `start-backend.bat` on **:4000** (embedded DB `backend/.data`), VS Code Live Server **:5500** |
| Browser tests | Throw-away backend on **:4100** + stand-in Razorpay **:4010** / Cashfree **:4011**, fresh DB per run |
| Production | GitHub Pages + Render + Neon + B2 (above). Render auto-deploys on push to `main`; service is NOT Blueprint-managed (`render.yaml` is not applied by Render). |

## 7. Deployment

- Website: GitHub Pages, Source "GitHub Actions" (since 2026-10-20): `.github/workflows/pages.yml` publishes only
  `*.html`, `assets/`, `js/`, `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml` on every push to `main` (or Actions →
  Website → Run workflow). backend/, docs/ and the .bat files are no longer served. A new top-level website file must
  be added to that copy list. Going back: Source "Deploy from a branch", main, / (root).
- Backend: push to `main` → Render redeploys → migrations run at start.
- Settings live in Render → Environment (typed by the owner; never in Git).

## 8. Backups

- Production: `pg_dump --format=custom` taken 2026-10-19 by the owner, encrypted `.7z`, restore-tested in an isolated
  in-memory PostgreSQL 18 (all tables, rows, sequences, constraints, indexes matched).
- Tool (local, not deployed): `backup-live-db.bat` / `npm run db:backup` (encrypted `.fxdb`) and `npm run db:restore`
  (only into an empty database).
- Photos live in B2 (not in the database backup). Keep `PAYOUT_ENCRYPTION_KEY` safe: backups need it to open payout details.
- 2026-10-20 15:06: `backup-live-db.bat` run against Neon by the owner before the deploy (first real run; worked):
  `Desktop\FrameX-backups\framex-db-live-20261020-1506.fxdb` (locked with the owner's passphrase).

## 8b. Finding shops (Home + Shop page, 2026-10-21)

- `assets/js/ui/shops.js` runs the shops section on both pages (Home: `data-limit="3"`). No location: `GET /api/shops`
  "recommended" order (featured first, then shops with products on sale, `md5(day || shop_code)` so it changes once a
  day, India time). With a location: Home = nearest three wherever they are; Shop page = `/api/shops/nearby` within the
  chosen distance, or the nearest three when none is that close. One search box: `q` (name, area, city, state, PIN);
  no match → place search (`/api/geo/search`) → shops near that place.
- `services/location.js` keeps the location in sessionStorage (this tab only; `{ off: true }` after "Clear location"
  so the tab doesn't use it again). When the browser already granted the permission (Permissions API), the nearest
  shops are shown without a click; otherwise nothing is asked until "Use my location".
- Featured: `shops.featured` + `featured_until` (timestamptz, end of the chosen day IST), set in Admin → Shops → the
  shop → Featured (`POST /api/admin/shops/:id/featured`, audit `SHOP_FEATURED`). Public JSON says only `featured`.

## 9. Email (domain shopframex.in, set up 2026-10-20)

```
Website / backend ──Brevo API──► customer         From: FrameX <support@shopframex.in>  (Render EMAIL_FROM)
customer ──mail to support@shopframex.in──► ImprovMX (MX) ──forward──► support.framex@gmail.com (business Gmail)
```

- **Sending (website emails):** Brevo. The domain is authenticated in Brevo (manual setup, no branded subdomain), so
  emails are DKIM-signed by shopframex.in ("signed-by shopframex.in" in Gmail) and land in the inbox. Sender
  `FrameX <support@shopframex.in>` is verified in Brevo. The old sender `shop.framex@gmail.com` is still listed
  (not used; kept).
- **Why not a @gmail.com sender:** Brevo sending "as gmail.com" fails Gmail's own checks (Gmail address, not sent by
  Google) → spam, no profile picture; Brevo itself warns "freemail domain is not recommended"; Google/Yahoo/Microsoft
  require bulk senders to use their own authenticated domain. A domain address is also the one customers can trust,
  and it stays the same if the inbox behind it changes (only the ImprovMX forwarding changes).
- **Receiving:** ImprovMX free plan (no card). Catch-all alias `*@shopframex.in` → `support.framex@gmail.com`
  (moved from the owner's personal Gmail 2026-10-20). There is no separate inbox for support@: mail to it is read in
  that Gmail. Gmail filter there (and in the personal Gmail): to `@shopframex.in` → never spam.
- **Replying as support@:** not set up yet. Today a reply from Gmail goes out as `support.framex@gmail.com`.
  Possible for free: Gmail → Settings → Accounts → "Send mail as" `support@shopframex.in` through Brevo's SMTP relay
  (`smtp-relay.brevo.com`, port 587, the Brevo SMTP login and an SMTP key made in Brevo → SMTP & API; the key is a
  secret, typed only into Gmail). It shares Brevo's free daily limit (300) with the website emails.
- **Profile picture (DP):** a Google account for `support@shopframex.in` (made with "use your existing email"; it has no
  Gmail inbox of its own) with the owner's picture (white F + orange square on black). Gmail can take hours to a day to
  show it, and mostly shows it to people who have the address in their contacts or have written to it (a logo for
  everyone = BIMI: needs a paid VMC/CMC certificate and a registered trademark). Recovery: Google uses the account's
  own address (it can't have another recovery email), so it depends on the domain + ImprovMX forwarding.
- **DNS at GoDaddy (shopframex.in):**

  | Type | Name | Value | For |
  | --- | --- | --- | --- |
  | TXT | @ | `brevo-code:…` | Brevo domain check |
  | CNAME | brevo1._domainkey | `b1.shopframex-in.dkim.brevo.com` | DKIM (Brevo) |
  | CNAME | brevo2._domainkey | `b2.shopframex-in.dkim.brevo.com` | DKIM (Brevo) |
  | MX | @ | `mx1.improvmx.com` (10), `mx2.improvmx.com` (20) | receiving (ImprovMX) |
  | TXT | @ | `v=spf1 include:spf.improvmx.com include:spf.brevo.com ~all` | SPF (one record for both) |
  | TXT | _dmarc | `v=DMARC1; p=quarantine; …` (was already there) | DMARC — keep only one |

  Also there and needed: 4 A records + CNAME `www` → `siburam7.github.io` (website), NS / SOA (GoDaddy).
  Never add a second SPF or a second `_dmarc`. GoDaddy auto-renew is OFF; the domain expires 2027-10-09.
- **On the website:** the public contact address is `support@shopframex.in` (`assets/data/site.seed.js` → footer,
  Contact page; Privacy Notice and Terms). Contact-form alerts go to `ADMIN_NOTIFY_EMAIL` (Render) or, when empty, to
  every admin account's email; the visitor's address is the Reply-To.
- **Design:** one template for every email (`htmlEmail()` in `backend/src/lib/mailer.js`), see `design.md` §5c.

# FrameX backend (Step 1)

Accounts, roles, shop onboarding and nearby-shop search for the FrameX website.
The website stays a static site (GitHub Pages); this is a separate Node.js service it talks to over HTTPS.

- **Stack:** Node.js 20+ · Express 5 · PostgreSQL
- **What it does:** customer sign-up / login / logout, forgot and reset password, shop applications, admin approval and shop account creation, shop and admin dashboards' APIs, nearby shops with real distances, audit log
- **What it does not do (Step 2):** products, cart, orders, payments, templates, FrameX Studio storage

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

## Create an admin

There is no admin sign-up. Admins are created from the command line by someone with access to the server:

```bash
npm run admin:create                 # asks for name, email and a password (12+ characters)
# hosts without an interactive terminal:
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:create -- --from-env
```

Log in on the website's login page with that email, then open `admin.html`.

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
| `ADMIN_NOTIFY_EMAIL` | no | gets a note when a shop applies |
| `GEOCODER_PROVIDER` | no | `nominatim` (OpenStreetMap place search) or `none` |
| `GEOCODER_CONTACT_EMAIL` | with nominatim | required by Nominatim's usage policy |
| `MAP_PROVIDER_KEY` | no | reserved for a future map provider |
| `NEARBY_DEFAULT_RADIUS_KM`, `NEARBY_RADIUS_OPTIONS_KM` | no | the one place search distances are configured (`25`, `5,10,25,50`) |

A production server refuses to start without `AUTH_SECRET`, a database, `FRONTEND_URL` and `CORS_ORIGINS`, or with a `dev` provider. Missing email / SMS credentials do not stop it: accounts keep working and password reset reports "… service is not configured." until they are filled in.

The older names `EMAIL_PROVIDER_KEY` and `SMS_PROVIDER_KEY` are still read.

## Deploy

The website stays on GitHub Pages. The backend needs a host that runs Node.js, and a PostgreSQL database. One practical setup:

1. **Database:** create a free PostgreSQL database (for example Neon, Supabase or Render Postgres) and copy its connection string.
2. **Backend:** create a Node web service from this repository (for example on Render: the `render.yaml` in the repository root describes it). Root directory `backend`, build `npm ci`, start `npm start`.
3. **Environment variables** on the host (typed into the host's dashboard, never into Git): `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL=require`, `AUTH_SECRET`, `FRONTEND_URL` (the website's address, e.g. `https://siburam7.github.io/FrameX-None`), `CORS_ORIGINS` (its origin, e.g. `https://siburam7.github.io`), `SERVE_FRONTEND=false`, `TRUST_PROXY=1`, `AUTH_ALLOW_BEARER=true`, the email settings (`EMAIL_PROVIDER=brevo`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`) and the SMS settings (`SMS_PROVIDER=fast2sms`, `SMS_API_KEY`).
4. **First admin:** run `npm run admin:create -- --from-env` once in the host's shell with `ADMIN_EMAIL` / `ADMIN_PASSWORD` set, then remove those two variables.
5. **Website:** in `assets/js/config.js` set `PRODUCTION_API_URL` to the backend's address + `/api` and `session: "bearer"`, and push to GitHub.
6. **Check delivery** in the host's shell: `npm run doctor`, `npm run email:test -- you@example.com`, `npm run sms:test -- <your number>`. Then reset a password on the live website once by email and once by mobile.

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
| `GET /api/shops/:shopCode/dashboard`, `PATCH /api/shops/:shopCode/profile` | **SHOP**, own shop only | the shop's data; phone, description, pickup / delivery |
| `GET /api/geo/search?q=` | anyone | place search for a typed location |
| `GET /api/admin/overview` | **ADMIN** | counts |
| `GET /api/admin/applications[?status=]`, `GET …/:id` | **ADMIN** | applications |
| `POST /api/admin/applications/:id/review` \| `/reject` \| `/approve` | **ADMIN** | approve creates the shop, its Shop ID and its login |
| `GET` / `POST /api/admin/shops`, `GET` / `PATCH /api/admin/shops/:id` | **ADMIN** | list, add, view, edit (information and location) |
| `POST /api/admin/shops/:id/activate` \| `/deactivate` \| `/approval` | **ADMIN** | status |
| `POST /api/admin/shops/:id/credentials` \| `/account` | **ADMIN** | new one-time password link; enable / disable the login |
| `GET /api/admin/audit` | **ADMIN** | audit log |

## Security notes

- Passwords: scrypt (N=32768, r=8, p=3) with a random salt per password. Never logged, never returned.
- Sessions and one-time links: 256-bit random tokens; the database stores only an HMAC of each. Reset links expire in 60 minutes, shop setup links in 72 hours, both work once.
- One-time codes (email and SMS): 6 digits, keyed hash only, 10 minutes, 5 tries, 30-second resend wait, 5 per account per hour, plus rate limits per network address. Never in an API response, never in the log. A failed provider call deletes the code.
- Public password reset covers customers and shops only. Admins reset from the command line.
- Roles are read from the database on every request. Shop routes also check that the Shop ID in the URL is the logged-in shop's own.
- Public sign-up can only create customers. Shops and admins cannot be created through any public endpoint.
- Rate limits on login, sign-up, password reset, applications and place search (in memory: use a shared store if you run several instances).
- Only approved + active shops are returned by public endpoints. Distances are computed in the database (Haversine, after an indexed latitude / longitude box), never in the browser.

## Layout

```
backend/
  src/server.js            start: config check, database, migrations, listen
  src/app.js               Express app: security, API routes, optional website files
  src/config.js            every setting, from environment variables
  src/db/                  database adapter (pg / PGlite), migrations
  src/lib/                 passwords, tokens, validation, errors, rate limit, security, mailer (email providers), sms (SMS providers), geocoder, geo, audit
  src/middleware/auth.js   session lookup, requireAuth / requireRole / requireOwnShop
  src/services/            auth-service.js, shop-service.js
  src/routes/              auth, users, shops, admin, misc (health, config, geo, dev mailbox)
  scripts/                 create-admin, seed-dev, migrate, doctor, test-email, test-sms, setup-email (Gmail)
  test/api.test.js         API tests (node --test)
```

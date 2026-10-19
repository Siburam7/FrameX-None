# FrameX — Architecture

> Living document. Update it whenever the structure, hosting or a service changes (see `rules.md` → "Project docs").
> Last updated: 2026-10-20 (account deletion). Deeper references: `docs/ARCHITECTURE.md` (frontend data contract, Live Demo),
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
   ├── Email        Brevo
   └── SMS          Fast2SMS (not configured)
```

Free plan: the API sleeps after ~15 idle minutes and needs ~50 s to wake. The pages show the catalogue without the
API after 1.2 s; login, cart and checkout wait for it.

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
- Each page carries a **Content-Security-Policy** `<meta>` (local, not yet deployed; test `backend/test/site-csp.test.js`).

## 3. Backend (`backend/`)

- Node.js, Express 5, ES modules. Entry `src/server.js` (start-up checks + log), `src/app.js` (routes).
- `src/routes/` — auth, users, addresses, cart, checkout, orders, uploads, shops, shop-dashboard, artists,
  paintings, admin, analytics, contact, misc (`/api/health`, `/api/config`). `GET /api/shops/:ref?optional=1`
  answers `{ shop: null }` for a catalogue shop that isn't on FrameX (the website asks that way; without the flag: 404).
  Admin coupons: `GET / POST /api/admin/coupons`, `PATCH /api/admin/coupons/:code` (no delete; audited).
- `src/services/` — business logic (cart, checkout, orders, payments, payouts, uploads, analytics, settings…).
- `src/db/` — `index.js` (PostgreSQL via `pg` when `DATABASE_URL` is set, else embedded PGlite in `backend/.data`),
  `migrations/001…014` (applied automatically at start, never reset; 013 sets the XUSE10 limits, 014 adds `users.deleted_at`), `backup.js`, `ssl.js` (local, not deployed).
- `src/payments/` — one payment system, gateway adapters `razorpay.js`, `cashfree.js`.
- `src/lib/` — security (CORS, CSRF, cookies), storage (disk or bucket), sealed (AES-256-GCM for payout details),
  mailer, sms, file links (signed URLs).
- Tests: `node --test` (`npm test`), in-memory database, stand-in gateways and bucket (`test/support/`).
  GitHub runs them for every push and pull request (`.github/workflows/tests.yml`, Node 24, no secrets, never deploys).

## 4. Data

- 40 tables + `schema_migrations`; sequences for Shop IDs, order numbers, artist codes, painting requests, payouts.
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

- Website: GitHub Pages "Deploy from a branch" (whole repo served today). Prepared locally: `.github/workflows/pages.yml`
  publishes only `*.html`, `assets/`, `js/`, `CNAME`, `robots.txt`, `sitemap.xml` once the Pages source is switched to
  "GitHub Actions". A new top-level website file must be added to that copy list.
- Backend: push to `main` → Render redeploys → migrations run at start.
- Settings live in Render → Environment (typed by the owner; never in Git).

## 8. Backups

- Production: `pg_dump --format=custom` taken 2026-10-19 by the owner, encrypted `.7z`, restore-tested in an isolated
  in-memory PostgreSQL 18 (all tables, rows, sequences, constraints, indexes matched).
- Tool (local, not deployed): `backup-live-db.bat` / `npm run db:backup` (encrypted `.fxdb`) and `npm run db:restore`
  (only into an empty database).
- Photos live in B2 (not in the database backup). Keep `PAYOUT_ENCRYPTION_KEY` safe: backups need it to open payout details.

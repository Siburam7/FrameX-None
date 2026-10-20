# FrameX — Tasks

> Update this file after every piece of work: move items, add new ones, record dates.
> Last updated: 2026-10-20 (F-11, F-13, F-14).

## Now

- [ ] **Finish the pending website design and development** (owner will give the tasks). Existing design stays.
- [x] 2026-10-19 Small fixes 1-7 (F-01, F-06, F-21, F-20, F-25, F-27, F-26) — local
- [x] 2026-10-20 F-12 coupons: XUSE10 limits + admin Coupons screen — local (backend 391/391; browser: new 16/16, coupon 25, CSP 8, payout 38, frame 55)
- [x] 2026-10-20 Owner: the limits must NOT be shown in advance — banner and coupon title without them; the ₹499 cap
      is applied quietly ("you save ₹499"); a second use shows "You have already used the coupon XUSE10." (browser 20/20)
- [x] 2026-10-20 F-23 automatic tests on GitHub + F-24 README test count — local
- [x] 2026-10-20 F-16 account deletion + data download — local (backend 398/398; browser 13/13)
- [x] 2026-10-20 F-17 Studio designs saved in the account — local (backend 406/406; browser: designs 14/14, Studio 37, decor 26, frame 55, CSP 8)
- [x] 2026-10-20 F-11 photos 15 days after finish, F-14 product approval on, F-13 darker orange — local (backend 414/414, shop browser suite 50/50)
- [x] 2026-10-20 Button orange = the logo "X" orange #ff5a1f (owner: #b45309 didn't look good), then "a little faded": #ff6a35, hover #f0501a — local
- [x] 2026-10-20 Home "Make it yours" tiles compact on phones: a list (274px) didn't look good to the owner; owner chose option 1 of 3 from a picture: the three side by side, picture + short name (696px → 159px tall); laptop screenshot identical — local
- [x] 2026-10-20 Phone: swiping rows felt loose and the page got stuck when scrolling over them (owner report) — the rows
      no longer scroll up/down (`overflow-y: hidden`, phones only); finger-swipe test reproduces the bug without the fix,
      passes with it; sideways swipe still works; nothing looks different — local
- [x] 2026-10-20 F-04 pinger support: `/api/ping`, quiet-time database jobs, quiet `/api/health` — local (backend 419/419;
      real server ping 2/2; browser frame 55, shop 50)
- [ ] Next candidates (owner chooses)

## Waiting for the end of development (one combined step, owner's approval needed)

- [ ] Final diff review of all local changes (Phase 2A + new work)
- [ ] Full tests: `npm test` + browser suites on the :4100 throw-away backend
- [ ] Merge `phase2a-wip` into `main` and push (owner approves) — this is the step that goes live
- [ ] Staged deployment (owner approves each stage):
  1. Backend — check the Render log: `Database link`, `Payouts`, `bucket is private`, `Stored files`
  2. Website — pages load, login works, Razorpay window opens without paying, no CSP errors in the console
  3. Pages workflow — commit `.github/workflows/pages.yml`, switch Settings → Pages → Source to "GitHub Actions"
- [ ] Final production backup after development (owner paused it)

## Phase 2A — done locally, NOT committed / pushed / deployed

On branch `phase2a-wip` (pushed 2026-10-20; not live — `main` = `eb23ecf` is what runs). `npm test` 391/391 on 2026-10-20.

- [x] F-08 Content-Security-Policy on all 38 pages (+ test)
- [x] F-10 `render.yaml` production values `sync: false` (no effect today: Render is not Blueprint-managed)
- [x] F-02 Backup / restore tools: `backup-live-db.bat`, `npm run db:backup` (passphrase ≥ 10 chars, always
      encrypted), `npm run db:restore` (empty databases only, refuses unlocked files) (+ tests)
- [x] F-05 Payout key readiness check (admin-only `ready`, start-up log) (+ tests)
- [x] F-28 Start-up checks: bucket private, files the database knows are in storage (+ tests)
- [x] F-09 Pages workflow publishing only website files (not active until the Pages source is switched)
- [x] F-07 Cookie-login readiness for `api.shopframex.in` (+ real-browser test of both modes)
- [x] Database SSL: certificate always checked unless `no-verify` is written out (+ tests)

## Owner actions (not code)

- [ ] **Required:** copy the encrypted `.7z` backup to a pen drive or Google Drive (C: and D: are the same SSD)
- [ ] **Required:** keep the `.7z` passphrase in a password manager
- [ ] **Required before deploy:** B2 bucket — check "Private" and the lifecycle option (look only)
- [ ] **After deploy (F-04):** UptimeRobot free monitor → `https://framex-api.onrender.com/api/ping`, every 5 minutes
      (not before the deploy; never `/api/health`). Before that, check in Render that this is the only free service
      (750 free hours a month per workspace; one awake all month ≈ 744) and which Health Check Path is set (look only)
- [ ] **Blocked until approved:** add `PAYOUT_ENCRYPTION_KEY` on Render (sellers can't save payout accounts until then)
- [ ] Optional: restore test on a Neon `restore-test` branch
- [ ] Optional: decide about the extra unencrypted `.dump` copies and the code copy with `.env` in
      `Desktop\FrameX-Complete-Backup` (never upload them)
- [ ] Later: API at `api.shopframex.in` (Render custom domain + DNS) for cookie login

## Open findings from the Phase 1 audit (2026-10-17)

| ID | Item | State |
| --- | --- | --- |
| F-01 | Templates page says "We'll ask for your photos after you order" but the cart requires them | **done locally 2026-10-19** (text fixed on `template.html`, `templates.html`) |
| F-03 | Razorpay live flow (payment → webhook → paid → refund) never proven | open — needs a real small payment, owner decides |
| F-04 | Render free plan cold starts (~50 s) | **done locally 2026-10-20** (owner: pinger): `GET /api/ping` (no database, not a visitor); database jobs wait during quiet times (`QUIET_AFTER_MINUTES` 15) and `/api/health` skips its query then, so Neon still sleeps (`keep-awake.test.js`). Owner step after deploy: UptimeRobot monitor on `/api/ping` every 5 min (backend/README → "Keep a free host awake") |
| F-06 | Cart says items from different shops are ordered separately; checkout makes one order | **done locally 2026-10-19** (cart drawer note + FAQ answer now say: one order, each shop sends its own items) |
| F-11 | Order photos kept forever; Privacy Notice doesn't say how long | **done locally 2026-10-20** (owner: 15 days): photos of an order / custom painting are deleted 15 days after it is finished (delivered, cancelled, returned, declined), unless still used (another unfinished order, cart, saved design); the order shows "Removed". `ORDER_PHOTO_DAYS=15`. Privacy Notice updated |
| F-12 | XUSE10 coupon has no limits, no admin coupon screen | **done locally 2026-10-20**: migration `013_xuse10_limits.sql` (XUSE10: max ₹499, once per customer, no end date — owner's values); admin → **Coupons** (list with uses + total given, create, change, switch on/off; no delete); banner and coupon title do NOT show the limits (owner); the cap is applied quietly, a 2nd use shows "You have already used the coupon XUSE10." Deploy note: migration 013 changes the LIVE XUSE10 row |
| F-13 | Orange button contrast 2.84:1 | **done locally 2026-10-20**: first #b45309 (option 2 of 4 shades), then the owner asked for the same orange as the logo "X" (#ff5a1f), then "a little faded": `--amber-strong` #ff6a35, hover `--amber-deep` #f0501a; Razorpay window colour too. White text on it is 2.85:1 (owner's choice; below the 4.5:1 guideline for small text) |
| F-14 | Product moderation off | **done locally 2026-10-20** (owner: approval needed): admin setting "Shop products need FrameX approval" (Admin → Settings), switched on by migration 016; products already on sale stay on sale. Fixed with it: an approved product stayed hidden on the website (isVisible was left false) |
| F-15 | SMS not configured | open — Fast2SMS (DLT) or hide phone option |
| F-16 | No account deletion / data download | **done locally 2026-10-20**: Account → Your data → Download my data (one JSON file) and Delete my account (customers; password + DELETE; refused while an order / painting is under way; login, addresses, photos, cart go; orders and paintings kept for tax without name, email, phone, address; reviews without name). Migration 014 (`users.deleted_at`). Privacy Notice §8 updated |
| F-17 | Studio designs saved in the browser only | **done locally 2026-10-20**: logged in → "Save design" keeps it in the account with its photos (`/api/designs`, migration 015, max 30), so it opens on any device; not logged in → this browser, as before (marked "this device only"); saving it again after logging in moves it into the account. Photos a saved design uses are kept (not tidied away, not deletable). Account deletion removes designs; the data download lists them |
| F-18 | 18% tax added at checkout — check GST registration with a CA | open — owner / CA |
| F-20 | No custom 404 / robots.txt / sitemap.xml | **done locally 2026-10-19** (`404.html` in the site's design, `robots.txt`, `sitemap.xml` with 17 public pages; the Pages workflow copies them) |
| F-21 | `noindex` missing on `artist-dashboard`, `paintings`, `painting` | **done locally 2026-10-19** |
| F-25 | Old-order email asked customers to send photos on WhatsApp | **done locally 2026-10-19** (now: "FrameX will contact you… please don't send photos by WhatsApp or email") |
| F-26 | Small a11y issues | **done locally 2026-10-19**: labels on the admin On/Off settings, hidden `h1` on empty checkout and "order not found". The other crawl flags were false positives (text inside closed `<details>`, home `h1` is visually hidden on purpose, offer dots already have a 24 px touch area, card titles have a bigger equivalent link) |
| F-27 | Product / shop page asked the API for a catalogue shop not on FrameX and got a 404 | **done locally 2026-10-19** (`GET /api/shops/:ref?optional=1` answers `{ shop: null }`; older API still works) |
| F-23 | No CI | **done locally 2026-10-20**: `.github/workflows/tests.yml` runs `npm test` on GitHub for every push / pull request (tests only, no deploy, no secrets). First real run on GitHub: when the branch is pushed next |
| F-24 | Outdated test count in README | **done locally 2026-10-20** (391 tests; per-file counts corrected) |
| F-19, F-22 | Partial-refund payouts by hand, many unminified scripts | open |
| F-29 | View on My Wall / tilt never tried on a real phone | open — owner tests on Android + iPhone |
| F-30 | Cashfree only against a stand-in | open — only if Cashfree will be used |

## Done (recent)

- 2026-10-19 Website fixes F-01, F-06, F-20, F-21, F-25, F-26, F-27 (local, uncommitted; browser check 21/21;
  regression 2026-10-20: CSP 8/8, all-pages crawl clean, frame 55, decor 26, shop 47, payout 38; `npm test` all pass).
  Note: `index.html` was re-wrapped by an editor's formatter (the CSP tag over two lines); tests now accept that.

- 2026-10-19 Production `pg_dump` backup by the owner; encrypted `.7z` verified (CRC OK, SHA-256 identical);
  isolated restore test PASS (41 tables, 1,398 rows, sequences, 68 PK/unique, 65 FKs, 74 indexes; schema = code).
- 2026-10-19 Owner reset the Neon password and updated Render `DATABASE_URL`; health check OK.
- 2026-10-18/19 Phase 2A safety fixes (local, above).
- 2026-10-17 Phase 1 audit; payouts + new-order alerts (`eb23ecf`, pushed); dark mode; join-artist page; tilt/360° hero.

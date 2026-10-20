# FrameX — Tasks

> Update this file after every piece of work: move items, add new ones, record dates.
> Last updated: 2026-10-20 (deploy, pinger, email domain).

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
- [x] 2026-10-20 Emails in the "orange line" look (owner's final pick of 3; "light and clean" first): white header with
      an orange line on top and a navy logo (new `logo-framex-email-dark.png`), grey page, light-orange code box, new orange button — local (backend 419/419; rendered and checked at 390/760px)
- [x] Email profile picture (owner: yes): send from a shopframex.in address authenticated in Brevo (DNS records),
      then a Google account for that address with the logo as its photo (Gmail usually shows it; not guaranteed).
      Why it is missing now: From is a @gmail.com address sent through Brevo, which Gmail can't verify
      [x] 2026-10-20 owner added in GoDaddy DNS (checked in public DNS): TXT @ `brevo-code:…`, CNAME `brevo1._domainkey` →
          `b1.shopframex-in.dkim.brevo.com`, CNAME `brevo2._domainkey` → `b2.shopframex-in.dkim.brevo.com`; the existing
          `_dmarc` (p=quarantine) was kept and Brevo accepted it. Brevo: "Your domain has been authenticated" (manual setup,
          no branded subdomain). Next: an inbox for the sender address, a Brevo sender, EMAIL_FROM on Render, the Google photo
      [x] 2026-10-20 sender address chosen by the owner: `support@shopframex.in`. Inbox: ImprovMX free (no card),
          catch-all `*@shopframex.in` → the owner's Gmail; GoDaddy: MX `@` 10 `mx1.improvmx.com`, 20 `mx2.improvmx.com`,
          TXT `@` `v=spf1 include:spf.improvmx.com include:spf.brevo.com ~all` (there was no SPF before). ImprovMX: Active.
          Next: test mail to support@, Brevo sender, EMAIL_FROM on Render (with the email design deploy), Google photo
      [x] 2026-10-20 test mail to support@ forwarded (ImprovMX log: delivered in 6 s; landed in Gmail spam → owner made a
          Gmail filter "to @shopframex.in: never spam"). Brevo sender `FrameX <support@shopframex.in>`: Verified, DKIM
          shopframex.in ✓, DMARC ✓ (the old `shop.framex@gmail.com` sender is kept, not deleted).
          [x] email design live (5c2fcc2); owner set EMAIL_FROM = `FrameX <support@shopframex.in>` on Render (17:16 deploy).
          Test reset email: from support@shopframex.in, signed-by shopframex.in, Inbox. Owner: in phone Gmail dark mode the
          navy logo disappeared → logo now on a white rounded badge (`logo-framex-email-badge.png`) — local.
          [x] badge logo live (ad19c05, 17:25). [x] Google account for support@shopframex.in ("FrameX", made with the
          existing-email option; the owner's own phone was refused as "used too many times", another number worked) with the
          owner's own picture (white F + orange square on black). 18:20 owner moved the ImprovMX catch-all to the business
          Gmail `support.framex@gmail.com` (alias `*` re-created; test mail arrived in its Primary inbox). Gmail may take hours to a day to show it; check with a
          new reset email. Owner: add a recovery email (Security & sign-in) to that account
      Note: GoDaddy auto-renew is OFF; shopframex.in expires 2027-10-09 — remind the owner before then
- [x] 2026-10-20 Website contact address: `support.framex@gmail.com` → `support@shopframex.in` (owner) in
      `assets/data/site.seed.js` (footer on every page, Contact page, art pages) and the Privacy Notice / Terms; mail to it
      reaches support.framex@gmail.com through ImprovMX. Checked: footer, Contact, Privacy, Terms 4/4, CSP 8/8 — local
- [x] 2026-10-20 18:45 owner added Render `ADMIN_NOTIFY_EMAIL=support@shopframex.in` (it was not set: alerts went to the
      admin account emails). Contact-form messages and shop/artist application alerts now reach support.framex@gmail.com.
      Email roles (owner): support.framex@gmail.com = customer issues; shop.framex@gmail.com = main business account
- [ ] 5 of 25 stored files missing (live log since the 2026-10-20 deploy): the start-up check now prints what each
      missing file belonged to (order number + status, "STILL UNDER WAY" first; shop / product; review) — local, backend
      420/420. Next: deploy, read the Render log, then decide per file (ask the customer for the photo again if an order
      is still under way)
- [ ] Optional (owner asked how): reply FROM support@shopframex.in — Gmail "Send mail as" through Brevo SMTP (free,
      ~10 min, steps in architecture.md §9). Today replies leave as support.framex@gmail.com
- [ ] Owner: recovery email on the support@shopframex.in Google account; check the Gmail DP with a new reset email
- [ ] F-15 SMS / WhatsApp OTP: owner put it aside 2026-10-20 (WhatsApp idea explained: ~₹0.12-0.35 a message,
      needs Meta business verification, a new number and a payment method; the grey SMS button stays for now)
- [ ] Next candidates (owner chooses)

## Waiting for the end of development (one combined step, owner's approval needed)

- [x] 2026-10-20 Final review of everything `main` (eb23ecf) doesn't have yet (123 files, 7 commits, fast-forward):
      migrations 013-016 only add (one transaction; the old code ignores the new rows/columns, so a rollback is safe);
      CSP allows the live API, Razorpay, Google Fonts, GA4 (photos come through the API, no bucket address needed);
      the only new start-up check is DATABASE_SSL (owner: Render has `require` = accepted)
- [x] 2026-10-20 Full tests: backend 419/419; browser frame 55, Studio 37, decor 26, shop 50, payout 38, coupon 25,
      coupon admin 20, designs 14, account 13, fixes 21, phone rows 4, CSP 8; all-pages crawl: no script errors, no CSP
      blocks (remaining flags are the known false positives: hidden home h1, buttons inside closed <details>, test 404s)
- [x] **Deploy 2026-10-20: LIVE** (`main` = a15c350; owner approved each step)
  0. [x] Owner: fresh production backup 2026-10-20 15:06 with `backup-live-db.bat` (its first run against Neon: worked;
     locked file `DesktopFrameX-backupsramex-db-live-20261020-1506.fxdb`, 180 KB; 12 orders, 7 users, 247 products)
  1. [x] 2026-10-20 15:09 owner said "deploy kar do": `main` fast-forwarded eb23ecf → a15c350 and pushed;
     Merge `phase2a-wip` into `main` (fast-forward) and push: Render redeploys the API and GitHub Pages the website
     at the same time (for 1-2 minutes new pages may talk to the old API)
  2. [x] 15:10 live API answers `/api/ping` {ok:true} and `/api/health` {database: postgres, checked: true};
     [x] owner's Render log (15:09:56): migrations up to 016 applied, database link encrypted + certificate checked,
     email READY, Razorpay LIVE, COD ON, bucket PRIVATE (owner check done), SMS not configured (F-15), payouts NOT READY
     (key blocked, as agreed). FINDING: "Stored files: 5 of 25 files the database knows are MISSING from the storage" —
     first time this check ran live (new in this deploy); not caused by the deploy (the photo tidy-up marks a row DELETED
     before removing its file, and DELETED rows aren't counted). Likely files kept on Render's disk before the bucket
     (2026-10-10). Open: which records (an order still under way?) — a read-only lister was offered to the owner.
     Backend: Render log shows migrations 013-016, `Database link`, `Payouts`, `bucket is private`, `Stored files`,
     `listening`; `/api/ping` and `/api/health` answer
  3. [x] Website as a visitor (read-only crawl of shopframex.in): 17 pages × laptop + phone, no script errors, no
     CSP blocks, new code served; GitHub runs on `main`: Tests, "Website" workflow and the branch build all green
     (the site is still served from the branch: `backend/README.md` answers 200 until step 5).
     [x] owner checked on the live site: login, cart, Razorpay window — all work (no payment made)
  4. [x] After deploy: UptimeRobot on `/api/ping` (F-04, done 15:31); the Pages workflow's first run fails until step 5 (expected)
  5. [x] 2026-10-20 19:18 owner switched Settings → Pages → Source to "GitHub Actions" and ran "Website" (#5, success).
     Live: website files 200; backend/, docs/, render.yaml, README.md, *.bat, CLAUDE.md now 404; 16 pages × laptop +
     phone load with no script errors or CSP blocks (unknown pages show the FrameX 404 page). Going back: Source
     "Deploy from a branch", main, / (root)
  Rollback: Render → Deploys → Rollback to eb23ecf; website: revert the merge on `main`. Migrations can stay.
  Expected right after start: photos of orders finished 15+ days ago are deleted (F-11); new shop products need approval (F-14)
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
- [x] 2026-10-20 15:31 done by the owner: UptimeRobot monitor on `https://framex-api.onrender.com/api/ping`, every 5 min,
      email alerts, first check Up. Watch Neon's CU-hours for a few days (12.03 CU-hrs used Oct 9 → Oct 20 before it).
- [x] **After deploy (F-04):** UptimeRobot free monitor → `https://framex-api.onrender.com/api/ping`, every 5 minutes
      (not before the deploy; never `/api/health`).
      Checked by the owner 2026-10-20: `framex-api` Health Check Path is EMPTY (keep it empty). A second free web service
      `FrameX-None` (framex-none.onrender.com, "My project", trial, auto-deploys `main` and fails every time) was found;
      the owner deleted it the same day ("My project": no active services; `framex-api` still Live on `eb23ecf`)
      (750 free hours a month per workspace; one service awake all month ≈ 744)
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

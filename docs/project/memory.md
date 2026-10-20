# FrameX — Project Memory

> Decisions, current state and lessons learned, newest first within each section. Add every owner decision and every
> change of status here (verified / not verified). No secrets or customer data: the repository is public.
> Last updated: 2026-10-20 (F-11, F-13, F-14).

## Current state (2026-10-20)

- **GitHub `main` = `eb23ecf`** ("Add Payout system", 2026-10-17). The live site and the Render backend run this code.
- **Branch `phase2a-wip`** (pushed to GitHub 2026-10-20, owner chose this to keep the work safe): Phase 2A, the project
  docs, the small website fixes (F-01, F-06, F-20, F-21, F-25, F-26, F-27) and the coupons work (F-12). **Not live**:
  Render and GitHub Pages use `main` only. Work continues on this branch; it goes live only when it is merged into
  `main` (owner's approval, staged plan in `tasks.md`).
- **Live:** shopframex.in loads, Shop page shows products; API health OK with PostgreSQL connected (checked 2026-10-19).
- **Render:** not Blueprint-managed (owner checked) — `render.yaml` is not applied. `PAYOUT_ENCRYPTION_KEY` is not set
  (owner checked); the production backup had 0 payout accounts and 0 payouts, so adding a key breaks nothing.
- **Payments:** Razorpay live keys + webhook secret on Render since 2026-10-12; no real payment, webhook or refund seen.
  UPI was not enabled on the Razorpay dashboard at that time.
- **Email:** Brevo configured (provider accepted a test). **SMS:** not configured. **GA4:** no ID.
- **Photos:** Backblaze B2 bucket since 2026-10-10 (start-up round trip passed live). Bucket "Private" setting and
  a photo surviving a redeploy: not verified.
- **Backup:** production `pg_dump` (custom format) 2026-10-19, encrypted `.7z` verified, isolated restore test passed.
  Copies are on the same SSD (C: and D: are one disk) — off-site copy pending.

## Owner decisions (log)

- 2026-10-20 F-04: a pinger keeps the Render server awake (owner chose it after the explanation). My choices: UptimeRobot
  every 5 min on `/api/ping` (owner sets it up after the deploy); database jobs wait after 15 quiet minutes so Neon
  (100 CU-hours/month) still sleeps; unpaid online orders are then cancelled when the next visitor or webhook comes,
  not to the minute.
- 2026-10-20 F-11: order photos deleted 15 days after the order is finished (my additions: same for custom painting
  reference photos; a photo still used by another unfinished order, the cart or a saved design is kept).
  F-14: shop products need FrameX approval (admin setting, on via migration 016). F-13: button orange #ff6a35 = the logo X orange #ff5a1f a little softer (owner, 2026-10-20; #b45309 was tried first and didn't look good to the owner; white text 2.85:1 accepted)
- 2026-10-20 F-17 (owner asked to build it): my choices, not asked — visitors who aren't logged in still save in the
  browser (no login forced); logged-in saves go to the account with the photos uploaded at save time; at most 30 per
  account; when the account limit refuses the quiet save before "Add to cart", the design is kept in the browser so
  ordering never stops.
- 2026-10-20 Account deletion (F-16): keep order/painting records for tax but remove name, email, phone, address; refuse
  while an order or painting is under way; confirm with password + DELETE; data download as one JSON file.
  My own choices inside that (not asked): reviews stay as "A FrameX customer" without their photo; messages to FrameX
  stay without contact details; the state of delivery stays on the order (GST place of supply); shop / artist / admin
  accounts are closed by FrameX, not by themselves.
- 2026-10-20 Coupon limits are applied, never announced: no "up to ₹499" / "once per customer" on the banner or the
  coupon title. Over ₹4,990 of items the discount simply stops at ₹499; a second use gets "You have already used the
  coupon XUSE10." (owner's choices). The admin Coupons screen still shows the limits to staff.
- 2026-10-20 XUSE10 limits: at most ₹499 off, once per customer, no end date ("jab tak main band na karun").
  Built as migration 013 + admin Coupons screen (local). Deploying it changes the live coupon.
- 2026-10-19 Do the small website fixes 1-7 first (F-01, F-06, F-21, F-20, F-25, F-27, F-26); bigger features later.

- 2026-10-19 Keep Phase 2A local/uncommitted; finish design + development first; then one combined review / test /
  commit / deploy plan. Final backup after development. Payout key stays blocked until approved.
- 2026-10-19 Project docs in `docs/project/` must be updated with every piece of work.
- 2026-10-18 Phase 2A safety fixes approved as local changes only (no push / deploy).
- 2026-10-17 Payouts: bank or UPI, 2% payout charge, manual payouts with UTR; new-order email + admin WhatsApp button.
- 2026-10-17 One role per account kept; shop / artist applications work without login; separate `join-artist.html`.
- 2026-10-17 Dark mode as an option; **Light is the default**.
- 2026-10-17 Hero frames follow phone tilt, shake, full 360° rotation over the text.
- 2026-10-15 Cancelled the 3D / film hero; kept the old carousel hero.
- 2026-10-10 Free object storage (Backblaze B2) instead of a paid Render disk. Owner has no card / PayPal.
- 2026-10-08 Desktop design final; phone styles only in `mobile.css`. Same soft-blue palette on every page.
  Home sections in "shopping-site style". Keep Sora / Plus Jakarta Sans.
- 2026-10-08 Cashfree requested as the gateway (adapter built; Razorpay kept and used live).
- 2026-10-07 "Light and clean" + deep blue palette.
- 2026-10-05 No guest cart; account-only cart in the database; server-side prices.

## Placeholders waiting for the owner's yes / no

Artworks without COD / gift wrap; custom paintings without delivery charge / tax; manual refunds of custom paintings;
gift-wrap fee ₹49; frame build details in `js/edit.js`; analytics consent card position and 400-day retention;
header button labels per section.

## Verified vs not verified (keep honest)

| Item | State |
| --- | --- |
| Razorpay test payment end to end (local, throw-away DB) | verified 2026-10-07 |
| Razorpay live payment / webhook / refund | **not verified** |
| Cashfree real sandbox payment | **not verified** |
| Email received in an inbox | **not verified** (provider accepted) |
| SMS | not configured |
| View on My Wall / tilt on a real phone | **not verified** |
| Live load test (browse only) | 100 visitors fast, 200 usable, 300 slow (2026-10-12) |
| Production backup restorable | verified 2026-10-19 (isolated in-memory PostgreSQL 18.3; not on Neon) |

## Lessons (for whoever works on this next)

- A sideways row (`overflow-x: auto`) also scrolls up/down when its content is 1-2px taller (rounding on real
  phones): the row felt loose and the page got stuck under the finger. Phones now set `overflow-y: hidden` on every
  swiping row (`mobile.css`); new swiping rows need the same. Test with `page.touchscreen`, not CDP scroll gestures.

- Browser tests: never against :4000 / :5500. A suite once placed a real COD order in the owner's local database.
- The live API sleeps on the free plan: the first request after a pause can take about a minute.
- A backend started before new backend code was written is the first suspect when a new admin screen doesn't load.
- Ad blockers hide `ad-…` class names (renamed to `adm-` on 2026-10-13).
- Reading `backend/.env`: anchor names with `=`; a loose pattern once printed an API key.
- Git Bash rewrites environment values that start with `/` (a base64 key) into Windows paths: generate test keys as hex.
- When "section" is said, check whether a whole page is meant.
- Small visual change → quick change, quick check, short answer.
- The owner's editor may re-wrap HTML (seen 2026-10-19 on `index.html`): tests must not depend on a tag being on one line.
- A new kind of id (a saved design's uuid) must be checked everywhere ids are validated: the cart only accepted
  "d-…" design ids and "Add to cart" broke silently (caught by the Studio browser suite, 2026-10-20).
- Accessibility crawl false positives: text inside a closed `<details>` has no `innerText`; a visually-hidden `h1`
  counts as "not visible"; a pseudo-element touch area isn't measured.

# FrameX — Project Memory

> Decisions, current state and lessons learned, newest first within each section. Add every owner decision and every
> change of status here (verified / not verified). No secrets or customer data: the repository is public.
> Last updated: 2026-10-24 (FrameX Care live chat).

## Current state (2026-10-20)

- **GitHub `main` = `eb23ecf`** ("Add Payout system", 2026-10-17). The live site and the Render backend run this code.
- **Branch `phase2a-wip`** (pushed to GitHub 2026-10-20, owner chose this to keep the work safe): Phase 2A, the project
  docs, the small website fixes (F-01, F-06, F-20, F-21, F-25, F-26, F-27) and the coupons work (F-12). **Not live**:
  Render and GitHub Pages use `main` only. Work continues on this branch; it goes live only when it is merged into
  `main` (owner's approval, staged plan in `tasks.md`).
- **Live:** shopframex.in loads, Shop page shows products; API health OK with PostgreSQL connected (checked 2026-10-19).
- **Render:** not Blueprint-managed (owner checked) — `render.yaml` is not applied. `PAYOUT_ENCRYPTION_KEY` is SET
  since 2026-10-21 (owner, approved; live log: payout accounts READY). The key is in the owner's Bitwarden; never change it.
- **Payments:** Razorpay live keys + webhook secret on Render since 2026-10-12; no real payment, webhook or refund seen.
  UPI was not enabled on the Razorpay dashboard at that time.
- **Email:** Brevo configured (provider accepted a test). **SMS:** not configured. **GA4:** no ID.
- **Photos:** Backblaze B2 bucket since 2026-10-10 (start-up round trip passed live). Bucket "Private" setting and
  a photo surviving a redeploy: not verified.
- **Backup:** production `pg_dump` (custom format) 2026-10-19, encrypted `.7z` verified, isolated restore test passed.
  Copies are on the same SSD (C: and D: are one disk) — off-site copy pending.

## Owner decisions (log)

- 2026-10-28 New footer from the owner's reference picture (near-black, centred line, faint FRAMEX word, 4 short
  columns; no feature badges on phones). The page-to-footer join: a grey fade was rejected; chosen "E" = deep navy
  turning black with a thin orange light line on top.
- 2026-10-28 Art & Artists opens on ALL artworks (owner: buyers should not have to open every profile), with a small
  "Meet the artists" strip; the artists list stays one tap away. Built after the design.
- 2026-10-28 Artworks: NO View on My Wall ("bekar option hai art ke liye"). The artist adds the photo of the artwork (main)
  and the original photo it was drawn from; buyers compare them with a Before / After slider. Built after the new design.
  My choices (unconfirmed): the original photo is optional ("Recommended"); it shows only with the artist's "I may show
  this photo" tick; "Drawn from imagination" when there is none.
- 2026-10-27 Artworks get the same easy 4 steps as frames (owner): main photo → picture for View on My Wall → sizes with
  prices → delivery time → submit; FrameX approves; the admin can add artworks for any artist (published at once) and
  sees them in All frames → Artworks. My choices (unconfirmed): an original has exactly 1 size; prints share one copies
  count. (The wall picture part was replaced on 2026-10-28 by Before / After.)
- 2026-10-27 Frames: model photos to sell + a frame FRONT (outer + inner background removed) for "your photo inside the
  real frame" (product page, cart, order, View on My Wall). Simple 4-step "Add a frame" for shops; admin adds / edits any
  shop's frames. The drawn 30 sample frames were dropped (owner). Artists' version later.
- 2026-10-26 Deployed banners / strips / Admin Promotions / Google + Facebook login (main bfcb26f) after a fresh production
  backup (pen drive, 21:09). GOOGLE_CLIENT_ID set on Render.
- 2026-10-26 Admin → Promotions built (banners + strips managed without code), then everything pushed together.
- 2026-10-26 Google + Facebook login built ("Haan banao dono"). Only customers; staff / shop / artist keep password login.
  A social login with an existing customer email joins that account. Off until the server has the ids.
- 2026-10-26 Social login: Google yes (free), Facebook design now / setup later, Apple no ($99/yr, needs a card).
- 2026-10-26 Home offer banners as whole pictures (no HTML text / buttons) and 6 promotion strips on Home, Shop, Product,
  Home Decor — built straight after the designs ("sab lagao page par direct"). Diwali "Copy code" button dropped.
- 2026-10-25 Deploy HEIC photos, medium review photos, Studio / cart on phones, hero steps removal WITHOUT a fresh backup
  ("Bina backup live karo") — main 5434cc3 + fe0060c; migrations 020 + 021 ran; newest backup 2026-10-24 19:12.
- 2026-10-25 Review photos: keep the customer's high-quality original, SHOW a medium copy (WebP 1600 px) so pages with many
  photos stay fast.
- 2026-10-25 iPhone HEIC photos: keep the original HEIC AND make a full-quality JPG copy that is printed ("Asli HEIC bhi
  rakho + JPG copy"). AVIF handled the same way. The JPG copy is an extra file; the original is never changed.
- 2026-10-24 Deploy FrameX Care + order changes WITHOUT a fresh backup ("bina backup live karo") — migration 019 (CARE role
  in users_role_check, live columns) ran on production with the newest backup still from 2026-10-20 15:06.
- 2026-10-24 Care logins open the **admin panel** (not a separate page) with only **Live chats and Orders**, and can
  act on a customer's order: cancel (with the automatic refund), refund, change the status, another size (before the
  shop makes it), another delivery address (before it ships). Owner's choices: "Chats + Orders" (not everything —
  payouts / settings / coupons / shops / Care team stay admin-only) and for another size: cheaper or same at once
  (online: difference refunded; COD: new total on delivery), dearer = the customer pays the difference (the online
  part is not built yet). My choices: the coupon is worked out again on the new items total (its own percent and cap),
  tax again at the order's rate, delivery / gift-wrap / COD fees stay; a size needing another number of photos is
  refused; every change is written in the order history + audit log and emailed to the customer.
- 2026-10-24 FrameX Care live chat: AI cancelled by the owner; quick answers without AI first, then "Connect with
  FrameX Care" → 2 minutes waiting → a care person accepts → the customer sees "Live · chatting with <first name>"
  (owner: first name only; team hours 10am–8pm; each care person has their OWN login made by the admin — owner chose
  this over a shared admin login with a name picked from a list). My choices, not asked: nobody Available or outside
  the hours → the customer is told at once (no 2-minute wait for nobody); "Available / Away" switch; the desk pops up
  with a sound; a live chat closes the conversation when it ends; 👍/👎 rating; staff messages carry the writer's first
  name, also in emails ("Priya from FrameX Care replied"); no email while the customer has the live chat open; live
  updates over server-sent events (not a 1-second refresh: it would keep the Neon database awake); quick answers are
  shown to visitors too, a person needs an account.
- 2026-10-23 Deploy the redesign + help chat now, backup tomorrow ("abhi live kardo ham backup kal karenge") — so
  migration 018 (two new tables, nothing changed in existing ones) ran without a fresh production backup; the
  newest one is from 2026-10-20 15:06.
- 2026-10-23 Make the whole site easy and self-explanatory on phone **and laptop**, keeping every feature (this
  changes the 2026-10-08 "desktop is final" rule for this redesign only). Owner approved design pictures 1–7 and the
  label idea "A, but a square dot like the F. of FrameX" (not a line); "should not look AI-generated". Feedback that
  shaped it: Home steps placed higher on the phone, checkout address in 3 lines, smaller order box on the phone,
  FrameX's own help chat instead of WhatsApp. My choices, not asked: only logged-in customers can chat (so we can
  answer by email and see their orders; visitors get "log in" or the Contact page); FrameX is emailed at most once
  per 15 minutes per conversation; the header says "We usually answer within a few hours"; a closed chat starts a
  new one when the customer writes again; chats are deleted with the account.
- 2026-10-21 Shops section (Home + Shop page): no location → 3 "good" shops in an order that changes once a day;
  location → nearest top 3 + "View more shops near you"; a shop search box; owner picks featured shops (paid
  promotion). My choices, not asked: featured shops carry a visible "Featured" label and a Terms line says a shop
  may pay for it (paid placement must be disclosed); with a location, distance wins over featured; "good" = has
  something on sale (ratings are too few to rank by yet); "Clear location" keeps it off for that tab even when the
  browser allows it; the location is kept in sessionStorage only.
- 2026-10-20 Owner asked why support@shopframex.in is needed when support.framex@gmail.com exists, and whether replies
  can go out as support@: explained (architecture.md §9) — sender must be the own domain; replying as support@ is
  possible for free with Gmail "Send mail as" + Brevo SMTP, not set up yet.
- 2026-10-20 Email sender is `FrameX <support@shopframex.in>` (Render EMAIL_FROM, set by the owner); shopframex.in is
  authenticated in Brevo (DKIM) and receives mail through ImprovMX (free; catch-all `*@shopframex.in` → the business Gmail support.framex@gmail.com).
  A @gmail.com address can't be the website's sender: Brevo sending as gmail.com fails Gmail's checks (spam, no DP). The email
  logo sits on a white badge for dark mode. Gmail profile picture: a Google account for support@ with the owner's
  "F" picture.
- 2026-10-20 Emails: "orange line" design (owner chose option 1 first, then the orange line as final). Profile picture: yes, via a shopframex.in sender
  address (Brevo domain authentication + a Google account photo). SMS/WhatsApp OTP: put aside for now.
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
| HEIC upload (Chrome, phone screen, local :4100) | verified 2026-10-25 with a public libheif sample; **not yet with a real iPhone photo** |

## Lessons (for whoever works on this next)

- The art browser suite (art-e2e) must run with the Cashfree stand-in (PROVIDER=cashfree): with the Razorpay stand-in the
  "closing the payment window pays nothing" check fails because that stand-in pays at once (2026-10-27).

- 2026-10-24 Writing code through `node -e '…'` in bash loses backslashes (`/^\s*(\d…)/` became `/^s*(d…)/`) and
  `$$` / `$&` in String.replace replacements are special: write edit scripts with the Write tool and use a replacement
  function. A broken CARE_HOURS parser was caught only because the browser test showed "10am–8pm".

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

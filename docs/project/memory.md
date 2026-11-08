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

## Costs and margins (2026-10-29, estimates)

- All calculations live in `costs.md` (running cost; order costs with 50% COD and 20% COD returns). Short version:
  running cost ≈ ₹1,300 / month at 500 users, ≈ ₹6–9k at 2000+; with 10–15% ordering, total ≈ ₹10–15k / month at 500
  users and ≈ ₹41–62k at 2000 users (≈ ₹216–247 per delivered order). Placeholders (order value ₹600, courier ₹90,
  making cost ₹250 …) wait for the owner's real numbers.
- Profit plan (costs.md §3): the owner's plan (shop price + 18%, COD +3%, UPI −4%, free delivery) LOSES ≈ ₹69 per
  ₹1,000 order; more users = more loss. Suggested Plan B (30%, UPI −2%, ₹49 delivery) and B2 (+ custom photo frames
  online-only) make a profit. Owner has not chosen yet. GST / TCS not counted (CA question).
- Marketing (costs.md §4): with Instagram / Meta ads (≈ ₹4.5k / ₹18k a month) only ~35–40% markup stays in profit at
  both user levels; one order from a cold ad costs ≈ ₹750 at a 2% order rate.
- WhatsApp (costs.md §5) ≈ ₹2.1k / ₹4.8–5k a month; owner has a private "FrameX Profit Calculator" page to try values.

## Owner decisions (log)

- 2026-11-02 FrameX Studio: the size is decided first, then the customer's photo; "Custom size" must work (it said
  "Coming soon"). My choices (not confirmed by the owner): 4–40 inches per side, inches or cm, price from the standard
  sizes by area rounded up to ₹10 and never below Small; not offered on a listed shop product. LIVE 2026-11-02
  (main c270c7a, no migration).
- 2026-11-02 GST: owner wants no GST registration now ("after 1 year"). My answer (general rules, CA to confirm):
  goods to other states and a marketplace selling shops' goods need registration from the first sale; without GST no
  "Tax" line may be charged → advised Tax 0 in Admin → Settings now and registering before the launch. The owner set
  Tax 0 the same day; registration not decided.
- 2026-11-02 Deploy: "Abhi push karke live karo, jaldii" → main bb0ca4f (courier + tracking, pricing plan; migrations 027
  + 028) WITHOUT a fresh Neon backup (owner chose "Bina backup push karo"). The pricing rule and the online discount
  stay off live until the owner types the values in Admin → Settings (costs.md §11).
- 2026-11-02 Pricing plan in code (built locally, migration 028): "Pehle shop price + 3%" (order of work: the shop's
  own price + the listing rule first, then the online discount); "FrameX shop ko uska daam dega" (for COD too: FrameX's
  courier collects the cash, the shop is paid its own price after delivery, no commission); "Haan, discount rahe" (a
  shop's own discount stays: off its price first, then the rule); the large-box delivery share was raised (value in
  costs.md §11); the shop must be told clearly at approval at what price the product is listed, and to contact FrameX
  Care or email for any issue (approval email built). The online discount works for "Pay online" (any method): the
  method is chosen inside Razorpay after the amount is fixed. Art COD with 50% advance: LATER.
- 2026-11-02 Couriers: book parcels by hand on NimbusPost (cheapest in the owner's checks; mixed seller reviews about
  support / COD remittance / weight disputes, so small wallet top-ups, photos of weighed parcels, little COD,
  Shiprocket kept as backup); FrameX types the courier + tracking number on the admin order page (built); the
  NimbusPost API (automatic shipments / labels / tracking) later, at about 5+ orders a day.
- 2026-11-02 Pricing: the owner DECIDED one listing-price formula for every product from now on (shop / artist gets its
  full price; delivery free for the customer; UPI discount; COD fee; no COD on photo frames; artwork COD with a 50%
  advance). The numbers live ONLY in costs.md (private, never pushed) with a ready answer for shop owners (§13).
- 2026-11-01 Deploy: "Now all push and live" (main 8af6d15). Then: "jo important hai usko karo only": test in proportion,
  not the whole suite every time (the full run had also crashed out of memory on this machine).
- 2026-11-01 Experiment: header search grows on hover on laptops (only the logo stays, the box ~25-30% of the bar,
  smooth); then on phones too: a tap grows it beside the logo, the X makes it small again. Then: results in a box
  under the search (no new page) on laptop and phone, and an empty search closes by itself after 10 s.
- 2026-11-01 Header: transparent at the very top of every page (with the thin line under it kept), today's frosted
  background after a little scrolling.
- 2026-11-01 Home: "Highly recommended frames" stays frames only; "Home Decor & Wall Art" and "Art & Artists" each get
  their own row of what is popular (owner: "Har hisse ki apni line"), option B: the row above the picture tiles, which
  stay. Laptop "Highly recommended frames": at most 2 lines, at least 8 frames.
- 2026-11-01 Suggestions: Home "Highly recommended frames" = the frames ordered most in the LAST 30 DAYS first (owner:
  "last 30 day se hisab karo"), then the frames VIEWED most in the last 30 days (owner chose "Order pehle, phir views";
  views count once per visitor and only from visitors who allowed analytics), then the chosen frames; automatic. Product page, in the owner's order: Similar products, You
  may also like, Recently viewed (rows that move sideways by arrows / touchpad on a laptop, swipe on a phone: NOT on
  their own, owner: "touchpad se"), then More products for you (frames, wall art, artworks mixed, more as you scroll).
- 2026-11-01 The login SMS arrives as "Team Global Net" (sender CP-GLBLNT-S, APITxT's no-DLT route): owner keeps it for now and
  will change it later (own DLT "FRAMEX" once Udyam / GST exists). No "SMS partner" note on the code screen for now.
- 2026-11-01 Login OTP by SMS ("masagee par chahiye", not WhatsApp), through APITxT's no-DLT OTP (₹0.30, APITxT's sender, no
  documents); FrameX's own DLT (sender FRAMEX) later, once Udyam / GST exists. A new mobile number's email is OPTIONAL
  (owner chose "Email optional (skip kar sakein)" over "ask once" and "phone only"): users.email may be empty; such
  customers get no emails. My choices: the mobile option shows only while SMS is set up; a shop / staff number gets no
  SMS; at most 6 SMS sends an hour per network address.
- 2026-11-01 WhatsApp: the messages the admin sent by hand become automatic ("jitna bhi abhi manual send karna padta hai
  … automatic"), from a FrameX business number (a family member's old keypad-phone number without WhatsApp, owner's
  choice) through Fast2SMS (no monthly fee, ₹0.25 a utility message). Templates approved by Meta in the Fast2SMS panel
  (all 3 APPROVED 2026-11-02; the owner set the 3 WHATSAPP_ values on Render the same day ~17:39: service "ready", ON).
  2026-11-07 Meta business VERIFIED (Udyam record); WhatsApp limit 2,000 conversations / 24 h; first real message sent.
- 2026-11-07 WhatsApp OTP login: the owner chose "WhatsApp pehle, SMS backup" (code on WhatsApp first, "Send it by SMS
  instead" on the code screen, automatic SMS if WhatsApp refuses). My choices: the SMS link waits like "Send a new code"
  (each message costs money); off by default behind an Admin switch until Meta approves the template.
  Template framex_login_code created by me through Fast2SMS's API on the owner's request, APPROVED by Meta at once
  (2026-11-07). Templates can be made with the API from now on (the Fast2SMS key in backend/.env, never printed).
  Login OTP on WhatsApp waits for Meta business verification (Udyam first). My choices (owner can change): the checkout
  box is ticked by default (remembered when unticked) and appears only while WhatsApp is set up; WhatsApp for placed,
  payment failed, shipped, out for delivery (WhatsApp only), delivered, cancelled and refunds, not for confirmed /
  processing; "approved" only after the setup email really went, never with a link; each kind has an Admin switch.
- 2026-11-01 No WhatsApp number anywhere on the site (it was the owner's personal number); customers are invited to
  email only. Add a WhatsApp number again only if the owner gives a business number.
- 2026-11-01 View on My Wall: one phone found no wall live. Owner chose Apple's AR Quick Look (ARKit) for iPhone / iPad
  (free, built into iOS; the 3D model made on the phone, nothing uploaded), a plain error where a phone can't do AR, and
  "open in Chrome / Safari" inside Instagram, WhatsApp, Facebook… Android Scene Viewer was offered but not chosen (it
  needs the model on a public address, i.e. an upload). LIVE the same day (main 3db81de, owner: "abhi push karke live
  karo"; no migration). My own choices (owner can change): the size is
  locked to the real one in Quick Look (no pinch), the simple camera view stays offered everywhere it can run, the
  in-app card warns that photo and choices may need to be added again in the other browser.

- 2026-11-01 Deployed everything of 2026-10-29 to 11-01 (main 65f41c4) after a Neon backup; costs.md kept out of the public repo.
- 2026-10-31 Cart reminder emails: ONE reminder 24 h after a cart is left, WITH a coupon (XUSE10 by default), only
  9 am to 9 pm; free with Brevo (300 a day shared with login codes and order emails, so at most 100 reminders a
  day). WhatsApp reminders need the WhatsApp Business API (paid per message) — not built. A "payment left" reminder
  10-15 minutes after a failed / closed payment was explained, not built.
- 2026-10-31 Login is a box over the page, not a page (asked after how Flipkart does it): email -> code -> name
  filled in from the email (changeable) -> in; no "Create an account", no password sign-up. Built locally.
- 2026-10-31 Simple login / sign-up: Google or email + code; an unknown email on the login page goes straight to
  "Almost done" (option A); every login page at least 100vh on laptop and phone. Built locally, not pushed.
- 2026-10-29 **Design is FIXED**: the owner said the whole design is final; from now on only feature upgrades
  (rules.md §4). No redesigns or design suggestions unless the owner asks.
- 2026-10-29 Home: of the shorter-home design only the new "Shop by category" tiles stay (owner removed the
  trust strip, occasions and the combined Decor + Art after seeing them built); then the tiles replaced the three
  boxes under "Start here" and the separate category section went.
- 2026-10-28 The fixed header must not sit over the footer: the footer now pushes it up and away. Live 2026-10-29 (main 7958b8a).
- 2026-10-28 Deployed everything of 2026-10-27/28 (main 010875c), no migration so no backup.
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
| View on My Wall / tilt on a real phone | **not verified** (owner tried live 2026-11-01: works on good phones, one phone found no wall) |
| View on My Wall iPhone Quick Look (orientation upright, real size) | **not verified** — checked only with Pixar's USD tools and a simulated iPhone (2026-11-01) |
| Live load test (browse only) | 100 visitors fast, 200 usable, 300 slow (2026-10-12) |
| Production backup restorable | verified 2026-10-19 (isolated in-memory PostgreSQL 18.3; not on Neon) |
| HEIC upload (Chrome, phone screen, local :4100) | verified 2026-10-25 with a public libheif sample; **not yet with a real iPhone photo** |

## Lessons (for whoever works on this next)

- 2026-11-01 The pages' CSP has no `blob:` in connect-src, so a script can't fetch() a blob: address (the Quick Look
  test reads the model from the Blob itself). Quick Look opens the blob: link as a navigation, not a fetch. Checking a
  USDZ: usd-core 26 dropped Pixar's old ARKit checker; the scratchpad uses OpenUSD v24.11 complianceChecker.py with two
  small patches (Sdf.ZipFile, one rule needing the old Sdr API skipped) plus the new UsdValidation validators.

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

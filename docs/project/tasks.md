# FrameX — Tasks

> Update this file after every piece of work: move items, add new ones, record dates.
> Last updated: 2026-11-02 (Studio custom size + size-first DEPLOYED: main c270c7a, no migration; WhatsApp ON live).

## Now

- [ ] 2026-11-02 **WhatsApp: Meta APPROVED the 3 templates** (Fast2SMS panel, Utility, EN): `framex_order_update` 41360,
      `framex_seller_new_order` 41362, `framex_account_approved` 41369. The code is already live (ec65434, migration 026)
      and stays OFF until Render has WHATSAPP_PROVIDER=fast2sms, WHATSAPP_API_KEY and WHATSAPP_PHONE_NUMBER_ID (owner
      types them; same values as backend/.env). Next: one real test to the owner's own number (local wa-real-test,
      needs the owner's OK), then Render, then Admin → Settings → WhatsApp messages shows "ready" and the 3 switches.
      If Meta says the language doesn't match: WHATSAPP_TEMPLATE_LANGUAGE=en_US. Not sent yet: no real message so far.
      - 2026-11-02 ~17:39 the owner set the 3 values on Render: Admin → Settings shows "WhatsApp service: ready", the 3
        switches On; live /api/config whatsappOrderUpdates true (checkout shows the WhatsApp box). Still open: the first
        real message (owner's own COD order, then cancel) and its result in the Admin list.

- [x] 2026-11-02 **FrameX Studio: custom size works + Size is step 1** — DEPLOYED main c270c7a (no migration).
      Owner: "abhi push karke sabhi live kar doo". Before push the cart suite was re-run but Node ran out of memory at
      start (the PC's commit memory was full: 1.3 of 44.7 GB free, the owner's open apps); the same code had passed at
      13:35-13:37 (cart 28, studio-custom-e2e 14/14, mx-e2e-2-studio 37/37); only the About/Home text changed after. Owner: "frameX
      studio main Custom size cooming Soon dikha raha hai … isko fix karo … side kitna hoga frame ka … pehele deside
      hona chahiye uske bad photo chahiye user ka".
      - Size is the first step (open at the start), Photo the second; the rest as before.
      - "Custom size" card next to Small / Medium / Large / XL (photo and template Studio; not on a listed shop
        product, which keeps its shop's sizes): width × height in inches or cm, 4–40 inches per side; the frame's shape
        (portrait / landscape / square) follows the typed size; a size outside the range shows a red message and can't be
        ordered. Price: from the standard sizes by area (in proportion between two sizes, the last step's rate above
        Extra Large, never below Small), rounded up to ₹10 — e.g. 10 × 14 in ₹559, 18 × 24 in ₹1,009 with the default
        options (Studio prices are still placeholders, js/studio.js).
      - Server: the cart keeps `customSize` {w, h, unit} with the design, prices it with the same engine and refuses a
        size it can't make; the order's size line reads "Custom · 10 × 14 in · portrait" (cm also shows inches).
      - About + Home FAQ no longer say "custom sizes coming soon".
      - Tests: cart 28 (new custom-size case), designs 7, photos 49, checkout 56; browser studio-custom-e2e 14/14,
        mx-e2e-2-studio 37/37 (opens the Photo step first now).

- [x] 2026-11-02 **DEPLOYED: courier + tracking (027) and the pricing plan (028)**, main bb0ca4f. Owner: "Abhi push karke
      live karo, jaldii"; chose "Bina backup push karo" (no fresh Neon backup). Live check: website has the new scripts,
      Render answers the new routes (401 without login), health ok with the database, catalog 200. Before push:
      api 48, shopwelcome 6, whatsapp 14 (+ the suites listed below).
- [ ] The pricing rule is OFF live until Admin → Settings are typed (next item). Not tried live yet: a real tracking
      entry, a shop product approved under the rule (the email), a "Pay online" discount on a real payment.
- [x] 2026-11-02 **Pricing plan BUILT (migration 028)**. Owner: "Pehle shop price + 3%", "FrameX shop
      ko uska daam dega", "Haan, discount rahe", large-box share decided, and "jab ham aproverd karnge tab saf likh na
      chahiye itna price par listing hoga if any isssue then contact care or email".
      - A shop types ITS OWN price per size (+ its own discount); the saved product's price is FrameX's listing price
        (shop price + markup % + a delivery share for the box size, rounded up to end in 9). Box size by the longer side:
        up to 12 in small, up to 18 in medium, else large. Numbers only in Admin → Settings ("Listing price of shops'
        products", env LISTING_MARKUP_PERCENT / LISTING_SHARE_SMALL|MEDIUM|LARGE, default 0 = off) and costs.md §11.
      - The shop's editor shows "Your price (₹)" and a live "Customer pays" column (`POST /api/shops/:code/listing-preview`,
        admin `/api/admin/shops/:id/listing-preview`: results only, never the numbers). The shop always edits its own
        prices (`shopPricesView`); anything like "what the shop receives" sent by the shop is dropped.
      - Admin approval emails the shop: each size "₹customer (you get ₹shop)", free delivery, "chat with FrameX Care
        from your dashboard or email support@shopframex.in", dashboard button. Once per approval.
      - Every order line keeps `seller_unit_amount` (what the shop gets). Payouts pay it for those lines, COD or online
        (FrameX's courier collects the cash), with no commission; the shop's order list / detail / new-order email /
        WhatsApp and the admin's seller list show the shop's amount and "the courier collects it". Size changes
        update it.
      - Online payment discount (Admin → Settings / env ONLINE_DISCOUNT_PERCENT): taken off the items when "Pay online"
        is chosen (the method is picked inside Razorpay after the amount is fixed, so UPI-only is not possible);
        checkout offer line + "Online payment discount (N%)" row; order page, emails; `orders.online_discount`; the
        total check constraint now includes it.
      - Tests: backend listing-price 7/7 (in npm test; made-up numbers, not the real ones), payouts 25, checkout 56,
        order-edit 7, cart 27, frames 6, order-tracking 7, art 57, decor 19; browser pricing-e2e 7/7.
- [ ] NOW (deployed 2026-11-02), Admin → Settings: the values in
      costs.md §11 (markup, 3 box shares, online discount), delivery fee 0, COD fee 49, commission shops 0% / artists
      0%, payout charge 0%, "Shop products need FrameX approval" ON; Render COD_ALLOW_CUSTOM_DESIGNS=false. Delivery 0
      only together with the new prices. Products listed before keep their typed price until the shop saves them again.
- [ ] Later: artwork COD with a 50% advance (refused at the door: advance refunded minus the courier both ways).

- [x] 2026-11-02 **Courier + tracking number on orders BUILT (migration 027; deployed 2026-11-02, main bb0ca4f)**. Owner: "admin order page par
      Courier + Tracking number banao" (parcels are booked by hand on NimbusPost for now; its API later, when there are
      ~5+ orders a day). Migration `027_order_tracking.sql`: orders.courier / tracking_number / tracking_url /
      tracking_added_at (new empty columns only). `POST /api/admin/orders/:orderNumber/tracking` {courier, number, url}
      (ADMIN or CARE; both needed, or both empty = removed; number letters / digits / dashes; link http(s) only; not on
      an unpaid or cancelled order; order history NOTE "Sent with X. Tracking number Y."; audit ORDER_TRACKING_SET).
      Order shape `tracking: {courier, number, url, addedAt} | null`. Admin order page: "Courier and tracking" card
      (courier list Delhivery / Shadowfax / Xpressbees / Ekart / Blue Dart / DTDC / Amazon Shipping / India Post).
      Customer order page: "Track your parcel" card at the top of the main column (courier, number, "Track your
      parcel" link in a new tab) and the summary "On its way with <courier>". The shipped email and the WhatsApp
      status carry it when it was added before "Mark as shipped". Tests: backend order-tracking 7/7 (in npm test),
      whatsapp 14, order-edit 7, checkout 56; browser tracking-e2e 10/10 (in push-check). Pictures:
      Desktop\FrameX-Courier-Tracking. Local backend restarted with migration 027 after a copy of `.data`
      (`.data.backup-2026-11-02-before-order-tracking`). Before the deploy: a fresh Neon backup (new migration).
- [x] 2026-11-02 Owner registered **Udyam** (free, udyamregistration.gov.in; Proprietary, enterprise "FrameX", NIC 63122 web
      portal + 47912 retail via e-commerce, investment / turnover 0). Number kept by the owner; certificate PDF awaited by
      email. Unlocks: Meta business verification (upload the certificate; name / address exactly as on it), DLT for an
      SMS sender "FRAMEX", proof for Razorpay.
- [x] 2026-11-02 **Invite messages for shop owners and artists**: Desktop\FrameX-Invite-Messages, ENGLISH ONLY, two files
      (owner found the first 8-file version in three languages confusing and asked to delete it):
      Shop-Owner-Messages.txt and Artist-Messages.txt, each = WhatsApp message, email, one reminder, 3 answers. Before
      sending: shop commission + payout charge 0% (they promise the full price), clean up the sample shops. The formula is
      never told.
- [x] 2026-11-01 **DEPLOYED** main 8af6d15 (owner: "Now all push and live"; no migration, so no Neon backup needed):
      smart suggestions (Home popular frames, Home Decor / Art popular rows, product page Similar / You may also like /
      Recently viewed / More products for you), transparent header at the top, header search that grows + results box
      + 10 s close, the "[object Object]" size fix. Tests before the push (owner then asked to keep testing to what
      matters, so the full run was stopped part-way): browser login 45, phone login 20, cart 47, frame 55, Studio 37,
      decor 26, shop 50, account 13, artwork 36, payout 38, coupon 20 (care 47/0 when stopped); this work's own suites
      suggest 35, home-popular 19, hover-search 70, search-results 16; backend popular 12/12. The full backend run
      crashed OUT OF MEMORY (only ~1.5 GB free on this machine; cart / checkout / decor could not start even alone);
      the last full backend run today, after the pricing.js change, was 537 pass / 0 fail.
      Live check after the deploy (read-only, laptop + phone, 14/14): Render /api/catalog/popular 200 with real ids
      (p-002 first), Pages serves the new files; header transparent with its line; Highly recommended = frames only,
      8 in 2 lines on a laptop, Classic Square first; Home Decor popular row (10) above its tiles; search grows, shows
      results for "gold", X closes; product page rows + feed; no script errors.
- [x] 2026-11-01 **Search that opens on hover BUILT for laptops (local, not pushed; owner's EXPERIMENT)**. Owner:
      hovering the header's search icon fades out everything but the logo, and the icon grows (same height) into a
      search box about 25-30% of the navbar, smoothly; laptop first, phone only when the owner says.
      - chrome.js: the search link sits in `.hdr-search` with a small form (search.html?q=); below 1100 px the plain
        link as before (below 420 px it is in the menu, as before), the form hidden.
      - nav.js: on hover (1100 px + a mouse) the header gets `.is-searching`; the box = clamp(300, 28% of the bar, 460) px,
        grown from its own middle and kept inside the buttons' right edge; closes 0.2 s after the mouse leaves unless
        the cursor is in it; Escape / clicking away closes; an empty search keeps the page and puts the cursor in.
      - chrome.css: width/left 450 ms, the rest fades in 200 ms (back in 280 ms); reduced motion = no animation.
      - Test `hover-search-e2e.js` 32/32 at 1366, 1100 and 1920 px (+ tablet / phone unchanged). Pictures + README:
        Desktop\FrameX-Search-Hover.
      - PHONE version, same day (owner: "acha hai, abhi mobile ka banao … X ko click karte hai chota ho jaye"): from
        360 px the round search button is in the bar (it used to show only from 420 px; below 360 it stays in the menu).
        A tap grows it across the room between the logo and the bar's edge (max 560 px; tablets too), Log in / cart / menu
        button fade out, the cursor goes in (keyboard opens); it stays open until its X (closing the keyboard keeps it);
        the X clears and closes, on laptops too (the browser's own clear button is hidden). 16px text on phones (no
        iPhone zoom); a box narrower than 300 px says "Search FrameX". hover-search-e2e.js 67/67 (laptop 1366 / 1100 /
        1920; phone 360 / 375 / 390 / 414; tablet 800; 320 = in the menu) + search-hint-check.js 2/2.
      - RESULTS UNDER THE BOX + 10 s CLOSE, same day (owner: "serch kare uske niche ek box hoke sabhi result ayega mobile
        par bhi laptop par bhi … kuch na serch kare 10sec ke bad … firse chota ho jaye"): typing (2+ letters, 250 ms
        after the last key) shows GET /api/search?limit=4 under the box: Products / Artworks / Artists / Templates /
        Shops with their totals, picture + name + shop / artist / city, "See all results for …" (search.html?q=);
        "Type at least two letters", "Searching…", "Nothing matches …", an error line. Enter shows the results instead
        of opening a new page (a phone's keyboard closes); without the backend Enter still opens search.html. Arrow keys
        move through the results; Escape / X close and clear. Laptop: the box under the search pill, right edges in
        line, at least 420 px, max 70vh; phone / tablet: across the screen under the header, scrolls. Searches are
        counted for the statistics as on the search page. Opened and left EMPTY for 10 s = small again (words typed =
        it stays); moving the mouse on the button opens it again. search-results-e2e.js 16/16, hover-search-e2e.js
        70/70 (both in push-check).
- [x] 2026-11-01 **Navbar transparent at the top BUILT (local, not pushed)**. Owner: no header background before
      scrolling, today's frosted background once the visitor scrolls a little. (I first made design pictures,
      Desktop\FrameX-Navbar-Design; the owner had meant "build it directly" and showed localhost unchanged.)
      Owner, same day: keep the thin line under the header while it is transparent (done; navbar-line.js 2/2).
      chrome.css: `.site-header:not(.is-scrolled):not(.is-menu-open)` has no background or blur, the thin line stays (stronger than
      .site-header--solid); nav.js already sets .is-scrolled past 24 px. Every page; the phone menu keeps its background
      when open; dark mode the same. Checked: the top of 29 pages on laptop and phone (navbar-sweep.js: all
      transparent at the top, background back after scrolling, all readable: every page top is light), dark mode +
      phone menu (navbar-dark.js) 2/2.
- [x] 2026-11-01 **Home: popular wall art + popular artworks rows BUILT (local, not pushed)**. Owner asked whether
      popular Home Decor / Art & Artists items show in "Highly recommended frames" (no: frames only), chose "Har hisse ki
      apni line", saw the design (Desktop\FrameX-Home-Popular-Design) and chose option B (row ABOVE the picture tiles,
      which stay).
      - `ui/home-popular.js`: "Home Decor & Wall Art" row = 10 wall art, popular first (ordered most, then viewed most,
        30 days), FrameX's chosen ones (js/decor.js SHOWCASE trending) while nothing is popular; "Art & Artists" row = up
        to 10 artworks that can be bought (GET /api/artworks), popular first, else newest; no artworks = no row.
        One sideways line (arrows + touchpad / swipe): `.shelf .product-grid--slide` in layout-hero.css (a home shelf's
        rail is a grid from 640 px).
      - Home now loads js/decor.js (~80 KB) + ui/decor-page.js for the wall-art cards. Side effect handled: a shop card's
        "N frames" no longer counts wall art (seed-provider countByShop), so it is the same on every page.
      - `/api/catalog/popular` also counts artwork page views (view_artwork) and returns up to 100 + 100 ids.
      - Tests: backend popular 12/12, site-csp 16/16 (with popular); browser `home-popular-e2e.js` 19/19 (in push-check):
        rows and their place, chosen / newest order, views move a wall art and an artwork to the front, sold artwork
        left out, no artworks = no row, frames-only Highly recommended, the same shop count on Home and Shop, phone
        swipe, no script errors); shop 50, decor 26, suggestions 35 again.
- [x] 2026-11-01 **Better suggestions BUILT (local, not pushed)** after the owner's design round
      (Desktop\FrameX-Suggestions-Design: design pictures 00-04 + built-1..4, laptop and phone; owner answered: best sellers =
      LAST 30 DAYS of orders; the laptop rows move by the < > arrows and the touchpad, not on their own).
      - Home "Highly recommended frames": same look; the frames ordered most in the last 30 days first, THEN the frames
        viewed most in the last 30 days (owner, after the build: "jo jada user views karenge wo top main"; chose "Order
        pehle, phir views"), then the chosen (isRecommended) frames fill the rest, max 10, no repeats; changes with every
        order and view. Backend `GET /api/catalog/popular` (public, product ids only, no counts; orders: test, unpaid,
        cancelled, returned, refunded and older ones don't count, a product counts once per order; views: analytics
        view_item rows, once per visitor, so only visitors who allowed analytics count, bots and FrameX staff never).
        Site `services/popular.js` (waits 1.5 s, then the list remembered from an earlier page; no backend = no list).
        Owner, same day: at most 2 lines on a laptop, at least 8 frames: laptop 8 (2 x 4), wide screen 10 (2 x 5),
        tablet 6 (2 x 3), phone swipes all 10 (layout-hero.css `#recommended-rail`; checked with home-2line-check.js).
        The row shows FRAMES only: popular wall art (Home Decor) and artworks (Art & Artists) don't appear in it.
      - Product page, replacing the 4-card "You may also like": `ui/suggestions.js`
        - Similar products: every product of its category (wall art: its collection), closest first;
        - You may also like: matching-style wall art + frames from other categories (+ best sellers), max 12, nothing
          from Similar;
        - Recently viewed: this browser, newest first, max 20, hidden on a first visit;
        - More products for you: frames, wall art and artworks (GET /api/artworks, sold ones left out, waits 2.5 s at
          most) mixed, 12 at a time, more as the visitor scrolls (IntersectionObserver); things already shown above
          come last.
        Rows: new `.product-grid--slide` (laptop: 4 cards + a slice of the 5th, arrows via railNav) + the existing phone
        swipe rail. Wall-art product: "More wall art like this one" (the old "More <collection>" link is gone).
      - Fixed: a product whose sizes came as records showed "[object Object]" on its card (`pricing.sizeOptions` label;
        ids and prices unchanged).
      - Tests: backend `popular.test.js` 11/11 (added to npm test; full backend 537 pass / 0 fail / 1 skipped before the
        views step); browser `suggest-e2e.js` (scratchpad, now in push-check) 35/35 (home: real COD orders first, then a
        frame 2 visitors viewed, then the chosen ones; the 4 parts and their order, laptop arrows, phone swipe + 2 columns,
        recently viewed, scrolling adds more with no repeats, artwork card, wall-art page, no script errors).
- [x] 2026-11-01 **DEPLOYED** main ec65434 (owner: "push karke live karo"; Neon backup taken by the owner with
      backup-to-pendrive / backup-live-db first; migration 026 runs on Render at start): phone + SMS login with the
      "Phone number | Email" toggle, email optional for new numbers, automatic WhatsApp messages (code only: switched on
      later with WHATSAPP_PROVIDER), WhatsApp number removed, reset page ?token=. Before: backend 529 / 0 (1 skipped,
      concurrency 2: no out-of-memory), browser suites login 45 (SMS=none), phone login 20, cart 47 (re-run alone after a
      15 s navigation timeout under load), frame 55, Studio 37, decor 26, shop 50, account 13, artwork 36, payout 38,
      coupon 20, Care 53, art 74, View on My Wall iPhone 44 + products 49, WhatsApp 10, no-WhatsApp-number 46, reset
      link 6, analytics 45 + 54 + off 7. Render env set before the push ("Save only"): SMS_API_KEY, WHATSAPP_API_KEY,
      WHATSAPP_PHONE_NUMBER_ID. AFTER the deploy the owner sets SMS_PROVIDER=apitxt (then the toggle appears live);
      WHATSAPP_PROVIDER=fast2sms only once Meta approves the 3 templates. NOT in this push: docs/project/costs.md and its
      CLAUDE.md line.
      Live check after the deploy: API health 200; config sms "none" / whatsapp off until set; phone code -> 503
      SMS_NOT_CONFIGURED (correct then); no old WhatsApp number on the privacy page or the site settings; /api/admin/whatsapp
      401. Then the owner set SMS_PROVIDER=apitxt on Render (Save, rebuild, deploy): config sms "real"; the live login box
      (laptop + phone) shows Google, the toggle with Phone number first, the same height on both sides (597 / 596 px), no
      script errors. Still to do: the owner tries a real phone login on shopframex.in; WHATSAPP_PROVIDER after Meta approval.
- [x] 2026-11-01 **Log in / sign up with a mobile number + SMS code BUILT** (owner: "otp masagee par chahiye", not
      WhatsApp; SMS company APITxT, no DLT of our own; email for a new number OPTIONAL: owner chose "Email optional
      (skip kar sakein)"). Local, NOT pushed; same migration 026 (now `026_whatsapp_phone_login.sql`).
      - Login box (owner's layout 2026-11-01, changed the same evening): Google on top, then a TOGGLE "Phone number |
        Email" (the existing .auth-tabs look, Phone chosen first), the chosen box ("Phone number": number keyboard, "We'll
        send a 6-digit code by SMS." / "Email"), "Send me a code", "Log in using password" below. No toggle while SMS isn't
        set up (email only, as before). "← Change number / email" comes back on the same side, filled in.
        Same height on both sides (owner: the box must not change height): the Email box got the same one-line hint
        "We'll send a 6-digit code by email."; the test measures the box (equal to the pixel, laptop + phone).
        Tests: phone-login-e2e 20/20 (laptop + phone) + 1/1 SMS off; login-e2e must now run with SMS=none (45/45);
        e2e-cart 47/47. Earlier the same day: one box "Email or phone number" (replaced by the toggle). Step 1: "Email or phone number" (only while the server can send SMS: GET /api/config
        features.smsDelivery; otherwise "Email" as before). A number -> "We sent a 6-digit code by SMS to ******3210",
        "← Change number" -> a new number: name + "Email (optional)" ("For order emails. Leave it empty to skip.");
        an existing number: straight in. Emails work exactly as before.
      - Backend: POST /api/auth/code/send|verify accept { phone } (Indian mobiles only) next to { email };
        /code/signup takes an optional email for a phone ticket (an email that already has an account -> 409
        EMAIL_TAKEN "log in with that email, then add this mobile number on your account page"). Codes, wait, hourly
        cap and wrong-try limit are the email ones (login_codes.email holds +91…); a shop / staff number gets no SMS.
        Per network address at most 6 SMS sends an hour (on top of the general limit).
      - `users.email` may be empty now: `sendMail` skips an empty address (no_address); orders / painting requests store
        ""; cart reminders skip such customers (admin "Send reminder" says so); password recovery offers SMS only;
        account page "Email: Not added"; the order confirmation drops "a confirmation is on its way to…"; deleting the
        account deletes its SMS codes. Privacy Notice §9: login by mobile + APITxT + no emails without an address.
      - `lib/sms.js`: SMS_PROVIDER=apitxt -> POST https://apitxt.com/api/sendOTP (form: authkey, mobile 91…, otp;
        optional template_id); FrameX makes and checks the code. Config SMS_API_BASE only for the tests' stand-in.
      - Tests: backend phone-login.test.js 11/11 (with an APITxT stand-in); whole backend 448 + 81 re-run alone after
        out-of-memory crashes of account / analytics / api (machine limit, not failures); browser phone-login-e2e 13/13
        (laptop + phone) + 1/1 with SMS off; login-e2e 45/45 (email box unchanged).
      - Still open: APITxT answers (minimum recharge, GST, sender shown), an APITxT account + key in backend/.env and
        Render (SMS_PROVIDER=apitxt, SMS_API_KEY), one real SMS to the owner's number, then deploy (backup first).
      - 2026-11-01 17:1x the owner's LOCAL backend (:4000): stopped, `.data` backed up to
        `.data.backup-2026-11-01-before-whatsapp-phone-login`, migration 026 proven on a copy (all row counts the same, email
        now optional), local `.env` SMS_PROVIDER=none -> dev (codes at http://localhost:4000/dev/mailbox), restarted: health
        200, config sms "dev", email "real", WhatsApp checkbox on (real Fast2SMS key; templates still in review).
      - 2026-11-01 17:4x the owner made the APITxT account (APITxT added ₹10 test credit after a call); key in local
        backend/.env. FIRST REAL SMS: `npm run sms:test` (SMS_PROVIDER=apitxt) -> APITxT accepted (SMS-OTP-17FDC6D97BB871B7) and
        the owner got the code on the phone. Local .env SMS_PROVIDER dev -> apitxt, backend restarted: config sms "real".
        2026-11-01 18:1x the owner added on Render ("Save only", no restart): SMS_API_KEY (APITxT), WHATSAPP_API_KEY
        (Fast2SMS), WHATSAPP_PHONE_NUMBER_ID. NOT yet: SMS_PROVIDER=apitxt (the live code doesn't know "apitxt": the server
        would refuse to start) -> only right after the push; WHATSAPP_PROVIDER=fast2sms -> after the push AND Meta's template
        approval. Still open: Neon backup + push.
      - What customers get (owner's screenshot): sender CP-GLBLNT-S, text "Your OTP is 758682. DO NOT DISCLOSE THIS TO
        ANYONE BY ANY MEANS. This is for login use by you only. Team Global Net" — APITxT's no-DLT route sends under
        another company's ("Global Net") DLT template; FrameX's name is nowhere. Owner: keep it for now, change later.
        Later: FrameX's own DLT (sender FRAMEX, own text) once Udyam / GST exists, or an APITxT template with the brand
        (SMS_TEMPLATE_ID is supported); optional now: a line on the code screen naming the SMS partner (not wanted yet).
- [x] 2026-11-01 **Automatic WhatsApp messages BUILT** (owner: what the admin sent by hand on WhatsApp should go by
      itself; setup done by the owner in Fast2SMS today, see F-15 below). Local, NOT pushed; **migration 026** -> fresh
      backup before deploying.
      - `lib/whatsapp.js`: Fast2SMS Advanced API `POST /dev/whatsapp/v26.0/<phone_number_id>/messages` (Meta's shape:
        template name + language "en", a body component with the values, a separate url-button component with the
        button's {{1}}; Fast2SMS support confirmed 2026-11-01 that the button value must NOT go in variables_values and
        that phone_number_id is required). Key in the Authorization header only; dev mailbox mode; Indian mobile numbers
        only; values cleaned (no "|" / new lines).
      - `services/whatsapp-service.js`: order updates (placed COD / paid, payment failed, shipped, out for delivery,
        delivered, cancelled, refund started / done) from `order-service notify()` + OUT_FOR_DELIVERY in `adminAdvance`;
        new-order alert to each shop / artist from `alertSellers()`; "approved" from shop / artist `deliverSetup()` only
        when the setup email was delivered. One row per (kind, ref, phone) in `whatsapp_messages`: never twice; FAILED
        keeps Fast2SMS's reason. Nothing stored or sent while WhatsApp isn't set up.
      - Config: WHATSAPP_PROVIDER (fast2sms | dev | none), WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID (required),
        template names (defaults framex_order_update / framex_seller_new_order / framex_account_approved),
        WHATSAPP_TEMPLATE_LANGUAGE (en); production refuses "dev". Start-up banner line "WhatsApp:".
      - Checkout: "Send order updates to my WhatsApp <phone>" above Place Order (ticked, remembered when unticked; only
        when GET /api/config says `features.whatsappOrderUpdates`); `orders.whatsapp_updates`.
      - Admin → Settings → "WhatsApp messages": service status, last 30 days sent / failed, latest 5 messages, 3 switches
        (GET /api/admin/whatsapp). Privacy Notice §9 says what is sent and through whom. Deleting an account deletes the
        WhatsApp rows of its orders. backend/README.md + .env.example: WhatsApp section.
      - Tests: backend whatsapp.test.js 14/14 (a Fast2SMS stand-in reads every request); whole backend 492 + analytics 26
        alone (the full run crashed once out of memory in analytics.test.js, a known machine limit); browser
        whatsapp-e2e 10/10 (WHATSAPP_PROVIDER=dev) + 2/2 without WhatsApp (no checkbox, order as before).
      - Still open: Meta approval of the 3 templates (in review), the key + Phone Number ID in backend/.env (owner)
        and Render, one real test message to the owner's own number, then deploy (backup first: migration 026).
      - 2026-11-01 16:3x the owner put the key in backend/.env (Phone Number ID added too). First real send of
        framex_order_update to the owner's own number: Fast2SMS answered 404 "Template not found" (also with en_US): the key
        and the phone_number_id are accepted, the template is still in Meta review. Try again once it is Approved.
- [x] 2026-11-01 **WhatsApp number removed from the whole site** (owner: "WhatsApp number sabhi jagah se hata do"; it was
      the owner's personal number). `assets/data/site.seed.js` contact.whatsapp = "" (so the Contact page line, the
      "WhatsApp FrameX" button on the shop / artist application "done" screens and the order page's WhatsApp link are
      gone; "Send photos" on an old order now opens the Contact page); the number and "or on WhatsApp at …" removed
      from privacy-notice.html §10 and terms-of-use.html §14; "WhatsApp or by email" -> "by email" on index.html,
      services.html, our-story.html, faq.seed.js and the contact form's error. Kept on purpose: FrameX's security lines
      ("we never ask … by phone, WhatsApp or email"), "don't send photos by WhatsApp", the admin's WhatsApp buttons to
      customers' / shops' own numbers. Check: 10 pages x laptop + phone, no wa.me link / number / "write on WhatsApp",
      email shown, no script errors (46/46). Local, NOT pushed. The number is still in OLD git commits (public repo
      history: 0c3e2d6, 3c51a7f, 5f1ca8a) and in local database files / backups (not touched).
      Noticed, not changed: our-story.html still says online checkout "is still to come" (it is live).
- [x] 2026-11-01 **DEPLOYED** main 3db81de (owner: "abhi push karke live karo"; no migration, so no backup needed): View
      on My Wall with iPhone AR Quick Look, "open in Safari / Chrome" in app browsers, plain no-AR error. Before: backend
      504 / 0 (1 skipped), browser suites login 45, cart 47, frame 55, Studio 37, decor 26, shop 50, account 13, artwork
      36, payout 38, coupon 20, Care 53, art 74, Live Demo iPhone 44, Live Demo products 49, analytics 45 + 54 — all
      passed. analytics-off was 6 / 7 only because the old test expected no banner when the server's analytics is
      off; since the cookie banner of 2026-10-16 the banner shows on every page on purpose (written in analytics.js:
      the choice is kept for when analytics is on). Test updated, 7 / 7. Still to try: one product on a real iPhone
      (Safari): upright, facing out of the wall, real size.
- [x] 2026-11-01 **View on My Wall on iPhone / iPad: Apple's AR Quick Look (ARKit)** (owner: "ek ek phone pe wall detect
      nahi kar raha… iPhone/iPad: Apple AR Quick Look… ye wala karo; if mobile support na kare error dikhao; Instagram ya
      WhatsApp support na kare to likho open in Chrome"). LIVE 2026-11-01 (main 3db81de), no migration, no design change
      (existing card styles only). What it does:
      - iPhone / iPad (Safari, Chrome, Edge, Firefox, Google app): the 3D model is made ON THE PHONE
        (`livedemo/ld-usdz.js`: USDZ = USD text + the painted front as JPEG/PNG, zipped stored and 64-byte aligned) at
        the real size, asks to hang on a wall (vertical plane anchoring), opened by Quick Look from a blob: link
        (`#allowsContentScaling=0`, so it stays the real size). Nothing is uploaded. "Open camera" opens Quick Look; then
        a card says what to do in AR and "Nothing opened? Update your iPhone, or open this page in Safari", with "Open AR
        again" and the simple camera view.
      - Inside Instagram / Facebook / Messenger / WhatsApp / Snapchat / Threads / LinkedIn / Pinterest / TikTok /
        Telegram / X / LINE (or any app's own web view): "Instagram can't show AR on your wall." + how to open the page
        in Safari (iPhone) or Chrome (Android) + "Open in Chrome" (Android, an intent link) / "Open in Safari" (iOS 17+,
        https only) + Copy link + the simple camera view (if the app gives a camera) + Close. The button now shows in
        such apps even without a camera.
      - A phone with no AR: Android Chrome without Google Play Services for AR -> "Your phone can't find walls in AR."
        (why + the simple camera view); another Android browser (Samsung Internet…) -> "This browser can't find walls."
        + Open in Chrome. Laptops unchanged.
      - Files: `livedemo/ld-usdz.js` (new), `services/live-demo.js` (device(), camera(), loads ld-usdz.js),
        `livedemo/ld-view.js` (intro(kind), quickLook(), elsewhere(), copy link). Analytics: live_demo_quick_look,
        live_demo_elsewhere.
      - Tests: new browser suite ld-e2e-ios 44/44 (iPhone Safari + Chrome, Instagram iPhone + Android, Facebook without
        camera, an unnamed app, Android Chrome without AR, Samsung Internet, laptop; the Quick Look link caught and its
        model checked with Pixar's USD tools: Apple's ARKit rules, USD validators, zip rules, real size, facing out of
        the wall, pictures bound); USDZ smoke 24/24 (box, cut-out frame picture, 3 panels). Old Live Demo suites
        still pass: part 1 38/38, part 2 34/34, part 3 (WebXR) 43/43, part 4 (every product kind + laptop) 49/49.
        Part 5 (a shop's own product, written 2026-10-09) fails BEFORE View on My Wall: its direct API save of a shop
        product no longer comes out "on sale" (backend untouched here) — an out-of-date test, to update separately.
      - **Not verified:** a real iPhone. Which way Quick Look turns wall content is taken from model-viewer / three.js
        reports (-90° about X, one constant WALL_TURN_X in ld-usdz.js); the owner must try one product on a real iPhone
        (Safari) after the push: the frame should hang upright, facing out, at its real size.

- [x] 2026-11-01 **DEPLOYED** main 65f41c4 (owner: "backup done abhi push karke live kardoo"; backup taken on Neon by the
      owner; migrations 024 login_codes + 025 cart reminders ran on Render at start): login box, cart reminder emails,
      admin Overview + Analytics, Shop by category tiles, ticker fade, real hero frames, footer without the personal
      number, whole-site-test fixes, npm security updates. Before: backend 504 / 0, browser suites all passed (login 45,
      cart 47, frame 55, shop 50, account 13, artwork 36, Studio 37, decor 26, payout 38, coupon 20, Care 53, art 74,
      analytics 45 + 54). Live check (read-only, laptop + phone): API health ok, new routes answer (401 / 422, not 404),
      hero frames use the mouldings, the header opens the login box with Google, login.html -> home with the box, no
      script errors. NOT in this push: docs/project/costs.md and its CLAUDE.md line (margins; the repo is public — owner
      to decide). Still to try live: a real login code email, a real cart reminder ("Send reminder"), admin pages.
- [x] 2026-11-01 Home hero: the hanging frames look like real frames (owner: "full really 100% frame", swing kept): three
      moulding pictures made for it (assets/img/ui/frames/moulding-black|oak|gold.webp, 4-8 KB: mitred corners, rounded lit
      profile, oak grain) used as border-image on .page-hero__piece--framed, a mat with a bevelled window, a glass sheen;
      the nail moved above the moulding. Art & Artists slide (photos) unchanged. Local, NOT pushed.
- [x] 2026-10-31 **Admin Overview + Analytics upgrade + cart reminder emails** BUILT (owner: "abhi direct code par design or
      ye email automation karo"; 1 reminder, with a coupon, 9 am to 9 pm), local, NOT pushed (migration 025 -> backup).
      Overview (admin-page.js + GET /api/admin/dashboard): today's sales / orders / visitors (+ on the site now) / visits
      that ordered (7 days) with change, "Needs your attention" (non-zero only), 7-day sales bars (hover / focus shows
      the day), latest 5 orders, carts left (+ "Send reminder"), low stock, then the old tiles. Analytics overview
      (admin-analytics.js): funnel (visits -> opened a frame -> checkout -> ordered, with a note on the consent-only
      steps), customers (average order, ordered more than once, new / returning, top cities, day x 2-hour heatmap),
      carts left + reminders sent + came back within 7 days. Reminders: services/cart-reminder-service.js, timer every
      10 min in server.js (unlessQuiet), migration 025 (carts.reminded_at, users.cart_reminders_off, cart_reminders),
      email messages.cartReminder (products' own pictures, never the customer's photo; coupon only while usable;
      "Don't send me cart reminders" -> index.html?reminders=off&t=… -> POST /api/reminders/unsubscribe), account page
      switch (PUT /api/users/me/cart-reminders), Admin -> Settings: on / off, hours (24), coupon (XUSE10), daily limit
      (100, leaves the free 300-a-day Brevo quota for login codes and order emails). test/cart-reminders.test.js (11).
      Earlier design request: owner asked for a more advanced
      Overview and a better Analytics. Pictures + README in DesktopFrameX-Admin-Upgrade-Design. Overview: today's 4
      numbers with change, "Needs your attention" (only non-zero tasks), 7-day sales bars, latest 5 orders, carts left
      without ordering (+ "Send reminder"), low stock, then today's shop / artist tiles. Analytics (on top of what is
      there): visitor-to-order funnel, customers (average order, repeat, new / returning, top cities, day x hour
      heatmap), carts left list with reminders. "Send reminder" = a NEW feature (abandoned-cart email via Brevo;
      WhatsApp needs the WhatsApp Business API). Owner also asked how big sites message visitors who didn't order:
      explained in chat (logged-in carts -> email / WhatsApp with consent; anonymous visitors -> ad retargeting only).
- [x] 2026-10-31 **Login as a BOX, no login / sign-up page** BUILT 2026-10-31 (owner: "abhi code par karoo"), local, NOT
      pushed. ui/auth-gate.js is the box: every link to login.html / signup.html opens it while logged out (header "Log
      in", phone Account tab, footer "Shop Login"); login.html / signup.html send old links to index.html?login=1 (with
      ?next / ?type=shop) and the box opens there; a page that needs a login (auth.guard) opens it over itself ("Log in
      to open this page"; closed -> home; logged in -> the page reloads); cart / add / buy keep their notice. After a
      login the box asked for itself: a customer stays on the page (or goes to ?next); shop / artist / staff go to their
      dashboard. ui/auth-pages.js: codeStart "Log in or sign up" (Google, email, "Send me a code", "Log in using
      password", Terms line), codeEntry "Enter the code" (step 2, "← Change email"), nameStep "Welcome to FrameX!"
      (name guessed from the email, "from email" tag until changed, no phone), passwordLogin (both tabs). Sign-up form
      and "Sign up using password" removed. CSS: step bars + name tag (auth.css), box 440 px / round (overlays.css),
      phone bottom sheet (mobile.css). login-e2e 45 / 45 (laptop + phone); old suites log in through the box's password
      form (mx-e2e-lib signUp = API account + box password login). store/cart.js: an item waiting from before a detour
      (e.g. "Forgot password?") is added right after the next login in the box too, not only on a page load (never twice
      when the box itself was opened for the item). Design request: owner (after asking how
      Flipkart does it): no separate login page, a box over the current page: email (or Google) -> code -> name filled
      in from the email (changeable) -> in; existing customers skip the name. Pictures + README in
      DesktopFrameX-Login-Box-Design (laptop centred box, phone bottom sheet, 3-step bar). Plan: signup.html and
      "Create an account" / "Sign up using password" removed; login.html opens home with the box; password login
      (shops, artists, old users) inside the box; forgot-password page stays.
- [x] **(owner, 2026-10-31): a simple login and sign-up** BUILT 2026-10-31, local, NOT pushed (needs migration 024 ->
      fresh backup before the deploy). Owner chose "A" (an unknown email on the login page gets a code and then "Almost
      done" = a new account) and "every login page at least 100vh, laptop and phone". Backend: login_codes table
      (024), POST /api/auth/code/send | verify | signup (services/auth-service.js sendLoginCode / verifyLoginCode /
      completeCodeSignup), emails loginCode + loginCodeRefused (a shop / artist / staff / disabled address gets "log in
      with your password", so the answer never shows who has an account); same limits as the reset codes (10 min, 30 s
      wait, 5 an hour, 5 tries); account deletion removes the address's codes; test/login-code.test.js (8). Frontend:
      ui/auth-pages.js codeStart / codeEntry (6 boxes, typing moves on, paste fills, sends itself) / nameStep /
      passwordLogin (the earlier tabs + form) / passwordSignup (the earlier form); the login dialog uses the same;
      store/auth.js sendLoginCode / verifyLoginCode / codeSignup; auth.css (.otp-boxes, .auth-mail, login pages
      min-height 100vh), mobile.css (code boxes). Browser: login-e2e (laptop + phone). Old suites updated to press
      "using password" first (mx-e2e-lib usePassword).
      Original request:  ("login ko simple karna hai nahi toh user bhag jayega").
      Two ways only: (1) email (Gmail) with a one-time code (OTP) sent to it, (2) Continue with Google. Sign-up the same
      (email + code, or Google). It must look simple: one email box, and under it a small "Log in using password" link.
      Design first: pictures in Desktop\FrameX-Simple-Login-Design, build only after the owner's "haan". (This reopens
      the fixed design for the login / sign-up pages only, at the owner's request.) Backend: a code login is new (today
      codes exist only for password reset, by email; SMS has no key), so it needs new /auth routes + tests.
      DESIGN DONE 2026-10-31: 6 screens (login, code, password, sign-up, code, "Almost done" name) + before, laptop +
      phone, README in Hinglish; open question to the owner: an unknown email on the login page -> (A) straight to a new
      account or (B) a message. Waiting for "haan".
- [ ] Waiting on the owner (2026-10-31; the push itself was DONE 2026-11-01, main 65f41c4; WhatsApp number removed
      everywhere 2026-11-01): WhatsApp number on Contact / Privacy / Terms / application / order pages (remove or business number);
      "Explore Wall Art" target; sample-item links at launch clean-up; after the push, one real email (nodemailer update).
- [x] 2026-10-30 **Security check** (owner sent an Instagram reel on securing AI-built sites; only its caption could be
      read): no secrets in tracked files or in any of the 76 commits; .env ignored; Pages serves no backend/docs/.bat
      (404); all private routes guarded (live: 401 without login on admin / orders / cart / addresses / uploads / shop
      dashboard / artist / care / users); CORS only shopframex.in; API headers HSTS + CSP + XFO + nosniff; SQL always
      parameterised; 500s say nothing internal; public forms validated (javascript: portfolio refused); script-in-text
      probe through shop / artist applications, contact, customer name and address shows as plain text on account and
      22 admin views (never HTML). Fixed: npm audit (body-parser 2.4.0 high, nodemailer 10.3.1, qs 6.17.1) -> 0
      vulnerabilities, backend 486 / 0; owner's personal Gmail removed from a code comment and their UPI ID from these
      docs (still in old commits; history not rewritten). Report: DesktopFrameX-Site-Test-ReportSECURITY-CHECK.txt.
      After the next deploy: check one real email (nodemailer update). Local, NOT pushed yet.
- [x] 2026-10-30 Fixed from the whole-site test (owner: "jo galtia hai usko thik karo ... everything change ke bina"):
      (1) artist.html / artwork.html without a name in the link now say "We couldn't find that artist / artwork"
      (ui/art-pages.js; no request with an empty name); (2) custom painting links open the artists list
      (art.html?view=artists): home "Custom painting" tile, paintings.html "Find an artist", the empty-list "Meet the
      artists" button (ui/painting-pages.js), the artist-not-found "See all artists"; (4) Admin -> Promotions -> New /
      Change opens at the top of the form (ui/admin-promotions.js). Checked on :4100, no errors. Not touched: (3)
      sample-item links (launch clean-up), (5) WhatsApp number and (6) "Explore Wall Art" (owner to decide).
      Local, NOT pushed yet.
- [x] 2026-10-29/30 **Whole-site test before the December launch** (owner asked: every page, link and button). Test site
      :4100 with data (incl. the unpushed local changes) as guest / customer / shop / artist / admin, laptop + phone: 273
      page loads, 16,454 link checks (272 destinations), 3,039 buttons pressed: no broken link, no missing jump target,
      no button error. Live shopframex.in read-only: 72 pages, 396 links, all fine. Flow suites all pass (frame 55, shop
      50, artwork 36, art 74, Studio 37, decor 26, cart 47, account 13, coupon 20, care 53 with CARE_HOURS=0-24
      CARE_WAIT_SECONDS=30, payout 38 with PLATFORM_COMMISSION_PERCENT=10, join 22, shops 35, social 16 with the :4012
      stand-in, designs 14, frames 25). Old suites that fail on outdated expectations (not site bugs): e2e-auth /
      e2e-checkout (missing seed files), chat-e2e, coupon(-admin) home banner, theme (dark default), rv (JPEG vs WebP),
      heic (GET /uploads), promo (Save button under the fixed header after the jump), buynow (env fees vs admin settings).
      Report: DesktopFrameX-Site-Test-Report (README + every link and button). Found:
      (1) artist.html / artwork.html without an id stay on the grey loader (TypeError; GET /artists/ returns the list);
      (2) home "Custom painting" tile (art.html#browse) and paintings.html "Find an artist" (art.html) open the artworks
      view, should be art.html?view=artists; (3) hard-wired links to sample items (index hero p-001/p-002/p-004,
      services "Shop Now" p-017, hd-custom-split-3) must be re-pointed at launch clean-up; (4) admin New promotion keeps
      the list scroll; (5) WhatsApp number still on contact / legal / application / order pages; (6) services "Explore
      Wall Art" opens shop.html?category=wall-art. Waiting for the owner on what to fix.
- [x] 2026-10-29 Running-cost estimate for the owner (first step before margins), 500 vs 2000+ users a month:
      ≈ ₹1,300 / month (₹15–16k a year) at 500, ≈ ₹6,000–9,000 / month (₹75k–1.1 lakh a year) at 2000+.
      Prices from web pages on 2026-10-29, not confirmed with the providers. All calculations: `costs.md`.
- [x] 2026-10-29 Order costs (costs.md §2): 10–15% of users order, 50% COD / 50% online, 20% of COD returned →
      ≈ ₹177 per order on average, total with running cost ≈ ₹10–15k / month (500 users), ≈ ₹41–62k (2000 users).
- [x] 2026-10-29 Profit plan (costs.md §3): shop price + 18%, COD +3%, UPI −4% → LOSS on every order (≈ −₹69 at
      ₹1,000; −₹4.8k / month at 500 users, −₹21–28k at 2000). Suggested Plan B (30%, UPI −2%, ₹49 delivery) ≈ +₹1.6–10k /
      month; Plan B2 (+ no COD on custom frames) ≈ +₹3.5–21.5k. Owner to choose.
- [x] 2026-10-29 Marketing added (costs.md §4): Instagram / Meta ads ≈ ₹4.5k / month (500 users), ≈ ₹18k (2000).
      With ads: Plan A −₹9–46k / month, B2 about break-even, 40% markup (C40) +₹1.5–18k. Ad buyers order less (1–3%), so
      test ads small first.
- [x] 2026-10-29 WhatsApp added (costs.md §5): ≈ ₹2.1k / month (500 users), ≈ ₹4.8–5k (2000); with it only C40 at 15%
      ordering stays in profit. Built the "FrameX Profit Calculator" (private claude.ai page) where the owner changes every value.
- [x] 2026-10-29 Lean start (costs.md §6): with 30% markup, no COD on photo frames, free tools and small ads → +₹3.4–6k /
      month at 500 users, +₹5.8–16k at 2000. With 18% markup still a loss. Owner to choose the markup.
- [x] 2026-10-29 Explained how Amazon / Flipkart earn from sellers (costs.md §7) and what FrameX can copy: shop packs and
      bears COD-return loss, customer pays delivery, sell featured shop / banner places. Owner to decide.
- [x] 2026-10-29 Excel "FrameX Expencivess.xlsx" on the owner's Desktop (name as the owner asked): website + delivery
      cost a month for 500 / 2000 users at 10 / 15%, yellow cells editable, formulas checked. ₹49 delivery from customers
      covers about 30% of delivery cost (not half: returned orders pay nothing, average delivery ₹145).
- [x] 2026-10-29 Same numbers as a 2-page PDF for the co-founder: "FrameX Expencivess.pdf" on the Desktop (English).
- [x] 2026-10-29 Delivery options listed (costs.md §8). Finding: no courier integration in the code yet (booking + tracking would be manual).
- [ ] Owner: sign up free on 2–3 aggregators (Shiprocket, NimbusPost, Shipmozo), check real rates with a real box size.
      2026-10-31: Shiprocket account created (seller panel open; profile 1/5, KYC not done, wallet ₹0, no pickup address).
      Process given in chat: rate calculator first, KYC (individual), bank, pickup address, wallet only after the
      founders decide; "Connect My Store" is not for FrameX (custom site) → orders by hand (Add Order) until an API is built.
      First real quote (2026-10-31): 759024 → 759017 (same district, Dhenkanal), prepaid, value ₹500, chargeable 0.75 kg,
      "Dangerous goods: Yes" + "Secure shipment: Yes" → only 2 couriers (Delhivery Air / Surface) at ₹137.72. To re-check
      with Dangerous goods = No (glass frame is fragile, not dangerous) and a box under 0.5 kg.
- [x] 2026-10-29 "FrameX Delivery Process.pdf" on the Desktop for the co-founder (English, 3 pages, diagrams): how an
      aggregator works, one-time setup, every order, delivered / not delivered, address entry, zones, decision (a) / (b).
- [ ] Owner is thinking of launching on 1 January 2027 (not final). Launch hype plan given in chat 2026-10-29 (waitlist,
      shops / artists first, photo contest, countdown, midnight launch, launch coupon via Admin → Coupons, Valentine's
      follow-up). Before launch: real listings instead of samples, Render paid plan (no sleep), SMS key, GA4 ID, courier
      account, fresh backup, full test of orders / payments. Marketing must stay factual (prd.md §4: no fake numbers).
- [x] 2026-10-30 "FrameX Launching Plan.pdf" on the Desktop for the co-founder (English, 2 pages: timeline to scale,
      4 phases, budget ₹5–15k, launch checklist).
- [ ] Owner: small orders (₹100–250) lose money on delivery (costs.md §9). 2026-11-01: a suggested delivery plan (minimum
      order, two delivery steps, COD minimum + fee, no COD on photo frames) is in costs.md §10 (private); waiting for the owner.
      2026-11-02: the owner's own model (shop gets its full price, free delivery inside the price, UPI discount, COD +₹49,
      no COD on photo frames, artworks COD with 50% advance) worked out in costs.md §11 with a price formula; NOT built:
      UPI discount, 50% advance for artwork COD, automatic listing price. 2026-11-02 the owner DECIDED the formula
      ("isko save karo, sabhi iske bad use karenge"): costs.md §11 (private). Still to build when the owner says: UPI
      discount, artwork COD advance, auto listing price (optional), settings change (delivery 0, COD fee 49, commission and
      payout charge 0%, no COD on photo frames). Choose: minimum order value, COD minimum,
      combos, add-on items (minimum order + COD minimum are NOT built; small features).
- [ ] Owner: choose the plan; decide who pays the shop for a returned COD photo frame; ask a CA about GST / TCS; real
      courier rates. Still open from before: real numbers for making cost, courier / COD / RTO charges, packing, who pays the
      courier for shop products → then update costs.md §3 with them.
- [x] 2026-10-29 Footer: the WhatsApp number is no longer shown (owner: it is their personal number); only the
      email stays (ui/chrome.js contactLinks). Local, NOT pushed yet.
- [x] 2026-11-01 DONE (owner: "WhatsApp number sabhi jagah se hata do"), see Now. Was: the same number is still on the Contact page, the shop / artist application "done" screens
      (WhatsApp button), the order page ("send photos on WhatsApp"), and written into privacy-notice.html and
      terms-of-use.html. It comes from `contact.whatsapp` in assets/data/site.seed.js (the two legal pages have it
      typed in). Remove everywhere, or replace with a business number?
- [x] 2026-10-29 Home ticker under the hero (Premium frames, HD printing …): words show only across the page content width and fade at the content edges (140 px), laptop and up only (owner
      asked; layout-hero.css, two overlays in the strip colour, dark mode too). Phone unchanged. Local, NOT pushed yet.
- [x] 2026-10-29 Owner: the design is FIXED, from now on only feature upgrades (rules.md §4, memory.md).
- [x] 2026-10-29 **Home page: new "Shop by category" only** (owner first chose 4 parts of the design in
      DesktopFrameX-Home-Naya-Design and had them built, then: "shop by catagory ko chod kar jitnaa bhi change kiya
      hai removed kar doo"). Kept: `#categories` as 6 square picture tiles (Photo Frames, Collage Frames, Create Your
      Frame, Ready Designs, Home Decor, Art & Artists; phones one swipe row of 84 px tiles); the old big cards and
      the category chips row under them are gone. Removed again (back as before): the new trust strip, Shop by
      occasion, and Home Decor + Art in one part. CSS: layout-hero.css + mobile.css (phones). Checked on :4100
      laptop + phone: rest of the home unchanged, no sideways scroll, no errors.
      Then (owner, same day, "ye 3 box ko removed karke shop by category add karo usmain"): the three boxes under
      "Your photo, framed by a local shop" / "Start here" (Frame my photo, Ready-made decor, Gift templates) are
      gone and the category tiles sit there instead (`.how__cats`, id `categories` kept for the footer link); the
      separate category section further down is gone. Laptop: the 1-2-3 steps, then the tiles. Phone: "Start
      here" heading hidden (the tiles have their own "Shop by category" heading). Old `.how__way*` CSS removed.
      Checked :4100 laptop + phone, no errors. Local, NOT pushed yet.
- [x] 2026-10-28 **Header stops at the footer** (owner: navbar must not stay stuck over the footer, "direct code"): when
      the footer reaches the header, the footer pushes the header up and out of view (ui/nav.js, CSS translate, all
      pages, laptop + phone); scrolling back up brings it back; opening the phone menu brings it back too. Checked on
      :4100, Home + Art, laptop + phone, no errors. **DEPLOYED 2026-10-29** main 7958b8a (owner: "abhi sabhi live karoo"; no migration): before the push browser frame 55, shop 50, artwork 36, art 74, Studio 37, decor 26 and backend 486 / 0 all passed; live check laptop + phone, Home + Art: header gone at the bottom, back at the top, no errors.
- [x] 2026-10-28 **DEPLOYED** main 010875c (owner: "abhi ssabhi push karke live kar dooo"; no migration, so no backup
      needed): easy "Add artwork" + admin Artworks tab, Before / After (no View on My Wall for artworks), Art & Artists
      opens on the artworks, footer bottom line, the new footer (running strip, navy + warm line). Before the push:
      backend 486 / 0, browser frame 55, shop 50, artwork 36, art 74 (Cashfree stand-in), Studio 37, decor 26 — all
      passed. npm test ran out of memory at 6 files at once with 4.3 GB free (V8 "Fatal process out of memory: Zone"):
      passed at 3 at once. Also in the commit: the owner's VS Code reformatting of index.html / login.html (line
      wrapping only; their inline-script CSP hashes still match). Live check (read-only, laptop + phone): Home, Art, Shop,
      artwork, login open with no script / CSP errors, navy footer + running strip on every page, Art & Artists opens on
      Artworks (live has no artworks yet), no sideways scroll. Not yet: a real artwork added live (also proves the backend).
- [x] 2026-10-28 **Footer: the "what FrameX offers" row runs** (owner, straight to code): one line moving right to left,
      both ends fading (mask), loops without a jump (the list twice; the copy aria-hidden), pauses under the pointer; for
      "less motion" it stands still and wraps. Phones: shown too since 2026-10-28 (owner: "mobile scrren par bhi"; smaller, checked at 390 and 320 px). chrome.js + footer-faq.css +
      mobile.css. Checked: moves ~41 px a second, one line, fades, no sideways scroll; still with less motion. Local.
- [x] 2026-10-28 **Footer: fade from the page into the black footer** (owner: the hard white-to-black edge looks bad).
      DESIGN READY in Desktop\FrameX-Footer-Fade-Design: A = a plain long fade, B = the fade + a soft orange glow; the fade
      starts from the colour just above the footer (light blue or white). Owner: neither ("bilkul acha nehi lag raha":
      grey between white and black looks muddy). Second try in Desktop\FrameX-Footer-Naya-Jod-Design: C = rounded dark
      card on the page colour, D = curved top edge, E = deep navy + a thin orange light line, F = card + orange glow.
      Owner chose **E** ("ye wala"). **BUILT 2026-10-28**, local, not pushed (footer-faq.css only): the footer is deep navy
      #0d1b3e turning black (#0c0d0f by 640 px), with a thin orange light line along its top edge (its glow spills a little
      above; overflow clips sideways only). Checked: Home + Art page, laptop + phone, no sideways scroll, no errors.
- [x] 2026-10-28 **New footer like the owner’s reference picture** (near-black; centred heading + line; grey feature badges;
      a huge faint FRAMEX word; brand + 4 short columns Shop / Create / Company / Help; copyright left, legal links right).
      DESIGN in Desktop\FrameX-Footer-Design; owner: no feature badges on phones (3-phone-footer-NAYA.png).
      **BUILT 2026-10-28** ("hm abhi code chnage karo"), local, not pushed: ui/chrome.js footer() (every page), footer-faq.css
      (laptop), mobile.css (phones: badges hidden, smaller heading). The Legal column is gone: Terms / Privacy / Cookie
      settings stay on the bottom line. Every old link is kept, regrouped. Checked: one screenshot each (laptop, phone), no
      sideways scroll, no script errors, Cookie settings button present.
- [x] 2026-10-28 **Footer bottom line** (owner, straight to code, no design): "© 2026 FrameX. All rights reserved." on the left,
      Terms of Use / Privacy Notice / Cookie settings on the right, from 600 px up (footer-faq.css). Phones unchanged.
      Checked with one screenshot each (laptop, phone). Local, not pushed. The FrameX Care button can sit over "Cookie
      settings" at the very bottom of a laptop page (it floats; it was so before, too).
- [x] 2026-10-28 **Art & Artists page: artworks first** (owner: only artists were listed, buyers had to open every profile to
      see art). DESIGN READY in Desktop\FrameX-Art-Page-Design: the page opens on all artworks (Artworks | Artists, Artworks
      first), type filters, a small "Meet the artists" strip above the grid ("See all artists" = the old list), cards with
      the artist's face + city, "from ₹ · N sizes" for prints, a "Before / After" badge; hero button "See the artworks".
      **BUILT 2026-10-28** (owner: "hm bhai abhi code par karo"), local, not pushed, frontend only (ui/art-pages.js, art.html,
      art.css). art.html?view=artists still opens the artists list. On the artist's own profile the cards show medium and
      size instead of the artist. Fixed on the way: "Load more" showed even when everything was shown (.section-more's
      display: flex beat [hidden]; #art-more[hidden] now hides it). Checks: browser artwork 36/36 (Art page 6 new), art
      74/74 (its directory checks now open ?view=artists).
- [x] 2026-10-27 (LIVE 2026-10-28, main 010875c) **Artists: the same easy "Add artwork"** (owner: main photo → PNG for View on My Wall → sizes + prices →
      delivery time → submit; admin approves; admin can list for any artist; artworks inside admin All frames). DESIGN READY in
      DesktopFrameX-Add-Artwork-Design: My artworks, 4 steps (Photos, Sizes & price, Delivery, Check & submit), admin All
      frames with Frames | Artworks tabs and "For which artist?". Owner: "Done abhi Code par banao".
      **BUILT 2026-10-27, local, not pushed** (no migration). Artist dashboard Artworks → Add / Edit opens the 4-step editor
      (ui/artwork-editor.js); the old long form stays as "…/<id>/advanced". Step 1 Photos: up to 8 photos + the View on My
      Wall picture: the main photo, its own picture (POST /api/artist/media/wall-art?mode=auto|keep: lib/frame-cutout.js
      removes the plain wall around the artwork, keeps the art itself, WebP) or none. Step 2: title, art type, medium,
      Original (exactly 1 size, 1 piece) or Prints (up to 8 sizes, each its own price, one copies count), frame included.
      Step 3: ready-to-send days, days on the way (min–max), packing (tube / flat / crate), ships from; "Buyers see" line.
      Step 4: check and submit → waiting for FrameX review. Admin: All frames → tab Artworks (#/products?tab=artworks):
      filter by artist / status, Edit / Approve / Reject (reason) / Hide / Show again; "Add artwork" → "For which artist?" →
      same editor; admin save is published at once (GET /api/admin/artworks?artist=, GET/PUT
      /api/admin/artists/:artistId/artworks/:id, POST /api/admin/artists/:artistId/media[/wall-art]). Buyers: artwork page
      size chips with prices, "Delivered in about X–Y days", delivery fact; cart / Buy now carry the chosen size (sizeOptions
      priceDelta). (View on My Wall for artworks was built here and replaced on 2026-10-28 by Before / After, see below.)
      Checks: backend 486 / 0 (artwork-steps 4 new), browser artwork 22/22, art 74/74 (run with PROVIDER=cashfree: the
      custom-painting advance test needs the Cashfree stand-in), shop 50/50.
      Not done: one artwork that is both an original and prints; a real artwork added live.
      **CHANGE 2026-10-27 (owner):** "View on My Wall" is no use for art. Instead the artist adds the photo of the drawing
      (main) + the original / reference photo it was drawn from; buyers compare them with a Before / After slider on the
      artwork page (no View on My Wall there). NEW DESIGN in DesktopFrameX-Add-Artwork-Design (old one in "Purana (View on My
      Wall wala)"): step 1 = artwork photo, original photo (+ "I may show this photo" tick, or "Drawn from imagination"),
      Before / After preview, more photos; step 4 and the buyer page show the slider.
      **BUILT 2026-10-28** (owner: "hm bhai aabhi Code main Karo"), local, not pushed, no migration. The wall-picture code is
      gone (no /media/wall-art, frame-cutout and ld-subject back as they were, no View on My Wall on artwork pages). Artwork
      data: reference { media, consent } (shown only when the artist ticked "I may show this photo"; never one of the
      artwork's pictures) or imagination: true. New ui/before-after.js (drag with mouse / finger, arrow keys; styles .ba in
      art.css) used by the editor (step 1 preview, step 4) and the artwork page (Before / After first, then the photos as
      thumbnails). The old long form ("…/advanced") now keeps sizes, delivery and the original photo when saved.
      Checks: backend 486 / 0 (artwork-steps 4: the original photo rules), browser artwork 31/31, art 74/74 (Cashfree
      stand-in). Once, a full npm test run had 5 storage.test.js failures (files left on disk) that did not come back:
      storage alone 12/12, the next full run 486 / 0.
- [x] 2026-10-27 **DEPLOYED** main 22575b6 (owner: "Abhi bhai Live kar doo"; no migration, so no backup needed): "Add a frame" + My
      frames + admin All frames + customer photo inside the real frame + see-through View on My Wall. Live check: new files
      served, admin / shop dashboard pages load them, /media sends CORS, Home / Product / Home Decor open with no errors
      (phone + laptop). Not yet: a real frame added live by a shop / the admin.
- [x] 2026-10-27 **Simple "Add a frame" BUILT** (owner: "Broo garate Work ! , abhi Code par change karo"; design
      Desktop\FrameX-Add-Frame-Design). Shop dashboard "My frames" + 4-step editor (ui/frame-editor.js): Photos (model photos;
      frame FRONT uploaded to /media/frame-art: server lib/frame-cutout.js removes the plain background outside and the
      photo space inside, finds that space, shop drags the orange box to adjust; full PNG for View on My Wall or "same as
      front"; "I only have model photos"), Details (name, category, style, material, colour, cover, customer photos,
      description, sizes + prices table, discount, stock, copy from another frame), Frame Components (layers: add / edit /
      ↑↓ / remove / photo, kept in the shop's order), Check & publish. The old 9-step wizard stays as "Full editor"
      (#/products/<id>/advanced). Admin "All frames" (ui/admin-frames.js): every shop's frames, filter by shop / status,
      search, Edit / Duplicate / Approve / Hide / Show again, "Add a frame" → "For which shop?" → same editor; admin
      publish goes live at once (routes /api/admin/shops/:shopId/products|media). Customers: product.frameArt; product
      page "How it fits" and the gallery's first picture show their photo INSIDE the real frame (services/frame-art.js,
      shaped spaces kept); cart / order picture = frame + photo; View on My Wall from the frame picture at the chosen size.
      /media now answers the website's CORS (canvas). No migration. npm test now runs 6 files at a time
      (--test-concurrency=6): 16 at once ran the PC out of memory. Checks: backend 482 / 0 (frames 6 new), browser
      frames 23/23, shop 50/50 (updated for My frames), frame 55, Studio 37, home 40, banners 35. Local, not pushed.
      Not done: catalogue-file frames (js/edit.js samples) don't show in a linked shop's "My frames" (they are FrameX's,
      removed at launch). Artists: later (owner).
      Fix 2026-10-27 (owner saw an empty "With a sample photo" on Live Server :5500 + backend :4000): a picture first shown as a
      plain <img> was cached without CORS, so it couldn't be drawn. /media now sends Vary: Origin, and frame-art.js loads its
      drawing copy with ?draw=1. Checked with the site and the API on different addresses (:4200 / :4100).
      Fix 2026-10-27: the View on My Wall button vanished once the customer added a photo (the gallery is drawn again for
      "Your photo in this frame"); it is now put back. The button shows only on a device with a camera (phones; a laptop
      without a webcam shows none). Frames browser test 25/25 (phone check added).
      Fix 2026-10-27 (owner: black background on the camera): View on My Wall drew every piece as a solid box, so a frame
      PNG's transparent parts showed black. Cut-out pieces (ld-subject fromFrameArt) are now drawn see-through in WebGL
      (no box sides, premultiplied texture, discard where clear) with a shadow in the picture's own shape. Checked by reading
      WebGL pixels (inside / corner transparent, frame solid); frames test 25/25.
- [x] 2026-10-27 (LIVE 2026-10-27, main 22575b6) **Frames shown the right way** (owner corrected my first idea: do NOT put the customer photo into the styled
      photo). Each frame = a MODEL photo (styled, to sell it) + a FRONT PNG (straight, background and opening transparent);
      the customer's photo goes inside the FRONT for the product preview, cart, order, shop / admin order and View on My Wall;
      drawn corner / back pictures stop. Owner: delete today's dummy frame products + images, list fewer frames properly.
      DESIGN READY in DesktopFrameX-New-Frames-Design: 6 frames drawn by me (Classic Black, Natural Oak, Walnut Heritage,
      Royal Gold, Modern White, Silver Metal), screens, shop form with the 2 pictures (plain background removed, opening found
      automatically). Owner then asked for 20-30 unique designs → DESIGN READY in DesktopFrameX-30-Frames-Design: 30 frames
      drawn by me in 6 groups (Family 4, Pets 3, Baby 3, Love & wedding 4, Trending borders 10 incl. coral / wavy / scalloped /
      rattan / arch, Classic 6), model photo + front PNG + a photo-space mask each (heart / cloud / arch shapes keep the photo
      inside). Pet model photos use the cat poster until the owner gives a real pet photo. Waiting for "haan".
      Old folders FrameX-Real-Frame-Preview-Design (wrong idea) and FrameX-New-Frames-Design (first 6) are superseded.
      Udyam: owner, 2026-10-28.
- [ ] **Facebook login: waiting for Meta business verification** (2026-10-26). Meta app "FrameX" made (App ID 2610632082716960,
      public; email + public_profile added; App domains, privacy / terms / data-deletion URLs, icon, category Shopping filled).
      Publish needs a verified Meta Business portfolio = business documents (Udyam / GST / bank statement in the business
      name). Owner has none yet → do Udyam first, then verify, publish, and only then set FACEBOOK_APP_ID + FACEBOOK_APP_SECRET
      on Render (the secret only there, never in chat). Until then the Facebook button stays hidden; Google login is live.
- [x] 2026-10-26 **DEPLOYED** main bfcb26f (owner: "Promotions karlete hai fir direct sabhi push karenge"; production backup taken
      first by the owner: pen drive `framex-db-live-20261026-2109.fxdb`). Live: migrations 022 + 023 ran; API lists 11
      promotions; GOOGLE_CLIENT_ID set on Render by the owner (full id, checked via /api/config); Facebook off. Live check
      (read-only, phone + laptop): Home 5 picture banners + 3 strips, Shop / Product / Home Decor 1 strip each, login shows
      Google's real button, no script errors. Not yet: a real Google login on the live site by the owner, Admin → Promotions
      used live.
- [x] 2026-10-26 **Admin → Promotions BUILT** (owner: "hmm abhi code main banao"; design Desktop\FrameX-Promotions-Admin-Design).
      Migration 023 `promotions` (placement, title = alt text, link, laptop / phone picture: website file or uploaded,
      position, on / off, first / last day, hide rule COUPON:<code> / FIRST_ORDER_FREE), seeded with today's 5 banners +
      6 strips. services/promotion-service.js; admin routes /api/admin/promotions (list, create, change, move, delete,
      picture upload → WebP no wider than the place, a warning for a different shape); public GET /api/promotions (1 min
      cache); /media/promo/:id/:which. Website: ui/promotions.js (replaces promo-strips.js) fills every
      data-promo-slot; offers.js waits for the banners; without the backend the page's own pictures stay. Admin: menu
      "Promotions" (ADMIN only), list by place with ↑↓ / Edit / on-off / delete, form with size check + live preview.
      Checks: backend 476 pass / 0 fail (promotions 7), browser 19/19 (admin flow + website), home 40, Studio 37, shop 50,
      account 13, banners/strips 35. LIVE 2026-10-26.
- [x] 2026-10-26 **Google + Facebook login BUILT** (owner: "Haan banao dono"; design Desktop\FrameX-Social-Login-Design).
      Buttons on the customer login, sign-up and the login dialog, above the form, with "or log in with email / phone";
      not on the Local shop tab. Google draws its own button (Google Identity Services, ID token); Facebook's SDK gives an
      access token; the backend checks either with Google / Facebook (lib/social-login.js: Google's keys + aud / iss / exp /
      verified email; Facebook debug_token for FrameX's app + appsecret_proof). New email = new CUSTOMER (no password, no
      phone); same email = that customer account; staff / shop / artist emails must use their password. Account page: "Set
      password" for such accounts, delete with DELETE only. Migration 022 (users.google_sub, users.facebook_id) — backup
      before deploy. CSP on 39 pages allows accounts.google.com and Facebook. Privacy notice updated. Buttons show ONLY when
      the server has GOOGLE_CLIENT_ID / FACEBOOK_APP_ID + FACEBOOK_APP_SECRET (none set yet = nothing changes on the site).
      Checks: backend 469 pass / 0 fail (new social-login test 10), browser 16/16 (stand-in Google / Facebook), off-mode 4/4,
      account 13/13. Local, not pushed.
- [x] 2026-10-26 Google OAuth client made by the owner (Google Cloud project "FrameX", client "FrameX website", origins
      https://shopframex.in + http://localhost:5500; account siburam.n7). Client ID set in the LOCAL backend/.env; the owner's
      :4000 backend restarted (migrations 020-022 applied; copy first: backend/.data.backup-2026-10-26-before-heic-review-social).
- [x] 2026-10-26 Real Google login WORKS locally (owner tested on localhost:5500 with the :4000 backend). App published
      (In production; only name + email asked, so no 100-user cap applies).
- [ ] Owner: Google Auth Platform → Branding (home page, privacy + terms links, authorized domain shopframex.in; no logo)
      → Audience → Publish app. Then delete the client secret (not used; it was shown in a screenshot). Render: GOOGLE_CLIENT_ID.
- [x] 2026-10-26 **Picture banners + promotion strips BUILT** (owner: "abhi sabhi jitna strip or banner sab lagao page par
      direct"; designs in Desktop\FrameX-Banner-Design and Desktop\FrameX-Promo-Strip-Design). Home: the 5 offer banners are
      now one picture each (laptop 2400×760 / phone 1080×608, assets/img/home/banners), the whole banner is the link, the
      banner takes the picture's shape (nothing cut off); Diwali "Copy code" is gone (the code is in the picture). 6 strips
      (assets/img/promo, laptop 2400×300 / phone 1080×260, `.promo-strip` in components.css): Home after the banners
      (Diwali fest), after Recommended (featured shop Mithus Frame FRX-SHOP-1001, "AD"), after Shops (Sell on FrameX →
      partner.html); Shop page under the Shops list, above All frames (free delivery; moved there by the owner); Product page above "You may also like" (Studio); Home Decor after
      Featured (gift). No hover effect on any banner or strip (owner). New `ui/promo-strips.js` (started by main.js): a coupon strip goes when the coupon ends, the
      free-delivery strip when that offer is off — like the banners. The old offer photos were removed from the site (kept
      with the generator scripts in Desktop\FrameX-Banner-Design\0 - Source). Checks 35/35 (phone + laptop, pictures,
      shapes, links, no script errors, coupon ended), home UX 40/40. Local, not pushed.
      Open (owner to answer): an admin "Promotions" section to change strips without code; paid shop promotion or not.
- [x] 2026-10-25 **DEPLOYED** (owner: "jitna sab change kiya sabhi push karke live kar do", "Bina backup live karo"): main 5434cc3 +
      fe0060c. Migrations 020 + 021 ran on production; newest backup is still 2026-10-24 19:12. Before the push: backend
      459/0, Studio 37/37, shop 50/50, home/UX 40/40. Live check (phone, read-only): Home, product, Studio, Customer gallery
      open with no script / CSP errors, the photo pickers take HEIC, API lists heic + avif. Not done live: a real HEIC upload.
- [x] 2026-10-25 **Review photos shown in medium quality** (owner: a customer may upload 10-15 high-quality photos, the
      page must not get slow). The original is kept as uploaded; the server makes one medium copy (WebP, longest side
      1600 px, quality 80, never made bigger) and `/media/review/:id` serves that copy. A 4000×3000 photo comes out at
      1600×1200 and is far smaller. Reviews from before this have no copy and keep showing their original. Review photos now
      also accept HEIC / AVIF. Migration 021 (`reviews.photo_view_key`) — **backup before deploying it**.
      Backend 459 pass, 0 fail (the HEIC sample test skips without its file). LIVE 2026-10-25.
- [x] 2026-10-25 **iPhone (HEIC) and AVIF photos accepted** (owner: "jo bhi photo do wo upload ho jaye", chose "Asli HEIC bhi
      rakho + JPG copy"). Before: "Please upload a supported image format (JPG, PNG or WebP)". Now the original HEIC / HEIF / AVIF
      is stored unchanged AND the server makes one full-quality JPEG copy (same pixels, quality 92) that links show and shops
      print; Admin and shop order pages show "Download JPG (print)" + "Original HEIC". Chrome / Android preview through
      libheif (WebAssembly, `assets/vendor/libheif`, LGPL-3.0; CSP now has 'wasm-unsafe-eval' on every page).
      Migration 020 (`uploads.print_key`, `print_bytes`, formats heic / avif) — **backup before deploying it**.
      Checks: backend 460/460 (incl. a real HEIC sample), browser on a phone screen (product page + Studio: preview, upload,
      original + JPG copy stored, no CSP error). LIVE 2026-10-25.
      Shop product pictures, artist pictures and review photos stay JPG / PNG / WebP (shown publicly; a clear "save it as a JPG"
      message). Painting reference photos accept HEIC (they use /api/uploads) but their small tile may not show a
      preview in Chrome — open, small.
- [x] 2026-10-25 Home hero on phones: the 1-2-3 steps (Choose a frame / Add your photo / We deliver it) removed (owner) —
      markup, hero.js and styles; "Start here" under the hero stays. LIVE 2026-10-25.
- [x] 2026-10-25 Studio on phones: the frame stays on screen while editing (owner approved the design in
      Desktop\FrameX-Studio-Phone-Design); pinch to zoom; "View on My Wall" with the controls. LIVE 2026-10-25.
      Checks 11/11 (phone, tablet, pinch, laptop unchanged); Studio 37, design 40, designs 14, frame 55.
- [x] 2026-10-25 Cart drawer footer on phones (owner: build it): one line — Subtotal, "Details ⌃", Checkout (65 px
      instead of ~200); "Details" opens the delivery line, shops note, Continue shopping. Laptop unchanged. LIVE 2026-10-25.
- [ ] **Launch clean-up (on the owner's word only):** every product, frame, Home Decor design, template and sample shop today is
      for experimenting (owner, 2026-10-24). On launch day remove all sample content and its images, add only real
      listings; keep UI / brand / email images; backup first; then check every page for empty sections.
- [x] 2026-10-24 Unused pictures removed (owner: "jitna image bekar hai … delet kar do"): of 835 files in assets/img + assets/video
      only 14 were not used (checked against the code AND the catalogue the server builds, then every page opened: no 404).
      Removed 6: reviews/avatar-1…4 (only in commented-out sample reviews), ui/chalk-arrow.png, ui/poster.webp. Kept on purpose:
      occasions/2-4, 3-1, 3-3 (the gallery builds their names), ui/logo-framex-email*.png (emails already sent load them),
      shops/cover-a…c (the live database may name them). Every video is used. LIVE 2026-10-25.
- [x] 2026-10-24 Production backup by the owner (19:12, `framex-db-live-20261024-1912.fxdb`, locked; checked: no readable data inside) and
      copied to the new pen drive BETA-BACKUP (E:) `FrameX Backup\Date - 24-10-2026` with the code bundle
      `framex-code-2026-10-24-1223587.bundle` and the 19 Oct `.7z` — every file compared with its original (SHA-256): same.
      New `backup-to-pendrive.bat`: the backup straight onto that pen drive (found by its name). Still on this PC:
      unlocked `.dump` copies (Desktop, Documents, FrameX-Complete-Backup) — owner to decide about removing them.
- [x] 2026-10-24 **FrameX Care live chat BUILT — local, not committed / deployed** (owner: "Design + jawab final, banana
      shuru karo", team hours 10am–8pm). Migration 019 (CARE role, live columns, SYSTEM messages); `/api/support/live*`,
      `/api/support/stream`, `/api/care/*`, `/api/admin/care-team`; care.html + ui/care-desk.js + css/care.css; Admin → Care team;
      ui/help-chat.js rewritten (8 quick answers, connect, live, leave a message, rating). Search answers carry `inStock`;
      /api/config has `cod` and `care`. Tests: backend 447/447 (new care.test.js 11); browser care-e2e 47/47 (cookie) and
      48/48 (token sessions, as live); messages arrive in ~20–35 ms each way.
  - [x] Owner: the care login belongs in the admin panel, and care staff must be able to act on the customer's order
        ("order cancel … size change etc."). Owner chose: care logins see **only Live chats + Orders** (not payouts,
        settings, coupons, shops); another size = cheaper / same at once (online: the difference refunded), dearer only on
        COD for now. Built: `/api/admin/orders/*` open to CARE (test mark + WhatsApp list stay admin-only),
        `…/items/:id/sizes`, `…/items/:id/size`, `…/address`, `services/order-edit-service.js`; the admin order page
        has "Change the order"; the care desk is Admin → Live chats (#/live); care.html removed. Tests: backend
        order-edit.test.js 7/7; browser care-e2e 54/54 (token sessions).
  - [ ] **Dearer size on an order paid online**: the customer pays the difference (a "Pay ₹X more" payment on the
        order) — not built; touches the live payment flow, refunds across two payments of one order. Until then the
        care person is told "the customer would have to pay the difference".
  - [x] Owner's logos saved in `assets/img/brand/` (F., Care, Shop, Support); the F. CARE logo is in the chat header and on the care desk
  - [x] Deployed 2026-10-24 (commit 9425cc6) WITHOUT a fresh backup, owner's choice ("bina backup live karo")
  - [ ] Production backup still owed (newest: 2026-10-20)
  - [ ] After deploy: create the first care login (Admin → Care team), test one live chat on shopframex.in with a
        phone, check the live connection works through Render
- [x] 2026-10-23 **FrameX Care live chat** (owner's plan, AI cancelled) — design (`Desktop\FrameX-Care-Chat-Design`):
      8 quick answers without AI (draft for the owner to confirm; amounts / order status / stock read live), then
      "Connect with FrameX Care" → connecting (2 minutes, owner) → staff accepts → customer sees "Live · chatting with
      <first name>" (owner: first name only) → nobody in 2 minutes = leave a message (today's chat). Care staff get
      their OWN login (owner chose it over a shared admin login), created only in Admin → Care team, and see only Chats;
      Available / Away; popup + sound. Messages over a live connection (server push), not a 1-second refresh (Neon
      free compute). UptimeRobot already keeps Render awake (since 2026-10-20). Waiting for: owner's look at the
      design, confirmed answers, team hours (the "10am–8pm" in the pictures is my placeholder)
- [x] 2026-10-23 **Easy-to-use redesign, laptop + phone** (owner approved design pictures 1–8 in
      `Desktop\FrameX-Design-Ideas`; "website AI generated ke tarha nehi dikhana chahiye") — **local, not committed / deployed**:
  - [x] 1. Label above headings: a small square orange dot + normal text (like the "F." of the logo), no pill / capitals;
        in the home hero the dot wipes the old words going right and uncovers the new ones coming back left (owner)
  - [x] 2. Home: three numbered steps under the hero buttons (phone) and a "Your photo, framed by a local shop" / phone
        "Start here" block with 3 steps and 3 ways to start (own photo, Home Decor, templates); owner 2026-10-23: the
        highlights strip + four reasons stay right under the hero, "Start here" comes after them
  - [x] 3. Phone bottom tab bar: Home / Shop / Studio / Cart (with count) / Account — not on product, checkout, Studio,
        login and dashboard pages
  - [x] 4. Product page: step guide under the price (Size ✓ → Add your photo → Add to cart); the buy bar stays at the
        bottom on every screen with "Next: add your photo" until the photo is there
  - [x] 5. Checkout: 4-step progress (Cart · Address · Summary · Pay); phone: address in 3 short lines, a bottom bar with
        the total and the pay button
  - [x] 6. Order page: a "What happens next" box per status (smaller on the phone); never promises delivery dates
  - [x] 7. Studio: step chips at the top, "Step i of n" + Back / Next at the bottom (Add to cart on the last step)
  - [x] 8. **Own help chat instead of WhatsApp**: button on customer pages, topics + "about this order", answers by
        email; Admin → Chats (list, answer, close / reopen, count in the menu and on the overview). Migration 018
        (two new tables only). Data download includes the chat; deleting the account deletes it. Privacy Notice updated.
  - Tests: backend 436/436 (new `support.test.js` 8); browser: design 40/40, chat 36/36, frame 55, Studio 37,
    decor 26, designs 14, cart links 10, shops 35, account 13, fix17 21, coupon 25, payout 38.
  - [x] Owner: "all push & live" → commit 2b9ba27, deployed 2026-10-23 (push to `main`)
  - [ ] **Production backup** — owner chose to deploy WITHOUT a fresh backup ("backup kal karenge", pen drive arrives
        2026-10-24); last production backup is 2026-10-20 15:06. Run `backup-live-db.bat` and copy it to the pen drive
  - Open: nobody has answered a chat on the live site yet; the "few hours" answer time in the chat header is a promise
    the owner must keep (or change the text)
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
      [x] Owner tested the live Contact form: the message arrived (works).
- [ ] 5 of 25 stored files missing (live log since the 2026-10-20 deploy): the start-up check now prints what each
      missing file belonged to (order number + status, "STILL UNDER WAY" first; shop / product; review) — local, backend
      420/420. Live since df6e420 (2026-10-20 19:37). The live log lists all 5, every one uploaded 2026-10-09/10, i.e.
      before the B2 bucket (2026-10-10): kept on Render's disk, wiped by a restart (cause confirmed; nothing later is missing).
      STILL UNDER WAY: customer photos of FX-100002 + FX-100003 (one photo) and FX-100004, all PLACED since 2026-10-09.
      Finished: FX-100001 DELIVERED, FX-100005 CANCELLED; one unused upload. Owner to check whose FX-100002/3/4 are:
      own tests → cancel them; real customers → ask for the photo again. The rest clears itself (15-day / 30-day tidy-ups)
      Owner 2026-10-20: FX-100002, FX-100003, FX-100004 are TEST orders (labelled "Test": Razorpay test-mode payments, no
      real money) → cancelled by the owner in Admin → Orders (23:38).
      The warning then clears by itself ~15 days after the cancel (sweep marks the photo rows DELETED)
- [x] 2026-10-21 Finding shops (owner's design; suggestions 2-7 chosen; random once a day; featured = paid promotion;
      Home + Shop page): search box, nearest 3 + "View more shops near you", nearest-three fallback, location kept for the
      tab (stays off after "Clear location"), used at once when allowed before, cleaner toolbar, rating / featured on the
      card, Admin → Shops → Featured (migration 017), Privacy + Terms lines — LIVE 2026-10-21 01:15 (1aa4aa8, owner: "final design"). Backend 428/428 (8 new); browser
      35/35 (new suite); before/after pictures on the Desktop (FrameX-shops-laptop-v2.png, FrameX-shops-phone-v2.png)
- [x] 2026-10-21 Header menu: FAQ → "Studio" (FrameX Studio); FAQ stays in the footer (Support) — LIVE (1aa4aa8). Fits on one line
      at 1280 / 1366 / 1920 px, phone menu checked, Studio marked current on FrameX Studio
- [x] 2026-11-02 RESOLVED: UPI apps now show "FrameX" as the payee (owner's screenshot; Razorpay changed the brand name). The
      round picture stays the letter "F": UPI apps decide it, not FrameX; a logo can go on Razorpay's own checkout window
      (Dashboard -> Branding). Old note: UPI apps show "Siburam7" and a VPA like (the owner’s personal UPI ID) when paying (owner: hurts trust). Cause: Razorpay
      Brand name = account / primary website name. "FrameX" refused: must match the business name (SIBURAM NAYAK) or the
      PRIMARY website (still https://siburam7.github.io/FrameX-None/; shopframex.in is an additional, verified site).
      Razorpay ticket #21472429 (2026-10-21): remove the additional shopframex.in, then edit the primary website to
      https://shopframex.in (review 24-48 h), then Checkout Styling → Brand Name and Logo → "FrameX" + the F logo
      (1-2 h to show in UPI apps). The VPA itself only changes with a registered business name (e.g. Udyam)
      2026-10-21 owner on Razorpay live chat: the internal team will review the brand name "FrameX"; new reference
      #21478745 (not shown on the Dashboard; updates by email to the registered address within 24-48 h)
      2026-10-21 15:16 Razorpay replaced the PRIMARY website: now only https://shopframex.in (verified); github.io gone.
      Brand name "FrameX": Razorpay internal team, 24-48 h (or the owner saves it in Checkout Styling if it now passes).
      A review login for Razorpay: customer account review@shopframex.in (password in the owner's Bitwarden)
      [x] 15:21 owner saved Brand name "FrameX" + the F logo in Checkout Styling (accepted now that the primary site is
      shopframex.in): instant on checkout, 1-2 h for UPI apps. [ ] owner: check PhonePe shows FrameX (open a payment, don't pay)
      [x] owner also set the Razorpay checkout background to the FrameX orange (header shows the F logo + FrameX)
      [ ] LATER (owner: "yaad rakho"): paying from the website on a phone shows "FrameX" in PhonePe, but scanning the
          checkout UPI QR still shows "Siburam7", no picture, and the old VPA (the owner’s personal UPI ID) (the QR carries the
          VPA, named at account creation). Ask Razorpay (ticket #21478745) to rename the VPA / QR payee to FrameX — they may
          ask for a business document (Udyam / GST)
- [ ] Tax shown at checkout is 2% (Admin → Settings), not the 18% in older notes — confirm with a CA (F-18)
- [x] 2026-10-21 Cart drawer: a line's picture and name now open its page (owner: they weren't clickable) — product →
      product page, template → template page, Studio design kept here → Studio — local. Browser 10/10 (laptop + phone), frame 55
- [ ] Optional (owner asked how): reply FROM support@shopframex.in — Gmail "Send mail as" through Brevo SMTP (free,
      ~10 min, steps in architecture.md §9). Today replies leave as support.framex@gmail.com
- [x] 2026-10-21 Recovery for the support@shopframex.in Google account: Google uses the account's own address as the
      recovery email (an account made with an existing email can't have another) — codes reach support.framex@gmail.com
      through ImprovMX, so the domain + ImprovMX must keep working. Optional: a recovery phone that Google accepts
- [ ] Gmail DP not showing yet (checked 2026-10-21). Gmail shows a sender's Google photo mostly to people who have the
      address in their contacts or have written to it; showing a logo to everyone needs BIMI (DMARC is ready; needs a
      paid VMC/CMC certificate + trademark — not now). Owner test: add support@shopframex.in to a Gmail's contacts
- [ ] F-15 SMS / WhatsApp OTP: owner put it aside 2026-10-20 (WhatsApp idea explained: ~₹0.12-0.35 a message,
      needs Meta business verification, a new number and a payment method; the grey SMS button stays for now)
      2026-11-01 owner asked again (mobile OTP: cost + DLT days). Found: an OTP by SMS in India needs the business's
      OWN DLT registration. Fast2SMS's own OTP page now says "SMS OTPs in India need DLT like all business SMS"; its
      no-DLT "Quick SMS" route costs ₹5-7 a message and every message is approved by their staff, so it is useless for
      OTP. The note in backend/src/lib/sms.js ("its OTP route sends without the business doing its own DLT
      registration") is out of date. Path told to the owner: Udyam (free, online, PAN + Aadhaar) -> DLT Principal
      Entity on one operator portal (about ₹5,900 incl. GST, 1-7 working days) -> header "FRAMEX" + one OTP template
      (about 1-3 days each) -> an SMS provider's DLT route (about ₹0.15-0.25 + GST a message) -> keys on Render ->
      build the phone-OTP login (today SMS is used only for password recovery). About 1-2 weeks in all. Owner to decide.
      Then asked about WhatsApp OTP (2026-11-01): no DLT needed; Meta's India authentication rate ≈ ₹0.115 + 18% GST;
      through Fast2SMS ₹0.25 a message, no setup / monthly / per-number fee, prepaid wallet from ₹100 (no card needed);
      needs a separate number not in use on WhatsApp (new SIM or landline), a Meta business portfolio, display name
      "FrameX" review, one authentication template (up to 24 h); can start before Meta business verification at a
      starter limit (verification needs GST / registration certificate / utility bill in the business name). About
      1-3 days to start. Not built: a WhatsApp sender in backend/src/lib/sms.js and a phone option in the login box.
      Owner then saw "OTP SMS without DLT" on APITxT (apitxt.com). Such offers (also Message Central "Verify Now")
      send through the PROVIDER's own DLT entity + approved OTP template: no ₹5,900 and no documents for FrameX, but the
      sender shown is the provider's header (not FRAMEX), the text is their template with the brand name in it, and
      FrameX depends on their registration. Not to be confused with "international / Quick SMS" no-DLT routes (₹5-7,
      random sender, staff approval). APITxT's page could not be read in full; its API (seen in a public GitHub PR)
      uses sender + PE ID + template ID. Questions for the provider before choosing: domestic DLT route or
      international, sender shown, exact text, price per OTP, minimum recharge. 2Factor (already supported in
      sms.js) worked the same way; its current offer is not re-checked.
      APITxT public pricing page (read 2026-11-01): SMS pay as you go, no subscription — OTP Services ₹0.22 / credit,
      OTP Platform ₹0.30 / credit, Transactional ₹0.18, Promotional ₹0.20; WhatsApp Authentication ₹0.15 / message but
      WhatsApp needs a monthly plan (Developer ₹199 / month, Starter ₹999). NOT on the public page: minimum recharge,
      GST, what one credit is, the difference between "OTP Services" and "OTP Platform", the sender shown — to ask them.
      Compare: Fast2SMS WhatsApp OTP ₹0.25, no monthly fee (cheaper than APITxT below ~2,000 OTP a month).
      Owner asked APITxT on WhatsApp (2026-11-01); their reply (a price list, looks automatic): OTP SMS without DLT
      ₹0.30 / SMS, OTP SMS with DLT ₹0.20 / SMS (own DLT mandatory), text SMS ₹0.20. Still unanswered: minimum
      recharge, GST, sender shown, exact text, Indian or international route.
      Owner asked (2026-11-01) whether the WhatsApp messages the admin sends BY HAND today can be automatic with the
      same Fast2SMS WhatsApp setup. Today by hand (admin's own WhatsApp, one press each): order status to customers
      (admin-orders.js waText, #/orders/updates), new-order alert to the order's shops / artists (sellerText), a new
      shop's login link (admin-page.js). Answer: yes, all three, from the FrameX business number, with Meta-approved
      utility templates (about ₹0.25 each through Fast2SMS), a WhatsApp opt-in for customers at checkout, and an
      Admin switch per message; marketing ones (cart reminder with coupon) cost about ₹0.95. Not built.
      2026-11-01 owner set it up: Fast2SMS account (₹50 free balance; WhatsApp rates shown there: Auth / Utility ₹0.25,
      Marketing ₹0.95, Session ₹0.13, no monthly or setup fee) -> "Login with Facebook" (Meta embedded signup): new
      business portfolio "FrameX", WhatsApp Business account "FrameX", messaging account "FrameX - Fast2SMS". Number:
      a family member's old keypad-phone number that has no WhatsApp (owner's choice; customers will see it and may
      call it). Meta: "Fast2SMS will need to verify your business; you'll receive an email". Waiting for that email,
      then: display name check, templates, the API key into Render (never in chat).
      Number shows "Pending" in Fast2SMS (2026-11-01 14:41). Templates page works while pending (Fast2SMS added its own
      sample "payment_completed"). Templates given to the owner to add (names the code will use): framex_login_code
      (Authentication, copy-code button, 10 min), framex_order_update (Utility: name, order number, status; button
      order.html?id=), framex_seller_new_order (Utility: seller, order, items, payment; button to the dashboard),
      framex_account_password (Utility: name, shop / artist, FrameX ID, valid until; button
      reset-password.html#token=). If Meta refuses the "#" in a button address, the reset page must also accept ?token=.
      First try (framex_login_code, Copy code, 10 min): "Cannot create message template: This WhatsApp Business account
      does not have permission to create message template" — the new WhatsApp account is still under review (number
      Pending). Wait for the approval email / Fast2SMS support, then submit the 4 templates.
      15:04 Fast2SMS support (chat): "Your WhatsApp number has been successfully connected… you can now proceed with
      creating your message templates". Next: submit the 4 templates.
      15:07 the same error again for framex_login_code. Cause (MSG91 help + Meta developer forum): Meta requires
      BUSINESS VERIFICATION for Authentication (OTP) templates; Utility templates work without it. So: the 3 Utility
      templates now; the WhatsApp login OTP only after Meta business verification (needs a document in the business
      name, e.g. Udyam / GST / shop licence) — Udyam is the owner's simplest route (also helps Razorpay's name and
      Facebook login). Until then login stays email code + Google.
      15:23 framex_order_update + framex_seller_new_order submitted (Utility, Pending review). 15:28
      framex_account_password REJECTED within minutes (likely: "password" wording, two variables side by side
      "{{1}}, {{2}}", or the "#" in the button address). Replacement given: framex_account_setup (no "password" word,
      no adjacent variables, button https://shopframex.in/reset-password.html?token={{1}}). The reset page now also
      reads ?token= (assets/js/ui/auth-pages.js reset(); still removed from the address bar at once). Local, not pushed.
      15:42 framex_account_setup REJECTED too, within minutes. Most likely Meta does not take a one-time account-setup
      link in a Utility template (account access belongs to Authentication, which is OTP-only). Plan: no setup link on
      WhatsApp at all — framex_account_approved says the shop / artist is approved, gives the FrameX ID and says the
      setup link was emailed (the email is already automatic); a fixed button to shopframex.in. Owner to read Meta's
      reason in business.facebook.com > WhatsApp Manager > Message templates first.
      15:52 Meta showed no reason on the template page; rejected ones deleted. Now 3 Utility templates in review:
      framex_order_update, framex_seller_new_order, framex_account_approved (no link / token, static button to
      shopframex.in; the setup link stays email-only). Still to do: approval, business profile logo + description,
      Fast2SMS's WhatsApp send API format ("Sample Code" on a template), the API key into backend/.env (owner) and
      Render, then the code. WhatsApp login OTP waits for Meta business verification (Udyam).
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
     locked file `Desktop\FrameX-backups\framex-db-live-20261020-1506.fxdb`, 180 KB; 12 orders, 7 users, 247 products)
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
- [x] B2 bucket private — confirmed by the live start-up log since 2026-10-20 ("the bucket is private"). Lifecycle option not looked at
- [x] 2026-10-20 15:31 done by the owner: UptimeRobot monitor on `https://framex-api.onrender.com/api/ping`, every 5 min,
      email alerts, first check Up. Watch Neon's CU-hours for a few days (12.03 CU-hrs used Oct 9 → Oct 20 before it).
- [x] **After deploy (F-04):** UptimeRobot free monitor → `https://framex-api.onrender.com/api/ping`, every 5 minutes
      (not before the deploy; never `/api/health`).
      Checked by the owner 2026-10-20: `framex-api` Health Check Path is EMPTY (keep it empty). A second free web service
      `FrameX-None` (framex-none.onrender.com, "My project", trial, auto-deploys `main` and fails every time) was found;
      the owner deleted it the same day ("My project": no active services; `framex-api` still Live on `eb23ecf`)
      (750 free hours a month per workspace; one service awake all month ≈ 744)
- [x] 2026-10-21 owner generated `PAYOUT_ENCRYPTION_KEY` on his PC (32 random bytes, base64), kept it in his password manager
      (Bitwarden), added it on Render; live log 12:59: "payout accounts READY (details sealed)". Never change it
- [x] 2026-10-21 owner set up a password manager (Bitwarden, EU server, 2-step login with an authenticator app,
      recovery code on paper) for every account, the backup passphrase and the payout key
- [ ] Optional: restore test on a Neon `restore-test` branch
- [ ] Optional: decide about the extra unencrypted `.dump` copies and the code copy with `.env` in
      `Desktop\FrameX-Complete-Backup` (never upload them)
- [ ] Later: API at `api.shopframex.in` (Render custom domain + DNS) for cookie login

## Open findings from the Phase 1 audit (2026-10-17)

| ID | Item | State |
| --- | --- | --- |
| F-01 | Templates page says "We'll ask for your photos after you order" but the cart requires them | **done locally 2026-10-19** (text fixed on `template.html`, `templates.html`) |
| F-03 | Razorpay live flow (payment → webhook → paid → refund) never proven | **done LIVE 2026-10-21** by the owner: order FX-100014 (Magnetic Hanging ₹299 + ₹49 delivery + ₹6 tax = ₹354, Buy now, UPI) → Razorpay Live payment `pay_TqHx…` captured; webhooks payment.authorized / payment.captured / order.paid all 200; admin cancelled → automatic full refund started → Razorpay "1 processed" → refund webhook → order shows Refunded ₹354. Razorpay "75 free days": no fee seen. Settlement of the ₹354 balance was due 2026-10-23 (refund deducted). Owner marked FX-100014 as a test order. The refund (normal speed) was not in the owner's bank yet on 2026-10-21: normal for UPI (5-7 working days); if not there by ~2026-10-30, give the refund's ARN/RRN (Razorpay → Refunds → the refund) to the UPI app / bank. Small UI note: after the cancel the admin page showed "This order has no payment that can be refunded" while the refund was pending — confusing, not harmful |
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
| F-29 | View on My Wall / tilt never tried on a real phone | open — owner tests on Android + iPhone (2026-11-01: owner tried live, one phone found no wall -> iPhone Quick Look + "open in Chrome / Safari" + no-AR error built locally; iPhone Quick Look still to try on a real iPhone) |
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

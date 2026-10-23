# FrameX — Design

> The current design is the reference: preserve it unless the owner asks for a change. Update this file whenever a
> visual rule, token or layout decision changes. All values come from `assets/css/tokens.css`.
> Last updated: 2026-10-23 (easy-to-use redesign, help chat).

## 1. Direction (owner's choices)

- **"Light and clean" with one colour, deep blue.** White and soft-blue sections, dark navy text, orange only on
  buttons. No dark or multi-colour sections. Same palette on every page (per-page colours were removed on the
  owner's request, 2026-10-08).
- Home page below the hero: **"shopping-site style"** (Amazon / Flipkart-like): soft page, white shelves, category
  circles, banner tiles, scrolling product rows.
- **Hero: the carousel hero** (`assets/js/ui/hero.js`). The home hero's soft colour changes per slide (`tint` in
  `assets/data/site.seed.js`). A scroll / 3D / film hero was cancelled by the owner (2026-10-15): don't bring it back
  unless asked. Hero frames follow phone tilt / shake (with an iPhone permission button).
- **Desktop / laptop is final** — except the owner's 2026-10-23 easy-to-use redesign (§5f), approved for both. Phones get shopping-app density (two compact cards per row, smaller text and
  buttons) only through `assets/css/mobile.css`.

## 2. Colours (light theme)

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0d1b3e` | deep navy: main text, dark buttons, footer |
| `--accent` | `#1d4ed8` | blue: small labels, highlighted headline words |
| `--accent-deep` | `#1e3a8a` | darker blue |
| `--text-gradient` | `#2563eb → #1e3a8a` | highlighted words in a hero headline |
| `--surface-soft` | `#eef3fb` | soft blue sections |
| `--hero-tint` | `#e2ecfb` | hero background |
| `--surface` / `--white` | `#ffffff` | cards, panels, inputs |
| `--muted` | `#5b5f6b` | secondary text |
| `--amber` | `#ea780e` | primary accent (orange) |
| `--amber-strong` | `#ff6a35` | primary button fill: the logo "X" orange `#ff5a1f`, a little softer (owner, 2026-10-20; was `#de832e`) |
| `--amber-deep` | `#f0501a` | primary button hover (was `#c96a0a`) |
| `--champagne` | `#ecdcbd` | selected choice |
| `--line` | `rgba(5, 8, 22, 0.12)` | borders |

**Dark mode** (choice on the account page; Light is the default): `:root[data-theme="dark"]` re-values the semantic
tokens (`--surface`, `--on-surface`, `--surface-*`, `--text-*`, `--tint-*`…). New CSS must use these tokens, never a
literal `#fff` / `var(--white)` / `var(--ink)` for surfaces or text.

White text on the orange button: 2.85:1 (hover 3.58:1). The owner chose the logo colour over the darker #b45309 (5.0:1), which didn't look good; WCAG AA asks 4.5:1 for small text, 3:1 for large/bold. Keep button text bold.

## 3. Typography

- Headings, prices: **Sora** (`--font-display`). Everything else: **Plus Jakarta Sans** (`--font-body`).
  Loaded from Google Fonts. Do not introduce another font family unless the owner asks.
- Sizes: `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-base` 1rem · `--text-lg` 1.125rem ·
  `--text-label` 0.6875rem (uppercase labels) · `--text-card` 0.95rem (card names). Hero headline max 52px.

## 4. Shape and depth

- Radius: `--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 20px · `--radius-xl` 28px · `--radius-pill` 999px.
- Shadows: `--shadow-card`, `--shadow-lift`, `--shadow-overlay`.

## 5. Layout

- Header menu (owner, 2026-10-21): Home · Art & Artists · Shop · Home Decor · Templates · Studio. "Studio" opens
  FrameX Studio (`studio.html?mode=photo`; the studio with a template stays under Templates); FAQ is in the footer
  (Support), and the footer still says "FrameX Studio".
- Header logo 150px wide on desktop. "Gallery" is in the footer, not the top menu. The orange header button follows
  the section (Shop Frames / Explore Art / Shop Decor / All Templates).
- Phone breakpoints: `mobile.css` blocks at max-width 639px, 374px and 359px. Target widths 320-430px.
- Home "Make it yours" tiles (`.promo-tiles--make`) on a phone: the three side by side, a square picture with the
  short name under it; title, sentence and button hidden, the whole tile is the link (owner's pick, 2026-10-20).
- Swiping rows on a phone scroll sideways only (`overflow-y: hidden` in `mobile.css`), so a finger moving up over
  them always scrolls the page.

## 5b. Page patterns

- Simple pages (FAQ, 404…): `page-hero` (breadcrumb, eyebrow, `h1` with a `<span>` for the blue word, lead,
  `page-hero__actions` buttons) then sections. The 404 page follows it: "Page **not found**", buttons Shop frames /
  Go to Home / Search.
- A screen with no visible page title (empty checkout, order not found) gets a visually-hidden `h1`
  (`.visually-hidden`), like the home page — no visual change.

## 5c. Emails

- "Orange line" (owner: first option 1 of 3, then the orange-line option as final, 2026-10-20): page `#f5f6f8`, white
  card; white header with a 5px `#ff6a35` line on top and 1px `#eeeeee` under it; navy logo on its own white rounded
  badge `assets/img/ui/logo-framex-email-badge.png` (480×120, shown 160×40), so a phone's dark mode (which darkens
  the header but not pictures) still shows it (owner, 2026-10-20); navy text `#0d1b3e`; code box `#fff4ee` /
  `#ffd7c4`; button `#ff6a35`. One template for
  every email: `htmlEmail()` in `backend/src/lib/mailer.js`. Was: cream `#faf6ee`, black header, button `#de832e`.

## 5d. Shops section (Home + Shop page, owner 2026-10-21)

- Toolbar: one search box ("Search shop name, area, city or PIN code", outline "Search" button) and the dark
  "Use my location" button (hidden while the device location is in use). The old Recommended / Nearest / Top rated
  chips and the Home heading's "Browse all shops" button are gone.
- Under the toolbar: why location is asked (before asking), or "Near you · Within (Shop page only) · Change location ·
  Clear location", or "Shops matching “…” · Clear search".
- Home: three cards, then a centred outline button "View more shops near you" (with a location) / "View all shops".
- Card: `badge--featured` ("Featured", `--amber-strong` on white text) top-left on the cover for a featured shop;
  distance, rating, frames count as before.

## 5e. Cart drawer

- Each line's picture and name link to its page (product / template / Studio design); the name underlines on hover.
  No other visual change (owner, 2026-10-21).

## 5f. Easy-to-use redesign (owner, 2026-10-23)

- **Label above headings** (`.eyebrow`): normal case, 600 weight, `--on-surface`, an 8×8 square dot `#ff5a1f`
  (radius 1px) before it — the "F." of the logo. No pill, no capitals, no letter-spacing. In the home hero, when the
  slide changes, the dot rolls right over the old words wiping them away (0.42s), then rolls back left uncovering the
  new ones (0.56s) — `labelWipe` in `ui/hero.js`, `.eyebrow.is-wiping` in `layout-hero.css` (owner, 2026-10-23; it
  replaced a spin-in). One dot at a time: the old slide's label first (its slide is held up by `.is-leaving`),
  then the new one's (hidden until then, `.is-waiting`) — the labels of two slides can sit at different heights, and
  moving both at once showed two dots (owner saw it, fixed 2026-10-23). From 640px up every slide's word block gets the
  height of the tallest (`evenCopy` in `ui/hero.js`), so the label never jumps to another line when the slide changes
  (owner saw it jump, fixed 2026-10-23); phones were already lined up. Nothing moves on page load or with reduced motion.
- **Home:** `.hero-steps` (1 Choose a frame · 2 Add your photo · 3 We deliver it) under the first slide's buttons, phone
  only; `.how` section under the highlights strip and the four reasons (owner: those come straight after the hero): laptop "Your photo, framed by a local shop", phone "Start here"; 3 steps + 3 ways.
- **Phone tab bar** (`.tabbar`, ≤639px): Home / Shop / Studio / Cart / Account, active tab orange; not on pages
  with their own bottom bar (product, checkout, Studio) or on login / dashboard pages.
- **Steps everywhere a task has steps:** product `.pp-guide` (done green with a tick, current orange outline),
  checkout `.co-steps` (4 columns with a top line), Studio `.fs-steps` chips + "Step i of n" and Back / Next.
- **Bottom bars:** product `.pp-buybar` and Studio `.fs-buybar` on every screen (laptop aligned to the 1200px
  content); checkout `.co-paybar` on the phone. Pages leave room for them (`scroll-padding-bottom` too).
- **Order page:** `.od-next` "What happens next" box under the order hero; on the phone the text line is hidden.
- **Help chat** (`.hc-*` in `overlays.css`): navy "Help & chat" pill bottom-right with an orange icon and a count;
  phone: a round button above the bottom bar, the chat over the whole screen. Header: "F." mark on white, "FrameX
  Support", green dot "We usually answer within a few hours". Customer messages orange on the right, FrameX white on
  the left. Admin → Chats uses the same bubbles (FrameX on the right there).

## 6. Content rules

- Banner and offer text must be factual (no invented discounts). Coupon limits (maximum discount, uses per customer)
  are not written on banners or coupon titles (owner, 2026-10-20); avoid words like "flat" that a limit makes untrue.
- Required photo texts (exact wording in `prd.md` §4). No image-sharpness warnings.
- Artists' exact addresses are never shown (city / area only).

## 7. Checking visual work

- Small change: laptop + phone quick look. Larger change: screenshot desktop before / after (must stay ≈0% different)
  and check both themes.

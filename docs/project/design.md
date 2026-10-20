# FrameX — Design

> The current design is the reference: preserve it unless the owner asks for a change. Update this file whenever a
> visual rule, token or layout decision changes. All values come from `assets/css/tokens.css`.
> Last updated: 2026-10-20 (F-11, F-13, F-14).

## 1. Direction (owner's choices)

- **"Light and clean" with one colour, deep blue.** White and soft-blue sections, dark navy text, orange only on
  buttons. No dark or multi-colour sections. Same palette on every page (per-page colours were removed on the
  owner's request, 2026-10-08).
- Home page below the hero: **"shopping-site style"** (Amazon / Flipkart-like): soft page, white shelves, category
  circles, banner tiles, scrolling product rows.
- **Hero: the carousel hero** (`assets/js/ui/hero.js`). The home hero's soft colour changes per slide (`tint` in
  `assets/data/site.seed.js`). A scroll / 3D / film hero was cancelled by the owner (2026-10-15): don't bring it back
  unless asked. Hero frames follow phone tilt / shake (with an iPhone permission button).
- **Desktop / laptop is final.** Phones get shopping-app density (two compact cards per row, smaller text and
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
| `--amber-strong` | `#b45309` | primary button fill (2026-10-20, was `#de832e`; white text 5.0:1) |
| `--amber-deep` | `#9a4a05` | primary button hover (was `#c96a0a`) |
| `--champagne` | `#ecdcbd` | selected choice |
| `--line` | `rgba(5, 8, 22, 0.12)` | borders |

**Dark mode** (choice on the account page; Light is the default): `:root[data-theme="dark"]` re-values the semantic
tokens (`--surface`, `--on-surface`, `--surface-*`, `--text-*`, `--tint-*`…). New CSS must use these tokens, never a
literal `#fff` / `var(--white)` / `var(--ink)` for surfaces or text.

White text on the orange button: 5.0:1 since 2026-10-20 (WCAG AA needs 4.5:1).

## 3. Typography

- Headings, prices: **Sora** (`--font-display`). Everything else: **Plus Jakarta Sans** (`--font-body`).
  Loaded from Google Fonts. Do not introduce another font family unless the owner asks.
- Sizes: `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-base` 1rem · `--text-lg` 1.125rem ·
  `--text-label` 0.6875rem (uppercase labels) · `--text-card` 0.95rem (card names). Hero headline max 52px.

## 4. Shape and depth

- Radius: `--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 20px · `--radius-xl` 28px · `--radius-pill` 999px.
- Shadows: `--shadow-card`, `--shadow-lift`, `--shadow-overlay`.

## 5. Layout

- Header logo 150px wide on desktop. "Gallery" is in the footer, not the top menu. The orange header button follows
  the section (Shop Frames / Explore Art / Shop Decor / All Templates).
- Phone breakpoints: `mobile.css` blocks at max-width 639px, 374px and 359px. Target widths 320-430px.

## 5b. Page patterns

- Simple pages (FAQ, 404…): `page-hero` (breadcrumb, eyebrow, `h1` with a `<span>` for the blue word, lead,
  `page-hero__actions` buttons) then sections. The 404 page follows it: "Page **not found**", buttons Shop frames /
  Go to Home / Search.
- A screen with no visible page title (empty checkout, order not found) gets a visually-hidden `h1`
  (`.visually-hidden`), like the home page — no visual change.

## 6. Content rules

- Banner and offer text must be factual (no invented discounts). Coupon limits (maximum discount, uses per customer)
  are not written on banners or coupon titles (owner, 2026-10-20); avoid words like "flat" that a limit makes untrue.
- Required photo texts (exact wording in `prd.md` §4). No image-sharpness warnings.
- Artists' exact addresses are never shown (city / area only).

## 7. Checking visual work

- Small change: laptop + phone quick look. Larger change: screenshot desktop before / after (must stay ≈0% different)
  and check both themes.

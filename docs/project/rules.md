# FrameX — Working Rules

> These are the owner's rules for anyone (person or AI) working on FrameX. They override habits and defaults.
> Last updated: 2026-10-19.

## 0. Project docs (always)

- The project docs are `docs/project/prd.md`, `architecture.md`, `rules.md`, `design.md`, `tasks.md`, `memory.md`.
- **After every piece of work, update the docs it affects in the same change**:
  - `tasks.md` — always (what was done, what is pending, what changed status);
  - `memory.md` — every decision the owner makes, every status that changed (verified / not verified);
  - `prd.md` — a feature or business rule added / changed;
  - `architecture.md` — structure, hosting, services, environments;
  - `design.md` — any visual rule, token or layout decision;
  - `rules.md` — a new rule from the owner.
- Never put secrets, passwords, keys, connection strings or customer data in these files (the repository is public).

## 1. Honesty

- "MOST IMPORTANT: Do not tell me that something is implemented if it is only a UI mockup."
- Never claim something works unless it was actually implemented **and** tested; say "not verified" otherwise.
- Separate: verified facts / reported by the owner / assumptions / pending.
- No fake payments, OTPs, emails, SMS, reviews, statistics or offers.

## 2. Production safety

- **No commit, push, deploy or production setting change without the owner's explicit approval.**
- No real payments, refunds, payouts or customer messages during development or tests.
- No destructive database work: never reset the database; migrations only add; never restore into production.
- Never change Render / Neon / B2 / GitHub settings yourself. Give the owner exact steps and mark which steps only
  look (safe) and which change production.
- Do not delete backups, `.env` files, databases or branches unless the owner asks.
- Current state (2026-10-19): Phase 2A changes stay **local and uncommitted** until the remaining development is
  done; then one combined plan: diff review, tests, commit/push, staged deployment.

## 3. Secrets

- Keys live only in `backend/.env` (local) and Render → Environment (live). Never in Git, chat or docs.
- Never print `.env` values: when reading it, anchor names with `=` (`^TAX_PERCENT=`), prefer `npm run doctor`.
- Never ask the owner to paste a key, password or `DATABASE_URL` into chat.

## 4. Design

- Preserve the existing colours, fonts, logo, layout and hero unless the owner asks for a change (`design.md`).
- **Desktop / laptop design is final.** Phone-only changes go in `assets/css/mobile.css` inside
  `@media (max-width: 639px)`. Compare desktop before / after.
- For a small visual change: make it, one quick check on laptop + phone, a 2-3 line answer.
- New colour direction: offer 3-4 named choices; never guess a palette.

## 5. Product rules (see `prd.md` §4)

Photo mandatory for photo products (page + server); originals never enhanced; photos private (signed links only);
no guest cart; server-side prices; payment proven only by server verification; custom painting 40% / 60%.

## 6. Code

- Match the surrounding code style; no new frameworks, no build step for the website.
- No class names or ids starting with `ad-`, `ads-`, `advert`, `sponsor` (ad blockers hide them; use `adm-`).
- New CSS uses the semantic tokens from `tokens.css` (dark mode depends on it).
- Website changes that add an inline `<script>` must add its hash to the page CSP (`backend/test/site-csp.test.js` says which).

## 7. Testing

- `npm test` in `backend/` (in-memory, safe while the owner's backend runs).
- Browser tests only against a throw-away backend on **:4100** — never the owner's **:4000** or **:5500**.
- Fresh database for every browser-test run.
- Report test results exactly, including failures and what was not tested.

## 8. Communication

- The owner writes in Hinglish; answer in simple Hinglish, explain technical words.
- Windows instructions: one step at a time, exact clicks / commands.
- Keep reports short and direct.

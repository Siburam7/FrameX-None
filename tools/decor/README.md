# Home Decor picture builder

Draws the product photos for **Home Decor & Wall Art** (`assets/img/decor/`). It is only needed when a design in
`js/decor.js` is added or changed; the website itself never runs it.

```
cd tools/decor
npm install          once (needs Google Chrome on the computer)
npm run sources      once: downloads the public-domain paintings into sources/ (not kept in Git)
npm run build        draws every design in js/decor.js

node build.mjs --only=hd-never-give-up,hd-mp-cherry-tree-3     just these
node build.mjs --art-only                                      only the artwork pictures in art/ (quick)
node build.mjs --sheet=sheet.png --cols=6                      also one overview picture of all cards
```

For each design it makes:

| File | What |
| ---- | ---- |
| `hd-<id>.webp` | the framed piece on a wall (card image and first product photo) |
| `hd-<id>-room.webp` | the piece in a room, for scale |
| `hd-<id>-set.webp` | multi-panel sets only: the panels straight on |
| `art/hd-<id>.webp` | the artwork alone, no frame and no wall. "View on My Wall" draws the frame and the panels around it at the size the customer chose. Not made for the "your photo" sets |
| `_back-<frame>.webp`, `_corner-<frame>.webp` | shared: back of a frame, corner close-up |

### Photo-frame pictures

`node frames.mjs` draws the pictures of photo-frame products that have no good photo of their own, with the same
frame, wall and room parts: today the "A4 White Texture Frame Set of 4" (`assets/img/products/white-texture-set.webp`
and `…-room.webp`). The frames show sample pictures and a "Your 4 photos" label, because the product is sold with the
customer's own photos. They are drawings, not photographs of a shop's product: replace them when the shop sends real
photos. The catalogue frames also reuse the shared `_corner-<frame>.webp` and `_back-<frame>.webp` views (`look` in
`js/edit.js`), labelled "illustration" in their alt text.

## How it works

1. `js/decor.js` gives every design an `art` recipe, for example `{ t: "stack", lines: ["NEVER", "*GIVE", "UP"], pal: "noir" }`.
2. `art/*.mjs` holds the templates (`t`): each returns HTML / SVG for the artwork at the right size.
   - `type.mjs` lettering (stack, serif, script, mono, dict, retro, list, word, panelwords)
   - `nature.mjs` mountains, waves, forest, palms, tree, skyline
   - `abstract.mjs` boho, flow, bauhaus, brush, marble, botanical, minimal
   - `pop.mjs` synth, pixel, pad, keys, hud, japan, cinema, car, court, music
   - `more.mjs` kids, love, iso (3D look), travel, sport, photo (a public-domain painting)
   - `index.mjs` poster (a travel-poster frame around another template) and sample (the "Your photo" label)
3. `build.mjs` opens that artwork in Chrome, saves it, then `scene.mjs` composes the product photos: the frame,
   the wall, the room, and for a set one slice of the artwork per panel (the part behind each gap is left out, as on a real wall).

The same seed always draws the same picture, so a rebuild only changes what you changed.

## Adding a design

Add one line to section 3 of `js/decor.js`, run `node build.mjs --only=hd-<your-id>`, look at the result in
`assets/img/decor/`, and refresh the website. `backend`'s `npm test` checks that every product has its pictures,
the artwork picture in `art/` included.

## What may be used

- **Original artwork only.** The templates draw from basic shapes. No film, game, anime, car-brand or sports-team
  artwork, logo, character or title may be added: those belong to someone else.
- **Public-domain paintings** come from `sources.mjs`. It asks the museum's own API and refuses any work that is not
  marked public domain (CC0). Sources: The Metropolitan Museum of Art (Open Access) and the Art Institute of Chicago
  (Open Access). Give each such design a `credit` line in `js/decor.js`.
- **Not stock-photo sites.** Unsplash, Pexels and Pixabay do not allow selling an unaltered photo as a print.

## Fonts

`fonts/` holds the typefaces drawn into the artwork. All are open-licensed for commercial use, including in
printed products: Anton, Bebas Neue, Playfair Display, Montserrat, Pacifico, Dancing Script, Space Mono,
Press Start 2P, Orbitron, Monoton, Abril Fatface, Righteous, Caveat, Fredoka and Oswald are under the
SIL Open Font License 1.1 (Google Fonts). The website does not load these files; they are only baked into the pictures.

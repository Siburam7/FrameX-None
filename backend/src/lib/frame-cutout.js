/* ==========================================================================
   A frame's "front" picture (owner, 2026-10-27): the empty frame seen straight
   from the front, with the background outside it AND the photo space inside
   it removed, so a customer's own photo can be shown inside the real frame.

     cutout(filePath) -> { png: Buffer (WebP with transparency), width, height,
                           opening: { x, y, w, h } (fractions of the picture) | null,
                           removedBackground: boolean, alreadyCut: boolean }

   A picture that already has a transparent background (a PNG the shop made)
   is kept as it is; its photo space is the transparent area in the middle.
   Otherwise the plain background is taken from the picture's edges and removed
   where it touches them (a frame photographed on a plain wall or table works
   best), and the photo space is the plain area around the centre.
   Nothing is drawn or "improved": only pixels become transparent, and the
   picture is cut to the frame's edges. When the photo space can't be found,
   opening is null: the shop marks it by hand in the dashboard.
   ========================================================================== */
import sharp from "sharp";

const MAX_EDGE = 1600;
const BG_TOLERANCE = 46; // RGB distance from the edge colour that still counts as background
const INSIDE_TOLERANCE = 40; // RGB distance from the centre colour that still counts as the photo space
const STEP = 12; // the largest change from one pixel to the next inside one plain area (an edge is a bigger jump)
const near = (d, a, b) => Math.hypot(d[a * 4] - d[b * 4], d[a * 4 + 1] - d[b * 4 + 1], d[a * 4 + 2] - d[b * 4 + 2]) < STEP;

const dist = (d, i, r, g, b) => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);

/** Every pixel reachable from the seeds through pixels that `ok(index, from)` accepts (4-neighbour flood fill). */
function flood(w, h, seeds, ok) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (const s of seeds) if (!seen[s] && ok(s, s)) (seen[s] = 1), stack.push(s);
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) if (q >= 0 && !seen[q] && ok(q, p)) (seen[q] = 1), stack.push(q);
  }
  return seen;
}

function bbox(mask, w, h, want = 1) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x] === want) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function cutout(filePath, { keep = false } = {}) {
  const { data, info } = await sharp(filePath, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const alpha = (p) => data[p * 4 + 3];

  // Already transparent somewhere (a PNG made for this)? Then nothing outside is removed.
  let clear = 0;
  for (let p = 0; p < n; p += 7) if (alpha(p) < 16) clear++;
  const alreadyCut = clear / (n / 7) > 0.02;

  let removedBackground = false;
  if (!alreadyCut && !keep) {
    const edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
    const [r, g, b] = [0, 1, 2].map((c) => median(edge.map((p) => data[p * 4 + c])));
    const outside = flood(w, h, edge, (p, from) => dist(data, p * 4, r, g, b) < BG_TOLERANCE && near(data, p, from));
    let count = 0;
    for (let p = 0; p < n; p++) if (outside[p]) (data[p * 4 + 3] = 0), count++;
    removedBackground = count > n * 0.02;
  }

  // The photo space: around the centre, transparent already, or of one plain colour
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const centre = cy * w + cx;
  let inside;
  if (alpha(centre) < 16) inside = flood(w, h, [centre], (p) => alpha(p) < 16);
  else {
    const window = [];
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) window.push((cy + dy) * w + cx + dx);
    const [r, g, b] = [0, 1, 2].map((c) => median(window.map((p) => data[p * 4 + c])));
    inside = flood(w, h, window, (p, from) => alpha(p) >= 16 && dist(data, p * 4, r, g, b) < INSIDE_TOLERANCE && near(data, p, from));
  }
  let opening = bbox(inside, w, h);
  // The frame itself: every pixel that is not transparent (and the space inside it)
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) solid[p] = alpha(p) >= 16 || inside[p] ? 1 : 0;
  const frame = bbox(solid, w, h) || { x: 0, y: 0, w, h };
  // A believable photo space is well inside the frame and neither tiny nor (nearly) the whole picture
  const share = opening ? (opening.w * opening.h) / (frame.w * frame.h) : 0;
  const touches = opening && (opening.x <= frame.x || opening.y <= frame.y || opening.x + opening.w >= frame.x + frame.w || opening.y + opening.h >= frame.y + frame.h);
  if (!opening || share < 0.06 || share > 0.92 || touches) opening = null;
  else for (let p = 0; p < n; p++) if (inside[p]) data[p * 4 + 3] = 0;

  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h })
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer();
  const rel = opening && {
    x: (opening.x - frame.x) / frame.w,
    y: (opening.y - frame.y) / frame.h,
    w: opening.w / frame.w,
    h: opening.h / frame.h
  };
  const round = (v) => Math.round(v * 10000) / 10000;
  return { png, width: frame.w, height: frame.h, opening: rel && { x: round(rel.x), y: round(rel.y), w: round(rel.w), h: round(rel.h) }, removedBackground, alreadyCut };
}

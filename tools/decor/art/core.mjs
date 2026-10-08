/* ==========================================================================
   FrameX Home Decor — artwork generator: shared helpers.

   Every design in js/decor.js names a template ("t") and a few options. A
   template is a function (spec, W, H, rand) -> HTML for a W x H box. The
   build (build.mjs) opens that HTML in Chrome and saves it as an image, so
   templates can use real fonts, SVG and CSS freely.

   All artwork made here is original to FrameX: shapes, lettering and layouts
   are drawn by this code. No third-party artwork, logo or character is used.
   ========================================================================== */

/** A repeatable random number generator: the same seed always draws the same picture. */
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const between = (r, a, b) => a + r() * (b - a);
export const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const n = (v) => Math.round(v * 10) / 10;

/** Mix two hex colours (t = 0 -> a, 1 -> b). */
export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/* Palettes: bg = paper / background, fg = main ink, ac = accent, more = extra colours. */
export const PAL = {
  noir: { bg: "#141414", fg: "#f4efe6", ac: "#e8892c", more: ["#2b2b2b", "#8a8478", "#c9c2b4"] },
  ink: { bg: "#f3ede2", fg: "#1c1a17", ac: "#c2512b", more: ["#e2d8c5", "#8c7f6d", "#3d3a35"] },
  paper: { bg: "#faf7f1", fg: "#22201c", ac: "#22201c", more: ["#e9e3d6", "#b9b1a2", "#6f685c"] },
  sand: { bg: "#e9dcc6", fg: "#3a2c1f", ac: "#b9562b", more: ["#d9c5a5", "#a67c52", "#6b4a31"] },
  terracotta: { bg: "#c8643c", fg: "#fff3e3", ac: "#2c1b12", more: ["#e39a6c", "#f0c9a0", "#8a3a1e"] },
  sage: { bg: "#dfe5d6", fg: "#27332a", ac: "#6f8a6b", more: ["#c3cfb8", "#93a78c", "#44574a"] },
  forest: { bg: "#1f3329", fg: "#eef0e4", ac: "#d9a441", more: ["#2e4a3b", "#4f7359", "#8fae8c"] },
  navy: { bg: "#14213d", fg: "#f1ead9", ac: "#e0a93b", more: ["#22335c", "#40598c", "#8fa3c8"] },
  ocean: { bg: "#e8f1f2", fg: "#12313f", ac: "#2a7f9e", more: ["#bfdde3", "#7fb6c4", "#1f5368"] },
  blush: { bg: "#f6e3dc", fg: "#4a2b2b", ac: "#c9566b", more: ["#eec9c0", "#dba39a", "#8b4a4f"] },
  rose: { bg: "#3a1f2b", fg: "#fbe9e4", ac: "#f28d9a", more: ["#5a2f3f", "#8d4a5c", "#d9a5ad"] },
  mustard: { bg: "#e3b23c", fg: "#1f1a12", ac: "#9c3d1e", more: ["#f0cf7a", "#b8872b", "#5a4418"] },
  mono: { bg: "#ffffff", fg: "#111111", ac: "#111111", more: ["#eeeeee", "#bdbdbd", "#666666"] },
  slate: { bg: "#2f3640", fg: "#f1f2f6", ac: "#f0b44c", more: ["#3d4652", "#6c7a89", "#aab4c0"] },
  gold: { bg: "#101010", fg: "#f5ecd7", ac: "#c9a24a", more: ["#1d1d1d", "#8a6f2f", "#e6cf8e"] },
  ivory: { bg: "#f7f2e8", fg: "#2a2520", ac: "#b8923a", more: ["#ece3d0", "#cdb98f", "#7d6a45"] },
  neon: { bg: "#120a2a", fg: "#f6f0ff", ac: "#ff3ea5", more: ["#27e0ff", "#7a3cff", "#ffd23e"] },
  arcade: { bg: "#0b1020", fg: "#e9f1ff", ac: "#39f58a", more: ["#ff4d6d", "#ffd23e", "#4dabff"] },
  sunset: { bg: "#2a1a3e", fg: "#fff1dc", ac: "#ff7a3c", more: ["#ff3e6c", "#ffc247", "#6a2c70"] },
  candy: { bg: "#fff4ea", fg: "#3b3340", ac: "#ff8fab", more: ["#ffd6a5", "#b9e3c6", "#a0c4ff", "#cdb4db"] },
  indigo: { bg: "#f1ead8", fg: "#1f2a44", ac: "#c8402f", more: ["#2f4270", "#6b86b8", "#d9cdb2"] },
  crimson: { bg: "#8f1d21", fg: "#fdf0dc", ac: "#f2c14e", more: ["#b33a2f", "#5e1014", "#f7dfb0"] },
  teal: { bg: "#0f3b3d", fg: "#eef6f0", ac: "#f2a65a", more: ["#1c5a5c", "#3f8f8a", "#a8d5c8"] },
  clay: { bg: "#efe2d3", fg: "#3b2a23", ac: "#a4553a", more: ["#d7b89c", "#b98363", "#6f4a3a", "#8c9a7b"] },
  lilac: { bg: "#ece6f6", fg: "#2c2540", ac: "#7b5ea7", more: ["#d2c5ec", "#a893d4", "#4b3b78"] },
};
export const pal = (name) => PAL[name] || PAL.ink;

/** Paper grain over the whole design, so flat colours look printed rather than digital. */
export const grain = (opacity = 0.14, id = "g") => `<svg class="grain" width="100%" height="100%" style="position:absolute;inset:0;mix-blend-mode:multiply;opacity:${opacity};pointer-events:none">
  <filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.33  0 0 0 0 0.3  0 0 0 0.9 0"/></filter>
  <rect width="100%" height="100%" filter="url(#${id})"/></svg>`;

/** Wrap a design: one positioned box with the palette as CSS variables. */
export function box(W, H, p, inner, { style = "", grainy = 0.14, cls = "" } = {}) {
  return `<div class="a ${cls}" style="width:${W}px;height:${H}px;--bg:${p.bg};--fg:${p.fg};--ac:${p.ac};--m0:${p.more[0]};--m1:${p.more[1]};--m2:${p.more[2]};${style}">${inner}${grainy ? grain(grainy) : ""}</div>`;
}

/** An SVG that fills the box. */
export const svg = (W, H, inner, attrs = "") => `<svg class="fill" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" ${attrs}>${inner}</svg>`;

/** A smooth closed "land" shape along the bottom of the canvas from a list of [x, y] points. */
export function land(points, W, H) {
  let d = `M0,${H} L${n(points[0][0])},${n(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${n(cx)},${n(y0)} ${n(cx)},${n(y1)} ${n(x1)},${n(y1)}`;
  }
  return d + ` L${W},${H} Z`;
}

/** A jagged ridge (straight segments) for sharp mountains. */
export function ridge(points, W, H) {
  return `M0,${H} ` + points.map(([x, y]) => `L${n(x)},${n(y)}`).join(" ") + ` L${W},${H} Z`;
}

/** Evenly spaced points with random heights between top and bottom. */
export function heights(r, W, count, top, bottom, { edge = 0 } = {}) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push([(W * i) / count + (i && i < count ? between(r, -W / count / 3, W / count / 3) : 0), between(r, top, bottom) + edge * Math.abs(i / count - 0.5)]);
  return out;
}

/** Styles shared by every design (fonts are declared by the build page). */
export const CSS = `
.a{position:relative;overflow:hidden;background:var(--bg);color:var(--fg);font-family:Montserrat,sans-serif}
.a .fill{position:absolute;inset:0;display:block}
.a .pad{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center}
.a [data-fit]{display:inline-block;white-space:nowrap}
.f-anton{font-family:Anton,sans-serif;letter-spacing:.01em}
.f-bebas{font-family:"Bebas Neue",sans-serif;letter-spacing:.02em}
.f-oswald{font-family:Oswald,sans-serif;font-weight:700;text-transform:uppercase}
.f-abril{font-family:"Abril Fatface",serif}
.f-right{font-family:Righteous,sans-serif}
.f-play{font-family:"Playfair Display",serif}
.f-playi{font-family:"Playfair Display",serif;font-style:italic}
.f-mont{font-family:Montserrat,sans-serif}
.f-pac{font-family:Pacifico,cursive}
.f-dance{font-family:"Dancing Script",cursive;font-weight:700}
.f-mono{font-family:"Space Mono",monospace}
.f-px{font-family:"Press Start 2P",monospace}
.f-orb{font-family:Orbitron,sans-serif;font-weight:800}
.f-neon{font-family:Monoton,sans-serif}
.f-hand{font-family:Caveat,cursive;font-weight:700}
.f-kid{font-family:Fredoka,sans-serif;font-weight:600}
.caps{text-transform:uppercase;letter-spacing:.32em;font-weight:600}
`;

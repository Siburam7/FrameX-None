/* Landscapes drawn from layered shapes: mountains, sea, forest, palms, a single
   tree, a city skyline. They work at any width, so the same design can be
   printed as one piece or split across several panels. */
import { between, box, heights, land, mix, n, pal, pick, ridge, svg } from "./core.mjs";

const SKY = {
  dawn: ["#27335c", "#c9697a", "#f6b97a", "#fde2b4"],
  dusk: ["#1c1b3a", "#5b2a6e", "#e0546a", "#ffb36b"],
  night: ["#070b1f", "#111a3c", "#1d2b5a", "#33457d"],
  mist: ["#dfe7ea", "#e9eee9", "#f3efe4", "#f8f1e3"],
  alpine: ["#6fa8d6", "#a9cfe8", "#dcecf3", "#f4f8f6"],
  ember: ["#2a0f1c", "#8a1f2d", "#e4572e", "#f9c784"],
  sand: ["#f3d9b1", "#f0c08a", "#e89b6c", "#f6e3c5"],
  teal: ["#0d2b36", "#17565e", "#3fa39a", "#bfe3cf"],
  rose: ["#3b1c3a", "#a2386b", "#f08a8f", "#ffd9c0"],
  mono: ["#f4f1ea", "#f4f1ea", "#f4f1ea", "#f4f1ea"],
};
const sky = (id, name) => {
  const c = SKY[name] || SKY.dawn;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${c.map((col, i) => `<stop offset="${n((i / (c.length - 1)) * 100)}%" stop-color="${col}"/>`).join("")}</linearGradient>`;
};
const stars = (r, W, H, count, maxY) => Array.from({ length: count }, () => `<circle cx="${n(r() * W)}" cy="${n(r() * maxY)}" r="${n(between(r, 0.6, 2.2) * (H / 1000))}" fill="#fff" opacity="${n(between(r, 0.3, 0.95))}"/>`).join("");
const birds = (r, W, H, count, x, y) =>
  Array.from({ length: count }, () => {
    const bx = x + between(r, -W * 0.12, W * 0.12);
    const by = y + between(r, -H * 0.05, H * 0.05);
    const s = between(r, 0.5, 1.1) * (H / 100);
    return `<path d="M${n(bx - s)},${n(by)} q${n(s / 2)},${n(-s * 0.7)} ${n(s)},0 q${n(s / 2)},${n(-s * 0.7)} ${n(s)},0" fill="none" stroke="#1b1b1b" stroke-width="${n(H / 500)}" stroke-linecap="round" opacity=".7"/>`;
  }).join("");
const glow = (id, color) => `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".9"/><stop offset=".45" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

/** Layered mountain ranges under a coloured sky. */
export function mountains(s, W, H, r) {
  const scheme = s.sky || "dawn";
  const far = s.far || mix(SKY[scheme][2], "#ffffff", 0.25);
  const near = s.near || "#101826";
  const layers = s.layers || 5;
  const sharp = s.style === "sharp";
  const sx = W * (s.sunX ?? 0.5);
  const sy = H * (s.sunY ?? 0.36);
  const sr = H * (s.sunR ?? 0.09);
  let out = `<defs>${sky("sk", scheme)}${glow("gl", s.sun || "#fff2c9")}<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sk)"/>`;
  if (scheme === "night") out += stars(r, W, H, Math.round((W * H) / 9000), H * 0.6);
  if (s.sun !== false) out += `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sr * 3.2)}" fill="url(#gl)"/><circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sr)}" fill="${s.sun || "#fff2c9"}"/>`;
  if (s.moon) out += `<circle cx="${n(sx + sr * 0.42)}" cy="${n(sy - sr * 0.18)}" r="${n(sr * 0.92)}" fill="${SKY[scheme][1]}"/>`;
  if (s.birds !== false) out += birds(r, W, H, s.birds || 4, sx + W * 0.16, sy - H * 0.02);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const top = H * (0.34 + t * 0.34);
    const pts = heights(r, W, Math.round((sharp ? 9 : 6) * (W / H) + 3), top - H * 0.02, top + H * (sharp ? 0.2 : 0.13));
    out += `<path d="${sharp ? ridge(pts, W, H) : land(pts, W, H)}" fill="${mix(far, near, Math.pow(t, 0.85))}"/>`;
    if (sharp && i >= 1 && i <= 2 && s.snow !== false)
      pts.forEach(([x, y], k) => {
        if (k % 2 === 0 || k === 0 || k === pts.length - 1) return;
        const w = (W / pts.length) * 0.22;
        out += `<path d="M${n(x)},${n(y)} l${n(-w)},${n(w * 1.5)} l${n(w * 0.5)},${n(-w * 0.4)} l${n(w * 0.5)},${n(w * 0.5)} l${n(w * 0.5)},${n(-w * 0.5)} l${n(w * 0.5)},${n(w * 0.4)} Z" fill="#fff" opacity="${n(0.75 - t * 0.3)}"/>`;
      });
    if (s.mist !== false && i < layers - 1) out += `<rect y="${n(top + H * 0.06)}" width="${W}" height="${n(H * 0.12)}" fill="url(#mist)" opacity="${n(0.5 - t * 0.3)}"/>`;
  }
  if (s.pines) {
    const base = H * 0.93;
    for (let x = -W * 0.02; x < W; x += between(r, W * 0.012, W * 0.03)) {
      const h = between(r, H * 0.07, H * 0.2);
      const w = h * 0.34;
      out += `<path d="M${n(x)},${n(base + H * 0.08)} L${n(x + w / 2)},${n(base - h)} L${n(x + w)},${n(base + H * 0.08)} Z" fill="${mix(near, "#000000", 0.35)}"/>`;
    }
  }
  if (s.lake) {
    const y = H * 0.84;
    out += `<rect y="${n(y)}" width="${W}" height="${n(H - y)}" fill="${mix(near, SKY[scheme][1], 0.35)}" opacity=".92"/>`;
    for (let k = 0; k < 16; k++) {
      const ly = y + (H - y) * Math.pow((k + 1) / 17, 1.4);
      const lw = between(r, W * 0.05, W * 0.3);
      out += `<rect x="${n(sx - lw / 2 + between(r, -W * 0.03, W * 0.03))}" y="${n(ly)}" width="${n(lw)}" height="${n(H / 320)}" rx="${n(H / 640)}" fill="${s.sun || "#fff2c9"}" opacity="${n(0.75 - k * 0.035)}"/>`;
    }
  }
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.1 });
}

/** The sea at sunrise or sunset: horizon, layered waves, light on the water. */
export function waves(s, W, H, r) {
  const scheme = s.sky || "dusk";
  const hz = H * (s.horizon ?? 0.5);
  const sx = W * (s.sunX ?? 0.5);
  const deep = s.deep || "#0d2740";
  const lite = s.lite || mix(SKY[scheme][2], "#ffffff", 0.15);
  let out = `<defs>${sky("sk", scheme)}${glow("gl", s.sun || "#ffe8b8")}<clipPath id="sea"><rect y="${n(hz)}" width="${W}" height="${n(H - hz)}"/></clipPath></defs>
    <rect width="${W}" height="${n(hz)}" fill="url(#sk)"/>`;
  if (scheme === "night") out += stars(r, W, H, Math.round((W * H) / 12000), hz * 0.9);
  if (s.sun !== false) out += `<circle cx="${n(sx)}" cy="${n(hz - H * 0.02)}" r="${n(H * 0.32)}" fill="url(#gl)"/><circle cx="${n(sx)}" cy="${n(hz - H * (s.sunUp ?? 0.03))}" r="${n(H * (s.sunR ?? 0.085))}" fill="${s.sun || "#ffe8b8"}"/>`;
  if (s.birds) out += birds(r, W, H, s.birds, sx - W * 0.2, hz - H * 0.22);
  out += `<rect y="${n(hz)}" width="${W}" height="${n(H - hz)}" fill="${lite}"/>`;
  const bands = s.bands || 9;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const y = hz + (H - hz) * Math.pow(t, 1.35) * 0.96;
    const amp = H * (0.004 + t * 0.022);
    const len = W / Math.max(2, Math.round((W / H) * (9 - t * 5)));
    let d = `M0,${H} L0,${n(y)}`;
    const off = between(r, 0, len);
    for (let x = -off; x < W + len; x += len) d += ` q${n(len / 4)},${n(-amp)} ${n(len / 2)},0 t${n(len / 2)},0`;
    out += `<path d="${d} L${W},${H} Z" fill="${mix(lite, deep, Math.pow(t, 0.7))}" opacity=".96"/>`;
    if (s.foam !== false && i > bands * 0.45) out += `<path d="${d.replace(`M0,${H} L0,`, "M0,")}" fill="none" stroke="#fff" stroke-width="${n(H / 420)}" opacity="${n(0.12 + t * 0.25)}"/>`;
  }
  if (s.sun !== false)
    for (let k = 0; k < 18; k++) {
      const ly = hz + (H - hz) * Math.pow((k + 0.5) / 18, 1.5) * 0.9;
      const lw = W * (0.02 + (k / 18) * 0.12) * between(r, 0.6, 1.2);
      out += `<rect x="${n(sx - lw / 2 + between(r, -W * 0.012, W * 0.012))}" y="${n(ly)}" width="${n(lw)}" height="${n(H / 300)}" rx="${n(H / 600)}" fill="${s.sun || "#ffe8b8"}" opacity="${n(0.85 - k * 0.035)}"/>`;
    }
  if (s.boat) {
    const bx = W * (s.boat === true ? 0.72 : s.boat);
    const by = hz + H * 0.035;
    const k = H * 0.045;
    out += `<path d="M${n(bx - k)},${n(by)} h${n(k * 2)} l${n(-k * 0.35)},${n(k * 0.3)} h${n(-k * 1.3)} Z" fill="#101622"/><path d="M${n(bx)},${n(by - k * 0.1)} v${n(-k * 1.7)} l${n(k * 0.95)},${n(k * 1.7)} Z" fill="#f7f3ea"/><path d="M${n(bx - k * 0.1)},${n(by - k * 0.1)} v${n(-k * 1.3)} l${n(-k * 0.7)},${n(k * 1.3)} Z" fill="#e9e1d0"/>`;
  }
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.1 });
}

/** Misty pine forest, light at the back and dark at the front. */
export function forest(s, W, H, r) {
  const scheme = s.sky || "mist";
  const far = s.far || "#b9c9c0";
  const near = s.near || "#12241c";
  const rows = s.rows || 5;
  let out = `<defs>${sky("sk", scheme)}${glow("gl", s.sun || "#fff6dc")}<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY[scheme][3]}" stop-opacity="0"/><stop offset="1" stop-color="${SKY[scheme][3]}" stop-opacity=".85"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>`;
  if (scheme === "night") out += stars(r, W, H, Math.round((W * H) / 10000), H * 0.5);
  if (s.sun !== false) out += `<circle cx="${n(W * (s.sunX ?? 0.62))}" cy="${n(H * (s.sunY ?? 0.3))}" r="${n(H * 0.28)}" fill="url(#gl)"/><circle cx="${n(W * (s.sunX ?? 0.62))}" cy="${n(H * (s.sunY ?? 0.3))}" r="${n(H * (s.sunR ?? 0.07))}" fill="${s.sun || "#fff6dc"}"/>`;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const base = H * (0.52 + t * 0.44);
    const col = mix(far, near, Math.pow(t, 0.8));
    const size = H * (0.1 + t * 0.26);
    let x = -size * 0.3;
    while (x < W + size) {
      const h = size * between(r, 0.6, 1.25);
      const w = h * between(r, 0.3, 0.42);
      const tiers = 5;
      let d = "";
      for (let k = 0; k < tiers; k++) {
        const ty = base - h + (h * k) / tiers;
        const tw = (w * (k + 1.4)) / (tiers + 0.4);
        d += `M${n(x)},${n(ty - h * 0.03)} L${n(x + tw / 2)},${n(ty + h / tiers + h * 0.06)} L${n(x - tw / 2)},${n(ty + h / tiers + h * 0.06)} Z `;
      }
      out += `<path d="${d}" fill="${col}"/><rect x="${n(x - w * 0.04)}" y="${n(base - h * 0.02)}" width="${n(w * 0.08)}" height="${n(H)}" fill="${col}"/>`;
      x += w * between(r, 0.45, 1.05);
    }
    out += `<rect y="${n(base - size * 0.1)}" width="${W}" height="${n(H)}" fill="${col}"/>`;
    if (i < rows - 1) out += `<rect y="${n(base - size * 0.5)}" width="${W}" height="${n(size * 0.75)}" fill="url(#fog)" opacity="${n(0.75 - t * 0.35)}"/>`;
  }
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.1 });
}

/** Tropical sunset: striped sun, sea line, palm trees in silhouette. */
export function palms(s, W, H, r) {
  const scheme = s.sky || "ember";
  const hz = H * 0.72;
  const sx = W * (s.sunX ?? 0.5);
  const sr = H * (s.sunR ?? 0.2);
  const ink = s.ink || "#150d1c";
  let out = `<defs>${sky("sk", scheme)}<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sunTop || "#ffe07a"}"/><stop offset="1" stop-color="${s.sunBottom || "#ff5e62"}"/></linearGradient><clipPath id="cut">`;
  for (let k = 0; k < 9; k++) out += `<rect x="0" y="${n(hz - sr * 2 + k * sr * 0.235 + (k * k * sr) / 180)}" width="${W}" height="${n(sr * 0.2 - k * sr * 0.012)}"/>`;
  out += `<rect x="0" y="0" width="${W}" height="${n(hz - sr * 0.9)}"/></clipPath></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>
    <circle cx="${n(sx)}" cy="${n(hz - sr * 0.55)}" r="${n(sr)}" fill="url(#sun)" clip-path="url(#cut)"/>
    <rect y="${n(hz)}" width="${W}" height="${n(H - hz)}" fill="${mix(SKY[scheme][1], ink, 0.45)}"/>`;
  for (let k = 0; k < 10; k++) out += `<rect x="${n(sx - (W * (0.03 + k * 0.012)) / 2)}" y="${n(hz + (H - hz) * ((k + 0.6) / 11))}" width="${n(W * (0.03 + k * 0.012))}" height="${n(H / 260)}" fill="${s.sunBottom || "#ff5e62"}" opacity="${n(0.8 - k * 0.06)}"/>`;
  const palm = (x, h, lean) => {
    const top = [x + lean * h, H * 0.97 - h];
    let p = `<path d="M${n(x)},${n(H * 0.97)} Q${n(x + lean * h * 0.2)},${n(H * 0.97 - h * 0.55)} ${n(top[0])},${n(top[1])}" fill="none" stroke="${ink}" stroke-width="${n(h * 0.03)}" stroke-linecap="round"/>`;
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * 0.95 + (k / 8) * Math.PI * 0.9 + between(r, -0.1, 0.1);
      const len = h * between(r, 0.3, 0.44);
      const ex = top[0] + Math.cos(a) * len;
      const ey = top[1] + Math.sin(a) * len * 0.55 + len * 0.38;
      const mx = top[0] + Math.cos(a) * len * 0.55;
      const my = top[1] + Math.sin(a) * len * 0.75 - len * 0.12;
      p += `<path d="M${n(top[0])},${n(top[1])} Q${n(mx)},${n(my)} ${n(ex)},${n(ey)} Q${n(mx)},${n(my + len * 0.2)} ${n(top[0])},${n(top[1])} Z" fill="${ink}"/>`;
    }
    return p;
  };
  const count = s.count || Math.max(2, Math.round((W / H) * 2));
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side < 0 ? W * between(r, 0.04, 0.26) : W * between(r, 0.74, 0.96);
    out += palm(x, H * between(r, 0.42, 0.72), -side * between(r, 0.05, 0.22));
  }
  out += `<path d="${land(heights(r, W, 8, H * 0.93, H * 0.99), W, H)}" fill="${ink}"/>`;
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.1 });
}

/** One wide tree in blossom, on a hill. style: cherry | autumn | gold | winter | green */
export function tree(s, W, H, r) {
  const styles = {
    cherry: { sky: "mist", bark: "#3b2a2a", leaf: ["#f7b6c2", "#f28ca6", "#fbd3da", "#e96a8d"], hill: "#cfd9c5", petal: "#f28ca6" },
    autumn: { sky: "sand", bark: "#3a2416", leaf: ["#e4572e", "#f29e4c", "#f1c453", "#a4281a"], hill: "#b9864a", petal: "#e4572e" },
    gold: { sky: "night", bark: "#c9a24a", leaf: ["#e6cf8e", "#c9a24a", "#f5e6b8", "#8a6f2f"], hill: "#0c1024", petal: "#e6cf8e" },
    winter: { sky: "alpine", bark: "#2a2f3a", leaf: ["#ffffff", "#e8f1f7", "#d5e4ee", "#f7fbfd"], hill: "#eef4f7", petal: "#ffffff" },
    green: { sky: "mist", bark: "#33271c", leaf: ["#5f8f4e", "#8fb26a", "#3f6b3a", "#b7d08a"], hill: "#aebf8f", petal: "#8fb26a" },
  };
  const st = styles[s.style] || styles.cherry;
  const bx = W * (s.x ?? 0.5);
  const by = H * 0.86;
  let branches = "";
  const tips = [];
  const grow = (x, y, a, len, w, depth) => {
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const bend = between(r, -0.25, 0.25) * len;
    branches += `<path d="M${n(x)},${n(y)} Q${n((x + ex) / 2 + Math.sin(a) * bend)},${n((y + ey) / 2 - Math.cos(a) * bend)} ${n(ex)},${n(ey)}" fill="none" stroke="${st.bark}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
    if (depth <= 0 || len < H * 0.03) return tips.push([ex, ey, len]);
    if (depth < 3) tips.push([ex, ey, len]);
    const kids = depth > 3 ? 2 : pick(r, [2, 2, 3]);
    for (let k = 0; k < kids; k++) {
      const spread = (k - (kids - 1) / 2) * between(r, 0.5, 0.85);
      // Branches lean outwards so the crown is wide: it has to fill a panoramic canvas.
      grow(ex, ey, a + spread + (a < -Math.PI / 2 ? -0.08 : 0.08), len * between(r, 0.66, 0.8), w * 0.68, depth - 1);
    }
  };
  const trunk = H * (s.trunk ?? 0.2);
  grow(bx, by, -Math.PI / 2 + between(r, -0.06, 0.06), trunk, H * 0.045, s.depth || 7);
  // Two low boughs reach sideways, as wide as the canvas allows.
  const reach = Math.min(W * 0.2, H * 0.5);
  grow(bx, by - trunk * 0.7, -Math.PI * 0.86, reach, H * 0.026, 5);
  grow(bx, by - trunk * 0.78, -Math.PI * 0.14, reach, H * 0.026, 5);
  let blossom = "";
  if (s.style !== "bare")
    tips.forEach(([x, y, len]) => {
      const count = Math.round(between(r, 5, 11));
      for (let k = 0; k < count; k++) {
        const a = r() * Math.PI * 2;
        const d = r() * len * 1.3;
        blossom += `<circle cx="${n(x + Math.cos(a) * d)}" cy="${n(y + Math.sin(a) * d * 0.8)}" r="${n(between(r, H * 0.008, H * 0.024))}" fill="${pick(r, st.leaf)}" opacity="${n(between(r, 0.72, 0.98))}"/>`;
      }
    });
  let petals = "";
  for (let k = 0; k < Math.round((W / H) * 26); k++) petals += `<ellipse cx="${n(r() * W)}" cy="${n(between(r, H * 0.2, H * 0.92))}" rx="${n(H * 0.006)}" ry="${n(H * 0.0035)}" transform="rotate(${n(r() * 180)} ${n(r() * W)} ${n(H / 2)})" fill="${st.petal}" opacity="${n(between(r, 0.35, 0.8))}"/>`;
  const out = `<defs>${sky("sk", st.sky)}${glow("gl", "#fff8e6")}</defs><rect width="${W}" height="${H}" fill="url(#sk)"/>
    ${st.sky === "night" ? stars(r, W, H, Math.round((W * H) / 8000), H * 0.8) : ""}
    <circle cx="${n(W * (s.sunX ?? 0.78))}" cy="${n(H * 0.24)}" r="${n(H * 0.24)}" fill="url(#gl)"/><circle cx="${n(W * (s.sunX ?? 0.78))}" cy="${n(H * 0.24)}" r="${n(H * 0.075)}" fill="${st.sky === "night" ? "#f5ecd7" : "#fff8e6"}" opacity=".95"/>
    <path d="${land([[0, H * 0.9], [W * 0.25, H * 0.87], [bx, H * 0.845], [W * 0.75, H * 0.87], [W, H * 0.9]], W, H)}" fill="${st.hill}"/>
    ${branches}${blossom}${petals}`;
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.1 });
}

/** A city at night or at sunset. style: night | sunset | neon | blueprint */
export function skyline(s, W, H, r) {
  const style = s.style || "night";
  const scheme = { night: "night", sunset: "dusk", neon: "night", blueprint: "mono" }[style];
  const neon = style === "neon";
  const blue = style === "blueprint";
  const base = H * (s.base ?? 0.8);
  let out = `<defs>${sky("sk", scheme)}${glow("gl", "#fff3c4")}<filter id="nf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(H / 220)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  out += blue ? `<rect width="${W}" height="${H}" fill="#1d3f72"/>` : `<rect width="${W}" height="${H}" fill="url(#sk)"/>`;
  if (blue) for (let x = 0; x < W; x += H / 20) out += `<path d="M${n(x)},0V${H}" stroke="#fff" stroke-width="${n(H / 1400)}" opacity=".13"/>`;
  if (blue) for (let y = 0; y < H; y += H / 20) out += `<path d="M0,${n(y)}H${W}" stroke="#fff" stroke-width="${n(H / 1400)}" opacity=".13"/>`;
  if (!blue && style !== "sunset") out += stars(r, W, H, Math.round((W * H) / 9000), base * 0.8);
  if (!blue) {
    const mx = W * (s.moonX ?? 0.72);
    const my = H * (style === "sunset" ? 0.52 : 0.22);
    out += `<circle cx="${n(mx)}" cy="${n(my)}" r="${n(H * 0.26)}" fill="url(#gl)" opacity="${neon ? 0.5 : 1}"/><circle cx="${n(mx)}" cy="${n(my)}" r="${n(H * (style === "sunset" ? 0.12 : 0.06))}" fill="${style === "sunset" ? "#ffd98a" : "#f6f1dc"}"/>`;
  }
  const rows = blue ? 1 : 3;
  for (let row = 0; row < rows; row++) {
    const t = rows === 1 ? 1 : row / (rows - 1);
    const fill = blue ? "none" : neon ? mix("#1a1140", "#07040f", t) : mix(style === "sunset" ? "#7a3b6d" : "#243767", "#06080f", Math.pow(t, 0.7));
    const stroke = blue ? "#eaf2ff" : neon ? pick(r, ["#ff3ea5", "#27e0ff", "#7a3cff"]) : "none";
    let x = -W * 0.02;
    while (x < W) {
      const w = between(r, H * 0.05, H * 0.14);
      const h = between(r, H * 0.12, H * (0.3 + t * 0.26)) * (r() < 0.12 ? 1.45 : 1);
      const y = base - h;
      const kind = r();
      let d = `M${n(x)},${n(base)} V${n(y)}`;
      if (kind < 0.2) d += ` H${n(x + w * 0.3)} V${n(y - h * 0.1)} H${n(x + w * 0.7)} V${n(y)}`;
      else if (kind < 0.32) d += ` L${n(x + w / 2)},${n(y - w * 0.5)} L${n(x + w)},${n(y)}`;
      d += ` H${n(x + w)} V${n(base)} Z`;
      out += `<path d="${d}" fill="${fill}" ${stroke !== "none" ? `stroke="${stroke}" stroke-width="${n(H / (blue ? 420 : 360))}" ${neon ? 'filter="url(#nf)"' : ""}` : ""}/>`;
      if (kind > 0.9) out += `<path d="M${n(x + w / 2)},${n(y)} v${n(-h * 0.22)}" stroke="${blue ? "#eaf2ff" : neon ? stroke : fill}" stroke-width="${n(H / 300)}"/>`;
      if (!blue && row > 0) {
        const cols = Math.max(2, Math.floor(w / (H * 0.018)));
        const lines = Math.floor(h / (H * 0.024));
        const lit = neon ? pick(r, ["#ffd23e", "#27e0ff", "#ff3ea5"]) : style === "sunset" ? "#ffcf8a" : "#ffe9a6";
        for (let cy = 1; cy < lines; cy++) for (let cx = 0; cx < cols; cx++) if (r() < (neon ? 0.3 : 0.24)) out += `<rect x="${n(x + (w / cols) * (cx + 0.28))}" y="${n(y + cy * H * 0.024)}" width="${n((w / cols) * 0.44)}" height="${n(H * 0.011)}" fill="${lit}" opacity="${n(between(r, 0.45, 0.95))}"/>`;
      }
      x += w + between(r, -w * 0.12, w * 0.08);
    }
  }
  out += blue ? `<path d="M0,${n(base)}H${W}" stroke="#eaf2ff" stroke-width="${n(H / 300)}"/>` : `<rect y="${n(base)}" width="${W}" height="${n(H - base)}" fill="${neon ? "#07040f" : "#05070d"}"/>`;
  if (!blue)
    for (let k = 0; k < Math.round((W / H) * 70); k++) {
      const col = neon ? pick(r, ["#ff3ea5", "#27e0ff", "#ffd23e"]) : style === "sunset" ? "#ffb36b" : "#ffe9a6";
      out += `<rect x="${n(r() * W)}" y="${n(between(r, base + H * 0.012, H * 0.99))}" width="${n(between(r, H * 0.01, H * 0.07))}" height="${n(H / 380)}" fill="${col}" opacity="${n(between(r, 0.12, 0.6))}"/>`;
    }
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: blue ? 0.06 : 0.09 });
}

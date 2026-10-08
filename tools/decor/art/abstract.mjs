/* Abstract and modern wall art: mid-century shapes, flowing lines, geometric
   grids, brush strokes, marble with gold, botanical line art. */
import { between, box, mix, n, pal, pick, svg } from "./core.mjs";

/** Mid-century "boho" composition: arches, a sun, soft blobs, a sprig. */
export function boho(s, W, H, r) {
  const p = pal(s.pal || "clay");
  const cols = [p.ac, ...p.more];
  const u = Math.min(W, H) / 100;
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  const arch = (cx, base, w, rings, col) => {
    let g = "";
    for (let i = 0; i < rings; i++) {
      const rw = w * (1 - i / (rings + 0.6));
      g += `<path d="M${n(cx - rw / 2)},${n(base)} v${n(-rw * 0.55)} a${n(rw / 2)},${n(rw / 2)} 0 0 1 ${n(rw)},0 v${n(rw * 0.55)}" fill="none" stroke="${i % 2 ? mix(col, p.bg, 0.45) : col}" stroke-width="${n((w / (rings + 0.6)) * 0.44)}"/>`;
    }
    return g;
  };
  const blob = (cx, cy, rad, col) => {
    const k = 7;
    const pts = Array.from({ length: k }, (_, i) => {
      const a = (i / k) * Math.PI * 2;
      const d = rad * between(r, 0.72, 1.12);
      return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
    });
    let d = `M${n((pts[0][0] + pts[k - 1][0]) / 2)},${n((pts[0][1] + pts[k - 1][1]) / 2)}`;
    for (let i = 0; i < k; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % k];
      d += ` Q${n(a[0])},${n(a[1])} ${n((a[0] + b[0]) / 2)},${n((a[1] + b[1]) / 2)}`;
    }
    return `<path d="${d} Z" fill="${col}"/>`;
  };
  const sprig = (x, y, h, col, lean) => {
    let g = `<path d="M${n(x)},${n(y)} q${n(lean * h * 0.5)},${n(-h * 0.5)} ${n(lean * h * 0.25)},${n(-h)}" fill="none" stroke="${col}" stroke-width="${n(u * 0.5)}" stroke-linecap="round"/>`;
    for (let i = 1; i <= 7; i++) {
      const t = i / 8;
      const lx = x + lean * h * (0.5 * 2 * t * (1 - t) + 0.25 * t * t) ;
      const ly = y - h * t;
      const side = i % 2 ? 1 : -1;
      const len = h * 0.17 * (1 - t * 0.45);
      g += `<path d="M${n(lx)},${n(ly)} q${n(side * len * 0.9)},${n(-len * 0.9)} ${n(side * len * 1.5)},${n(-len * 0.25)} q${n(-side * len * 0.5)},${n(len * 0.75)} ${n(-side * len * 1.5)},${n(len * 0.25)} Z" fill="${col}"/>`;
    }
    return g;
  };
  const kind = s.kind || pick(r, ["arches", "sun", "blobs"]);
  if (kind === "arches") {
    out += blob(W * 0.68, H * 0.3, u * 20, mix(cols[1], p.bg, 0.3));
    out += `<circle cx="${n(W * 0.3)}" cy="${n(H * 0.26)}" r="${n(u * 9)}" fill="${cols[0]}"/>`;
    out += arch(W * 0.36, H * 0.86, u * 46, 4, cols[2 % cols.length]);
    out += arch(W * 0.7, H * 0.86, u * 30, 3, cols[0]);
    out += sprig(W * 0.86, H * 0.86, u * 34, cols[3 % cols.length] || p.fg, -0.3);
  } else if (kind === "sun") {
    out += `<circle cx="${n(W * 0.5)}" cy="${n(H * 0.36)}" r="${n(u * 19)}" fill="${cols[0]}"/>`;
    for (let i = 0; i < 5; i++) out += `<path d="M0,${n(H * (0.56 + i * 0.09))} C${n(W * 0.3)},${n(H * (0.5 + i * 0.09) - between(r, 0, u * 6))} ${n(W * 0.7)},${n(H * (0.62 + i * 0.09) + between(r, 0, u * 6))} ${W},${n(H * (0.55 + i * 0.09))} V${H} H0 Z" fill="${mix(cols[1 + (i % 3)] || cols[1], p.bg, 0.12 + i * 0.03)}"/>`;
    out += sprig(W * 0.2, H * 0.98, u * 44, p.fg, 0.35) + sprig(W * 0.82, H * 0.98, u * 30, p.fg, -0.3);
  } else if (kind === "blobs") {
    out += blob(W * 0.36, H * 0.34, u * 26, cols[1]) + blob(W * 0.64, H * 0.62, u * 30, cols[0]) + blob(W * 0.3, H * 0.74, u * 15, cols[2 % cols.length]);
    out += `<circle cx="${n(W * 0.7)}" cy="${n(H * 0.24)}" r="${n(u * 7)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.45)}"/>`;
    out += `<path d="M${n(W * 0.16)},${n(H * 0.5)} C${n(W * 0.4)},${n(H * 0.4)} ${n(W * 0.55)},${n(H * 0.7)} ${n(W * 0.88)},${n(H * 0.48)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.45)}" stroke-linecap="round"/>`;
    for (let i = 0; i < 9; i++) out += `<circle cx="${n(W * 0.6 + (i % 3) * u * 3.2)}" cy="${n(H * 0.84 + Math.floor(i / 3) * u * 3.2)}" r="${n(u * 0.6)}" fill="${p.fg}"/>`;
  } else if (kind === "rainbow") {
    out += arch(W * 0.5, H * 0.7, u * 70, 5, cols[0]);
    out += `<circle cx="${n(W * 0.5)}" cy="${n(H * 0.2)}" r="${n(u * 8)}" fill="${cols[1]}"/>`;
  } else if (kind === "moon") {
    out += `<circle cx="${n(W * 0.5)}" cy="${n(H * 0.34)}" r="${n(u * 22)}" fill="${cols[0]}"/><circle cx="${n(W * 0.58)}" cy="${n(H * 0.3)}" r="${n(u * 19)}" fill="${p.bg}"/>`;
    for (let i = 0; i < 3; i++) out += `<path d="M0,${n(H * (0.68 + i * 0.1))} Q${n(W * 0.5)},${n(H * (0.56 + i * 0.1))} ${W},${n(H * (0.68 + i * 0.1))} V${H} H0 Z" fill="${mix(cols[1 + i] || cols[1], p.bg, 0.1)}"/>`;
    for (let i = 0; i < 14; i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * H * 0.55)}" r="${n(u * between(r, 0.3, 0.7))}" fill="${p.fg}" opacity=".7"/>`;
  }
  return box(W, H, p, svg(W, H, out), { grainy: 0.16 });
}

/** Parallel flowing lines, or the rings of a contour map. */
export function flow(s, W, H, r) {
  const p = pal(s.pal || "paper");
  const u = Math.min(W, H) / 100;
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  if (s.kind === "topo") {
    const cx = W * (s.cx ?? between(r, 0.35, 0.65));
    const cy = H * (s.cy ?? between(r, 0.4, 0.6));
    const k = 14;
    const wob = Array.from({ length: k }, () => between(r, 0.75, 1.25));
    const rings = s.rings || 22;
    for (let i = 1; i <= rings; i++) {
      const rad = (Math.hypot(W, H) * 0.62 * i) / rings;
      const pts = wob.map((w, j) => {
        const a = (j / k) * Math.PI * 2;
        const d = rad * (1 + (w - 1) * (0.25 + (i / rings) * 0.75));
        return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.86];
      });
      let d = `M${n((pts[0][0] + pts[k - 1][0]) / 2)},${n((pts[0][1] + pts[k - 1][1]) / 2)}`;
      for (let j = 0; j < k; j++) d += ` Q${n(pts[j][0])},${n(pts[j][1])} ${n((pts[j][0] + pts[(j + 1) % k][0]) / 2)},${n((pts[j][1] + pts[(j + 1) % k][1]) / 2)}`;
      out += `<path d="${d} Z" fill="none" stroke="${i % 5 === 0 ? p.ac : p.fg}" stroke-width="${n(u * (i % 5 === 0 ? 0.42 : 0.2))}" opacity="${i % 5 === 0 ? 1 : 0.75}"/>`;
    }
  } else {
    const lines = s.lines || 26;
    const a = [between(r, 0.2, 0.8), between(r, 0.2, 0.8), between(r, 0.2, 0.8)];
    const span = H * 0.5;
    for (let i = 0; i < lines; i++) {
      const t = i / (lines - 1);
      const y = H * 0.25 + span * t;
      const col = s.fill ? mix(p.ac, p.more[1 % p.more.length], t) : i % 6 === 2 ? p.ac : p.fg;
      const d = `M${-W * 0.05},${n(y + (a[0] - 0.5) * span * (1 - t))} C${n(W * 0.3)},${n(y - span * 0.5 * a[1] * (1 - t * 0.6))} ${n(W * 0.6)},${n(y + span * 0.6 * a[2] * (0.4 + t * 0.6))} ${n(W * 1.05)},${n(y - span * 0.22 * a[0])}`;
      out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(u * (s.fill ? 1.5 : 0.34))}" stroke-linecap="round" opacity="${s.fill ? 0.95 : 0.9}"/>`;
    }
    if (s.dot !== false) out += `<circle cx="${n(W * (s.dotX ?? 0.72))}" cy="${n(H * 0.24)}" r="${n(u * 7)}" fill="${p.ac}"/>`;
  }
  return box(W, H, p, svg(W, H, out), { grainy: 0.12 });
}

/** A grid of simple geometric tiles. */
export function bauhaus(s, W, H, r) {
  const p = pal(s.pal || "ink");
  const cols = [p.fg, p.ac, ...p.more.slice(0, 2), p.bg];
  const nx = s.cols || Math.max(2, Math.round((W / H) * 4));
  const ny = s.rows || Math.round((nx * H) / W);
  const cw = W / nx;
  const ch = H / ny;
  let out = "";
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const bg = pick(r, cols);
      let fg = pick(r, cols);
      while (fg === bg) fg = pick(r, cols);
      const X = x * cw;
      const Y = y * ch;
      const k = Math.floor(r() * 7);
      const corner = pick(r, [[0, 0], [1, 0], [0, 1], [1, 1]]);
      out += `<g transform="translate(${n(X)} ${n(Y)})"><rect width="${n(cw + 0.5)}" height="${n(ch + 0.5)}" fill="${bg}"/>`;
      if (k === 0) out += `<circle cx="${n(cw / 2)}" cy="${n(ch / 2)}" r="${n(Math.min(cw, ch) * 0.38)}" fill="${fg}"/>`;
      else if (k === 1) out += `<clipPath id="c${x}_${y}"><rect width="${n(cw)}" height="${n(ch)}"/></clipPath><circle cx="${n(corner[0] * cw)}" cy="${n(corner[1] * ch)}" r="${n(Math.min(cw, ch))}" fill="${fg}" clip-path="url(#c${x}_${y})"/>`;
      else if (k === 2) out += `<path d="M0,${n(ch)} A${n(cw / 2)},${n(cw / 2)} 0 0 1 ${n(cw)},${n(ch)} Z" fill="${fg}"/>`;
      else if (k === 3) for (let i = 0; i < 4; i++) out += `<rect x="0" y="${n((ch / 8) * (i * 2 + 0.5))}" width="${n(cw)}" height="${n(ch / 8)}" fill="${fg}"/>`;
      else if (k === 4) out += `<path d="M0,0 L${n(cw)},0 L0,${n(ch)} Z" fill="${fg}"/>`;
      else if (k === 5) out += `<circle cx="${n(cw / 2)}" cy="${n(ch / 2)}" r="${n(Math.min(cw, ch) * 0.36)}" fill="none" stroke="${fg}" stroke-width="${n(Math.min(cw, ch) * 0.12)}"/>`;
      else out += `<rect x="${n(cw * 0.25)}" y="${n(ch * 0.25)}" width="${n(cw * 0.5)}" height="${n(ch * 0.5)}" fill="${fg}"/>`;
      out += "</g>";
    }
  return box(W, H, p, svg(W, H, out), { grainy: 0.16 });
}

/** Loose brush strokes with torn edges, a few gold flecks. */
export function brush(s, W, H, r) {
  const p = pal(s.pal || "ivory");
  const u = Math.min(W, H) / 100;
  const cols = s.cols || [p.fg, p.ac, ...p.more];
  let out = `<defs><filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${n(0.012 * (1000 / Math.max(W, H)) * 1)}" numOctaves="3" seed="${Math.floor(r() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="${n(u * 9)}"/></filter>
    <filter id="dry" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.4" numOctaves="2" seed="${Math.floor(r() * 99)}" result="t"/><feColorMatrix in="t" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.1" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/><feDisplacementMap in2="t" scale="${n(u * 5)}"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  const strokes = s.strokes || 6;
  for (let i = 0; i < strokes; i++) {
    const cx = W * between(r, 0.2, 0.8);
    const cy = H * between(r, 0.18, 0.82);
    const rx = W * between(r, 0.16, 0.42);
    const ry = H * between(r, 0.04, 0.13);
    const rot = between(r, -28, 28) + (s.vertical ? 90 : 0);
    out += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="${cols[i % cols.length]}" opacity="${n(between(r, 0.78, 0.96))}" filter="url(#${i % 2 ? "dry" : "rough"})"/>`;
  }
  if (s.ring !== false) out += `<circle cx="${n(W * between(r, 0.3, 0.7))}" cy="${n(H * between(r, 0.3, 0.7))}" r="${n(u * between(r, 12, 20))}" fill="none" stroke="${s.gold || "#c9a24a"}" stroke-width="${n(u * 0.5)}"/>`;
  for (let i = 0; i < (s.flecks ?? 60); i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r="${n(u * between(r, 0.12, 0.6))}" fill="${s.gold || "#c9a24a"}" opacity="${n(between(r, 0.4, 1))}"/>`;
  return box(W, H, p, svg(W, H, out), { grainy: 0.18 });
}

/** Marble with gold veins. tone: white | black | emerald | rose | navy */
export function marble(s, W, H, r) {
  const tones = { white: ["#f6f3ee", "#d9d4cb", "#9d968a"], black: ["#17171a", "#2b2b30", "#55555c"], emerald: ["#0f3d34", "#17584b", "#2f8a73"], rose: ["#f2ddd8", "#e2bdb7", "#c08f8a"], navy: ["#101d3a", "#1b2f5c", "#3a5796"] };
  const t = tones[s.tone] || tones.white;
  const u = Math.min(W, H) / 100;
  const seed = Math.floor(r() * 999);
  let out = `<defs>
    <filter id="mb" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${n(0.0035 * (1000 / H))} ${n(0.009 * (1000 / H))}" numOctaves="5" seed="${seed}" result="n"/><feColorMatrix in="n" type="matrix" values="1.6 0 0 0 -0.35  1.6 0 0 0 -0.35  1.6 0 0 0 -0.35  0 0 0 0 1" result="c"/><feComponentTransfer in="c"><feFuncR type="table" tableValues="0 .2 .9 .25 1 .3 0"/><feFuncG type="table" tableValues="0 .2 .9 .25 1 .3 0"/><feFuncB type="table" tableValues="0 .2 .9 .25 1 .3 0"/></feComponentTransfer></filter>
    <filter id="warp"><feTurbulence type="fractalNoise" baseFrequency="${n(0.004 * (1000 / H))}" numOctaves="3" seed="${seed + 7}"/><feDisplacementMap in="SourceGraphic" scale="${n(u * 26)}"/></filter>
    <linearGradient id="au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1dc9a"/><stop offset=".5" stop-color="#b98a2f"/><stop offset="1" stop-color="#ecd28a"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="${t[0]}"/>
    <rect width="${W}" height="${H}" filter="url(#mb)" opacity="${s.tone === "white" || s.tone === "rose" ? 0.34 : 0.5}" style="mix-blend-mode:${s.tone === "white" || s.tone === "rose" ? "multiply" : "screen"}"/>`;
  const veins = s.veins ?? 5;
  for (let i = 0; i < veins; i++) {
    const y0 = H * between(r, 0.05, 0.95);
    const y1 = H * between(r, 0.05, 0.95);
    out += `<path d="M${-W * 0.1},${n(y0)} C${n(W * 0.3)},${n(y0 + between(r, -H * 0.3, H * 0.3))} ${n(W * 0.6)},${n(y1 + between(r, -H * 0.3, H * 0.3))} ${n(W * 1.1)},${n(y1)}" fill="none" stroke="url(#au)" stroke-width="${n(u * between(r, 0.25, 1.1))}" filter="url(#warp)" opacity="${n(between(r, 0.7, 1))}"/>`;
  }
  if (s.shape === "hex") {
    const cx = W / 2;
    const cy = H / 2;
    const rad = Math.min(W, H) * 0.3;
    const pts = Array.from({ length: 6 }, (_, i) => `${n(cx + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * rad)},${n(cy + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * rad)}`).join(" ");
    out += `<polygon points="${pts}" fill="none" stroke="url(#au)" stroke-width="${n(u * 0.9)}"/><polygon points="${pts}" fill="none" stroke="url(#au)" stroke-width="${n(u * 0.3)}" transform="translate(${n(cx)} ${n(cy)}) scale(.86) translate(${n(-cx)} ${n(-cy)})"/>`;
  } else if (s.shape === "ring") out += `<circle cx="${n(W / 2)}" cy="${n(H / 2)}" r="${n(Math.min(W, H) * 0.28)}" fill="none" stroke="url(#au)" stroke-width="${n(u * 1.1)}"/>`;
  else if (s.shape === "frame") out += `<rect x="${n(u * 7)}" y="${n(u * 7)}" width="${n(W - u * 14)}" height="${n(H - u * 14)}" fill="none" stroke="url(#au)" stroke-width="${n(u * 0.5)}"/>`;
  return box(W, H, pal("noir"), svg(W, H, out), { grainy: 0.06 });
}

/** Botanical line art: stems with leaves. style: line | fill */
export function botanical(s, W, H, r) {
  const p = pal(s.pal || "ivory");
  const u = Math.min(W, H) / 100;
  const ink = s.ink || p.fg;
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  const stems = s.stems || Math.max(3, Math.round((W / H) * 4));
  for (let k = 0; k < stems; k++) {
    const x = W * ((k + 0.5) / stems) + between(r, -W * 0.04, W * 0.04);
    const h = H * between(r, 0.5, 0.8);
    const lean = between(r, -0.22, 0.22);
    const col = s.style === "fill" ? pick(r, [p.ac, ...p.more]) : ink;
    const bx = (t) => x + lean * h * t * t;
    out += `<path d="M${n(x)},${n(H * 0.96)} Q${n(x)},${n(H * 0.96 - h * 0.5)} ${n(bx(1))},${n(H * 0.96 - h)}" fill="none" stroke="${col}" stroke-width="${n(u * 0.34)}" stroke-linecap="round"/>`;
    const leaves = Math.round(between(r, 6, 10));
    const shape = pick(r, ["leaf", "leaf", "round", "fern"]);
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1);
      const lx = bx(t);
      const ly = H * 0.96 - h * t;
      const side = i % 2 ? 1 : -1;
      const len = h * (shape === "fern" ? 0.2 : 0.14) * (1 - t * 0.5);
      const fill = s.style === "fill" ? col : "none";
      const attrs = `fill="${fill}" stroke="${col}" stroke-width="${n(u * 0.28)}" stroke-linejoin="round"`;
      if (shape === "round") out += `<circle cx="${n(lx + side * len * 0.9)}" cy="${n(ly - len * 0.5)}" r="${n(len * 0.42)}" ${attrs}/><path d="M${n(lx)},${n(ly)} L${n(lx + side * len * 0.55)},${n(ly - len * 0.3)}" stroke="${col}" stroke-width="${n(u * 0.25)}"/>`;
      else out += `<path d="M${n(lx)},${n(ly)} q${n(side * len * 0.75)},${n(-len * (shape === "fern" ? 0.3 : 0.95))} ${n(side * len * 1.5)},${n(-len * 0.5)} q${n(-side * len * 0.55)},${n(len * (shape === "fern" ? 0.25 : 0.7))} ${n(-side * len * 1.5)},${n(len * 0.5)} Z" ${attrs}/>`;
    }
    if (shape !== "fern") out += `<circle cx="${n(bx(1))}" cy="${n(H * 0.96 - h)}" r="${n(u * 0.8)}" fill="${s.style === "fill" ? p.ac : ink}"/>`;
  }
  if (s.sun) out += `<circle cx="${n(W * 0.74)}" cy="${n(H * 0.2)}" r="${n(u * 9)}" fill="${p.ac}" opacity=".9"/>`;
  return box(W, H, p, svg(W, H, out), { grainy: 0.14 });
}

/** A single thin geometric drawing on an empty sheet (minimalist). kind: circle | arc | lines | horizon | grid */
export function minimal(s, W, H, r) {
  const p = pal(s.pal || "paper");
  const u = Math.min(W, H) / 100;
  const sw = u * (s.weight || 0.5);
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  const cx = W / 2;
  const cy = H * 0.47;
  if (s.kind === "circle") out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(u * 24)}" fill="none" stroke="${p.fg}" stroke-width="${n(sw)}"/><circle cx="${n(cx + u * 10)}" cy="${n(cy + u * 8)}" r="${n(u * 9)}" fill="${p.ac}"/>`;
  else if (s.kind === "arc") for (let i = 0; i < 5; i++) out += `<path d="M${n(cx - u * (30 - i * 5))},${n(cy + u * 14)} a${n(u * (30 - i * 5))},${n(u * (30 - i * 5))} 0 0 1 ${n(u * (60 - i * 10))},0" fill="none" stroke="${i === 2 ? p.ac : p.fg}" stroke-width="${n(sw)}"/>`;
  else if (s.kind === "horizon") out += `<path d="M${n(u * 14)},${n(cy + u * 8)} H${n(W - u * 14)}" stroke="${p.fg}" stroke-width="${n(sw)}"/><circle cx="${n(cx + u * 9)}" cy="${n(cy + u * 8)}" r="${n(u * 11)}" fill="${p.ac}"/><rect x="0" y="${n(cy + u * 8 + sw / 2)}" width="${W}" height="${n(u * 14)}" fill="${p.bg}"/><path d="M${n(u * 26)},${n(cy + u * 12)} H${n(W - u * 26)} M${n(u * 36)},${n(cy + u * 16)} H${n(W - u * 36)}" stroke="${p.fg}" stroke-width="${n(sw * 0.7)}" opacity=".6"/>`;
  else if (s.kind === "lines") for (let i = 0; i < 9; i++) out += `<path d="M${n(cx + (i - 4) * u * 5)},${n(cy - u * (26 - Math.abs(i - 4) * 4))} V${n(cy + u * (26 - Math.abs(i - 4) * 4))}" stroke="${i === 4 ? p.ac : p.fg}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
  else if (s.kind === "grid") for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) out += `<circle cx="${n(cx + (x - 1.5) * u * 11)}" cy="${n(cy + (y - 2) * u * 11)}" r="${n(u * 3.2)}" fill="${(x + y * 4) % 7 === 3 ? p.ac : "none"}" stroke="${p.fg}" stroke-width="${n(sw * 0.8)}"/>`;
  else if (s.kind === "square") out += `<rect x="${n(cx - u * 22)}" y="${n(cy - u * 22)}" width="${n(u * 44)}" height="${n(u * 44)}" fill="none" stroke="${p.fg}" stroke-width="${n(sw)}"/><rect x="${n(cx - u * 8)}" y="${n(cy - u * 8)}" width="${n(u * 30)}" height="${n(u * 30)}" fill="${p.ac}" opacity=".92"/>`;
  else if (s.kind === "wave") for (let i = 0; i < 7; i++) out += `<path d="M${n(u * 14)},${n(cy + (i - 3) * u * 5)} q${n((W - u * 28) / 8)},${n(-u * 5)} ${n((W - u * 28) / 4)},0 t${n((W - u * 28) / 4)},0 t${n((W - u * 28) / 4)},0 t${n((W - u * 28) / 4)},0" fill="none" stroke="${i === 3 ? p.ac : p.fg}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
  else out += `<path d="M${n(cx - u * 22)},${n(cy + u * 20)} L${n(cx)},${n(cy - u * 24)} L${n(cx + u * 22)},${n(cy + u * 20)} Z" fill="none" stroke="${p.fg}" stroke-width="${n(sw)}" stroke-linejoin="round"/><circle cx="${n(cx)}" cy="${n(cy + u * 6)}" r="${n(u * 6)}" fill="${p.ac}"/>`;
  const label = s.label ? `<div class="caps" style="position:absolute;left:0;right:0;bottom:${n(u * 9)}px;text-align:center;font-size:${n(u * 1.7)}px;color:${p.fg};opacity:.75">${s.label}</div>` : "";
  return box(W, H, p, svg(W, H, out) + label, { grainy: 0.07 });
}

/* Gaming, Japan / anime-inspired, cinema, cars & bikes, sports and music art.
   Everything is drawn here from basic shapes. No game, film, anime, car brand
   or team is depicted: no logos, no characters, no titles that belong to anyone. */
import { between, box, esc, land, mix, n, pal, pick, svg, heights } from "./core.mjs";

const neonGlow = (id, H, k = 1) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n((H / 160) * k)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const caption = (text, u, color, bottom = 7, size = 2.5) => (text ? `<div class="caps" style="position:absolute;left:0;right:0;bottom:${n(u * bottom)}px;text-align:center;font-size:${n(u * size)}px;color:${color}">${esc(text)}</div>` : "");

/* ---------------------------------------------------------------- Gaming */

/** Synthwave: striped sun, wire mountains or a city, a glowing grid running to the horizon. */
export function synth(s, W, H, r) {
  const u = Math.min(W, H) / 100;
  const hz = H * (s.horizon ?? 0.6);
  const cx = W * (s.x ?? 0.5);
  const a = s.a || "#ff3ea5";
  const b = s.b || "#27e0ff";
  const sr = H * 0.2;
  let out = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top || "#0d0221"}"/><stop offset=".6" stop-color="${s.mid || "#3a0d5c"}"/><stop offset="1" stop-color="${s.low || "#b5179e"}"/></linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45e"/><stop offset="1" stop-color="${a}"/></linearGradient>${neonGlow("ng", H)}
    <clipPath id="cut">${Array.from({ length: 8 }, (_, k) => `<rect x="0" y="${n(hz - sr * 1.7 + k * sr * 0.25 + (k * k * sr) / 110)}" width="${W}" height="${n(Math.max(2, sr * 0.2 - k * sr * 0.017))}"/>`).join("")}<rect width="${W}" height="${n(hz - sr * 0.85)}"/></clipPath></defs>
    <rect width="${W}" height="${n(hz)}" fill="url(#bg)"/>`;
  for (let i = 0; i < Math.round((W * H) / 11000); i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * hz * 0.75)}" r="${n(between(r, 0.5, 1.8) * (H / 1000))}" fill="#fff" opacity="${n(between(r, 0.3, 0.9))}"/>`;
  out += `<circle cx="${n(cx)}" cy="${n(hz - sr * 0.35)}" r="${n(sr)}" fill="url(#sun)" clip-path="url(#cut)"/>`;
  if (s.back === "city") {
    let x = 0;
    while (x < W) {
      const w = between(r, H * 0.03, H * 0.08);
      const h = between(r, H * 0.05, H * 0.24);
      out += `<rect x="${n(x)}" y="${n(hz - h)}" width="${n(w)}" height="${n(h)}" fill="#0d0221" stroke="${b}" stroke-width="${n(u * 0.22)}" filter="url(#ng)"/>`;
      x += w;
    }
  } else {
    const pts = heights(r, W, Math.round((W / H) * 9) + 3, hz - H * 0.2, hz - H * 0.04);
    out += `<path d="M0,${n(hz)} ${pts.map(([x, y]) => `L${n(x)},${n(y)}`).join(" ")} L${W},${n(hz)} Z" fill="#12052e" stroke="${b}" stroke-width="${n(u * 0.3)}" stroke-linejoin="round" filter="url(#ng)"/>`;
    pts.forEach(([x, y], i) => {
      if (i % 2) out += `<path d="M${n(x)},${n(y)} L${n(x + between(r, -H * 0.03, H * 0.03))},${n(hz)}" stroke="${b}" stroke-width="${n(u * 0.18)}" opacity=".6"/>`;
    });
  }
  out += `<rect y="${n(hz)}" width="${W}" height="${n(H - hz)}" fill="#12052e"/><g filter="url(#ng)" stroke="${a}" stroke-width="${n(u * 0.26)}" fill="none">`;
  const cols = Math.round((W / H) * 14) + 6;
  for (let i = -cols; i <= cols; i++) out += `<path d="M${n(cx + i * (H * 0.022))},${n(hz)} L${n(cx + i * (H * 0.2))},${H}"/>`;
  for (let k = 1; k <= 9; k++) out += `<path d="M0,${n(hz + (H - hz) * Math.pow(k / 9, 2.2))} H${W}"/>`;
  out += `<path d="M0,${n(hz)} H${W}" stroke="${b}"/></g>`;
  const title = s.title ? `<div class="pad" style="justify-content:flex-start;align-items:center;padding-top:${n(H * 0.09)}px"><div style="width:${s.titleW || 78}%;text-align:center"><span data-fit="1" class="f-${s.font || "neon"}" style="color:#fff;text-shadow:0 0 ${n(u * 1.2)}px ${b},0 0 ${n(u * 3)}px ${b},0 0 ${n(u * 6)}px ${a}">${esc(s.title)}</span></div></div>` : "";
  return box(W, H, pal("neon"), svg(W, H, out) + title + caption(s.sub, u, "#fff", 5), { grainy: 0.05 });
}

const SPRITES = {
  alienA: ["..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##..."],
  alienB: ["...####...", ".########.", "##########", "###..##..#", "##########", "..##..##..", ".##.##.##.", "##......##"],
  alienC: ["....##....", "...####...", "..######..", ".##.##.##.", ".########.", "..#.##.#..", ".#......#.", "..#....#.."],
  ship: [".....#.....", "....###....", "....###....", ".#########.", "###########", "###########"],
  heart: [".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."],
  star: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", ".#.....#."],
  sword: ["........##", ".......###", "......###.", ".....###..", "#...###...", "##.###....", ".###......", ".####.....", "##..##....", "#....#...."],
  slime: ["...####...", ".########.", "##########", "##.####.##", "##########", "##########", "###....###", ".########."],
  cup: ["#########", "#########", ".#######.", ".#######.", "..#####..", "...###...", "....#....", "..#####..", ".#######."],
  key: ["..###.....", ".#...#....", ".#...#....", "..###.....", "...#......", "...####...", "...#......", "...###...."],
};
const sprite = (name, x, y, cell, color) => SPRITES[name].map((row, j) => [...row].map((c, i) => (c === "#" ? `<rect x="${n(x + i * cell)}" y="${n(y + j * cell)}" width="${n(cell + 0.4)}" height="${n(cell + 0.4)}" fill="${color}"/>` : "")).join("")).join("");
const spriteW = (name) => SPRITES[name][0].length;

/** 8-bit pixel art. kind: invaders | heart | levelup | gameover | quest | trophy */
export function pixel(s, W, H, r) {
  const p = pal(s.pal || "arcade");
  const u = Math.min(W, H) / 100;
  const cols = [p.ac, ...p.more];
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  for (let i = 0; i < 70; i++) out += `<rect x="${n(Math.floor((r() * W) / (u * 0.8)) * u * 0.8)}" y="${n(Math.floor((r() * H) / (u * 0.8)) * u * 0.8)}" width="${n(u * 0.8)}" height="${n(u * 0.8)}" fill="#fff" opacity="${n(between(r, 0.1, 0.5))}"/>`;
  let text = "";
  const line = (t, top, size, color = p.fg) => `<div class="f-px" style="position:absolute;left:0;right:0;top:${n(top)}px;text-align:center;font-size:${n(size)}px;color:${color};text-shadow:${n(size * 0.12)}px ${n(size * 0.12)}px 0 rgba(0,0,0,.55)">${esc(t)}</div>`;
  if (s.kind === "invaders") {
    const cell = (W * 0.72) / (5 * 13);
    ["alienA", "alienB", "alienC", "alienB"].forEach((name, row) => {
      for (let i = 0; i < 5; i++) out += sprite(name, W * 0.14 + i * cell * 13 + (cell * (11 - spriteW(name))) / 2, H * 0.2 + row * cell * 11, cell, cols[row % cols.length]);
    });
    out += sprite("ship", W / 2 - cell * 5.5, H * 0.78, cell, p.fg);
    for (let k = 0; k < 3; k++) out += `<rect x="${n(W / 2 - cell / 2 + (k - 1) * cell * 9)}" y="${n(H * (0.62 + k * 0.03))}" width="${n(cell)}" height="${n(cell * 3)}" fill="${cols[2]}"/>`;
    text = line("SCORE 004200", H * 0.07, u * 3.8) + line(s.text || "INSERT COIN", H * 0.89, u * 3.8);
  } else if (s.kind === "heart") {
    const cell = (W * 0.5) / 9;
    out += sprite("heart", W / 2 - cell * 4.5, H * 0.24, cell, cols[1] || p.ac);
    out += `<rect x="${n(W / 2 - cell * 2.5)}" y="${n(H * 0.24 + cell)}" width="${n(cell)}" height="${n(cell)}" fill="#fff" opacity=".85"/>`;
    text = line(s.text || "+1 LIFE", H * 0.72, u * 5.2) + line(s.sub || "PLAYER 2 JOINED", H * 0.82, u * 3, cols[3] || p.fg);
  } else if (s.kind === "levelup") {
    const cell = (W * 0.36) / 9;
    out += sprite("star", W / 2 - cell * 4.5, H * 0.2, cell, cols[2] || p.ac);
    for (let k = 0; k < 10; k++) out += `<rect x="${n(W * 0.18 + k * W * 0.064)}" y="${n(H * 0.74)}" width="${n(W * 0.055)}" height="${n(u * 4)}" fill="${k < 8 ? p.ac : mix(p.bg, "#ffffff", 0.18)}"/>`;
    text = line(s.text || "LEVEL UP", H * 0.56, u * 6.4) + line(s.sub || "XP 80 / 100", H * 0.82, u * 3);
  } else if (s.kind === "gameover") {
    const shapes = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]];
    const cell = W / 12;
    for (let k = 0; k < 9; k++) {
      const sh = pick(r, shapes);
      const ox = Math.floor(r() * 9) * cell;
      const oy = H * 0.62 + Math.floor(r() * 3) * cell;
      const col = pick(r, cols);
      sh.forEach(([i, j]) => (out += `<rect x="${n(ox + i * cell)}" y="${n(oy + j * cell)}" width="${n(cell - 3)}" height="${n(cell - 3)}" fill="${col}"/><rect x="${n(ox + i * cell)}" y="${n(oy + j * cell)}" width="${n(cell - 3)}" height="${n(cell * 0.16)}" fill="#fff" opacity=".3"/>`));
    }
    text = line(s.text || "GAME", H * 0.16, u * 9.5) + line(s.text2 || "OVER", H * 0.29, u * 9.5, p.ac) + line(s.sub || "CONTINUE? 9", H * 0.46, u * 3.2);
  } else if (s.kind === "quest") {
    const cell = (W * 0.34) / 10;
    out += sprite("sword", W * 0.16, H * 0.2, cell, p.fg) + sprite("slime", W * 0.56, H * 0.3, cell * 0.9, cols[0]) + sprite("key", W * 0.6, H * 0.12, cell * 0.6, cols[2] || p.ac);
    out += `<rect x="${n(W * 0.1)}" y="${n(H * 0.62)}" width="${n(W * 0.8)}" height="${n(H * 0.24)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.8)}"/>`;
    text = `<div class="f-px" style="position:absolute;left:${n(W * 0.14)}px;right:${n(W * 0.14)}px;top:${n(H * 0.66)}px;font-size:${n(u * 3.3)}px;line-height:1.9;color:${p.fg}">${(s.lines || ["A WILD MONDAY", "APPEARS!", "> FIGHT   RUN"]).map(esc).join("<br>")}</div>`;
  } else {
    const cell = (W * 0.36) / 9;
    out += sprite("cup", W / 2 - cell * 4.5, H * 0.2, cell, cols[2] || p.ac);
    text = line(s.text || "PLAYER ONE", H * 0.64, u * 5) + line(s.sub || "READY", H * 0.76, u * 5, p.ac);
  }
  return box(W, H, p, svg(W, H, out, 'shape-rendering="crispEdges"') + text, { grainy: 0.05 });
}

/** A game controller. style: neon | flat | blueprint */
export function pad(s, W, H, r) {
  const style = s.style || "neon";
  const p = pal(s.pal || (style === "flat" ? "mustard" : "neon"));
  const u = Math.min(W, H) / 100;
  const k = (W * 0.84) / 640;
  const ox = W / 2 - 320 * k;
  const oy = H * (s.y ?? 0.44) - 190 * k;
  const line = style === "blueprint" ? "#eaf2ff" : p.ac;
  const bg = style === "blueprint" ? "#1d3f72" : p.bg;
  const shapes = `<rect x="70" y="60" width="500" height="200" rx="96"/><circle cx="140" cy="250" r="96"/><circle cx="500" cy="250" r="96"/><rect x="120" y="36" width="110" height="60" rx="24"/><rect x="410" y="36" width="110" height="60" rx="24"/>`;
  let out = `<defs>${neonGlow("ng", H, 1.2)}</defs><rect width="${W}" height="${H}" fill="${bg}"/>`;
  if (style === "blueprint") for (let g = 0; g < 40; g++) out += `<path d="M${n((g * W) / 20)},0V${H}M0,${n((g * H) / 25)}H${W}" stroke="#fff" stroke-width="${n(u * 0.08)}" opacity=".13"/>`;
  if (style === "neon") for (let i = 0; i < 9; i++) out += `<path d="M0,${n(H * (0.72 + i * 0.035))} H${W}" stroke="${p.more[1]}" stroke-width="${n(u * 0.16)}" opacity="${n(0.5 - i * 0.04)}"/>`;
  const sw = style === "flat" ? 0 : 7;
  out += `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k * 10) / 10})" ${style === "neon" ? 'filter="url(#ng)"' : ""}>`;
  if (style === "flat") out += `<g fill="${p.fg}">${shapes}</g>`;
  else out += `<g fill="${line}" stroke="${line}" stroke-width="${sw * 2}" stroke-linejoin="round">${shapes}</g><g fill="${bg}">${shapes}</g>`;
  const d = style === "flat" ? p.bg : line;
  const f = style === "flat" ? p.bg : "none";
  out += `<g fill="${f}" stroke="${d}" stroke-width="${style === "flat" ? 0 : 6}" stroke-linejoin="round">
      <path d="M170,118h30v-30h36v30h30v36h-30v30h-36v-30h-30z"/>
      <circle cx="470" cy="100" r="19"/><circle cx="470" cy="172" r="19"/><circle cx="434" cy="136" r="19"/><circle cx="506" cy="136" r="19"/>
      <circle cx="262" cy="222" r="34"/><circle cx="378" cy="222" r="34"/>
      <rect x="290" y="112" width="24" height="12" rx="6"/><rect x="326" y="112" width="24" height="12" rx="6"/>
    </g>`;
  if (style !== "flat") out += `<circle cx="470" cy="100" r="8" fill="${p.more[0]}"/><circle cx="506" cy="136" r="8" fill="${p.more[2]}"/>`;
  out += `</g>`;
  if (style === "blueprint") out += `<path d="M${n(ox)},${n(oy + 380 * k)} H${n(ox + 640 * k)}" stroke="#eaf2ff" stroke-width="${n(u * 0.2)}"/><path d="M${n(ox)},${n(oy + 372 * k)} v${n(16 * k)} M${n(ox + 640 * k)},${n(oy + 372 * k)} v${n(16 * k)}" stroke="#eaf2ff" stroke-width="${n(u * 0.2)}"/>`;
  const title = s.title ? `<div style="position:absolute;left:8%;right:8%;top:${n(H * (s.titleY ?? 0.72))}px;text-align:center"><span data-fit="${s.fit || 0.9}" class="f-${s.font || "orb"}" style="color:${style === "flat" ? p.fg : "#fff"};${style === "neon" ? `text-shadow:0 0 ${n(u * 1.4)}px ${p.ac},0 0 ${n(u * 4)}px ${p.ac}` : ""}">${esc(s.title)}</span></div>` : "";
  return box(W, H, p, svg(W, H, out) + title + caption(s.sub, u, style === "flat" ? p.fg : "#fff", 6), { grainy: 0.06 });
}

/** Keycaps: W A S D (or any letters). */
export function keys(s, W, H) {
  const p = pal(s.pal || "slate");
  const u = Math.min(W, H) / 100;
  const size = W * 0.2;
  const gap = size * 0.14;
  const cap = (ch, x, y, hot) => `<div style="position:absolute;left:${n(x)}px;top:${n(y)}px;width:${n(size)}px;height:${n(size)}px;border-radius:${n(size * 0.16)}px;background:${hot ? p.ac : p.more[0]};box-shadow:0 ${n(size * 0.12)}px 0 ${hot ? mix(p.ac, "#000000", 0.4) : mix(p.more[0], "#000000", 0.45)},0 ${n(size * 0.2)}px ${n(size * 0.2)}px rgba(0,0,0,.4)">
      <div style="position:absolute;inset:${n(size * 0.09)}px;border-radius:${n(size * 0.12)}px;background:linear-gradient(160deg,rgba(255,255,255,.2),rgba(255,255,255,0) 60%);display:grid;place-items:center" class="f-orb"><span style="font-size:${n(size * 0.42)}px;color:${hot ? p.bg : p.fg}">${esc(ch)}</span></div></div>`;
  const rows = s.rows || [[null, "W", null], ["A", "S", "D"]];
  const total = 3 * size + 2 * gap;
  const x0 = (W - total) / 2;
  const y0 = H * (s.y ?? 0.26);
  const capsHtml = rows.map((row, j) => row.map((ch, i) => (ch ? cap(ch, x0 + i * (size + gap), y0 + j * (size + gap * 1.6), ch === (s.hot || "W")) : "")).join("")).join("");
  return box(W, H, p, `${capsHtml}<div style="position:absolute;left:10%;right:10%;top:${n(y0 + 2 * (size + gap * 1.6) + size * 0.5)}px;text-align:center"><span data-fit="${s.fit || 0.8}" class="f-${s.font || "orb"}" style="color:${p.fg};letter-spacing:.08em">${esc(s.title || "KEEP MOVING")}</span></div>${caption(s.sub, u, p.fg, 7)}`, { grainy: 0.1 });
}

/** Esports poster: slanted type on hard diagonals. */
export function hud(s, W, H, r) {
  const p = pal(s.pal || "arcade");
  const u = Math.min(W, H) / 100;
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  for (let i = 0; i < 7; i++) {
    const x = W * (-0.2 + i * 0.22);
    out += `<path d="M${n(x)},${H} L${n(x + W * 0.45)},0 L${n(x + W * 0.45 + W * between(r, 0.02, 0.1))},0 L${n(x + W * between(r, 0.02, 0.1))},${H} Z" fill="${pick(r, [p.ac, ...p.more])}" opacity="${n(between(r, 0.1, 0.5))}"/>`;
  }
  for (let y = 0; y < H; y += u * 1.2) out += `<path d="M0,${n(y)}H${W}" stroke="#000" stroke-width="${n(u * 0.25)}" opacity=".18"/>`;
  out += `<path d="M${n(u * 6)},${n(u * 6)} h${n(u * 12)} M${n(u * 6)},${n(u * 6)} v${n(u * 12)} M${n(W - u * 6)},${n(H - u * 6)} h${n(-u * 12)} M${n(W - u * 6)},${n(H - u * 6)} v${n(-u * 12)}" stroke="${p.fg}" stroke-width="${n(u * 0.5)}" fill="none"/>`;
  const rows = s.lines.map((l, i) => `<div style="line-height:.98"><span data-fit="1" class="f-anton" style="display:inline-block;transform:skewX(-10deg);color:${l.startsWith("*") ? p.ac : p.fg};text-shadow:${n(u * 0.5)}px ${n(u * 0.5)}px 0 ${p.more[i % 2]}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("");
  return box(W, H, p, svg(W, H, out) + `<div class="pad" data-fith style="padding:${n(u * 12)}px ${n(u * 10)}px"><div style="width:100%">${s.top ? `<div class="f-mono" style="font-size:${n(u * 2.8)}px;color:${p.fg};margin-bottom:${n(u * 3)}px;letter-spacing:.2em">${esc(s.top)}</div>` : ""}${rows}${s.sub ? `<div class="f-mono" style="font-size:${n(u * 2.8)}px;color:${p.fg};margin-top:${n(u * 3.5)}px;letter-spacing:.2em">${esc(s.sub)}</div>` : ""}</div></div>`, { grainy: 0.08 });
}

/* ---------------------------------------------------------------- Japan, anime-inspired */

const seal = (text, x, y, size) => `<div style="position:absolute;left:${n(x)}px;top:${n(y)}px;width:${n(size)}px;height:${n(size)}px;background:#c8402f;border-radius:${n(size * 0.12)}px;display:grid;place-items:center;color:#f7ead6;font-family:'Yu Mincho','MS Mincho','Noto Serif JP',serif;font-weight:700;font-size:${n(size * 0.62)}px;line-height:1">${text}</div>`;
const vertical = (text, x, y, size, color) => `<div style="position:absolute;left:${n(x)}px;top:${n(y)}px;writing-mode:vertical-rl;font-family:'Yu Mincho','MS Mincho','Noto Serif JP',serif;font-weight:700;font-size:${n(size)}px;letter-spacing:.18em;color:${color}">${text}</div>`;

/** Japanese-style scenes. kind: fuji | torii | sakura | waves | sky | wanderer | alley | pagoda */
export function japan(s, W, H, r) {
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "fuji";
  let out = "";
  let over = "";
  if (kind === "fuji") {
    const paper = s.paper || "#f1e8d4";
    const cx = W * (s.x ?? 0.52);
    const base = H * 0.72;
    const top = H * 0.36;
    const half = Math.min(W * 0.46, H * 0.5);
    const cone = `M${n(cx - half)},${n(base)} Q${n(cx - half * 0.36)},${n(base - (base - top) * 0.5)} ${n(cx - half * 0.12)},${n(top)} L${n(cx + half * 0.12)},${n(top)} Q${n(cx + half * 0.36)},${n(base - (base - top) * 0.5)} ${n(cx + half)},${n(base)} Z`;
    out += `<defs><clipPath id="fj"><path d="${cone}"/></clipPath></defs><rect width="${W}" height="${H}" fill="${paper}"/>
      <circle cx="${n(W * (s.sunX ?? 0.7))}" cy="${n(H * 0.26)}" r="${n(Math.min(W, H) * 0.13)}" fill="#c8402f"/>
      <path d="${cone}" fill="${s.ink || "#28396b"}"/>
      <path d="M${n(cx - half)},${n(top - 10)} H${n(cx + half)} V${n(top + (base - top) * 0.26)} ${Array.from({ length: 9 }, (_, i) => `L${n(cx + half * 0.5 - (i + 0.5) * (half / 9))},${n(top + (base - top) * (i % 2 ? 0.2 : 0.36))}`).join(" ")} L${n(cx - half * 0.5)},${n(top + (base - top) * 0.26)} Z" fill="#fbf7ee" clip-path="url(#fj)"/>`;
    for (let i = 0; i < 6; i++) {
      const y = H * between(r, 0.42, 0.7);
      const w = W * between(r, 0.16, 0.38);
      const x = between(r, -W * 0.05, W * 0.85);
      out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(u * 2.6)}" rx="${n(u * 1.3)}" fill="#fbf7ee" opacity=".95"/><rect x="${n(x + w * 0.2)}" y="${n(y + u * 3.2)}" width="${n(w * 0.7)}" height="${n(u * 1.9)}" rx="${n(u)}" fill="#fbf7ee" opacity=".85"/>`;
    }
    out += `<path d="${land(heights(r, W, 7, H * 0.74, H * 0.82), W, H)}" fill="#5f7d5a"/><path d="${land(heights(r, W, 9, H * 0.84, H * 0.9), W, H)}" fill="#2f4b3a"/>`;
    over = seal("富", W * 0.1, H * 0.1, u * 7) + (s.text === false ? "" : vertical("富士山", W * 0.105, H * 0.2, u * 3.2, "#28396b"));
  } else if (kind === "torii") {
    const hz = H * 0.62;
    const cx = W * (s.x ?? 0.5);
    const k = Math.min(W, H) * 0.0036;
    const gate = (flip) => `<g transform="translate(${n(cx)} ${n(hz)}) scale(${n(k)} ${n(flip ? -k * 0.8 : k)})" fill="${flip ? "#7a1b12" : "#c8402f"}" opacity="${flip ? 0.45 : 1}">
        <path d="M-74,0 L-66,-150 H-50 L-42,0 Z M42,0 L50,-150 H66 L74,0 Z"/><rect x="-86" y="-118" width="172" height="13"/>
        <path d="M-112,-166 Q0,-150 112,-166 L104,-146 Q0,-134 -104,-146 Z"/><path d="M-120,-180 Q0,-160 120,-180 L116,-168 Q0,-150 -116,-168 Z" fill="${flip ? "#3a0d0a" : "#1c1410"}"/><rect x="-8" y="-146" width="16" height="30"/></g>`;
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a55"/><stop offset=".55" stop-color="#e86a5c"/><stop offset="1" stop-color="#ffcf8a"/></linearGradient></defs>
      <rect width="${W}" height="${n(hz)}" fill="url(#sk)"/><circle cx="${n(cx)}" cy="${n(hz - H * 0.12)}" r="${n(Math.min(W, H) * 0.16)}" fill="#fff0c2" opacity=".95"/>
      <path d="${land(heights(r, W, 8, hz - H * 0.1, hz - H * 0.02), W, H)}" fill="#2a2244" opacity=".8"/>
      <rect y="${n(hz)}" width="${W}" height="${n(H - hz)}" fill="#3b2f5c"/>${gate(true)}`;
    for (let i = 0; i < 26; i++) out += `<rect x="${n(r() * W)}" y="${n(between(r, hz + 4, H))}" width="${n(between(r, W * 0.03, W * 0.16))}" height="${n(u * 0.3)}" fill="#ffcf8a" opacity="${n(between(r, 0.15, 0.6))}"/>`;
    out += gate(false);
  } else if (kind === "sakura") {
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top || "#bcd9e6"}"/><stop offset="1" stop-color="${s.low || "#fbe3e1"}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>
      <circle cx="${n(W * 0.72)}" cy="${n(H * 0.3)}" r="${n(Math.min(W, H) * 0.17)}" fill="#fffaf0" opacity=".9"/>`;
    const tips = [];
    const grow = (x, y, a, len, w, d) => {
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      out += `<path d="M${n(x)},${n(y)} Q${n((x + ex) / 2 + between(r, -len, len) * 0.18)},${n((y + ey) / 2 + between(r, -len, len) * 0.18)} ${n(ex)},${n(ey)}" stroke="#3a2a26" stroke-width="${n(w)}" fill="none" stroke-linecap="round"/>`;
      tips.push([ex, ey]);
      if (d > 0) for (let k = 0; k < 2; k++) grow(ex, ey, a + between(r, -0.75, 0.75), len * between(r, 0.6, 0.78), w * 0.64, d - 1);
    };
    grow(-W * 0.02, H * 0.3, 0.18, Math.min(W * 0.34, H * 0.4), u * 2.2, 5);
    grow(W * 1.02, H * 0.82, Math.PI + 0.3, Math.min(W * 0.26, H * 0.3), u * 1.6, 4);
    tips.forEach(([x, y]) => {
      for (let f = 0; f < 3; f++) {
        const fx = x + between(r, -u * 5, u * 5);
        const fy = y + between(r, -u * 5, u * 5);
        const rad = u * between(r, 1.2, 2.3);
        const col = pick(r, ["#f7b6c2", "#f28ca6", "#fbd3da", "#ffffff"]);
        for (let q = 0; q < 5; q++) out += `<circle cx="${n(fx + Math.cos((q / 5) * 6.283) * rad)}" cy="${n(fy + Math.sin((q / 5) * 6.283) * rad)}" r="${n(rad * 0.82)}" fill="${col}" opacity=".95"/>`;
        out += `<circle cx="${n(fx)}" cy="${n(fy)}" r="${n(rad * 0.4)}" fill="#e2566f"/>`;
      }
    });
    for (let i = 0; i < Math.round((W / H) * 40); i++) out += `<ellipse cx="${n(r() * W)}" cy="${n(r() * H)}" rx="${n(u * 1)}" ry="${n(u * 0.55)}" transform="rotate(${n(r() * 180)} ${n(r() * W)} ${n(r() * H)})" fill="#f28ca6" opacity="${n(between(r, 0.35, 0.8))}"/>`;
    over = seal("桜", W * 0.84, H * 0.84, u * 7);
  } else if (kind === "waves") {
    const ink = s.ink || "#1f3b73";
    const rad = Math.min(W, H) / 9;
    out += `<rect width="${W}" height="${H}" fill="#f4ecd9"/>`;
    for (let row = Math.ceil(H / (rad * 0.5)) + 1; row >= 0; row--)
      for (let col = -1; col <= Math.ceil(W / (rad * 2)) + 1; col++) {
        const x = col * rad * 2 + (row % 2 ? rad : 0);
        const y = row * rad * 0.5;
        for (let k = 0; k < 4; k++) out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad * (1 - k * 0.24))}" fill="${k % 2 ? "#f4ecd9" : ink}" stroke="${ink}" stroke-width="${n(u * 0.2)}"/>`;
      }
    out += `<circle cx="${n(W * (s.sunX ?? 0.5))}" cy="${n(H * 0.36)}" r="${n(Math.min(W, H) * 0.2)}" fill="#c8402f"/>`;
  } else if (kind === "sky") {
    const hz = H * 0.86;
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top || "#1c3f8f"}"/><stop offset=".45" stop-color="${s.mid || "#4f9ad6"}"/><stop offset=".8" stop-color="${s.low || "#ffc58f"}"/><stop offset="1" stop-color="#ff9a7b"/></linearGradient>
      <radialGradient id="cl" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="${s.cloud || "#ffe2d1"}"/><stop offset="1" stop-color="${s.shade || "#e9a7a2"}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>
      <circle cx="${n(W * (s.sunX ?? 0.3))}" cy="${n(hz - H * 0.06)}" r="${n(H * 0.3)}" fill="#fff3c9" opacity=".35"/>`;
    const cloud = (cx, cy, size) => {
      let g = "";
      for (let k = 0; k < 16; k++) {
        const t = k / 15;
        const x = cx + (t - 0.5) * size * 2.4 + between(r, -size * 0.12, size * 0.12);
        const rad = size * (0.3 + Math.sin(t * Math.PI) * 0.55) * between(r, 0.8, 1.15);
        g += `<circle cx="${n(x)}" cy="${n(cy - rad * 0.5)}" r="${n(rad)}" fill="url(#cl)"/>`;
      }
      return g + `<rect x="${n(cx - size * 1.5)}" y="${n(cy - size * 0.1)}" width="${n(size * 3)}" height="${n(size * 0.45)}" rx="${n(size * 0.2)}" fill="${s.shade || "#e9a7a2"}" opacity=".0"/>`;
    };
    const clouds = Math.max(3, Math.round((W / H) * 3));
    for (let i = 0; i < clouds; i++) out += cloud(W * ((i + 0.5) / clouds) + between(r, -W * 0.06, W * 0.06), H * between(r, 0.34, 0.66), H * between(r, 0.1, 0.19));
    for (let i = 0; i < 5; i++) out += `<path d="M${n(W * 0.6 + i * u * 4)},${n(H * 0.2 + (i % 2) * u * 2)} q${n(u)},${n(-u * 1.2)} ${n(u * 2)},0 q${n(u)},${n(-u * 1.2)} ${n(u * 2)},0" fill="none" stroke="#1b2140" stroke-width="${n(u * 0.25)}"/>`;
    const ink = "#151a33";
    let roof = `M0,${H} L0,${n(hz)}`;
    let x = 0;
    while (x < W) {
      const w = between(r, H * 0.08, H * 0.2);
      const y = hz - between(r, -H * 0.02, H * 0.06);
      roof += ` L${n(x)},${n(y)} L${n(x + w * 0.5)},${n(y - w * 0.16)} L${n(x + w)},${n(y)}`;
      x += w;
    }
    out += `<path d="${roof} L${W},${H} Z" fill="${ink}"/>`;
    const poles = Math.max(2, Math.round(W / (H * 0.7)));
    const tops = [];
    for (let i = 0; i < poles; i++) {
      const px = W * ((i + 0.3) / poles) + between(r, -W * 0.03, W * 0.03);
      const ph = H * between(r, 0.42, 0.56);
      tops.push([px, hz - ph]);
      out += `<rect x="${n(px - u * 0.5)}" y="${n(hz - ph)}" width="${n(u * 1)}" height="${n(ph + H * 0.1)}" fill="${ink}"/><rect x="${n(px - u * 5)}" y="${n(hz - ph + u * 3)}" width="${n(u * 10)}" height="${n(u * 0.8)}" fill="${ink}"/><rect x="${n(px - u * 3.6)}" y="${n(hz - ph + u * 7)}" width="${n(u * 7.2)}" height="${n(u * 0.7)}" fill="${ink}"/><rect x="${n(px + u * 1)}" y="${n(hz - ph + u * 10)}" width="${n(u * 2.2)}" height="${n(u * 3.4)}" fill="${ink}"/>`;
    }
    const ends = [[-W * 0.1, hz - H * 0.5], ...tops, [W * 1.1, hz - H * 0.46]];
    for (let i = 0; i < ends.length - 1; i++)
      for (let w = 0; w < 3; w++) {
        const [x0, y0] = ends[i];
        const [x1, y1] = ends[i + 1];
        const off = u * (3.2 + w * 2);
        out += `<path d="M${n(x0)},${n(y0 + off)} Q${n((x0 + x1) / 2)},${n((y0 + y1) / 2 + off + H * 0.06)} ${n(x1)},${n(y1 + off)}" fill="none" stroke="${ink}" stroke-width="${n(u * 0.22)}"/>`;
      }
    const fx = W * (s.figureX ?? 0.64);
    out += `<circle cx="${n(fx)}" cy="${n(hz - H * 0.085)}" r="${n(H * 0.012)}" fill="${ink}"/><path d="M${n(fx - H * 0.012)},${n(hz - H * 0.07)} h${n(H * 0.024)} l${n(H * 0.006)},${n(H * 0.08)} h${n(-H * 0.036)} Z" fill="${ink}"/>`;
  } else if (kind === "wanderer") {
    const mx = W * (s.moonX ?? 0.6);
    const my = H * 0.4;
    const mr = Math.min(W * 0.4, H * 0.34);
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top || "#0c1030"}"/><stop offset="1" stop-color="${s.low || "#3b2a5c"}"/></linearGradient><radialGradient id="mg"><stop offset="0" stop-color="#fff6dc" stop-opacity=".45"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sk)"/>`;
    for (let i = 0; i < Math.round((W * H) / 9000); i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * H * 0.8)}" r="${n(between(r, 0.5, 1.8) * (H / 1000))}" fill="#fff" opacity="${n(between(r, 0.3, 0.9))}"/>`;
    out += `<circle cx="${n(mx)}" cy="${n(my)}" r="${n(mr * 1.5)}" fill="url(#mg)"/><circle cx="${n(mx)}" cy="${n(my)}" r="${n(mr)}" fill="${s.moon || "#f6ecd2"}"/>
      <circle cx="${n(mx - mr * 0.3)}" cy="${n(my - mr * 0.2)}" r="${n(mr * 0.16)}" fill="#e6d9b8" opacity=".6"/><circle cx="${n(mx + mr * 0.25)}" cy="${n(my + mr * 0.3)}" r="${n(mr * 0.22)}" fill="#e6d9b8" opacity=".5"/><circle cx="${n(mx + mr * 0.1)}" cy="${n(my - mr * 0.45)}" r="${n(mr * 0.1)}" fill="#e6d9b8" opacity=".5"/>`;
    const ink = "#07081a";
    const cx = W * (s.cliffX ?? 0.4);
    const gy = H * 0.74;
    out += `<path d="M0,${H} L0,${n(gy + H * 0.06)} C${n(cx * 0.4)},${n(gy + H * 0.04)} ${n(cx * 0.8)},${n(gy)} ${n(cx + W * 0.07)},${n(gy)} L${n(cx + W * 0.1)},${n(gy + H * 0.03)} C${n(cx + W * 0.06)},${n(gy + H * 0.12)} ${n(cx + W * 0.14)},${n(H * 0.95)} ${n(cx + W * 0.2)},${H} Z" fill="${ink}"/>`;
    const k = H * 0.0021;
    out += `<g transform="translate(${n(cx)} ${n(gy)}) scale(${n(k)})" fill="${ink}">
      <circle cx="0" cy="-104" r="9"/><path d="M-9,-110 l-14,-6 l12,10 Z"/>
      <path d="M-8,-96 L8,-96 L12,-52 L-12,-52 Z"/>
      <path d="M-10,-94 C-40,-80 -62,-50 -84,-34 C-60,-36 -44,-42 -34,-50 C-40,-30 -52,-14 -70,-6 C-40,-6 -22,-24 -12,-50 Z"/>
      <path d="M-11,-52 L-13,0 L-4,0 L0,-40 L4,0 L13,0 L11,-52 Z"/>
      <path d="M8,-60 L62,-22 L60,-19 L6,-55 Z"/><rect x="2" y="-64" width="12" height="5" transform="rotate(35 8 -62)"/></g>`;
    for (let i = 0; i < 40; i++) {
      const x = between(r, 0, cx + W * 0.1);
      out += `<path d="M${n(x)},${n(gy + H * 0.05)} q${n(between(r, -u, u))},${n(-u * 4)} ${n(between(r, -u * 2, u * 2))},${n(-u * between(r, 4, 9))}" stroke="${ink}" stroke-width="${n(u * 0.3)}" fill="none"/>`;
    }
    for (let i = 0; i < Math.round((W / H) * 26); i++) out += `<ellipse cx="${n(r() * W)}" cy="${n(r() * H)}" rx="${n(u * 0.9)}" ry="${n(u * 0.45)}" transform="rotate(${n(r() * 180)} ${n(r() * W)} ${n(r() * H)})" fill="${s.petal || "#e2566f"}" opacity="${n(between(r, 0.5, 0.95))}"/>`;
  } else if (kind === "pagoda") {
    const cx = W * (s.x ?? 0.5);
    const base = H * 0.8;
    const k = Math.min(W, H) * 0.0032;
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c58f"/><stop offset=".6" stop-color="#f08a6c"/><stop offset="1" stop-color="#b9506a"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>
      <circle cx="${n(cx)}" cy="${n(H * 0.36)}" r="${n(Math.min(W, H) * 0.24)}" fill="#fff0c2" opacity=".9"/>
      <path d="${land(heights(r, W, 7, H * 0.62, H * 0.72), W, H)}" fill="#8a3b5c" opacity=".8"/><path d="${land(heights(r, W, 9, H * 0.76, H * 0.84), W, H)}" fill="#2a1830"/>
      <g transform="translate(${n(cx)} ${n(base)}) scale(${n(k)})" fill="#1c0f22">
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="${-34 + i * 5}" y="${-40 - i * 40}" width="${68 - i * 10}" height="40"/><path d="M${-62 + i * 7},${-40 - i * 40} Q0,${-56 - i * 40} ${62 - i * 7},${-40 - i * 40} L${50 - i * 6},${-52 - i * 40} Q0,${-62 - i * 40} ${-50 + i * 6},${-52 - i * 40} Z"/>`).join("")}
        <rect x="-2" y="-270" width="4" height="34"/></g>`;
  } else {
    // alley: a neon street
    const cols = ["#ff3ea5", "#27e0ff", "#ffd23e", "#7a3cff", "#39f58a"];
    out += `<defs>${neonGlow("ng", H)}<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070616"/><stop offset="1" stop-color="#2a1050"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>`;
    const signs = ["ラーメン", "ゲーム", "カフェ", "ホテル", "東京", "24", "OPEN", "BAR"];
    let x = 0;
    let html = "";
    while (x < W) {
      const w = between(r, H * 0.1, H * 0.2);
      const h = between(r, H * 0.5, H * 0.92);
      out += `<rect x="${n(x)}" y="${n(H - h)}" width="${n(w)}" height="${n(h)}" fill="${mix("#120a2a", "#000000", r() * 0.5)}"/>`;
      for (let wy = H - h + u * 3; wy < H * 0.86; wy += u * 4.4) for (let wx = x + u * 1.6; wx < x + w - u * 3; wx += u * 3.6) if (r() < 0.3) out += `<rect x="${n(wx)}" y="${n(wy)}" width="${n(u * 2)}" height="${n(u * 2.6)}" fill="${pick(r, ["#ffd23e", "#ffe9a6", "#27e0ff"])}" opacity="${n(between(r, 0.3, 0.85))}"/>`;
      if (r() < 0.9) {
        const col = pick(r, cols);
        const sw = w * between(r, 0.4, 0.56);
        const sh = h * between(r, 0.26, 0.5);
        const sx = x + (r() < 0.5 ? -sw * 0.3 : w - sw * 0.7);
        const sy = H - h + h * between(r, 0.12, 0.3);
        out += `<rect x="${n(sx)}" y="${n(sy)}" width="${n(sw)}" height="${n(sh)}" rx="${n(u * 0.6)}" fill="#0b0618" stroke="${col}" stroke-width="${n(u * 0.4)}" filter="url(#ng)"/>`;
        html += `<div style="position:absolute;left:${n(sx)}px;top:${n(sy)}px;width:${n(sw)}px;height:${n(sh)}px;display:grid;place-items:center;writing-mode:vertical-rl;font-family:'Yu Gothic','MS Gothic',sans-serif;font-weight:800;font-size:${n(sw * 0.62)}px;letter-spacing:.04em;color:${col};text-shadow:0 0 ${n(u * 1)}px ${col},0 0 ${n(u * 2.4)}px ${col}">${pick(r, signs)}</div>`;
      }
      x += w;
    }
    out += `<rect y="${n(H * 0.9)}" width="${W}" height="${n(H * 0.1)}" fill="#05030d"/>`;
    for (let i = 0; i < Math.round((W / H) * 40); i++) out += `<rect x="${n(r() * W)}" y="${n(between(r, H * 0.905, H * 0.99))}" width="${n(between(r, H * 0.02, H * 0.09))}" height="${n(u * 0.35)}" fill="${pick(r, cols)}" opacity="${n(between(r, 0.2, 0.7))}"/>`;
    over = html;
  }
  return box(W, H, pal("indigo"), svg(W, H, out) + over, { grainy: kind === "alley" || kind === "wanderer" ? 0.06 : 0.14 });
}

/* ---------------------------------------------------------------- Cinema */

/** Film-inspired posters. kind: projector | clapper | marquee | strip | ticket | reel | popcorn | noir */
export function cinema(s, W, H, r) {
  const p = pal(s.pal || "noir");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "projector";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  const title = (lines, top, fit = 0.8, font = "bebas", color = p.fg, tall = 0.2) => `<div style="position:absolute;left:8%;right:8%;top:${n(top)}px;height:${n(H * tall)}px;display:flex;flex-direction:column;justify-content:center;text-align:center" data-fith><div style="width:100%">${lines.map((l) => `<div style="line-height:1"><span data-fit="${fit}" class="f-${font}" style="color:${l.startsWith("*") ? p.ac : color}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("")}</div></div>`;
  if (kind === "projector") {
    out += `<defs><linearGradient id="beam" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient></defs>
      <path d="M${n(W * 0.9)},${n(H * 0.12)} L${n(-W * 0.1)},${n(H * 0.36)} L${n(-W * 0.1)},${n(H * 0.82)} Z" fill="url(#beam)" opacity=".8"/>`;
    for (let i = 0; i < 90; i++) out += `<circle cx="${n(r() * W)}" cy="${n(between(r, H * 0.15, H * 0.75))}" r="${n(u * between(r, 0.1, 0.4))}" fill="#fff6d8" opacity="${n(between(r, 0.2, 0.8))}"/>`;
    out += `<rect x="${n(W * 0.84)}" y="${n(H * 0.09)}" width="${n(W * 0.2)}" height="${n(H * 0.06)}" rx="${n(u)}" fill="#000"/>`;
    for (let row = 0; row < 3; row++) {
      const y = H * (0.78 + row * 0.075);
      const seat = u * (7 + row * 1.6);
      for (let x = -seat * (row % 2 ? 0.5 : 0); x < W; x += seat * 1.25) out += `<rect x="${n(x)}" y="${n(y)}" width="${n(seat)}" height="${n(H * 0.3)}" rx="${n(seat * 0.34)}" fill="${mix("#2a0f14", "#000000", row * 0.3)}"/>`;
    }
    out += `<circle cx="${n(W * 0.34)}" cy="${n(H * 0.775)}" r="${n(u * 2.6)}" fill="#000"/><circle cx="${n(W * 0.43)}" cy="${n(H * 0.78)}" r="${n(u * 2.4)}" fill="#000"/>`;
    html = title(s.lines || ["THE", "*LAST REEL"], H * 0.3, 0.6, "abril", p.fg, 0.24);
  } else if (kind === "clapper") {
    const x = W * 0.16;
    const y = H * 0.3;
    const w = W * 0.68;
    const h = H * 0.36;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(u * 1.4)}" fill="${p.fg}"/><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h * 0.2)}" fill="${p.bg}" stroke="${p.fg}" stroke-width="${n(u * 0.5)}"/>
      <g transform="rotate(-12 ${n(x)} ${n(y)})"><rect x="${n(x)}" y="${n(y - h * 0.22)}" width="${n(w)}" height="${n(h * 0.2)}" fill="${p.bg}" stroke="${p.fg}" stroke-width="${n(u * 0.5)}"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${n(x + (w / 6) * i + w / 14)},${n(y - h * 0.22)} l${n(w / 12)},0 l${n(-w / 16)},${n(h * 0.2)} l${n(-w / 12)},0 Z" fill="${p.fg}"/>`).join("")}</g>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${n(x + (w / 6) * i + w / 14)},${n(y)} l${n(w / 12)},0 l${n(-w / 16)},${n(h * 0.2)} l${n(-w / 12)},0 Z" fill="${p.fg}"/>`).join("")}`;
    html = `<div class="f-mono" style="position:absolute;left:${n(x + u * 3)}px;top:${n(y + h * 0.28)}px;width:${n(w - u * 6)}px;font-size:${n(u * 2.7)}px;line-height:2.05;color:${p.bg};font-weight:700">${(s.rows || ["PROD.  OUR LIFE", "SCENE  1      TAKE  ∞", "DIRECTOR  US"]).map((t) => `<div style="border-bottom:${n(u * 0.3)}px solid ${p.bg}">${esc(t)}</div>`).join("")}</div>` + title(s.lines || ["AND...", "*ACTION"], H * 0.72, 0.6, "bebas", p.fg, 0.22);
  } else if (kind === "marquee") {
    const x = W * 0.1;
    const y = H * 0.26;
    const w = W * 0.8;
    const h = H * 0.4;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(u * 2)}" fill="${p.ac}"/><rect x="${n(x + u * 4)}" y="${n(y + u * 4)}" width="${n(w - u * 8)}" height="${n(h - u * 8)}" fill="#fbf3dc"/>`;
    const bulbs = (x0, y0, x1, y1, count) => Array.from({ length: count }, (_, i) => `<circle cx="${n(x0 + ((x1 - x0) * i) / (count - 1))}" cy="${n(y0 + ((y1 - y0) * i) / (count - 1))}" r="${n(u * 1.05)}" fill="#fff3b0"/><circle cx="${n(x0 + ((x1 - x0) * i) / (count - 1))}" cy="${n(y0 + ((y1 - y0) * i) / (count - 1))}" r="${n(u * 2)}" fill="#fff3b0" opacity=".3"/>`).join("");
    out += bulbs(x + u * 2, y + u * 2, x + w - u * 2, y + u * 2, 16) + bulbs(x + u * 2, y + h - u * 2, x + w - u * 2, y + h - u * 2, 16) + bulbs(x + u * 2, y + u * 2, x + u * 2, y + h - u * 2, 9) + bulbs(x + w - u * 2, y + u * 2, x + w - u * 2, y + h - u * 2, 9);
    html = `<div style="position:absolute;left:${n(x + u * 7)}px;top:${n(y + u * 7)}px;width:${n(w - u * 14)}px;height:${n(h - u * 14)}px;display:flex;flex-direction:column;justify-content:center;text-align:center;color:#1a1410" data-fith><div style="width:100%">${(s.lines || ["NOW SHOWING", "*MOVIE NIGHT", "EVERY NIGHT"]).map((l) => `<div style="line-height:1"><span data-fit="${l.startsWith("*") ? 0.98 : 0.6}" class="f-bebas" style="color:${l.startsWith("*") ? "#b3261e" : "#1a1410"}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("")}</div></div>` + caption(s.sub || "popcorn required", u, p.fg, 18);
  } else if (kind === "strip") {
    const frames = 4;
    const fw = W * 0.56;
    const fh = (H * 0.9) / frames;
    out += `<g transform="rotate(${s.tilt ?? -8} ${n(W / 2)} ${n(H / 2)})"><rect x="${n(W / 2 - fw / 2 - u * 5)}" y="${n(-H * 0.1)}" width="${n(fw + u * 10)}" height="${n(H * 1.2)}" fill="#0c0c0c"/>`;
    for (let i = -1; i <= frames; i++) {
      const y = H * 0.05 + i * fh;
      const c1 = pick(r, [p.ac, ...p.more]);
      out += `<defs><linearGradient id="f${i + 1}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${mix(c1, "#000000", 0.6)}"/></linearGradient></defs><rect x="${n(W / 2 - fw / 2)}" y="${n(y + u * 1.2)}" width="${n(fw)}" height="${n(fh - u * 2.4)}" rx="${n(u)}" fill="url(#f${i + 1})"/><circle cx="${n(W / 2 + between(r, -fw * 0.25, fw * 0.25))}" cy="${n(y + fh * 0.45)}" r="${n(fh * between(r, 0.12, 0.26))}" fill="#fff" opacity=".22"/>`;
      for (let k = 0; k < 5; k++) out += `<rect x="${n(W / 2 - fw / 2 - u * 3.8)}" y="${n(y + (fh / 5) * k + u * 0.8)}" width="${n(u * 2.4)}" height="${n(fh / 5 - u * 1.6)}" rx="${n(u * 0.4)}" fill="${p.bg}"/><rect x="${n(W / 2 + fw / 2 + u * 1.4)}" y="${n(y + (fh / 5) * k + u * 0.8)}" width="${n(u * 2.4)}" height="${n(fh / 5 - u * 1.6)}" rx="${n(u * 0.4)}" fill="${p.bg}"/>`;
    }
    out += `</g>`;
    html = caption(s.sub || "life in 24 frames a second", u, p.fg, 4);
  } else if (kind === "ticket") {
    const x = W * 0.12;
    const y = H * 0.34;
    const w = W * 0.76;
    const h = H * 0.3;
    out += `<path d="M${n(x)},${n(y)} H${n(x + w)} V${n(y + h * 0.36)} a${n(h * 0.14)},${n(h * 0.14)} 0 0 0 0,${n(h * 0.28)} V${n(y + h)} H${n(x)} V${n(y + h * 0.64)} a${n(h * 0.14)},${n(h * 0.14)} 0 0 0 0,${n(-h * 0.28)} Z" fill="${p.ac}"/>
      <rect x="${n(x + u * 3)}" y="${n(y + u * 3)}" width="${n(w - u * 6)}" height="${n(h - u * 6)}" fill="none" stroke="${p.bg}" stroke-width="${n(u * 0.35)}" stroke-dasharray="${n(u * 1.2)} ${n(u * 1.2)}"/>
      <path d="M${n(x + w * 0.74)},${n(y + u * 3)} V${n(y + h - u * 3)}" stroke="${p.bg}" stroke-width="${n(u * 0.35)}" stroke-dasharray="${n(u * 1.2)} ${n(u * 1.2)}"/>`;
    html = `<div style="position:absolute;left:${n(x + u * 6)}px;top:${n(y + u * 5)}px;width:${n(w * 0.74 - u * 9)}px;height:${n(h - u * 10)}px;display:flex;flex-direction:column;justify-content:center;color:${p.bg}" data-fith><div style="width:100%"><div class="caps" style="font-size:${n(u * 2.2)}px">${esc(s.top || "cinema")}</div><div style="line-height:.95"><span data-fit="1" class="f-bebas">${esc(s.big || "ADMIT ONE")}</span></div><div class="caps" style="font-size:${n(u * 2.2)}px">${esc(s.low || "row L · seat 14")}</div></div></div>
      <div class="f-bebas" style="position:absolute;left:${n(x + w * 0.76)}px;top:${n(y)}px;width:${n(w * 0.22)}px;height:${n(h)}px;display:grid;place-items:center;font-size:${n(u * 6)}px;color:${p.bg};writing-mode:vertical-rl">${esc(s.no || "No. 0421")}</div>` + title(s.lines || ["GOOD FOR ONE", "*MOVIE NIGHT"], H * 0.7, 0.62, "bebas", p.fg, 0.22);
  } else if (kind === "reel") {
    const cx = W / 2;
    const cy = H * 0.42;
    const R = Math.min(W, H) * 0.3;
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 2.4)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 0.86)}" fill="${p.more[0]}"/>`;
    for (let i = 0; i < 6; i++) out += `<circle cx="${n(cx + Math.cos((i / 6) * 6.283) * R * 0.52)}" cy="${n(cy + Math.sin((i / 6) * 6.283) * R * 0.52)}" r="${n(R * 0.2)}" fill="${p.bg}"/>`;
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 0.12)}" fill="${p.ac}"/><path d="M${n(cx + R)},${n(cy)} C${n(cx + R)},${n(cy + R * 1.2)} ${n(cx - R * 0.4)},${n(cy + R * 1.0)} ${n(-W * 0.05)},${n(cy + R * 1.36)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 2.4)}"/>`;
    html = title(s.lines || ["ROLL", "*CAMERA"], H * 0.73, 0.5, "bebas", p.fg, 0.22);
  } else if (kind === "popcorn") {
    const cx = W / 2;
    const top = H * 0.44;
    const bot = H * 0.84;
    const tw = W * 0.5;
    const bw = W * 0.38;
    out += `<defs><clipPath id="tub"><path d="M${n(cx - tw / 2)},${n(top)} H${n(cx + tw / 2)} L${n(cx + bw / 2)},${n(bot)} H${n(cx - bw / 2)} Z"/></clipPath></defs>`;
    for (let i = 0; i < 46; i++) {
      const x = cx + between(r, -tw * 0.48, tw * 0.48);
      const y = top - between(r, -u * 2, H * 0.17) * (1 - Math.abs(x - cx) / (tw * 0.6));
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(u * between(r, 3, 5))}" fill="${pick(r, ["#fff6d6", "#ffe9a6", "#f7d77a"])}" stroke="#d9a441" stroke-width="${n(u * 0.2)}"/>`;
    }
    out += `<path d="M${n(cx - tw / 2)},${n(top)} H${n(cx + tw / 2)} L${n(cx + bw / 2)},${n(bot)} H${n(cx - bw / 2)} Z" fill="#fbf3dc"/><g clip-path="url(#tub)">${Array.from({ length: 5 }, (_, i) => `<path d="M${n(cx - tw / 2 + (tw / 4.5) * i)},${n(top)} l${n(tw / 9)},0 l${n(-(tw - bw) / 9 + (i - 2) * -u * 1.2)},${n(bot - top)} l${n(-bw / 9)},0 Z" fill="#c8312b"/>`).join("")}</g>`;
    html = title(s.lines || ["*MOVIE", "NIGHT"], H * 0.05, 0.6, "abril", p.fg, 0.2);
  } else {
    // noir: blinds of light, a street lamp, an invented title
    for (let i = 0; i < 14; i++) out += `<path d="M${n(-W * 0.2)},${n(H * 0.1 + i * H * 0.055)} L${n(W * 1.2)},${n(H * -0.1 + i * H * 0.055)} l0,${n(H * 0.02)} L${n(-W * 0.2)},${n(H * 0.12 + i * H * 0.055)} Z" fill="${p.fg}" opacity="${n(0.05 + (i % 3) * 0.03)}"/>`;
    const lx = W * 0.26;
    out += `<path d="M${n(lx)},${n(H)} V${n(H * 0.4)} q0,${n(-u * 5)} ${n(u * 6)},${n(-u * 5)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.9)}"/><path d="M${n(lx + u * 3)},${n(H * 0.36)} h${n(u * 6)} l${n(u * 2)},${n(u * 5)} h${n(-u * 10)} Z" fill="${p.ac}"/>
      <path d="M${n(lx - u * 3)},${n(H * 0.41)} L${n(lx - u * 30)},${n(H)} H${n(lx + u * 42)} L${n(lx + u * 15)},${n(H * 0.41)} Z" fill="${p.ac}" opacity=".16"/>
      <circle cx="${n(W * 0.6)}" cy="${n(H * 0.73)}" r="${n(u * 2.1)}" fill="#000"/><path d="M${n(W * 0.6 - u * 4.2)},${n(H * 0.72)} h${n(u * 8.4)} l${n(-u * 1.5)},${n(-u * 1.6)} h${n(-u * 5.4)} Z" fill="#000"/><path d="M${n(W * 0.6 - u * 3.4)},${n(H * 0.75)} h${n(u * 6.8)} l${n(u * 2.6)},${n(H * 0.25)} h${n(-u * 12)} Z" fill="#000"/>`;
    html = title(s.lines || ["MIDNIGHT", "*TRAIN"], H * 0.05, 0.72, "abril", p.fg, 0.2) + caption(s.sub || "a story in black and white", u, p.fg, 5);
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy: 0.16 });
}

/* ---------------------------------------------------------------- Cars & bikes */

const CARS = {
  sports: { body: "M30,238 C30,208 70,196 150,190 C230,152 320,114 430,108 C540,104 640,120 720,160 C800,166 900,178 950,196 C975,205 978,226 968,240 L915,240 A60,60 0 0 0 795,240 L335,240 A60,60 0 0 0 215,240 L60,240 C40,240 30,244 30,238 Z", glass: "M306,166 C350,134 400,124 440,122 L560,122 C612,126 652,140 690,164 Z M500,122 L506,164", wheels: [[275, 240, 52], [855, 240, 52]] },
  super: { body: "M20,238 C30,224 90,214 180,206 C300,170 420,130 520,122 C600,120 690,132 770,160 C860,168 934,184 976,206 C986,218 984,232 976,240 L925,240 A58,58 0 0 0 809,240 L325,240 A58,58 0 0 0 209,240 L40,240 Z M860,160 L876,128 L968,126 L970,138 L890,142 L884,162 Z", glass: "M410,164 C456,142 504,132 544,130 L650,136 C690,144 716,154 744,164 Z", wheels: [[267, 240, 50], [867, 240, 50]] },
  jdm: { body: "M40,236 C40,212 80,204 160,198 L300,150 C340,128 400,120 470,118 L640,118 C690,120 720,140 760,170 L900,178 C950,184 965,205 962,240 L915,240 A56,56 0 0 0 803,240 L333,240 A56,56 0 0 0 221,240 L60,240 Z M842,174 L852,128 L964,128 L966,142 L872,142 L868,174 Z", glass: "M318,160 L352,134 C380,128 420,126 470,126 L540,126 L546,162 Z M560,126 L640,126 C676,130 700,146 724,164 L566,162 Z", wheels: [[277, 240, 50], [859, 240, 50]] },
  classic: { body: "M60,240 C40,240 40,206 70,196 C110,180 150,176 190,176 C230,110 330,70 470,70 C620,70 720,110 770,176 C860,180 930,196 950,220 C956,232 950,240 940,240 L895,240 A62,62 0 0 0 771,240 L329,240 A62,62 0 0 0 205,240 Z", glass: "M250,170 C280,120 350,92 450,90 L460,170 Z M480,90 C590,92 680,120 720,170 L484,170 Z", wheels: [[267, 240, 56], [833, 240, 56]] },
  muscle: { body: "M30,238 L30,200 C80,186 200,180 300,178 L360,132 C380,120 420,116 470,116 L640,116 C680,118 700,130 730,160 L930,172 C965,178 972,205 968,240 L915,240 A58,58 0 0 0 799,240 L331,240 A58,58 0 0 0 215,240 Z", glass: "M326,172 L372,136 C390,128 430,126 470,126 L530,126 L534,172 Z M548,126 L636,126 C668,128 686,140 706,166 L552,172 Z", wheels: [[273, 240, 54], [857, 240, 54]] },
  f1: { body: "M24,262 L24,248 L150,244 L300,226 C380,214 430,200 470,178 C500,160 540,150 600,150 L628,104 L664,104 L668,152 C720,156 790,172 850,196 L874,120 L972,120 L972,146 L912,146 L900,214 L960,228 L960,262 L880,262 L880,240 L740,240 L740,262 L330,262 L330,240 L190,240 L190,262 Z", glass: "M520,186 C540,170 570,162 606,162 L620,186 Z", wheels: [[258, 226, 58], [810, 222, 62]] },
};
const BIKE = `<circle cx="250" cy="230" r="70" fill="none" stroke="INK" stroke-width="16"/><circle cx="750" cy="230" r="70" fill="none" stroke="INK" stroke-width="16"/><circle cx="250" cy="230" r="14" fill="INK"/><circle cx="750" cy="230" r="14" fill="INK"/>
  <path d="M250,230 L420,124 L604,124 L750,230 M420,124 L520,232 L750,230 M604,124 L520,232 M250,230 L334,84" fill="none" stroke="INK" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M410,116 C450,82 560,86 602,114 L592,132 L420,132 Z" fill="INK"/><path d="M602,108 L744,104 C764,104 768,122 752,126 L604,128 Z" fill="INK"/>
  <path d="M312,86 L380,78" stroke="INK" stroke-width="12" stroke-linecap="round"/><circle cx="318" cy="112" r="18" fill="INK"/>
  <rect x="462" y="168" width="116" height="74" rx="12" fill="INK"/><path d="M566,232 L812,240 L818,222 L572,212 Z" fill="INK"/>`;

/** A car or a bike in profile. kind: sports | super | jdm | classic | muscle | f1 | bike. style: sunset | blueprint | neon | minimal | stripes */
export function car(s, W, H, r) {
  const style = s.style || "sunset";
  const kind = s.kind || "sports";
  const u = Math.min(W, H) / 100;
  const p = pal(s.pal || { sunset: "sunset", blueprint: "navy", neon: "neon", minimal: "ink", stripes: "ink" }[style]);
  const k = (W * (s.scale || 0.86)) / 1000;
  const gy = H * (s.y ?? 0.66);
  const ox = W / 2 - 500 * k;
  const oy = gy - 240 * k - (kind === "bike" ? 60 * k : 0);
  const outline = style === "blueprint" || style === "neon";
  const ink = style === "blueprint" ? "#eaf2ff" : style === "neon" ? p.ac : style === "sunset" ? "#0b0613" : p.fg;
  let out = `<defs>${neonGlow("ng", H, 1.1)}<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1035"/><stop offset=".55" stop-color="#b3276b"/><stop offset="1" stop-color="#ff9a4d"/></linearGradient><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45e"/><stop offset="1" stop-color="#ff4d6d"/></linearGradient></defs>`;
  if (style === "sunset") {
    const sr = Math.min(W, H) * 0.26;
    out += `<rect width="${W}" height="${H}" fill="url(#sk)"/><clipPath id="cut">${Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${n(gy - sr * 1.75 + i * sr * 0.25 + (i * i * sr) / 110)}" width="${W}" height="${n(Math.max(2, sr * 0.2 - i * sr * 0.017))}"/>`).join("")}<rect width="${W}" height="${n(gy - sr * 0.95)}"/></clipPath>
      <circle cx="${n(W / 2)}" cy="${n(gy - sr * 0.5)}" r="${n(sr)}" fill="url(#sun)" clip-path="url(#cut)"/><path d="${land(heights(r, W, 8, gy - H * 0.12, gy - H * 0.03), W, H)}" fill="#2a1240" opacity=".9"/>
      <rect y="${n(gy)}" width="${W}" height="${n(H - gy)}" fill="#0b0613"/>`;
    for (let i = 0; i < 9; i++) out += `<rect x="${n(W * 0.06 + i * W * 0.11)}" y="${n(gy + (H - gy) * 0.45)}" width="${n(W * 0.06)}" height="${n(u * 0.6)}" fill="#ffd98a" opacity=".7"/>`;
  } else if (style === "blueprint") {
    out += `<rect width="${W}" height="${H}" fill="#1d3f72"/>`;
    for (let g = 0; g <= 40; g++) out += `<path d="M${n((g * W) / 20)},0V${H}M0,${n((g * H) / 25)}H${W}" stroke="#fff" stroke-width="${n(u * 0.08)}" opacity=".13"/>`;
  } else if (style === "neon") {
    out += `<rect width="${W}" height="${H}" fill="${p.bg}"/><ellipse cx="${n(W / 2)}" cy="${n(gy + u * 1)}" rx="${n(W * 0.42)}" ry="${n(u * 3)}" fill="${p.more[0]}" opacity=".45" filter="url(#ng)"/>`;
    for (let i = 0; i < 7; i++) out += `<path d="M0,${n(gy + u * 2 + i * u * 3.4)} H${W}" stroke="${p.more[1]}" stroke-width="${n(u * 0.16)}" opacity="${n(0.6 - i * 0.07)}"/>`;
  } else if (style === "stripes") {
    out += `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
    [p.ac, p.more[1] || p.fg, p.fg].forEach((c, i) => (out += `<rect x="0" y="${n(gy - H * 0.24 + i * H * 0.045)}" width="${W}" height="${n(H * 0.032)}" fill="${c}"/>`));
    out += `<circle cx="${n(W * 0.8)}" cy="${n(H * 0.2)}" r="${n(u * 9)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.8)}"/>`;
  } else out += `<rect width="${W}" height="${H}" fill="${p.bg}"/><path d="M${n(W * 0.08)},${n(gy)} H${n(W * 0.92)}" stroke="${p.fg}" stroke-width="${n(u * 0.3)}"/>`;

  const attrs = outline ? `fill="none" stroke="${ink}" stroke-width="${style === "neon" ? 6 : 4}" stroke-linejoin="round"` : `fill="${ink}"`;
  out += `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k * 100) / 100})" ${style === "neon" ? 'filter="url(#ng)"' : ""}>`;
  if (kind === "bike") out += BIKE.replace(/INK/g, ink);
  else {
    const c = CARS[kind] || CARS.sports;
    out += `<path d="${c.body}" ${attrs}/><path d="${c.glass}" ${outline ? attrs : `fill="${style === "sunset" ? "#ff9a4d" : p.bg}" opacity="${style === "sunset" ? 0.55 : 0.9}"`}/>`;
    c.wheels.forEach(([x, y, rad]) => (out += `<circle cx="${x}" cy="${y}" r="${rad}" ${outline ? attrs : `fill="${ink}"`}/><circle cx="${x}" cy="${y}" r="${rad * 0.5}" ${outline ? attrs : `fill="${style === "sunset" ? "#2a1240" : p.bg}"`}/><circle cx="${x}" cy="${y}" r="${rad * 0.14}" fill="${ink}"/>`));
  }
  out += `</g>`;
  if (style === "blueprint") {
    out += `<path d="M${n(ox + 30 * k)},${n(gy + u * 7)} H${n(ox + 968 * k)} M${n(ox + 30 * k)},${n(gy + u * 5.5)} v${n(u * 3)} M${n(ox + 968 * k)},${n(gy + u * 5.5)} v${n(u * 3)}" stroke="#eaf2ff" stroke-width="${n(u * 0.2)}" fill="none"/><path d="M${n(ox + 275 * k)},${n(gy + u * 12)} H${n(ox + 855 * k)}" stroke="#eaf2ff" stroke-width="${n(u * 0.2)}" stroke-dasharray="${n(u)} ${n(u)}"/>`;
  }
  const tc = style === "minimal" || style === "stripes" ? p.fg : "#fff";
  const title = s.title ? `<div style="position:absolute;left:8%;right:8%;top:${n(H * (s.titleY ?? (style === "minimal" || style === "stripes" ? 0.1 : 0.07)))}px;text-align:center"><span data-fit="${s.fit || 0.86}" data-max="${n(H * (s.max || 0.15))}" class="f-${s.font || (style === "neon" ? "orb" : "anton")}" style="color:${tc};${style === "neon" ? `text-shadow:0 0 ${n(u * 1.4)}px ${p.ac},0 0 ${n(u * 4)}px ${p.ac}` : ""}${style === "stripes" ? ";font-style:italic" : ""}">${esc(s.title)}</span></div>` : "";
  const note = style === "blueprint" ? `<div class="f-mono" style="position:absolute;left:8%;bottom:${n(u * 6)}px;font-size:${n(u * 2.5)}px;color:#eaf2ff;line-height:1.7">${(s.notes || ["SIDE ELEVATION", "SCALE 1 : 18", "FRAMEX DESIGN STUDY"]).map(esc).join("<br>")}</div>` : caption(s.sub, u, tc, 7);
  return box(W, H, p, svg(W, H, out) + title + note, { grainy: style === "blueprint" ? 0.06 : 0.1 });
}

/* ---------------------------------------------------------------- Sports */

/** A playing field from above. kind: football | basketball | tennis | cricket | badminton | track | hockey */
export function court(s, W, H) {
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "football";
  const bg = s.bg || { football: "#2e6b3f", basketball: "#c9743a", tennis: "#2f5f8f", cricket: "#3f7a45", badminton: "#3c6e63", track: "#b5452f", hockey: "#2f6f8a" }[kind];
  const line = s.line || "#f7f3e8";
  const sw = u * 0.55;
  const portrait = H >= W;
  const fw = portrait ? W * 0.68 : H * 0.62;
  const fh = portrait ? H * 0.72 : W * 0.72;
  let g = `<g fill="none" stroke="${line}" stroke-width="${n(sw)}">`;
  const x = -fw / 2;
  const y = -fh / 2;
  if (kind === "football" || kind === "hockey") {
    g += `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}"/><path d="M${n(x)},0 H${n(-x)}"/><circle r="${n(fw * 0.14)}"/><circle r="${n(u * 0.6)}" fill="${line}"/>`;
    [-1, 1].forEach((d) => (g += `<rect x="${n(-fw * 0.3)}" y="${n(d < 0 ? y : -y - fh * 0.16)}" width="${n(fw * 0.6)}" height="${n(fh * 0.16)}"/><rect x="${n(-fw * 0.135)}" y="${n(d < 0 ? y : -y - fh * 0.055)}" width="${n(fw * 0.27)}" height="${n(fh * 0.055)}"/><path d="M${n(-fw * 0.11)},${n(d * (fh / 2 - fh * 0.16))} A${n(fw * 0.14)},${n(fw * 0.14)} 0 0 ${d < 0 ? 0 : 1} ${n(fw * 0.11)},${n(d * (fh / 2 - fh * 0.16))}"/><circle cx="0" cy="${n(d * (fh / 2 - fh * 0.11))}" r="${n(u * 0.5)}" fill="${line}"/>`));
    [[x, y, 0], [-x, y, 90], [-x, -y, 180], [x, -y, 270]].forEach(([cx, cy, a]) => (g += `<path d="M${n(cx)},${n(cy + (a === 0 || a === 90 ? 1 : -1) * u * 2)} A${n(u * 2)},${n(u * 2)} 0 0 ${a % 180 ? 1 : 0} ${n(cx + (a === 0 || a === 270 ? 1 : -1) * u * 2)},${n(cy)}"/>`));
  } else if (kind === "basketball") {
    g += `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}"/><path d="M${n(x)},0 H${n(-x)}"/><circle r="${n(fw * 0.12)}"/>`;
    [-1, 1].forEach((d) => (g += `<rect x="${n(-fw * 0.16)}" y="${n(d < 0 ? y : -y - fh * 0.2)}" width="${n(fw * 0.32)}" height="${n(fh * 0.2)}"/><path d="M${n(-fw * 0.12)},${n(d * (fh / 2 - fh * 0.2))} A${n(fw * 0.12)},${n(fw * 0.12)} 0 0 ${d < 0 ? 0 : 1} ${n(fw * 0.12)},${n(d * (fh / 2 - fh * 0.2))}"/><path d="M${n(-fw * 0.44)},${n(d * (fh / 2))} V${n(d * (fh / 2 - fh * 0.08))} A${n(fw * 0.46)},${n(fw * 0.46)} 0 0 ${d < 0 ? 0 : 1} ${n(fw * 0.44)},${n(d * (fh / 2 - fh * 0.08))} V${n(d * (fh / 2))}"/><circle cx="0" cy="${n(d * (fh / 2 - fh * 0.045))}" r="${n(u * 1.3)}"/>`));
  } else if (kind === "tennis" || kind === "badminton") {
    g += `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}"/><rect x="${n(x * 0.76)}" y="${n(y)}" width="${n(fw * 0.76)}" height="${n(fh)}"/><path d="M${n(x * 1.08)},0 H${n(-x * 1.08)}" stroke-width="${n(sw * 1.6)}"/><path d="M${n(x * 0.76)},${n(-fh * 0.27)} H${n(-x * 0.76)} M${n(x * 0.76)},${n(fh * 0.27)} H${n(-x * 0.76)} M0,${n(-fh * 0.27)} V${n(fh * 0.27)}"/>`;
    if (kind === "badminton") g += `<path d="M${n(x)},${n(y + fh * 0.06)} H${n(-x)} M${n(x)},${n(-y - fh * 0.06)} H${n(-x)} M0,${n(y)} V${n(-fh * 0.27)} M0,${n(fh * 0.27)} V${n(-y)}"/>`;
  } else if (kind === "cricket") {
    g += `<ellipse rx="${n(fw * 0.62)}" ry="${n(fh * 0.5)}"/><ellipse rx="${n(fw * 0.36)}" ry="${n(fh * 0.3)}" stroke-dasharray="${n(u * 1.4)} ${n(u * 1.4)}"/><rect x="${n(-fw * 0.045)}" y="${n(-fh * 0.13)}" width="${n(fw * 0.09)}" height="${n(fh * 0.26)}" fill="#d9c08a" stroke="none"/><rect x="${n(-fw * 0.045)}" y="${n(-fh * 0.13)}" width="${n(fw * 0.09)}" height="${n(fh * 0.26)}"/>
      <path d="M${n(-fw * 0.07)},${n(-fh * 0.1)} H${n(fw * 0.07)} M${n(-fw * 0.07)},${n(fh * 0.1)} H${n(fw * 0.07)}"/>`;
    [-1, 1].forEach((d) => [-1, 0, 1].forEach((i) => (g += `<circle cx="${n(i * u * 0.9)}" cy="${n(d * fh * 0.118)}" r="${n(u * 0.3)}" fill="${line}"/>`)));
  } else {
    for (let i = 0; i < 6; i++) g += `<rect x="${n(x + i * u * 2.6)}" y="${n(y + i * u * 2.6)}" width="${n(fw - i * u * 5.2)}" height="${n(fh - i * u * 5.2)}" rx="${n(fw / 2 - i * u * 2.6)}"/>`;
    g += `<path d="M${n(x)},0 h${n(u * 13)}" stroke-width="${n(sw * 1.5)}"/>`;
  }
  g += "</g>";
  const out = `<rect width="${W}" height="${H}" fill="${bg}"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${portrait ? 0 : n((W / 12) * i)}" y="${portrait ? n((H / 12) * i) : 0}" width="${portrait ? W : n(W / 12)}" height="${portrait ? n(H / 12) : H}" fill="#000" opacity="${i % 2 ? 0.07 : 0}"/>`).join("")}
    <g transform="translate(${n(W / 2)} ${n(H * 0.46)}) ${portrait ? "" : "rotate(90)"}">${g}</g>`;
  return box(W, H, pal("forest"), svg(W, H, out) + caption(s.label, u, line, 5.5, 1.9), { grainy: 0.16 });
}

/* ---------------------------------------------------------------- Music */

/** kind: vinyl | wave | keys | cassette | eq | guitar | notes | headphones */
export function music(s, W, H, r) {
  const p = pal(s.pal || "noir");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "vinyl";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  const cx = W / 2;
  const cy = H * (s.y ?? 0.44);
  if (kind === "vinyl") {
    const R = Math.min(W, H) * 0.34;
    out += `<rect x="${n(cx - R * 1.1)}" y="${n(cy - R * 1.05)}" width="${n(R * 2.1)}" height="${n(R * 2.1)}" fill="${p.ac}"/><rect x="${n(cx - R * 1.1)}" y="${n(cy - R * 1.05)}" width="${n(R * 2.1)}" height="${n(R * 2.1)}" fill="url(#shade)"/>
      <defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>
      <circle cx="${n(cx + R * 0.5)}" cy="${n(cy)}" r="${n(R)}" fill="#0c0c0c"/>`;
    for (let i = 0; i < 14; i++) out += `<circle cx="${n(cx + R * 0.5)}" cy="${n(cy)}" r="${n(R * (0.96 - i * 0.045))}" fill="none" stroke="#fff" stroke-width="${n(u * 0.1)}" opacity=".12"/>`;
    out += `<circle cx="${n(cx + R * 0.5)}" cy="${n(cy)}" r="${n(R * 0.33)}" fill="${p.more[1] || p.fg}"/><circle cx="${n(cx + R * 0.5)}" cy="${n(cy)}" r="${n(R * 0.04)}" fill="${p.bg}"/>`;
  } else if (kind === "wave") {
    const bars = s.bars || Math.round((W / u) * 0.62);
    const bw = (W * 0.8) / bars;
    for (let i = 0; i < bars; i++) {
      const t = i / (bars - 1);
      const env = Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.sin(t * 14 + 1.3)) * between(r, 0.5, 1);
      const h = Math.max(u * 0.8, H * 0.3 * env);
      out += `<rect x="${n(W * 0.1 + i * bw)}" y="${n(cy - h)}" width="${n(bw * 0.56)}" height="${n(h * 2)}" rx="${n(bw * 0.28)}" fill="${mix(p.ac, p.more[1] || p.fg, t)}"/>`;
    }
  } else if (kind === "keys") {
    const kw = (W * 0.84) / 14;
    const top = cy - H * 0.2;
    const kh = H * 0.4;
    out += `<rect x="${n(W * 0.08)}" y="${n(top - u * 2)}" width="${n(W * 0.84)}" height="${n(kh + u * 4)}" rx="${n(u)}" fill="#0c0c0c"/>`;
    for (let i = 0; i < 14; i++) out += `<rect x="${n(W * 0.08 + i * kw + u * 0.2)}" y="${n(top)}" width="${n(kw - u * 0.4)}" height="${n(kh)}" rx="${n(u * 0.6)}" fill="${i === (s.hot ?? 4) ? p.ac : "#f7f3ea"}"/>`;
    [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].forEach((i) => (out += `<rect x="${n(W * 0.08 + (i + 1) * kw - kw * 0.3)}" y="${n(top)}" width="${n(kw * 0.6)}" height="${n(kh * 0.6)}" rx="${n(u * 0.4)}" fill="#111"/>`));
  } else if (kind === "cassette") {
    const w = W * 0.74;
    const h = w * 0.62;
    const x = cx - w / 2;
    const y = cy - h / 2;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(u * 2.4)}" fill="${p.fg}"/><rect x="${n(x + w * 0.07)}" y="${n(y + h * 0.1)}" width="${n(w * 0.86)}" height="${n(h * 0.56)}" rx="${n(u * 1.4)}" fill="${p.ac}"/>
      ${[0, 1, 2].map((i) => `<rect x="${n(x + w * 0.07)}" y="${n(y + h * (0.12 + i * 0.045))}" width="${n(w * 0.86)}" height="${n(h * 0.02)}" fill="${p.more[i % p.more.length]}"/>`).join("")}
      <rect x="${n(x + w * 0.22)}" y="${n(y + h * 0.34)}" width="${n(w * 0.56)}" height="${n(h * 0.24)}" rx="${n(h * 0.12)}" fill="${p.bg}"/>
      ${[0.33, 0.67].map((t) => `<circle cx="${n(x + w * t)}" cy="${n(y + h * 0.46)}" r="${n(h * 0.085)}" fill="${p.fg}"/><circle cx="${n(x + w * t)}" cy="${n(y + h * 0.46)}" r="${n(h * 0.03)}" fill="${p.bg}"/>`).join("")}
      <path d="M${n(x + w * 0.2)},${n(y + h)} L${n(x + w * 0.26)},${n(y + h * 0.76)} H${n(x + w * 0.74)} L${n(x + w * 0.8)},${n(y + h)} Z" fill="${mix(p.fg, p.bg, 0.25)}"/>`;
  } else if (kind === "eq") {
    const colsN = 12;
    const rows = 16;
    const cw = (W * 0.8) / colsN;
    const chh = (H * 0.5) / rows;
    for (let i = 0; i < colsN; i++) {
      const lvl = Math.round(rows * (0.25 + 0.7 * Math.abs(Math.sin(i * 0.9 + r() * 2))));
      for (let j = 0; j < rows; j++) out += `<rect x="${n(W * 0.1 + i * cw + cw * 0.12)}" y="${n(cy + H * 0.25 - (j + 1) * chh + chh * 0.15)}" width="${n(cw * 0.76)}" height="${n(chh * 0.7)}" rx="${n(u * 0.3)}" fill="${j < lvl ? (j > rows * 0.75 ? p.more[0] : j > rows * 0.5 ? p.more[2] || p.ac : p.ac) : mix(p.bg, "#ffffff", 0.08)}"/>`;
    }
  } else if (kind === "guitar") {
    const k = Math.min(W, H) * 0.0017;
    out += `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${s.tilt ?? 24}) scale(${n(k * 100) / 100})"><path d="M0,40 C-70,40 -84,96 -60,128 C-96,150 -92,220 0,224 C92,220 96,150 60,128 C84,96 70,40 0,40 Z" fill="${p.ac}"/><circle cx="0" cy="132" r="26" fill="${p.bg}"/><rect x="-10" y="-190" width="20" height="300" fill="${p.fg}"/><rect x="-16" y="-232" width="32" height="46" rx="6" fill="${p.fg}"/><rect x="-24" y="172" width="48" height="10" rx="3" fill="${p.bg}"/>
      ${[-6, -2, 2, 6].map((dx) => `<path d="M${dx},-190 V176" stroke="${p.more[2] || p.bg}" stroke-width="1.4"/>`).join("")}</g>`;
  } else if (kind === "notes") {
    for (let i = 0; i < 5; i++) out += `<path d="M${n(W * 0.08)},${n(cy - u * 8 + i * u * 4)} C${n(W * 0.35)},${n(cy - u * 16 + i * u * 4)} ${n(W * 0.65)},${n(cy + i * u * 4)} ${n(W * 0.92)},${n(cy - u * 10 + i * u * 4)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.28)}"/>`;
    [[0.24, -7, 1], [0.4, -3, 0], [0.56, 3, 1], [0.72, -4, 0]].forEach(([t, dy, beam], i) => {
      const x = W * t;
      const y = cy + u * dy;
      out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(u * 2.6)}" ry="${n(u * 1.9)}" transform="rotate(-20 ${n(x)} ${n(y)})" fill="${i === 2 ? p.ac : p.fg}"/><path d="M${n(x + u * 2.3)},${n(y)} v${n(-u * 15)}" stroke="${i === 2 ? p.ac : p.fg}" stroke-width="${n(u * 0.6)}"/>`;
      if (beam) out += `<path d="M${n(x + u * 2.3)},${n(y - u * 15)} q${n(u * 5)},${n(u * 2)} ${n(u * 5)},${n(u * 8)}" fill="none" stroke="${i === 2 ? p.ac : p.fg}" stroke-width="${n(u * 0.8)}"/>`;
    });
  } else {
    const R = Math.min(W, H) * 0.27;
    out += `<path d="M${n(cx - R)},${n(cy + R * 0.2)} A${n(R)},${n(R)} 0 0 1 ${n(cx + R)},${n(cy + R * 0.2)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 2.4)}" stroke-linecap="round"/>
      <rect x="${n(cx - R * 1.24)}" y="${n(cy + R * 0.05)}" width="${n(R * 0.44)}" height="${n(R * 0.86)}" rx="${n(R * 0.18)}" fill="${p.ac}"/><rect x="${n(cx + R * 0.8)}" y="${n(cy + R * 0.05)}" width="${n(R * 0.44)}" height="${n(R * 0.86)}" rx="${n(R * 0.18)}" fill="${p.ac}"/>`;
    for (let i = 0; i < 9; i++) {
      const h = R * (0.12 + 0.5 * Math.abs(Math.sin(i * 1.1 + 0.5)));
      out += `<rect x="${n(cx - R * 0.56 + i * R * 0.135)}" y="${n(cy + R * 0.5 - h / 2)}" width="${n(R * 0.07)}" height="${n(h)}" rx="${n(R * 0.035)}" fill="${p.fg}"/>`;
    }
  }
  const title = s.title ? `<div style="position:absolute;left:9%;right:9%;top:${n(H * (s.titleY ?? 0.76))}px;text-align:center"><span data-fit="${s.fit || 0.82}" class="f-${s.font || "bebas"}" style="color:${p.fg};line-height:1">${esc(s.title)}</span></div>` : "";
  return box(W, H, p, svg(W, H, out) + title + caption(s.sub, u, p.fg, 6), { grainy: 0.14 });
}

/* Kids, couple / love, 3D-look, travel and sports art, plus the template that
   shows a public-domain picture (photo). All drawn here from basic shapes. */
import { between, box, esc, mix, n, pal, pick, svg } from "./core.mjs";

const caption = (text, u, color, bottom = 7, size = 2.5) => (text ? `<div class="caps" style="position:absolute;left:0;right:0;bottom:${n(u * bottom)}px;text-align:center;font-size:${n(u * size)}px;color:${color}">${esc(text)}</div>` : "");
const titleAt = (text, top, { fit = 0.8, font = "kid", color = "var(--fg)", side = 9, extra = "" } = {}) => (text ? `<div style="position:absolute;left:${side}%;right:${side}%;top:${n(top)}px;text-align:center"><span data-fit="${fit}" class="f-${font}" style="color:${color};line-height:1.05;${extra}">${esc(text)}</span></div>` : "");
const heart = (cx, cy, size, fill, extra = "") => `<path transform="translate(${n(cx)} ${n(cy)}) scale(${n(size / 100)})" d="M0,34 C-58,-8 -44,-52 -18,-52 C-6,-52 0,-42 0,-34 C0,-42 6,-52 18,-52 C44,-52 58,-8 0,34 Z" fill="${fill}" ${extra}/>`;
const star = (cx, cy, R, fill, rot = -90) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? R * 0.45 : R;
    d += `${i ? "L" : "M"}${n(cx + Math.cos(a) * rad)},${n(cy + Math.sin(a) * rad)} `;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
};

/* ---------------------------------------------------------------- Kids */

const FACES = {
  bear: (c) => `<circle cx="-62" cy="-66" r="34" fill="${c.a}"/><circle cx="62" cy="-66" r="34" fill="${c.a}"/><circle cx="-62" cy="-66" r="17" fill="${c.b}"/><circle cx="62" cy="-66" r="17" fill="${c.b}"/><circle r="92" fill="${c.a}"/><ellipse cy="30" rx="42" ry="34" fill="${c.b}"/>`,
  panda: () => `<circle cx="-64" cy="-68" r="32" fill="#22201c"/><circle cx="64" cy="-68" r="32" fill="#22201c"/><circle r="92" fill="#fbfaf5"/><ellipse cx="-36" cy="-10" rx="24" ry="30" transform="rotate(20 -36 -10)" fill="#22201c"/><ellipse cx="36" cy="-10" rx="24" ry="30" transform="rotate(-20 36 -10)" fill="#22201c"/>`,
  bunny: (c) => `<ellipse cx="-36" cy="-130" rx="24" ry="70" transform="rotate(-8 -36 -130)" fill="${c.a}"/><ellipse cx="36" cy="-130" rx="24" ry="70" transform="rotate(8 36 -130)" fill="${c.a}"/><ellipse cx="-36" cy="-126" rx="11" ry="48" transform="rotate(-8 -36 -126)" fill="#f6b6c2"/><ellipse cx="36" cy="-126" rx="11" ry="48" transform="rotate(8 36 -126)" fill="#f6b6c2"/><circle r="88" fill="${c.a}"/>`,
  fox: () => `<path d="M-92,-30 L-78,-118 L-22,-70 Z M92,-30 L78,-118 L22,-70 Z" fill="#e2732f"/><path d="M-74,-50 L-70,-96 L-40,-70 Z M74,-50 L70,-96 L40,-70 Z" fill="#3b2a23"/><path d="M-96,-24 C-96,-80 96,-80 96,-24 C96,30 30,92 0,92 C-30,92 -96,30 -96,-24 Z" fill="#e2732f"/><path d="M-96,-10 C-70,10 -40,24 0,92 C40,24 70,10 96,-10 C96,40 30,92 0,92 C-30,92 -96,40 -96,-10 Z" fill="#fbf3e6"/>`,
  lion: (c) => `${Array.from({ length: 14 }, (_, i) => `<circle cx="${n(Math.cos((i / 14) * 6.283) * 96)}" cy="${n(Math.sin((i / 14) * 6.283) * 96)}" r="34" fill="${i % 2 ? "#c9722e" : "#e08a3c"}"/>`).join("")}<circle cx="-58" cy="-62" r="22" fill="${c.a}"/><circle cx="58" cy="-62" r="22" fill="${c.a}"/><circle r="82" fill="${c.a}"/><ellipse cy="30" rx="36" ry="28" fill="${c.b}"/>`,
  cat: (c) => `<path d="M-90,-36 L-82,-124 L-26,-76 Z M90,-36 L82,-124 L26,-76 Z" fill="${c.a}"/><path d="M-74,-56 L-72,-98 L-44,-74 Z M74,-56 L72,-98 L44,-74 Z" fill="#f6b6c2"/><ellipse rx="96" ry="86" fill="${c.a}"/><path d="M-110,20 H-56 M-108,40 L-56,32 M110,20 H56 M108,40 L56,32" stroke="#3b3340" stroke-width="3" stroke-linecap="round"/>`,
  koala: (c) => `<circle cx="-84" cy="-44" r="46" fill="${c.a}"/><circle cx="84" cy="-44" r="46" fill="${c.a}"/><circle cx="-84" cy="-44" r="26" fill="#f6d5d8"/><circle cx="84" cy="-44" r="26" fill="#f6d5d8"/><ellipse rx="88" ry="84" fill="${c.a}"/>`,
};
const FACE_COLORS = { bear: { a: "#b98363", b: "#efd9bf" }, bunny: { a: "#fbfaf5", b: "#fff" }, lion: { a: "#f2c078", b: "#fbe9cf" }, cat: { a: "#b9b4c4", b: "#fff" }, koala: { a: "#a9adb8", b: "#fff" } };
function face(who, cx, cy, size) {
  const c = FACE_COLORS[who] || {};
  const nose = who === "koala" ? `<ellipse cy="20" rx="20" ry="28" fill="#3b3340"/>` : who === "fox" ? `<ellipse cy="74" rx="13" ry="9" fill="#3b2a23"/>` : `<ellipse cy="${who === "bear" || who === "lion" ? 16 : 22}" rx="13" ry="9" fill="${who === "bunny" || who === "cat" ? "#e98aa0" : "#3b2a23"}"/><path d="M0,${who === "bear" || who === "lion" ? 24 : 30} v10 M0,${who === "bear" || who === "lion" ? 34 : 40} q-12,12 -22,2 M0,${who === "bear" || who === "lion" ? 34 : 40} q12,12 22,2" stroke="#3b2a23" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const ey = who === "fox" ? 6 : -14;
  const ex = who === "panda" ? 36 : 34;
  const eyes = `<circle cx="${-ex}" cy="${ey}" r="${who === "panda" ? 9 : 8}" fill="${who === "panda" ? "#fff" : "#2b2622"}"/><circle cx="${ex}" cy="${ey}" r="${who === "panda" ? 9 : 8}" fill="${who === "panda" ? "#fff" : "#2b2622"}"/>${who === "panda" ? `<circle cx="-36" cy="${ey}" r="4.5" fill="#22201c"/><circle cx="36" cy="${ey}" r="4.5" fill="#22201c"/>` : `<circle cx="${-ex + 2.6}" cy="${ey - 2.6}" r="2.6" fill="#fff"/><circle cx="${ex + 2.6}" cy="${ey - 2.6}" r="2.6" fill="#fff"/>`}`;
  const cheeks = who === "fox" ? "" : `<circle cx="-58" cy="26" r="13" fill="#f28ca6" opacity=".45"/><circle cx="58" cy="26" r="13" fill="#f28ca6" opacity=".45"/>`;
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(size / 240)})">${FACES[who](c)}${cheeks}${eyes}${nose}</g>`;
}

/** kind: rainbow | animal | alphabet | numbers | moon | balloon | rocket | clouds */
export function kids(s, W, H, r) {
  const p = pal(s.pal || "candy");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "rainbow";
  const soft = [p.ac, ...p.more];
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  const dots = (count, col = p.fg, op = 0.16) => Array.from({ length: count }, () => `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r="${n(u * between(r, 0.4, 1))}" fill="${col}" opacity="${op}"/>`).join("");
  const cloud = (cx, cy, w, fill = "#ffffff") => `<g fill="${fill}"><circle cx="${n(cx - w * 0.26)}" cy="${n(cy)}" r="${n(w * 0.2)}"/><circle cx="${n(cx)}" cy="${n(cy - w * 0.1)}" r="${n(w * 0.27)}"/><circle cx="${n(cx + w * 0.27)}" cy="${n(cy)}" r="${n(w * 0.19)}"/><rect x="${n(cx - w * 0.42)}" y="${n(cy)}" width="${n(w * 0.84)}" height="${n(w * 0.19)}" rx="${n(w * 0.095)}"/></g>`;
  if (kind === "rainbow") {
    const cx = W / 2;
    const cy = H * 0.56;
    const R = Math.min(W * 0.4, H * 0.34);
    out += dots(60);
    soft.slice(0, 5).forEach((c, i) => (out += `<path d="M${n(cx - R + i * R * 0.17)},${n(cy)} A${n(R - i * R * 0.17)},${n(R - i * R * 0.17)} 0 0 1 ${n(cx + R - i * R * 0.17)},${n(cy)}" fill="none" stroke="${c}" stroke-width="${n(R * 0.13)}" stroke-linecap="round"/>`));
    out += cloud(cx - R * 0.86, cy + u * 1, R * 0.7) + cloud(cx + R * 0.86, cy + u * 1, R * 0.7);
    for (let i = 0; i < 7; i++) out += star(between(r, W * 0.1, W * 0.9), between(r, H * 0.08, H * 0.2), u * between(r, 1.2, 2.4), pick(r, soft));
    html = titleAt(s.title || "you are my sunshine", H * 0.7, { fit: s.fit || 0.82, font: "kid" }) + caption(s.sub, u, p.fg, 8);
  } else if (kind === "animal") {
    const who = s.who || "bear";
    out += `<circle cx="${n(W / 2)}" cy="${n(H * 0.43)}" r="${n(Math.min(W, H) * 0.36)}" fill="${s.disc || soft[(who.length + 1) % soft.length]}" opacity=".55"/>` + dots(40) + face(who, W / 2, H * 0.45, Math.min(W, H) * 0.56);
    html = titleAt(s.title || `hello little ${who}`, H * 0.77, { fit: s.fit || 0.74, font: "kid" }) + caption(s.sub, u, p.fg, 6);
  } else if (kind === "alphabet" || kind === "numbers") {
    const items = kind === "alphabet" ? [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const cols = kind === "alphabet" ? (W > H ? 7 : 5) : W > H ? 5 : 3;
    const rows = Math.ceil(items.length / cols);
    const top = H * 0.18;
    const cw = (W * 0.84) / cols;
    const ch = (H * 0.74) / rows;
    const size = Math.min(cw, ch);
    html =
      titleAt(s.title || (kind === "alphabet" ? "my ABC" : "let's count"), H * 0.055, { fit: s.fit || 0.5, font: "kid", color: "var(--fg)" }) +
      items
        .map((ch2, i) => {
          const c = soft[(i * 3 + Math.floor(i / cols)) % soft.length];
          const x = W * 0.08 + (i % cols) * cw + (cw - size * 0.86) / 2 + (Math.floor(i / cols) === rows - 1 ? ((cols - (items.length - (rows - 1) * cols)) * cw) / 2 : 0);
          const y = top + Math.floor(i / cols) * ch + (ch - size * 0.86) / 2;
          return `<div class="f-kid" style="position:absolute;left:${n(x)}px;top:${n(y)}px;width:${n(size * 0.86)}px;height:${n(size * 0.86)}px;border-radius:${i % 2 ? "50%" : n(size * 0.2) + "px"};background:${c};display:grid;place-items:center;font-size:${n(size * (ch2.length > 1 ? 0.42 : 0.56))}px;color:#fff;text-shadow:0 ${n(size * 0.03)}px 0 rgba(0,0,0,.14)">${ch2}</div>`;
        })
        .join("");
  } else if (kind === "moon") {
    const night = s.night !== false;
    const bg = night ? s.bg || "#1f2a52" : p.bg;
    out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
    for (let i = 0; i < 46; i++) out += star(r() * W, r() * H * 0.86, u * between(r, 0.7, 2.2), pick(r, ["#ffe9a6", "#fff", "#ffd6a5"]), r() * 72);
    const mx = W * 0.5;
    const my = H * 0.4;
    const R = Math.min(W, H) * 0.25;
    out += `<circle cx="${n(mx)}" cy="${n(my)}" r="${n(R)}" fill="#ffe9a6"/><circle cx="${n(mx + R * 0.42)}" cy="${n(my - R * 0.2)}" r="${n(R * 0.86)}" fill="${bg}"/>
      <circle cx="${n(mx - R * 0.52)}" cy="${n(my + R * 0.1)}" r="${n(R * 0.045)}" fill="#3b3340"/><path d="M${n(mx - R * 0.6)},${n(my + R * 0.34)} q${n(R * 0.1)},${n(R * 0.1)} ${n(R * 0.22)},${n(R * 0.02)}" stroke="#3b3340" stroke-width="${n(u * 0.5)}" fill="none" stroke-linecap="round"/><circle cx="${n(mx - R * 0.7)}" cy="${n(my + R * 0.3)}" r="${n(R * 0.08)}" fill="#f28ca6" opacity=".6"/>`;
    out += cloud(W * 0.24, H * 0.66, W * 0.34, night ? "#34406e" : "#fff") + cloud(W * 0.76, H * 0.62, W * 0.4, night ? "#34406e" : "#fff");
    html = titleAt(s.title || "dream big, little one", H * 0.74, { fit: s.fit || 0.82, font: "kid", color: night ? "#fff7e0" : "var(--fg)" }) + caption(s.sub, u, night ? "#fff7e0" : p.fg, 7);
  } else if (kind === "balloon") {
    const cx = W / 2;
    const cy = H * 0.31;
    const R = Math.min(W * 0.28, H * 0.215);
    out += cloud(W * 0.2, H * 0.2, W * 0.3) + cloud(W * 0.82, H * 0.34, W * 0.26) + cloud(W * 0.24, H * 0.62, W * 0.22);
    out += `<defs><clipPath id="bl"><path d="M${n(cx - R)},${n(cy)} A${n(R)},${n(R)} 0 0 1 ${n(cx + R)},${n(cy)} C${n(cx + R)},${n(cy + R * 0.8)} ${n(cx + R * 0.3)},${n(cy + R * 1.1)} ${n(cx + R * 0.22)},${n(cy + R * 1.4)} H${n(cx - R * 0.22)} C${n(cx - R * 0.3)},${n(cy + R * 1.1)} ${n(cx - R)},${n(cy + R * 0.8)} ${n(cx - R)},${n(cy)} Z"/></clipPath></defs><g clip-path="url(#bl)">${soft.slice(0, 5).map((c, i) => `<rect x="${n(cx - R + i * R * 0.4)}" y="${n(cy - R)}" width="${n(R * 0.42)}" height="${n(R * 2.5)}" fill="${c}"/>`).join("")}<ellipse cx="${n(cx)}" cy="${n(cy + R * 0.2)}" rx="${n(R * 0.42)}" ry="${n(R * 1.3)}" fill="#fff" opacity=".18"/></g>
      <path d="M${n(cx - R * 0.2)},${n(cy + R * 1.4)} L${n(cx - R * 0.16)},${n(cy + R * 1.74)} M${n(cx + R * 0.2)},${n(cy + R * 1.4)} L${n(cx + R * 0.16)},${n(cy + R * 1.74)}" stroke="${p.fg}" stroke-width="${n(u * 0.4)}"/><rect x="${n(cx - R * 0.2)}" y="${n(cy + R * 1.72)}" width="${n(R * 0.4)}" height="${n(R * 0.3)}" rx="${n(R * 0.05)}" fill="#b98363"/>`;
    html = titleAt(s.title || "up, up & away", H * 0.81, { fit: s.fit || 0.7, font: "kid" }) + caption(s.sub, u, p.fg, 6);
  } else if (kind === "rocket") {
    const bg = s.bg || "#1b2350";
    out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
    for (let i = 0; i < 50; i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r="${n(u * between(r, 0.2, 0.7))}" fill="#fff" opacity="${n(between(r, 0.4, 1))}"/>`;
    out += `<circle cx="${n(W * 0.2)}" cy="${n(H * 0.2)}" r="${n(u * 9)}" fill="#ffd6a5"/><ellipse cx="${n(W * 0.2)}" cy="${n(H * 0.2)}" rx="${n(u * 15)}" ry="${n(u * 3.2)}" fill="none" stroke="#ff8fab" stroke-width="${n(u * 1)}" transform="rotate(-18 ${n(W * 0.2)} ${n(H * 0.2)})"/>
      <circle cx="${n(W * 0.82)}" cy="${n(H * 0.62)}" r="${n(u * 6)}" fill="#a0c4ff"/><circle cx="${n(W * 0.8)}" cy="${n(H * 0.61)}" r="${n(u * 1.6)}" fill="#7fa8ea"/>
      <g transform="translate(${n(W * 0.52)} ${n(H * 0.44)}) rotate(24) scale(${n(Math.min(W, H) / 520)})">
        <path d="M-30,90 q30,90 60,0 Z" fill="#ffd23e"/><path d="M-16,90 q16,54 32,0 Z" fill="#ff7a3c"/>
        <path d="M-46,30 L-86,96 L-44,86 Z M46,30 L86,96 L44,86 Z" fill="#ff8fab"/>
        <path d="M0,-140 C52,-90 52,40 44,92 H-44 C-52,40 -52,-90 0,-140 Z" fill="#fbfaf5"/><path d="M0,-140 C26,-116 40,-86 46,-54 H-46 C-40,-86 -26,-116 0,-140 Z" fill="#ff8fab"/>
        <circle cy="-6" r="24" fill="#a0c4ff" stroke="#3b3340" stroke-width="7"/><rect x="-44" y="70" width="88" height="22" fill="#cdb4db"/></g>`;
    for (let i = 0; i < 6; i++) out += star(between(r, W * 0.08, W * 0.92), between(r, H * 0.08, H * 0.7), u * between(r, 1.4, 2.6), "#ffe9a6", r() * 72);
    html = titleAt(s.title || "to the moon & back", H * 0.78, { fit: s.fit || 0.82, font: "kid", color: "#fff7e0" }) + caption(s.sub, u, "#fff7e0", 6);
  } else {
    out += cloud(W * 0.3, H * 0.26, W * 0.44) + cloud(W * 0.72, H * 0.4, W * 0.36) + cloud(W * 0.26, H * 0.54, W * 0.3);
    for (let i = 0; i < 16; i++) {
      const x = W * between(r, 0.14, 0.86);
      const y = H * between(r, 0.3, 0.64);
      out += `<path d="M${n(x)},${n(y)} q${n(-u * 1.2)},${n(u * 2.6)} 0,${n(u * 3.4)} q${n(u * 1.2)},${n(-u * 0.8)} 0,${n(-u * 3.4)} Z" fill="${pick(r, soft)}"/>`;
    }
    html = titleAt(s.title || "hello, little one", H * 0.72, { fit: s.fit || 0.8, font: "kid" }) + caption(s.sub, u, p.fg, 8);
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy: 0.1 });
}

/* ---------------------------------------------------------------- Couple / love */

/** kind: hearts | starmap | heartbeat | couple | venn | infinity | wreath | key */
export function love(s, W, H, r) {
  const p = pal(s.pal || "blush");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "hearts";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  if (kind === "hearts") {
    const cols = s.cols || 5;
    const rows = s.rows || 6;
    const cw = (W * 0.76) / cols;
    const hot = s.hot ?? Math.floor(rows / 2) * cols + Math.floor(cols / 2) + 1;
    for (let i = 0; i < cols * rows; i++) out += heart(W * 0.12 + (i % cols) * cw + cw / 2, H * 0.12 + Math.floor(i / cols) * cw * 1.02 + cw / 2, cw * 0.82, i === hot ? p.ac : "none", i === hot ? "" : `stroke="${p.fg}" stroke-width="${n((u * 0.34 * 100) / (cw * 0.82))}"`);
    html = caption(s.sub || "you are the one", u, p.fg, 6, 2.6);
  } else if (kind === "starmap") {
    const cx = W / 2;
    const cy = H * 0.4;
    const R = Math.min(W * 0.36, H * 0.29);
    const sky = s.sky || "#141a33";
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 1.045)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.25)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="${sky}"/><defs><clipPath id="sm"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}"/></clipPath></defs><g clip-path="url(#sm)">`;
    for (let k = 1; k <= 3; k++) out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n((R * k) / 4)}" fill="none" stroke="#fff" stroke-width="${n(u * 0.08)}" opacity=".3"/>`;
    for (let k = 0; k < 12; k++) out += `<path d="M${n(cx)},${n(cy)} L${n(cx + Math.cos((k / 12) * 6.283) * R)},${n(cy + Math.sin((k / 12) * 6.283) * R)}" stroke="#fff" stroke-width="${n(u * 0.08)}" opacity=".22"/>`;
    const pts = [];
    for (let i = 0; i < 230; i++) {
      const a = r() * 6.283;
      const d = Math.sqrt(r()) * R;
      const size = Math.pow(r(), 3) * u * 0.9 + u * 0.12;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (size > u * 0.45) pts.push([x, y]);
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="#fff" opacity="${n(between(r, 0.5, 1))}"/>`;
    }
    for (let i = 0; i + 2 < pts.length; i += 3) out += `<path d="M${n(pts[i][0])},${n(pts[i][1])} L${n(pts[i + 1][0])},${n(pts[i + 1][1])} L${n(pts[i + 2][0])},${n(pts[i + 2][1])}" fill="none" stroke="#fff" stroke-width="${n(u * 0.14)}" opacity=".55"/>`;
    out += `</g>`;
    html = `<div style="position:absolute;left:10%;right:10%;top:${n(H * 0.74)}px;text-align:center"><div><span data-fit="${s.fit || 0.72}" class="f-playi" style="color:var(--fg)">${esc(s.title || "the night we met")}</span></div><div class="caps" style="font-size:${n(u * 2.5)}px;margin-top:${n(u * 2.6)}px;line-height:1.9;color:var(--fg)">${(s.lines || ["under these stars", "our story began"]).map(esc).join("<br>")}</div></div>`;
  } else if (kind === "heartbeat") {
    const cy = H * 0.46;
    const x0 = W * 0.06;
    const w = W * 0.88;
    const seg = (t) => x0 + w * t;
    out += `<path d="M${n(seg(0))},${n(cy)} H${n(seg(0.22))} l${n(w * 0.03)},${n(-H * 0.07)} l${n(w * 0.04)},${n(H * 0.14)} l${n(w * 0.03)},${n(-H * 0.07)} h${n(w * 0.05)}
      c${n(-w * 0.1)},${n(-H * 0.1)} ${n(w * 0.03)},${n(-H * 0.19)} ${n(w * 0.13)},${n(-H * 0.07)} c${n(w * 0.1)},${n(-H * 0.12)} ${n(w * 0.23)},${n(-H * 0.03)} ${n(w * 0.13)},${n(H * 0.07)} l${n(-w * 0.13)},${n(H * 0.13)} l${n(-w * 0.13)},${n(-H * 0.13)}
      M${n(seg(0.63))},${n(cy)} h${n(w * 0.05)} l${n(w * 0.03)},${n(-H * 0.07)} l${n(w * 0.04)},${n(H * 0.14)} l${n(w * 0.03)},${n(-H * 0.07)} H${n(seg(1))}" fill="none" stroke="${p.ac}" stroke-width="${n(u * 0.9)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    html = titleAt(s.title || "you make my heart skip", H * 0.68, { fit: s.fit || 0.78, font: s.font || "playi" }) + caption(s.sub, u, p.fg, 9);
  } else if (kind === "couple") {
    const hz = H * 0.7;
    const mx = W * (s.moonX ?? 0.5);
    const top = s.top || "#22264f";
    const low = s.low || "#e77a7a";
    out += `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".72" stop-color="${low}"/><stop offset="1" stop-color="#ffd0a0"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>`;
    for (let i = 0; i < Math.round((W * H) / 10000); i++) out += `<circle cx="${n(r() * W)}" cy="${n(r() * hz * 0.7)}" r="${n(u * between(r, 0.12, 0.4))}" fill="#fff" opacity="${n(between(r, 0.4, 1))}"/>`;
    out += `<circle cx="${n(mx)}" cy="${n(hz - H * 0.22)}" r="${n(Math.min(W, H) * 0.2)}" fill="#fff3d6" opacity=".95"/>`;
    const ink = "#161228";
    out += `<path d="M0,${H} L0,${n(hz + H * 0.04)} C${n(W * 0.3)},${n(hz - H * 0.03)} ${n(W * 0.7)},${n(hz - H * 0.03)} ${W},${n(hz + H * 0.05)} L${W},${H} Z" fill="${ink}"/>`;
    const k = Math.min(W, H) * 0.0021;
    out += `<g transform="translate(${n(W * (s.x ?? 0.5))} ${n(hz - H * 0.006)}) scale(${n(k)})" fill="${ink}">
      <circle cx="-34" cy="-128" r="13"/><path d="M-48,-112 H-20 L-14,-52 H-22 L-24,0 H-33 L-34,-50 L-36,0 H-45 L-46,-52 H-54 Z"/>
      <circle cx="30" cy="-116" r="12"/><path d="M19,-124 q-6,26 -4,40 l8,-6 Z"/><path d="M18,-102 H42 L60,-22 H0 Z"/><rect x="18" y="-24" width="8" height="24"/><rect x="34" y="-24" width="8" height="24"/>
      <path d="M-20,-96 L4,-72 L20,-92 L24,-86 L4,-60 L-24,-88 Z"/></g>`;
    html = s.title ? titleAt(s.title, H * 0.82, { fit: s.fit || 0.7, font: s.font || "dance", color: "#fff3d6" }) : "";
  } else if (kind === "venn") {
    const R = Math.min(W * 0.26, H * 0.22);
    const cy = H * 0.4;
    out += `<circle cx="${n(W / 2 - R * 0.55)}" cy="${n(cy)}" r="${n(R)}" fill="${p.ac}" opacity=".85"/><circle cx="${n(W / 2 + R * 0.55)}" cy="${n(cy)}" r="${n(R)}" fill="${p.more[1]}" opacity=".85" style="mix-blend-mode:multiply"/>`;
    html = `<div class="caps" style="position:absolute;left:${n(W / 2 - R * 1.4)}px;top:${n(cy - u * 1.4)}px;width:${n(R * 0.9)}px;text-align:center;font-size:${n(u * 3.2)}px;color:#fff">${esc(s.a || "you")}</div><div class="caps" style="position:absolute;left:${n(W / 2 + R * 0.5)}px;top:${n(cy - u * 1.4)}px;width:${n(R * 0.9)}px;text-align:center;font-size:${n(u * 3.2)}px;color:#fff">${esc(s.b || "me")}</div><div class="caps" style="position:absolute;left:${n(W / 2 - R * 0.45)}px;top:${n(cy - u * 1.4)}px;width:${n(R * 0.9)}px;text-align:center;font-size:${n(u * 3.2)}px;color:#fff">${esc(s.mid || "us")}</div>` + titleAt(s.title || "better together", H * 0.72, { fit: s.fit || 0.66, font: s.font || "playi" }) + caption(s.sub, u, p.fg, 9);
  } else if (kind === "infinity") {
    const cx = W / 2;
    const cy = H * 0.42;
    const a = Math.min(W * 0.36, H * 0.3);
    let d = "";
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * 6.283;
      const den = 1 + Math.sin(t) * Math.sin(t);
      d += `${i ? "L" : "M"}${n(cx + (a * Math.cos(t)) / den)},${n(cy + (a * Math.sin(t) * Math.cos(t)) / den)} `;
    }
    out += `<path d="${d}Z" fill="none" stroke="${p.ac}" stroke-width="${n(u * 1.2)}" stroke-linecap="round"/>` + heart(cx, cy + u * 0.6, u * 9, p.ac);
    html = titleAt(s.title || "always & forever", H * 0.68, { fit: s.fit || 0.74, font: s.font || "dance" }) + caption(s.sub, u, p.fg, 9);
  } else if (kind === "wreath") {
    const cx = W / 2;
    const cy = H * 0.44;
    const R = Math.min(W * 0.33, H * 0.27);
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * 6.283 + 0.2;
      if (Math.abs(Math.sin(a / 2 + 0.8)) < 0.12) continue;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      const deg = (a * 180) / Math.PI + (i % 2 ? 50 : 130);
      out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(u * 3.4)}" ry="${n(u * 1.3)}" transform="rotate(${n(deg)} ${n(x)} ${n(y)})" fill="${i % 3 ? p.more[1] : p.ac}" opacity=".9"/>`;
      if (i % 6 === 0) out += `<circle cx="${n(cx + Math.cos(a) * R * 1.1)}" cy="${n(cy + Math.sin(a) * R * 1.1)}" r="${n(u * 1)}" fill="${p.ac}"/>`;
    }
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.18)}" opacity=".4"/>`;
    html = `<div style="position:absolute;left:${n(cx - R * 0.8)}px;top:${n(cy - R * 0.5)}px;width:${n(R * 1.6)}px;height:${n(R)}px;display:flex;flex-direction:column;justify-content:center;text-align:center" data-fith><div style="width:100%">${(s.lines || ["Mr", "&", "Mrs"]).map((l, i) => `<div style="line-height:1.06"><span data-fit="${l.length < 3 ? 0.22 : 0.7}" class="f-${i % 2 ? "playi" : s.font || "play"}" style="color:${i % 2 ? "var(--ac)" : "var(--fg)"};font-weight:600">${esc(l)}</span></div>`).join("")}</div></div>` + caption(s.sub || "est. together", u, p.fg, 9);
  } else {
    const cx = W / 2;
    const cy = H * 0.4;
    out += heart(cx - u * 6, cy, u * 30, "none", `stroke="${p.ac}" stroke-width="5"`) + `<circle cx="${n(cx - u * 6)}" cy="${n(cy - u * 1)}" r="${n(u * 2)}" fill="${p.ac}"/><path d="M${n(cx - u * 6)},${n(cy)} v${n(u * 5)}" stroke="${p.ac}" stroke-width="${n(u * 1.1)}" stroke-linecap="round"/>
      <g transform="translate(${n(cx + u * 16)} ${n(cy + u * 12)}) rotate(-35)"><circle r="${n(u * 4)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 1)}"/><path d="M${n(u * 4)},0 h${n(u * 15)} M${n(u * 13)},0 v${n(u * 3.4)} M${n(u * 17)},0 v${n(u * 3.4)}" stroke="${p.fg}" stroke-width="${n(u * 1)}" stroke-linecap="round" fill="none"/></g>`;
    html = titleAt(s.title || "you hold the key", H * 0.7, { fit: s.fit || 0.74, font: s.font || "playi" }) + caption(s.sub, u, p.fg, 9);
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy: kind === "couple" ? 0.08 : 0.14 });
}

/* ---------------------------------------------------------------- 3D look */

/** Optical depth. kind: cubes | penrose | tunnel | spheres | papercut | extrude | stairs | rings | bars */
export function iso(s, W, H, r) {
  const p = pal(s.pal || "slate");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "cubes";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  let grainy = 0.08;
  if (kind === "cubes") {
    const a = s.size || Math.min(W, H) / 7;
    const h = a * 0.866;
    const light = s.light || p.more[2];
    const mid = s.mid || p.more[1];
    const shade = s.dark || p.more[0];
    for (let row = -1; row < H / (a * 1.5) + 1; row++)
      for (let col = -1; col < W / (h * 2) + 1; col++) {
        const cx = col * h * 2 + (row % 2 ? h : 0);
        const cy = row * a * 1.5;
        const hot = s.accent !== false && r() < 0.09;
        out += `<path d="M${n(cx)},${n(cy)} l${n(h)},${n(-a / 2)} l${n(h)},${n(a / 2)} l${n(-h)},${n(a / 2)} Z" fill="${hot ? p.ac : light}"/><path d="M${n(cx)},${n(cy)} l${n(h)},${n(a / 2)} v${n(a)} l${n(-h)},${n(-a / 2)} Z" fill="${hot ? mix(p.ac, "#000000", 0.25) : mid}"/><path d="M${n(cx + h * 2)},${n(cy)} l${n(-h)},${n(a / 2)} v${n(a)} l${n(h)},${n(-a / 2)} Z" fill="${hot ? mix(p.ac, "#000000", 0.5) : shade}"/>`;
      }
  } else if (kind === "penrose") {
    const cx = W / 2;
    const cy = H * 0.48;
    const unit = Math.min(W, H) * 0.094;
    const cols = [mix(p.ac, "#ffffff", 0.3), p.ac, mix(p.ac, "#000000", 0.42)];
    // lattice point (i, j) -> picture; the three pieces are the same hexagon turned a third of a turn
    const at = ([i, j]) => `${n(cx + (i + j / 2 - 3.5) * unit)},${n(cy - (j * 0.866 - 2.02) * unit)}`;
    const pieces = [[[1, 0], [6, 0], [2, 4], [2, 3], [4, 1], [0, 1]], [[6, 1], [1, 6], [1, 2], [2, 2], [2, 4], [6, 0]], [[0, 6], [0, 1], [4, 1], [3, 2], [1, 2], [1, 6]]];
    pieces.forEach((pts, i) => (out += `<path d="M${pts.map(at).join(" L")} Z" fill="${cols[i]}" stroke="${cols[i]}" stroke-width="1" stroke-linejoin="round"/>`));
    html = caption(s.sub || "impossible is a shape", u, p.fg, 9, 2.1);
  } else if (kind === "tunnel") {
    const cx = W * (s.x ?? 0.5);
    const cy = H * (s.y ?? 0.5);
    const steps = s.steps || 16;
    const big = Math.hypot(W, H) * 0.62;
    const round = s.round ? 1 : 0;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const size = big * Math.pow(1 - t, 1.55);
      const col = i % 2 ? mix(p.bg, p.ac, 0.15 + t * 0.85) : mix(p.fg, p.bg, 0.92 - t * 0.5);
      const rot = (s.twist || 0) * i;
      out += round ? `<circle cx="${n(cx + (s.drift || 0) * i * u)}" cy="${n(cy)}" r="${n(size)}" fill="${col}"/>` : `<rect x="${n(cx - size)}" y="${n(cy - size)}" width="${n(size * 2)}" height="${n(size * 2)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="${col}"/>`;
    }
    out += `<circle cx="${n(cx + (s.drift || 0) * steps * u)}" cy="${n(cy)}" r="${n(u * 1.4)}" fill="${p.fg}"/>`;
  } else if (kind === "spheres") {
    const count = s.count || 7;
    out += `<defs>${[p.ac, ...p.more].map((c, i) => `<radialGradient id="sp${i}" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="${mix(c, "#ffffff", 0.75)}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, "#000000", 0.72)}"/></radialGradient>`).join("")}<filter id="sh"><feGaussianBlur stdDeviation="${n(u * 1.4)}"/></filter></defs>`;
    const balls = [];
    for (let tries = 0; balls.length < count && tries < 400; tries++) {
      const rad = Math.min(W, H) * between(r, 0.07, 0.19);
      const x = between(r, rad + W * 0.06, W - rad - W * 0.06);
      const y = between(r, rad + H * 0.08, H - rad - H * 0.1);
      if (balls.every((b) => Math.hypot(b.x - x, b.y - y) > b.rad + rad + u * 2)) balls.push({ x, y, rad });
    }
    balls.sort((a, b) => a.y - b.y);
    balls.forEach((b, i) => (out += `<ellipse cx="${n(b.x + b.rad * 0.3)}" cy="${n(b.y + b.rad * 1.02)}" rx="${n(b.rad * 0.92)}" ry="${n(b.rad * 0.22)}" fill="#000" opacity=".35" filter="url(#sh)"/><circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.rad)}" fill="url(#sp${i % (p.more.length + 1)})"/>`));
  } else if (kind === "papercut") {
    const layers = s.layers || 7;
    const from = s.from || p.more[2];
    const to = s.to || p.bg;
    out = `<defs><filter id="pc" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="${n(u * 1)}" stdDeviation="${n(u * 1.3)}" flood-color="#000" flood-opacity=".45"/></filter></defs><rect width="${W}" height="${H}" fill="${from}"/>`;
    if (s.sun !== false) out += `<circle cx="${n(W * (s.sunX ?? 0.66))}" cy="${n(H * 0.26)}" r="${n(Math.min(W, H) * 0.1)}" fill="${p.ac}" filter="url(#pc)"/>`;
    for (let i = 0; i < layers; i++) {
      const t = (i + 1) / layers;
      const base = H * (0.24 + t * 0.66);
      const amp = H * between(r, 0.04, 0.1);
      const ph = r() * 6.283;
      const waves = between(r, 1.2, 2.6);
      let d = `M0,${H} L0,${n(base + Math.sin(ph) * amp)}`;
      const stepsN = 40;
      for (let k = 1; k <= stepsN; k++) {
        const x = (W * k) / stepsN;
        d += ` L${n(x)},${n(base + Math.sin(ph + (x / W) * 6.283 * waves) * amp + Math.sin(ph * 2 + (x / W) * 6.283 * waves * 2.3) * amp * 0.3)}`;
      }
      out += `<path d="${d} L${W},${H} Z" fill="${mix(from, to, t)}" filter="url(#pc)"/>`;
    }
    grainy = 0.2;
  } else if (kind === "extrude") {
    const depth = s.depth || 22;
    const col = p.ac;
    const sh = Array.from({ length: depth }, (_, i) => `${n((i + 1) * u * 0.28)}px ${n((i + 1) * u * 0.28)}px 0 ${mix(col, "#000000", 0.35 + (i / depth) * 0.4)}`).join(",");
    html = `<div class="pad" data-fith style="padding:${n(u * 9)}px ${n(u * 12)}px ${n(u * 13)}px ${n(u * 8)}px"><div style="width:100%">${s.lines.map((l) => `<div style="line-height:1.02"><span data-fit="1" class="f-${s.font || "anton"}" style="color:${l.startsWith("*") ? p.fg : col};text-shadow:${sh}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("")}</div></div>`;
    for (let i = 0; i < 30; i++) out += `<path d="M${n(-W * 0.2 + i * W * 0.06)},${H} L${n(W * 0.1 + i * W * 0.06)},0" stroke="${p.fg}" stroke-width="${n(u * 0.1)}" opacity=".07"/>`;
  } else if (kind === "stairs") {
    const a = Math.min(W, H) / 11;
    const h = a * 0.866;
    const steps = s.steps || 6;
    const ox = W / 2 - (steps * h) / 2 - h * 1.4;
    const oy = H * 0.78;
    for (let i = 0; i < steps; i++) {
      const x = ox + i * h;
      const y = oy - i * a * 0.5 - i * a * 0.5;
      out += `<path d="M${n(x)},${n(y)} l${n(h * 2.6)},${n(-a * 1.3)} l${n(h)},${n(a / 2)} l${n(-h * 2.6)},${n(a * 1.3)} Z" fill="${mix(p.more[2], "#ffffff", 0.2)}"/><path d="M${n(x)},${n(y)} l${n(h)},${n(a / 2)} V${n(H + 10)} H${n(x)} Z" fill="${p.more[1]}"/><path d="M${n(x + h)},${n(y + a / 2)} l${n(h * 2.6)},${n(-a * 1.3)} V${n(H + 10)} H${n(x + h)} Z" fill="${p.more[0]}"/>`;
    }
    out += `<circle cx="${n(W * 0.74)}" cy="${n(H * 0.16)}" r="${n(u * 7)}" fill="${p.ac}"/>`;
  } else if (kind === "rings") {
    const cx = W / 2;
    const cy = H / 2;
    const count = s.count || 18;
    out += `<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(p.ac, "#ffffff", 0.5)}"/><stop offset=".5" stop-color="${p.ac}"/><stop offset="1" stop-color="${mix(p.ac, "#000000", 0.6)}"/></linearGradient></defs>`;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      out += `<ellipse cx="${n(cx)}" cy="${n(cy + (t - 0.5) * H * 0.62)}" rx="${n(Math.min(W, H) * (0.12 + 0.3 * Math.sin(t * Math.PI)))}" ry="${n(Math.min(W, H) * (0.03 + 0.07 * Math.sin(t * Math.PI)))}" fill="none" stroke="url(#rg)" stroke-width="${n(u * 1.1)}"/>`;
    }
  } else {
    // bars: an isometric bar chart skyline
    const a = Math.min(W, H) / 12;
    const h = a * 0.866;
    const nx = 6;
    for (let row = 0; row < nx; row++)
      for (let col = 0; col < nx; col++) {
        const height = a * between(r, 0.5, 4.2);
        const cx = W / 2 + (col - row) * h;
        const cy = H * 0.5 + (col + row) * a * 0.5 - (nx * a) / 2 + a;
        const hot = r() < 0.14;
        const c = hot ? p.ac : p.more[2];
        out += `<path d="M${n(cx)},${n(cy - height)} l${n(h)},${n(-a / 2)} l${n(h)},${n(a / 2)} l${n(-h)},${n(a / 2)} Z" fill="${mix(c, "#ffffff", 0.2)}"/><path d="M${n(cx)},${n(cy - height)} l${n(h)},${n(a / 2)} v${n(height)} l${n(-h)},${n(-a / 2)} Z" fill="${mix(c, "#000000", 0.25)}"/><path d="M${n(cx + h * 2)},${n(cy - height)} l${n(-h)},${n(a / 2)} v${n(height)} l${n(h)},${n(-a / 2)} Z" fill="${mix(c, "#000000", 0.5)}"/>`;
      }
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy });
}

/* ---------------------------------------------------------------- Travel */

/** kind: compass | pass | stamps | window | globe */
export function travel(s, W, H, r) {
  const p = pal(s.pal || "ink");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "compass";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  if (kind === "compass") {
    const cx = W / 2;
    const cy = H * 0.42;
    const R = Math.min(W * 0.34, H * 0.28);
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.5)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 0.9)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.16)}"/>`;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 6.283;
      const len = i % 18 === 0 ? 0.12 : i % 6 === 0 ? 0.07 : 0.035;
      out += `<path d="M${n(cx + Math.cos(a) * R * 0.9)},${n(cy + Math.sin(a) * R * 0.9)} L${n(cx + Math.cos(a) * R * (0.9 - len))},${n(cy + Math.sin(a) * R * (0.9 - len))}" stroke="${p.fg}" stroke-width="${n(u * 0.18)}"/>`;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 - Math.PI / 2;
      const len = i % 2 ? 0.44 : 0.76;
      const w = i % 2 ? 0.07 : 0.11;
      const tip = [cx + Math.cos(a) * R * len, cy + Math.sin(a) * R * len];
      const l = [cx + Math.cos(a - 1.5708) * R * w, cy + Math.sin(a - 1.5708) * R * w];
      const rt = [cx + Math.cos(a + 1.5708) * R * w, cy + Math.sin(a + 1.5708) * R * w];
      out += `<path d="M${n(tip[0])},${n(tip[1])} L${n(l[0])},${n(l[1])} L${n(cx)},${n(cy)} Z" fill="${i === 0 ? p.ac : p.fg}"/><path d="M${n(tip[0])},${n(tip[1])} L${n(rt[0])},${n(rt[1])} L${n(cx)},${n(cy)} Z" fill="${i === 0 ? mix(p.ac, "#000000", 0.3) : p.more[1]}"/>`;
    }
    html = ["N", "E", "S", "W"].map((ch, i) => `<div class="f-play" style="position:absolute;left:${n(cx + Math.cos((i / 4) * 6.283 - 1.5708) * R * 1.14 - u * 3)}px;top:${n(cy + Math.sin((i / 4) * 6.283 - 1.5708) * R * 1.14 - u * 2.6)}px;width:${n(u * 6)}px;text-align:center;font-size:${n(u * 4)}px;font-weight:700;color:${i ? "var(--fg)" : "var(--ac)"}">${ch}</div>`).join("") + titleAt(s.title || "not all who wander are lost", H * 0.76, { fit: s.fit || 0.84, font: s.font || "playi" }) + caption(s.sub, u, p.fg, 7);
  } else if (kind === "pass") {
    const x = W * 0.1;
    const y = H * 0.28;
    const w = W * 0.8;
    const h = H * 0.42;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(u * 2.4)}" fill="#fbf8f0"/><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h * 0.2)}" rx="${n(u * 2.4)}" fill="${p.ac}"/><rect x="${n(x)}" y="${n(y + h * 0.1)}" width="${n(w)}" height="${n(h * 0.1)}" fill="${p.ac}"/>
      <path d="M${n(x)},${n(y + h * 0.72)} H${n(x + w)}" stroke="#22201c" stroke-width="${n(u * 0.2)}" stroke-dasharray="${n(u * 1)} ${n(u * 1)}"/>
      <path d="M${n(x + w * 0.4)},${n(y + h * 0.44)} H${n(x + w * 0.6)}" stroke="#22201c" stroke-width="${n(u * 0.3)}" stroke-dasharray="${n(u * 0.8)} ${n(u * 0.8)}"/><path transform="translate(${n(x + w * 0.5)} ${n(y + h * 0.44)}) scale(${n(u * 0.11)})" d="M-30,0 L10,-6 L28,-34 H38 L28,-6 L52,-4 L60,-14 H66 L62,0 L66,14 H60 L52,4 L28,6 L38,34 H28 L10,6 Z" fill="#22201c"/>`;
    let bar = x + w * 0.08;
    while (bar < x + w * 0.92) {
      const bw = u * pick(r, [0.3, 0.5, 0.8, 1.1]);
      out += `<rect x="${n(bar)}" y="${n(y + h * 0.78)}" width="${n(bw)}" height="${n(h * 0.15)}" fill="#22201c"/>`;
      bar += bw + u * pick(r, [0.3, 0.5, 0.8]);
    }
    html = `<div class="caps" style="position:absolute;left:${n(x + w * 0.06)}px;top:${n(y + h * 0.06)}px;font-size:${n(u * 2.6)}px;color:#fff">${esc(s.top || "boarding pass")}</div>
      <div style="position:absolute;left:${n(x + w * 0.07)}px;top:${n(y + h * 0.28)}px;color:#22201c"><div class="caps" style="font-size:${n(u * 2)}px;opacity:.6">${esc(s.fromLabel || "from")}</div><div class="f-bebas" style="font-size:${n(u * 10)}px;line-height:1">${esc(s.from || "HOME")}</div></div>
      <div style="position:absolute;right:${n(W - x - w + w * 0.07)}px;top:${n(y + h * 0.28)}px;color:#22201c;text-align:right"><div class="caps" style="font-size:${n(u * 2)}px;opacity:.6">${esc(s.toLabel || "to")}</div><div class="f-bebas" style="font-size:${n(u * 10)}px;line-height:1;color:${p.ac}">${esc(s.to || "AWAY")}</div></div>
      <div class="f-mono" style="position:absolute;left:${n(x + w * 0.07)}px;right:${n(W - x - w + w * 0.07)}px;top:${n(y + h * 0.6)}px;font-size:${n(u * 2.2)}px;color:#22201c;display:flex;justify-content:space-between">${(s.row || ["GATE 01", "SEAT WINDOW", "CLASS FUN"]).map((t) => `<span>${esc(t)}</span>`).join("")}</div>` + titleAt(s.title || "adventure awaits", H * 0.78, { fit: s.fit || 0.7, font: s.font || "playi" });
  } else if (kind === "stamps") {
    const stamps = s.stamps || ["GOA", "MANALI", "JAIPUR", "KERALA", "LADAKH", "MUMBAI", "DELHI", "SHIMLA", "OOTY"];
    const cols = [p.ac, p.more[2], "#2f5f8f", "#3f7a45", "#8a3a6c", "#b5452f"];
    const colsN = W > H ? 4 : 3;
    const cw = (W * 0.84) / colsN;
    const rows = Math.ceil(stamps.length / colsN);
    const chh = (H * 0.72) / rows;
    stamps.forEach((name, i) => {
      const cx = W * 0.08 + (i % colsN) * cw + cw / 2 + between(r, -u * 2, u * 2);
      const cy = H * 0.1 + Math.floor(i / colsN) * chh + chh / 2 + between(r, -u * 2, u * 2);
      const c = cols[i % cols.length];
      const rot = between(r, -16, 16);
      const size = Math.min(cw, chh) * 0.42;
      const shape = i % 3;
      out += `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="none" stroke="${c}" opacity=".88">${shape === 0 ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(size)}" stroke-width="${n(u * 0.5)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(size * 0.8)}" stroke-width="${n(u * 0.2)}"/>` : shape === 1 ? `<rect x="${n(cx - size * 1.1)}" y="${n(cy - size * 0.7)}" width="${n(size * 2.2)}" height="${n(size * 1.4)}" rx="${n(u)}" stroke-width="${n(u * 0.5)}"/><rect x="${n(cx - size * 0.98)}" y="${n(cy - size * 0.58)}" width="${n(size * 1.96)}" height="${n(size * 1.16)}" rx="${n(u * 0.6)}" stroke-width="${n(u * 0.2)}"/>` : `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(size * 1.15)}" ry="${n(size * 0.75)}" stroke-width="${n(u * 0.5)}"/>`}</g>`;
      html += `<div style="position:absolute;left:${n(cx - size * 1.1)}px;top:${n(cy - size * 0.5)}px;width:${n(size * 2.2)}px;height:${n(size)}px;display:flex;flex-direction:column;justify-content:center;align-items:center;transform:rotate(${n(rot)}deg);color:${c};opacity:.9"><div class="f-bebas" style="font-size:${n(size * (name.length > 6 ? 0.36 : 0.46))}px;line-height:1">${esc(name)}</div><div class="f-mono" style="font-size:${n(size * 0.14)}px;letter-spacing:.1em">${["ARRIVED", "VISITED", "ENTRY"][i % 3]}</div></div>`;
    });
    html += titleAt(s.title || "collect moments", H * 0.85, { fit: s.fit || 0.6, font: s.font || "playi" });
  } else if (kind === "window") {
    const x = W * 0.2;
    const y = H * 0.14;
    const w = W * 0.6;
    const h = H * 0.56;
    out = `<rect width="${W}" height="${H}" fill="${s.wall || "#e9e4dc"}"/><defs><clipPath id="wn"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(w * 0.42)}"/></clipPath><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4c8c"/><stop offset=".6" stop-color="#f29f7a"/><stop offset="1" stop-color="#ffd9a0"/></linearGradient></defs>
      <rect x="${n(x - u * 3)}" y="${n(y - u * 3)}" width="${n(w + u * 6)}" height="${n(h + u * 6)}" rx="${n(w * 0.46)}" fill="#fbfaf7" stroke="#c9c2b6" stroke-width="${n(u * 0.4)}"/><g clip-path="url(#wn)"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#sk)"/>`;
    for (let i = 0; i < 6; i++) {
      const cy = y + h * between(r, 0.5, 0.95);
      const cx = x + w * between(r, 0, 1);
      for (let k = 0; k < 6; k++) out += `<circle cx="${n(cx + (k - 2.5) * w * 0.09)}" cy="${n(cy + between(r, -u, u) * 2)}" r="${n(w * between(r, 0.07, 0.13))}" fill="#fff" opacity=".9"/>`;
    }
    out += `<path d="M${n(x + w * 0.5)},${n(y + h)} L${n(x + w * 1.1)},${n(y + h * 0.56)} L${n(x + w * 1.1)},${n(y + h)} Z" fill="#dfe4ea"/><path d="M${n(x + w * 0.5)},${n(y + h)} L${n(x + w * 1.1)},${n(y + h * 0.56)}" stroke="#aab4c0" stroke-width="${n(u * 0.4)}"/></g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(w * 0.42)}" fill="none" stroke="#b9b1a2" stroke-width="${n(u * 0.6)}"/>`;
    html = titleAt(s.title || "window seat, please", H * 0.78, { fit: s.fit || 0.74, font: s.font || "playi", color: "#22201c" }) + caption(s.sub, u, "#22201c", 7);
  } else {
    const cx = W / 2;
    const cy = H * 0.42;
    const R = Math.min(W * 0.34, H * 0.28);
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.5)}"/>`;
    for (let i = 1; i < 6; i++) out += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n((R * i) / 6)}" ry="${n(R)}" fill="none" stroke="${p.fg}" stroke-width="${n(u * 0.16)}"/>`;
    for (let i = -2; i <= 2; i++) out += `<path d="M${n(cx - Math.sqrt(R * R - Math.pow((i * R) / 3, 2)))},${n(cy + (i * R) / 3)} H${n(cx + Math.sqrt(R * R - Math.pow((i * R) / 3, 2)))}" stroke="${p.fg}" stroke-width="${n(u * 0.16)}"/>`;
    out += `<path d="M${n(cx - R * 1.2)},${n(cy + R * 0.5)} Q${n(cx)},${n(cy - R * 1.5)} ${n(cx + R * 1.2)},${n(cy - R * 0.2)}" fill="none" stroke="${p.ac}" stroke-width="${n(u * 0.5)}" stroke-dasharray="${n(u * 1.4)} ${n(u * 1.2)}"/><path transform="translate(${n(cx + R * 1.2)} ${n(cy - R * 0.2)}) rotate(28) scale(${n(u * 0.12)})" d="M-30,0 L10,-6 L28,-34 H38 L28,-6 L52,-4 L60,-14 H66 L62,0 L66,14 H60 L52,4 L28,6 L38,34 H28 L10,6 Z" fill="${p.ac}"/>`;
    html = titleAt(s.title || "the world is waiting", H * 0.76, { fit: s.fit || 0.8, font: s.font || "playi" }) + caption(s.sub, u, p.fg, 7);
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy: 0.14 });
}

/* ---------------------------------------------------------------- Sports */

const BALLS = {
  football: (c) => `<circle r="100" fill="#fbfaf5" stroke="${c}" stroke-width="5"/><path d="M0,-34 L32,-10 L20,28 H-20 L-32,-10 Z" fill="${c}"/>${[0, 72, 144, 216, 288].map((d) => `<g transform="rotate(${d})"><path d="M0,-34 V-64 M-22,-88 L0,-64 L22,-88" fill="none" stroke="${c}" stroke-width="5"/><path d="M-22,-88 L0,-64 L22,-88 L14,-99 H-14 Z" fill="${c}" opacity=".0"/></g>`).join("")}`,
  basketball: (c) => `<circle r="100" fill="#e2732f" stroke="${c}" stroke-width="5"/><path d="M-100,0 H100 M0,-100 V100 M-70,-71 C-30,-30 -30,30 -70,71 M70,-71 C30,-30 30,30 70,71" fill="none" stroke="${c}" stroke-width="5"/>`,
  cricket: (c) => `<circle r="100" fill="#b3261e" stroke="${c}" stroke-width="5"/><path d="M-12,-99 C-34,-40 -34,40 -12,99 M12,-99 C-10,-40 -10,40 12,99" fill="none" stroke="#fbf3dc" stroke-width="4"/>${Array.from({ length: 13 }, (_, i) => `<path d="M-40,${-84 + i * 14} l20,3 M-6,${-84 + i * 14} l20,3" stroke="#fbf3dc" stroke-width="3"/>`).join("")}`,
  tennis: (c) => `<circle r="100" fill="#d7e84a" stroke="${c}" stroke-width="5"/><path d="M-86,-52 C-30,-30 -30,30 -86,52 M86,-52 C30,-30 30,30 86,52" fill="none" stroke="#fbfaf5" stroke-width="8"/>`,
  shuttle: (c) => `<path d="M-64,-70 L-22,56 H22 L64,-70 Z" fill="#fbfaf5" stroke="${c}" stroke-width="5" stroke-linejoin="round"/><path d="M-32,-70 L-8,56 M0,-70 V56 M32,-70 L8,56 M-52,-30 H52 M-40,8 H40" stroke="${c}" stroke-width="3.4" fill="none"/><path d="M-24,56 H24 A24,30 0 0 1 -24,56 Z" fill="${c}"/>`,
};

/** kind: ball (which: football | basketball | cricket | tennis | shuttle) | jersey | medal */
export function sport(s, W, H, r) {
  const p = pal(s.pal || "ink");
  const u = Math.min(W, H) / 100;
  const kind = s.kind || "ball";
  let out = `<rect width="${W}" height="${H}" fill="${p.bg}"/>`;
  let html = "";
  if (kind === "ball") {
    const cx = W / 2;
    const cy = H * 0.4;
    const size = Math.min(W, H) * 0.5;
    for (let i = 0; i < 9; i++) out += `<path d="M${n(-W * 0.1)},${n(cy + (i - 4) * u * 3.2)} H${n(cx - size * 0.62 - i * u * 1.4)}" stroke="${i % 3 ? p.fg : p.ac}" stroke-width="${n(u * (i % 2 ? 0.5 : 0.9))}" stroke-linecap="round" opacity="${n(0.25 + (i % 3) * 0.2)}"/>`;
    out += `<ellipse cx="${n(cx)}" cy="${n(cy + size * 0.6)}" rx="${n(size * 0.4)}" ry="${n(size * 0.045)}" fill="#000" opacity=".18"/><g transform="translate(${n(cx)} ${n(cy)}) rotate(${s.tilt ?? -14}) scale(${n(size / 200)})">${(BALLS[s.which] || BALLS.football)(p.fg === "#f4efe6" || p.fg === "#f1ead9" ? "#1c1a17" : p.fg)}</g>`;
    html = `<div style="position:absolute;left:9%;right:9%;top:${n(H * 0.72)}px;text-align:center">${(s.lines || ["PLAY", "*HARD"]).map((l) => `<div style="line-height:.96"><span data-fit="${s.fit || 0.7}" class="f-${s.font || "anton"}" style="color:${l.startsWith("*") ? "var(--ac)" : "var(--fg)"}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("")}</div>`;
    html = `<div style="position:absolute;left:0;right:0;top:${n(H * 0.7)}px;bottom:${n(H * 0.05)}px;display:flex;flex-direction:column;justify-content:center" data-fith><div style="width:100%;padding:0 9%;text-align:center">${(s.lines || ["PLAY", "*HARD"]).map((l) => `<div style="line-height:.98"><span data-fit="${s.fit || 0.74}" class="f-${s.font || "anton"}" style="color:${l.startsWith("*") ? "var(--ac)" : "var(--fg)"}">${esc(l.replace(/^\*/, ""))}</span></div>`).join("")}</div></div>`;
  } else if (kind === "jersey") {
    const cx = W / 2;
    const k = Math.min(W, H) * 0.0033;
    const stripes = s.stripes !== false;
    out += `<g transform="translate(${n(cx)} ${n(H * 0.44)}) scale(${n(k)})"><defs><clipPath id="js"><path d="M-46,-110 Q0,-84 46,-110 L120,-84 L140,-20 L96,-2 L84,-34 V120 H-84 V-34 L-96,-2 L-140,-20 L-120,-84 Z"/></clipPath></defs>
      <path d="M-46,-110 Q0,-84 46,-110 L120,-84 L140,-20 L96,-2 L84,-34 V120 H-84 V-34 L-96,-2 L-140,-20 L-120,-84 Z" fill="${p.ac}"/>
      <g clip-path="url(#js)">${stripes ? [-70, -28, 14, 56].map((x) => `<rect x="${x}" y="-120" width="18" height="260" fill="${p.more[1] || p.fg}" opacity=".45"/>`).join("") : ""}<path d="M-140,-20 L-96,-2 L-100,-12 L-138,-30 Z M140,-20 L96,-2 L100,-12 L138,-30 Z" fill="${p.fg}"/></g>
      <path d="M-46,-110 Q0,-84 46,-110 L40,-116 Q0,-94 -40,-116 Z" fill="${p.fg}"/></g>`;
    html = `<div class="f-anton" style="position:absolute;left:0;right:0;top:${n(H * 0.44 - k * 62)}px;text-align:center;font-size:${n(k * 150)}px;line-height:1;color:${s.ink || p.bg}">${esc(s.no || "10")}</div>` + titleAt(s.title || "CAPTAIN", H * 0.76, { fit: s.fit || 0.62, font: s.font || "anton" }) + caption(s.sub, u, p.fg, 6);
  } else {
    const cx = W / 2;
    const cy = H * 0.46;
    const R = Math.min(W, H) * 0.2;
    out += `<path d="M${n(cx - R * 0.7)},0 L${n(cx - R * 0.16)},${n(cy - R * 0.9)} H${n(cx + R * 0.16)} L${n(cx + R * 0.7)},0 H${n(cx + R * 0.26)} L${n(cx)},${n(cy - R * 1.4)} L${n(cx - R * 0.26)},0 Z" fill="${p.more[0]}"/><path d="M${n(cx - R * 0.7)},0 L${n(cx - R * 0.16)},${n(cy - R * 0.9)} H${n(cx)} L${n(cx - R * 0.48)},0 Z" fill="${p.more[1]}" opacity=".7"/>
      <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="${p.ac}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 0.82)}" fill="none" stroke="${mix(p.ac, "#000000", 0.35)}" stroke-width="${n(u * 0.5)}"/>` + star(cx, cy, R * 0.52, mix(p.ac, "#ffffff", 0.6));
    html = titleAt(s.title || "EARNED, NOT GIVEN", H * 0.74, { fit: s.fit || 0.82, font: s.font || "bebas" }) + caption(s.sub, u, p.fg, 8);
  }
  return box(W, H, p, svg(W, H, out) + html, { grainy: 0.14 });
}

/* ---------------------------------------------------------------- A picture */

/**
 * A public-domain artwork (or any raster picture) filling the piece.
 * url is set by the build from `src`, a file in tools/decor/sources/.
 * pos: CSS background-position ("50% 40%"); border: a white paper margin in % of the width.
 */
export function photo(s, W, H) {
  const m = (s.border || 0) * (W / 100);
  const filter = s.filter ? `filter:${s.filter};` : "";
  return `<div class="a" style="width:${W}px;height:${H}px;--bg:${s.paper || "#fbfaf7"};--fg:#22201c;--ac:#22201c;--m0:#eee;--m1:#bbb;--m2:#666">
    <div style="position:absolute;left:${n(m)}px;top:${n(m)}px;right:${n(m)}px;bottom:${n(s.label ? m * 2.4 : m)}px;background:url(${s.url}) ${s.pos || "50% 50%"} / ${s.size || "cover"} no-repeat;${filter}"></div>
    ${s.label ? `<div class="caps" style="position:absolute;left:0;right:0;bottom:${n(m * 0.8)}px;text-align:center;font-size:${n(W * 0.017)}px;letter-spacing:.3em">${esc(s.label)}</div>` : ""}</div>`;
}

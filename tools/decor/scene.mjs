/* ==========================================================================
   Product photos for Home Decor, composed from a finished artwork image:

     front(art, opts)   the framed piece on a wall          (4:5, the card image)
     room(art, opts)    the piece in a room, for scale      (4:3)
     flat(art, opts)    multi-panel sets, straight on       (3:2)
     back(opts)         the back of a frame                 (4:5, shared)
     corner(opts)       a frame corner close-up             (4:5, shared)

   `art` is { url, w, h }: the artwork as an image. For a multi-panel set the
   artwork is one wide image and each panel shows its own slice of it, with the
   part "behind" the gap between two panels left out, as on a real wall.
   ========================================================================== */

export const FRAMES = {
  black: { edge: "#1a1a1a", face: "linear-gradient(135deg,#2a2a2a,#111 55%,#262626)", lip: "rgba(255,255,255,.07)" },
  white: { edge: "#e9e6df", face: "linear-gradient(135deg,#ffffff,#ece8e0 55%,#faf8f4)", lip: "rgba(0,0,0,.08)" },
  oak: { edge: "#b98a55", face: "repeating-linear-gradient(92deg,rgba(90,55,20,.10) 0 2px,transparent 2px 7px),linear-gradient(135deg,#d2a66f,#b98a55 55%,#caa068)", lip: "rgba(60,35,10,.25)" },
  walnut: { edge: "#4f3323", face: "repeating-linear-gradient(92deg,rgba(0,0,0,.16) 0 2px,transparent 2px 8px),linear-gradient(135deg,#6a4631,#4a2f20 55%,#5f3e2b)", lip: "rgba(0,0,0,.3)" },
  gold: { edge: "#b08a3a", face: "linear-gradient(135deg,#e7cd87,#a67f2f 45%,#d9bb6c 70%,#8f6d27)", lip: "rgba(60,40,0,.3)" },
};

export const WALLS = {
  linen: ["#efeae1", "#e3dccf"],
  warm: ["#eadfce", "#dccdb7"],
  sage: ["#d6ddd0", "#c3cdbb"],
  clay: ["#e0c2ae", "#d1ab93"],
  blush: ["#eed9d2", "#e2c5bc"],
  mist: ["#dfe4e6", "#cfd6d9"],
  charcoal: ["#34373c", "#26282c"],
  navy: ["#243247", "#182335"],
  forest: ["#2f4238", "#213129"],
  plum: ["#3b2c3d", "#2a1f2c"],
};
const dark = (wall) => ["charcoal", "navy", "forest", "plum"].includes(wall);

export const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff}
.scene{position:relative;overflow:hidden}
.scene .light{position:absolute;inset:0;background:radial-gradient(120% 90% at 30% 10%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%)}
.scene .vig{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 40%,rgba(0,0,0,0) 55%,rgba(0,0,0,.16))}
.fr{position:absolute;box-shadow:0 2px 3px rgba(0,0,0,.28),0 18px 30px -8px rgba(0,0,0,.38),0 40px 70px -20px rgba(0,0,0,.3)}
.fr .in{position:absolute;overflow:hidden;background:#fff}
.fr .in i{position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.22),inset 0 4px 10px rgba(0,0,0,.28);pointer-events:none}
.fr .in b{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 28%,rgba(255,255,255,0) 62%,rgba(255,255,255,.08) 100%);pointer-events:none}
.fr .art{position:absolute;background-repeat:no-repeat}
`;

/** One frame showing a slice of the artwork. box = {x,y,w,h} on the scene; slice = {x,y,w,h} in artwork pixels; scale = scene px per artwork px. */
function frame(art, box, slice, scale, { color = "black", width = 12, mat = 0 }) {
  const f = FRAMES[color] || FRAMES.black;
  const outer = { x: box.x - width - mat, y: box.y - width - mat, w: box.w + (width + mat) * 2, h: box.h + (width + mat) * 2 };
  return `<div class="fr" style="left:${outer.x}px;top:${outer.y}px;width:${outer.w}px;height:${outer.h}px;background:${f.face};outline:1px solid ${f.lip};outline-offset:-1px">
    <div class="in" style="left:${width}px;top:${width}px;width:${box.w + mat * 2}px;height:${box.h + mat * 2}px;background:#fbfaf7">
      <div class="art" style="left:${mat}px;top:${mat}px;width:${box.w}px;height:${box.h}px;background-image:url(${art.url});background-size:${art.w * scale}px ${art.h * scale}px;background-position:${-slice.x * scale}px ${-slice.y * scale}px"></div><i></i><b></b>
    </div></div>`;
}

/**
 * Where each panel of a set goes. layout: { panels, gap, stagger }.
 * Returns the panels' slices in artwork pixels: [{x,y,w,h}], for artwork art.w x art.h.
 * stagger (5-panel classic): the outer panels are shorter than the middle one.
 */
export function slices(art, { panels = 1, gap = 0, stagger = false }) {
  if (panels === 1) return [{ x: 0, y: 0, w: art.w, h: art.h }];
  const w = (art.w - gap * (panels - 1)) / panels;
  return Array.from({ length: panels }, (_, i) => {
    const d = Math.abs(i - (panels - 1) / 2) / ((panels - 1) / 2);
    const h = stagger ? art.h * (1 - 0.34 * d) : art.h;
    return { x: i * (w + gap), y: (art.h - h) / 2, w, h };
  });
}

/** The hanging piece(s), centred at (cx, cy), fitted into maxW x maxH. */
function hang(art, layout, cx, cy, maxW, maxH, frameOpts) {
  const scale = Math.min(maxW / art.w, maxH / art.h);
  const left = cx - (art.w * scale) / 2;
  const top = cy - (art.h * scale) / 2;
  return slices(art, layout)
    .map((s) => frame(art, { x: Math.round(left + s.x * scale), y: Math.round(top + s.y * scale), w: Math.round(s.w * scale), h: Math.round(s.h * scale) }, s, scale, frameOpts))
    .join("");
}

const wallBg = (wall) => `linear-gradient(180deg,${(WALLS[wall] || WALLS.linen)[0]},${(WALLS[wall] || WALLS.linen)[1]})`;
const floor = (W, H, y, wall) => `<div style="position:absolute;left:0;right:0;top:${y}px;height:${H - y}px;background:linear-gradient(180deg,${dark(wall) ? "#6b4f3a,#4f3a2b" : "#c9a67e,#b08b63"})"></div>
  <div style="position:absolute;left:0;right:0;top:${y}px;height:${H - y}px;background:repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 2px,transparent 2px ${Math.round(W / 9)}px);opacity:.6"></div>
  <div style="position:absolute;left:0;right:0;top:${y - 14}px;height:14px;background:${dark(wall) ? "#1c1d20" : "#f6f3ee"};box-shadow:0 1px 0 rgba(0,0,0,.18)"></div>`;

/* ---- Furniture, drawn flat with soft shading. All in a W x 300 strip that sits on the floor line. ---- */
const sofa = (W, col = "#8d8a80") => `<svg viewBox="0 0 1200 300" width="${W}" height="${W / 4}" style="position:absolute;left:0;bottom:0">
  <ellipse cx="600" cy="282" rx="430" ry="16" fill="rgba(0,0,0,.22)"/>
  <rect x="218" y="96" width="764" height="150" rx="34" fill="${col}"/>
  <rect x="190" y="130" width="96" height="136" rx="30" fill="${col}"/><rect x="914" y="130" width="96" height="136" rx="30" fill="${col}"/>
  <rect x="270" y="166" width="660" height="92" rx="22" fill="rgba(255,255,255,.14)"/>
  <path d="M600 170v84M270 200h660" stroke="rgba(0,0,0,.12)" stroke-width="3"/>
  <rect x="318" y="118" width="150" height="100" rx="20" fill="#d9c7a6"/><rect x="746" y="126" width="128" height="92" rx="20" fill="#b9562b" opacity=".9"/>
  <rect x="236" y="262" width="18" height="24" fill="#3a2a1d"/><rect x="946" y="262" width="18" height="24" fill="#3a2a1d"/>
  <g transform="translate(1040 96)"><rect x="0" y="118" width="110" height="10" rx="4" fill="#5a4030"/><rect x="50" y="128" width="10" height="60" fill="#5a4030"/><ellipse cx="55" cy="190" rx="34" ry="6" fill="#5a4030"/>
    <rect x="44" y="70" width="22" height="48" rx="6" fill="#e9e1d0"/><path d="M22 70h66l-14-52H36z" fill="#f4ead2"/></g>
  <g transform="translate(86 60)"><rect x="18" y="170" width="64" height="56" rx="10" fill="#c7a07a"/>
    <path d="M50 172c-8-60-34-92-52-104 30 6 48 36 54 70 0-56 12-96 34-122-6 44-12 86-12 132 12-40 34-62 58-70-30 30-48 62-58 96z" fill="#4f7359"/></g></svg>`;
const consoleTable = (W) => `<svg viewBox="0 0 1200 300" width="${W}" height="${W / 4}" style="position:absolute;left:0;bottom:0">
  <ellipse cx="600" cy="284" rx="380" ry="12" fill="rgba(0,0,0,.2)"/>
  <rect x="250" y="150" width="700" height="22" rx="6" fill="#6b4a33"/><rect x="250" y="172" width="700" height="10" fill="rgba(0,0,0,.18)"/>
  <rect x="276" y="172" width="14" height="112" fill="#5a3d2a"/><rect x="910" y="172" width="14" height="112" fill="#5a3d2a"/><rect x="276" y="236" width="648" height="10" fill="#5a3d2a"/>
  <rect x="330" y="118" width="120" height="32" rx="3" fill="#2f4b5a"/><rect x="342" y="98" width="96" height="20" rx="3" fill="#d9c7a6"/>
  <path d="M770 150c-22-10-28-44-8-60h44c20 16 14 50-8 60z" fill="#e7dccb"/><path d="M792 92c-4-34-18-52-30-62 20 6 30 24 34 44 2-30 10-52 24-66-4 26-8 50-8 78 8-22 22-34 36-38-18 16-28 34-34 52z" fill="#5f8f4e"/>
  <circle cx="620" cy="126" r="24" fill="#c98b5e"/><rect x="560" y="140" width="40" height="10" rx="3" fill="#3b2a23"/>
  <g transform="translate(1020 0)"><rect x="46" y="60" width="8" height="220" fill="#2a2a2a"/><ellipse cx="50" cy="284" rx="40" ry="7" fill="#2a2a2a"/><path d="M14 64h72l-16-58H30z" fill="#f1e6cf"/></g></svg>`;
const bed = (W) => `<svg viewBox="0 0 1200 300" width="${W}" height="${W / 4}" style="position:absolute;left:0;bottom:0">
  <rect x="240" y="40" width="720" height="150" rx="26" fill="#a98d73"/><rect x="262" y="60" width="676" height="110" rx="18" fill="rgba(255,255,255,.1)"/>
  <rect x="210" y="170" width="780" height="120" rx="18" fill="#f3eee6"/><rect x="210" y="214" width="780" height="76" rx="14" fill="#c9b7a2"/>
  <rect x="300" y="132" width="230" height="74" rx="26" fill="#ffffff"/><rect x="670" y="132" width="230" height="74" rx="26" fill="#ffffff"/>
  <rect x="520" y="150" width="160" height="62" rx="22" fill="#b9562b" opacity=".85"/>
  <g transform="translate(60 120)"><rect x="0" y="60" width="120" height="110" rx="8" fill="#6b4a33"/><rect x="12" y="76" width="96" height="34" rx="4" fill="rgba(255,255,255,.1)"/><rect x="50" y="20" width="20" height="40" rx="6" fill="#e9e1d0"/><path d="M30 22h60L78-22H42z" fill="#f4ead2"/></g>
  <g transform="translate(1020 120)"><rect x="0" y="60" width="120" height="110" rx="8" fill="#6b4a33"/><rect x="12" y="76" width="96" height="34" rx="4" fill="rgba(255,255,255,.1)"/>
    <path d="M60 60c-6-40-24-62-36-70 20 4 32 24 36 48 0-38 8-64 24-82-4 30-8 58-8 88 8-26 22-42 38-46-20 20-32 42-38 62z" fill="#4f7359"/></g></svg>`;
const desk = (W) => `<svg viewBox="0 0 1200 300" width="${W}" height="${W / 4}" style="position:absolute;left:0;bottom:0">
  <rect x="220" y="150" width="760" height="18" rx="5" fill="#1b1c20"/><rect x="244" y="168" width="14" height="124" fill="#111"/><rect x="942" y="168" width="14" height="124" fill="#111"/>
  <rect x="220" y="166" width="760" height="5" fill="#7a3cff" opacity=".9"/><rect x="200" y="168" width="800" height="26" fill="#7a3cff" opacity=".18" filter="blur(8px)"/>
  <rect x="430" y="32" width="340" height="100" rx="8" fill="#0b0c10"/><rect x="442" y="42" width="316" height="80" rx="4" fill="#1a2440"/><rect x="442" y="42" width="316" height="80" rx="4" fill="url(#scr)"/>
  <defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27e0ff" stop-opacity=".5"/><stop offset="1" stop-color="#ff3ea5" stop-opacity=".45"/></linearGradient></defs>
  <rect x="586" y="132" width="28" height="18" fill="#0b0c10"/><rect x="540" y="146" width="120" height="6" rx="3" fill="#0b0c10"/>
  <rect x="300" y="138" width="110" height="12" rx="4" fill="#23252b"/><rect x="800" y="134" width="60" height="16" rx="8" fill="#23252b"/>
  <g transform="translate(540 150)"><rect x="0" y="20" width="120" height="110" rx="24" fill="#22242a"/><rect x="14" y="0" width="92" height="46" rx="18" fill="#2b2e36"/><rect x="54" y="130" width="12" height="20" fill="#111"/></g>
  <g transform="translate(1020 60)"><rect x="0" y="0" width="70" height="230" rx="8" fill="#15161a"/><rect x="10" y="14" width="50" height="6" fill="#39f58a"/><rect x="10" y="30" width="50" height="6" fill="#27e0ff" opacity=".8"/></g></svg>`;
const FURNITURE = { sofa, console: consoleTable, bed, desk };

/** The card image: the piece on a wall, a little furniture at the bottom when it is a wide set. */
export function front(art, o) {
  const W = 800;
  const H = 1000;
  const wide = o.panels > 1 || art.w / art.h > 1.5;
  const body = wide
    ? `${floor(W, H, 860, o.wall)}<div style="position:absolute;left:-80px;right:-80px;bottom:36px;height:240px">${(FURNITURE[o.room] || sofa)(960)}</div>${hang(art, o, W / 2, 380, o.panels > 4 ? 730 : 690, 430, { color: o.frame, width: 9 })}`
    : hang(art, o, W / 2, 480, (art.w > art.h ? 640 : 520) + (o.mat ? -40 : 0), 660 + (o.mat ? -50 : 0), { color: o.frame, width: 16, mat: o.mat ? 34 : 0 });
  return `<div class="scene" style="width:${W}px;height:${H}px;background:${wallBg(o.wall)}"><div class="light"></div>${body}<div class="vig"></div></div>`;
}

/** The piece in a room: sofa, console, bed or desk under it. */
export function room(art, o) {
  const W = 1200;
  const H = 900;
  const wide = o.panels > 1 || art.w / art.h > 1.5;
  const big = 1.2;
  return `<div class="scene" style="width:${W}px;height:${H}px;background:${wallBg(o.wall)}"><div class="light"></div>${floor(W, H, 770, o.wall)}
    <div style="position:absolute;left:${(-W * (big - 1)) / 2}px;width:${W * big}px;bottom:34px;height:${300 * big}px">${(FURNITURE[o.room] || sofa)(W * big)}</div>
    ${hang(art, o, W / 2, wide ? 268 : 262, wide ? (o.panels > 4 ? 900 : 820) : 390, wide ? 380 : 430, { color: o.frame, width: wide ? 9 : 11, mat: !wide && o.mat ? 22 : 0 })}<div class="vig"></div></div>`;
}

/** A multi-panel set, straight on, filling the picture. */
export function flat(art, o) {
  const W = 1200;
  const H = 800;
  return `<div class="scene" style="width:${W}px;height:${H}px;background:${wallBg(o.wall)}"><div class="light"></div>${hang(art, o, W / 2, H / 2, 1040, 600, { color: o.frame, width: 12 })}<div class="vig"></div></div>`;
}

/** The back of a frame: backing board, turn clips, hanger. */
export function back({ wall = "linen", frame: color = "black" } = {}) {
  const f = FRAMES[color] || FRAMES.black;
  return `<div class="scene" style="width:800px;height:1000px;background:${wallBg(wall)}"><div class="light"></div>
    <div class="fr" style="left:140px;top:170px;width:520px;height:660px;background:${f.face}">
      <div style="position:absolute;inset:16px;background:linear-gradient(135deg,#b58f62,#a37d52);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 1px,transparent 1px 5px)"></div>
        ${[[50, 4], [50, 96], [3, 30], [3, 70], [97, 30], [97, 70]].map(([x, y]) => `<span style="position:absolute;left:${x}%;top:${y}%;width:34px;height:12px;margin:-6px -17px;background:#c9c9c9;border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.4);transform:rotate(${x === 50 ? 0 : 90}deg)"></span>`).join("")}
        <span style="position:absolute;left:50%;top:9%;width:86px;height:20px;margin-left:-43px;background:repeating-linear-gradient(90deg,#d6d6d6 0 6px,#9d9d9d 6px 9px);clip-path:polygon(0 100%,6% 0,94% 0,100% 100%);box-shadow:0 1px 2px rgba(0,0,0,.4)"></span>
        <span style="position:absolute;left:50%;bottom:9%;transform:translateX(-50%);font:600 15px Montserrat,sans-serif;letter-spacing:.3em;color:rgba(40,25,10,.55)">FRAMEX</span>
      </div></div><div class="vig"></div></div>`;
}

/** A close look at a frame corner and the print surface. */
export function corner({ wall = "linen", frame: color = "black" } = {}) {
  const f = FRAMES[color] || FRAMES.black;
  return `<div class="scene" style="width:800px;height:1000px;background:${wallBg(wall)}"><div class="light"></div>
    <div class="fr" style="left:210px;top:260px;width:900px;height:1100px;background:${f.face}">
      <div style="position:absolute;left:0;top:0;width:150px;height:150px;background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(0,0,0,.12));clip-path:polygon(0 0,100% 0,0 100%)"></div>
      <div style="position:absolute;left:0;top:0;width:212px;height:2px;background:rgba(0,0,0,.45);transform-origin:0 0;transform:rotate(45deg)"></div>
      <div style="position:absolute;left:70px;top:70px;right:0;bottom:0;background:#fbfaf7;box-shadow:inset 6px 8px 14px rgba(0,0,0,.28)">
        <div style="position:absolute;left:60px;top:60px;right:0;bottom:0;background:linear-gradient(135deg,#e9e3d6,#d9d1bf);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></div>
        <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.35),rgba(255,255,255,0) 30%)"></div>
      </div></div><div class="vig"></div></div>`;
}

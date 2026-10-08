/* Typographic posters: quotes, words, definitions, lists.
   Text sizes are worked out in the page (see fit() in build.mjs): an element
   with data-fit="0.8" is scaled until it is 80% as wide as its row. */
import { box, esc, pal, svg, n } from "./core.mjs";

const accent = (text) => (text.startsWith("*") ? [text.slice(1), true] : [text, false]);

/** Big stacked words. lines: ["NEVER", "*GIVE", "UP"] (a leading * = accent colour). */
export function stack(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const font = s.font || "anton";
  const lh = { anton: 1.02, bebas: 0.92, oswald: 1.05, abril: 1.0, right: 1.0 }[font] || 1;
  const rows = s.lines
    .map((l) => {
      const [text, ac] = accent(l);
      return `<div style="line-height:${lh};text-align:${s.align || "left"}"><span data-fit="${s.fit || 1}" class="f-${font}" style="${ac ? "color:var(--ac);" : ""}${s.outline && !ac ? `-webkit-text-stroke:${0.22 * u}px var(--fg);color:transparent;` : ""}">${esc(text)}</span></div>`;
    })
    .join("");
  const top = s.top ? `<div class="caps" style="font-size:${2.3 * u}px;margin-bottom:${3.2 * u}px;color:var(--ac);text-align:${s.align || "left"}">${esc(s.top)}</div>` : "";
  const sub = s.sub ? `<div style="display:flex;align-items:center;gap:${2 * u}px;margin-top:${3.6 * u}px;justify-content:${s.align === "center" ? "center" : "flex-start"}"><span style="width:${7 * u}px;height:${0.35 * u}px;background:var(--ac)"></span><span class="caps" style="font-size:${2.8 * u}px">${esc(s.sub)}</span></div>` : "";
  const frame = s.frame ? `<div style="position:absolute;inset:${3.4 * u}px;border:${0.28 * u}px solid var(--fg);opacity:.85"></div>` : "";
  const corner = s.mark ? `<div class="f-${font}" style="position:absolute;right:${6 * u}px;top:${5 * u}px;font-size:${5 * u}px;color:var(--ac)">${esc(s.mark)}</div>` : "";
  return box(W, H, p, `${frame}${corner}<div class="pad" data-fith style="padding:${(s.frame ? 11 : 9) * u}px ${(s.frame ? 11 : 9) * u}px"><div style="width:100%">${top}${rows}${sub}</div></div>`);
}

/** An elegant serif quote. lines are already broken; *line = accent colour. */
export function serif(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const quote = s.lines
    .map((l) => {
      const [text, ac] = accent(l);
      return `<span style="${ac ? "color:var(--ac)" : ""}">${esc(text)}</span>`;
    })
    .join("<br>");
  const orn = `<svg width="${14 * u}" height="${2.4 * u}" viewBox="0 0 140 24" style="display:block;margin:0 auto"><path d="M0 12h52M88 12h52" stroke="currentColor" stroke-width="1.6"/><path d="M70 2l8 10-8 10-8-10z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  return box(
    W,
    H,
    p,
    `${s.frame === false ? "" : `<div style="position:absolute;inset:${4 * u}px;border:${0.18 * u}px solid var(--fg);opacity:.55"></div>`}
    <div class="pad" data-fith style="padding:${12 * u}px ${9 * u}px;align-items:center;text-align:center"><div style="width:100%">
      ${s.top ? `<div class="caps" style="font-size:${2.1 * u}px;color:var(--ac);margin-bottom:${4 * u}px">${esc(s.top)}</div>` : ""}
      <div style="color:var(--ac);margin-bottom:${4.5 * u}px">${orn}</div>
      <div><span data-fit="${s.fit || 0.97}" class="${s.upright ? "f-play" : "f-playi"}" style="line-height:1.24;font-weight:${s.weight || 500};text-align:center">${quote}</span></div>
      <div style="color:var(--ac);margin-top:${4.5 * u}px">${orn}</div>
      ${s.by ? `<div class="caps" style="font-size:${2.6 * u}px;margin-top:${4 * u}px;opacity:.8">${esc(s.by)}</div>` : ""}
    </div></div>`,
  );
}

/** A script word with small capitals above and below. */
export function script(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const font = s.font || "pac";
  const words = (Array.isArray(s.word) ? s.word : [s.word]).map((w) => `<div style="line-height:1.12"><span data-fit="${s.fit || 0.84}" class="f-${font}" style="color:var(--ac);padding:0 ${1.5 * u}px">${esc(w)}</span></div>`).join("");
  return box(
    W,
    H,
    p,
    `<div class="pad" data-fith style="padding:${10 * u}px ${8 * u}px;align-items:center;text-align:center"><div style="width:100%">
      ${s.top ? `<div class="caps" style="font-size:${2.6 * u}px;line-height:1.9">${s.top.map(esc).join("<br>")}</div>` : ""}
      <div style="margin:${2.5 * u}px 0 ${6 * u}px">${words}</div>
      ${s.bottom ? `<div class="caps" style="font-size:${2.6 * u}px;line-height:1.9">${s.bottom.map(esc).join("<br>")}</div>` : ""}
      ${s.note ? `<div class="f-playi" style="font-size:${2.7 * u}px;margin-top:${4 * u}px;opacity:.75">${esc(s.note)}</div>` : ""}
    </div></div>`,
  );
}

/** Typewriter lines. [square brackets] are highlighted. */
export function mono(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const rows = s.lines
    .map((l) => esc(l).replace(/\[(.+?)\]/g, `<span style="background:var(--ac);color:var(--bg);padding:0 .3em">$1</span>`))
    .map((l) => `<div style="line-height:1.55">${l || "&nbsp;"}</div>`)
    .join("");
  return box(
    W,
    H,
    p,
    `<div class="pad" data-fith style="padding:${10 * u}px"><div style="width:100%">
      ${s.top ? `<div class="f-mono" style="font-size:${2.3 * u}px;opacity:.6;margin-bottom:${4 * u}px">${esc(s.top)}</div>` : ""}
      <div><div data-fit="${s.fit || 1}" class="f-mono" style="font-weight:700;white-space:nowrap">${rows}</div></div>
      ${s.sub ? `<div class="f-mono" style="font-size:${2.3 * u}px;opacity:.6;margin-top:${4 * u}px">${esc(s.sub)}</div>` : ""}
    </div></div>`,
  );
}

/** A dictionary entry: word, pronunciation, part of speech, meanings. */
export function dict(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  return box(
    W,
    H,
    p,
    `<div class="pad" data-fith style="padding:${10 * u}px"><div style="width:100%">
      <div><span data-fit="${s.fit || 0.7}" class="f-play" style="font-weight:800;line-height:1.05">${esc(s.word)}</span></div>
      <div class="f-mono" style="font-size:${3.6 * u}px;margin-top:${2.4 * u}px;opacity:.7">${esc(s.say)} &nbsp;·&nbsp; <i class="f-playi">${esc(s.pos || "noun")}</i></div>
      <div style="width:${12 * u}px;height:${0.5 * u}px;background:var(--ac);margin:${4 * u}px 0"></div>
      ${s.defs.map((d, i) => `<div style="display:flex;gap:${2.2 * u}px;font-size:${4.6 * u}px;line-height:1.4;margin-bottom:${2.8 * u}px"><span class="f-play" style="color:var(--ac);font-weight:700">${i + 1}.</span><span class="f-play">${esc(d)}</span></div>`).join("")}
      ${s.see ? `<div class="f-playi" style="font-size:${3.6 * u}px;opacity:.7;margin-top:${3 * u}px">see also: ${esc(s.see)}</div>` : ""}
    </div></div>`,
  );
}

/** 70s sunburst with chunky stacked lettering. */
export function retro(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const cx = W / 2;
  const cy = H * (s.cy || 0.62);
  const R = Math.hypot(W, H);
  const cols = [p.ac, p.more[0], p.more[1]];
  let rays = "";
  const count = s.rays || 24;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 1) / count) * Math.PI * 2;
    rays += `<path d="M${cx},${cy} L${n(cx + Math.cos(a0) * R)},${n(cy + Math.sin(a0) * R)} L${n(cx + Math.cos(a1) * R)},${n(cy + Math.sin(a1) * R)} Z" fill="${i % 2 ? cols[i % 3] : p.bg}" opacity="${i % 2 ? 0.9 : 1}"/>`;
  }
  const shadow = `${0.5 * u}px ${0.5 * u}px 0 ${p.more[2]}, ${1 * u}px ${1 * u}px 0 ${p.more[2]}, ${1.5 * u}px ${1.5 * u}px 0 ${p.more[2]}`;
  const rows = s.lines.map((l) => `<div style="line-height:1.0"><span data-fit="${s.fit || 0.82}" class="f-right" style="color:${p.fg};text-shadow:${shadow}">${esc(l)}</span></div>`).join("");
  return box(
    W,
    H,
    p,
    `${svg(W, H, rays + `<circle cx="${cx}" cy="${cy}" r="${W * 0.2}" fill="${p.more[2]}" opacity=".0"/>`)}
    <div class="pad" data-fith style="padding:${9 * u}px;align-items:center;text-align:center"><div style="width:100%">${s.top ? `<div class="caps" style="font-size:${2.4 * u}px;margin-bottom:${3 * u}px;color:${p.fg}">${esc(s.top)}</div>` : ""}${rows}${s.sub ? `<div class="caps" style="font-size:${2.4 * u}px;margin-top:${4 * u}px;color:${p.fg}">${esc(s.sub)}</div>` : ""}</div></div>`,
  );
}

/** A titled list: house rules, daily reminders, a checklist. */
export function list(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  const check = s.style === "check";
  return box(
    W,
    H,
    p,
    `<div class="pad" data-fith style="padding:${10 * u}px"><div style="width:100%">
      <div><span data-fit="${s.fit || 0.8}" class="f-${s.font || "bebas"}" style="line-height:1;color:var(--ac)">${esc(s.title)}</span></div>
      <div style="height:${0.4 * u}px;background:var(--fg);margin:${3 * u}px 0 ${3.5 * u}px"></div>
      ${s.items
        .map(
          (it, i) => `<div style="display:flex;align-items:baseline;gap:${2.6 * u}px;padding:${1.5 * u}px 0;border-bottom:${0.12 * u}px solid color-mix(in srgb, var(--fg) 25%, transparent)">
          ${check ? `<span style="flex:none;width:${3.2 * u}px;height:${3.2 * u}px;border:${0.34 * u}px solid var(--fg);position:relative;top:${0.4 * u}px">${s.done && s.done.includes(i) ? `<span style="position:absolute;left:18%;top:-45%;font-size:${4.4 * u}px;color:var(--ac);font-family:Caveat">✓</span>` : ""}</span>` : `<span class="f-mono" style="font-size:${2.5 * u}px;color:var(--ac)">${String(i + 1).padStart(2, "0")}</span>`}
          <span class="f-mont" style="font-size:${5 * u}px;font-weight:600;letter-spacing:.02em">${esc(it)}</span></div>`,
        )
        .join("")}
      ${s.sub ? `<div class="f-hand" style="font-size:${5.6 * u}px;margin-top:${3.5 * u}px;color:var(--ac)">${esc(s.sub)}</div>` : ""}
    </div></div>`,
  );
}

/** One huge word or number with a small line under it (minimalist). */
export function word(s, W, H) {
  const p = pal(s.pal);
  const u = W / 100;
  return box(
    W,
    H,
    p,
    `<div class="pad" data-fith style="padding:${10 * u}px;align-items:center;text-align:center"><div style="width:100%">
      <div><span data-fit="${s.fit || 0.7}" class="f-${s.font || "mont"}" style="font-weight:${s.weight || 200};letter-spacing:${s.track || ".18em"};line-height:1.1;margin-right:-${s.track || ".18em"}">${esc(s.word)}</span></div>
      ${s.rule === false ? "" : `<div style="width:${5 * u}px;height:${0.3 * u}px;background:var(--ac);margin:${4 * u}px auto"></div>`}
      ${s.sub ? `<div class="caps" style="font-size:${2.2 * u}px;opacity:.75">${esc(s.sub)}</div>` : ""}
    </div></div>`,
    { grainy: 0.08 },
  );
}

/** One word per panel of a multi-panel set: words: ["DREAM", "BELIEVE", "ACHIEVE"]. */
export function panelwords(s, W, H, r, layout = {}) {
  const p = pal(s.pal);
  const count = layout.panels || s.words.length;
  const gap = layout.gap || 0;
  const pw = (W - gap * (count - 1)) / count;
  const u = pw / 100;
  const font = s.font || "anton";
  const cells = s.words
    .slice(0, count)
    .map((word, i) => {
      const hot = s.hot === undefined ? i === Math.floor(count / 2) : s.hot === i;
      return `<div style="position:absolute;left:${n(i * (pw + gap))}px;top:0;width:${n(pw)}px;height:${H}px;background:${hot ? "var(--ac)" : "var(--bg)"};color:${hot ? "var(--bg)" : "var(--fg)"};display:flex;flex-direction:column;justify-content:center;padding:0 ${n(u * 11)}px">
        <div class="f-mono" style="font-size:${n(u * 5)}px;opacity:.7;margin-bottom:${n(u * 5)}px">${String(i + 1).padStart(2, "0")}</div>
        <div style="line-height:1"><span data-fit="1" class="f-${font}">${esc(word)}</span></div>
        <div style="width:${n(u * 16)}px;height:${n(u * 1.2)}px;background:currentColor;margin-top:${n(u * 7)}px"></div>
        ${s.subs && s.subs[i] ? `<div class="caps" style="font-size:${n(u * 4.2)}px;margin-top:${n(u * 6)}px;line-height:1.7;letter-spacing:.2em">${esc(s.subs[i])}</div>` : ""}
      </div>`;
    })
    .join("");
  return box(W, H, p, cells);
}

/* Every artwork template, by the name a design uses in js/decor.js ( art: { t: "stack", ... } ). */
import { CSS, esc, n, pal } from "./core.mjs";
import * as type from "./type.mjs";
import * as nature from "./nature.mjs";
import * as abstract from "./abstract.mjs";
import * as pop from "./pop.mjs";
import * as more from "./more.mjs";

const BASE = { ...type, ...nature, ...abstract, ...pop, ...more };

/**
 * A travel-poster layout around any other template:
 *   { t: "poster", of: { t: "mountains", sky: "alpine" }, title: "MANALI", sub: "Himachal Pradesh" }
 * The inner picture sits in a paper margin with the place name set large underneath.
 */
function poster(s, W, H, r) {
  const p = pal(s.pal || "ivory");
  const u = W / 100;
  const m = u * (s.margin ?? 5);
  const band = H * (s.band ?? 0.2);
  const iw = Math.round(W - m * 2);
  const ih = Math.round(H - m - band);
  const inner = BASE[s.of.t](s.of, iw, ih, r);
  return `<div class="a" style="width:${W}px;height:${H}px;--bg:${p.bg};--fg:${p.fg};--ac:${p.ac};--m0:${p.more[0]};--m1:${p.more[1]};--m2:${p.more[2]}">
    <div style="position:absolute;left:${n(m)}px;top:${n(m)}px;width:${iw}px;height:${ih}px;overflow:hidden">${inner}</div>
    <div style="position:absolute;left:${n(m)}px;right:${n(m)}px;top:${n(m + ih)}px;bottom:${n(m * 0.6)}px;display:flex;flex-direction:column;justify-content:center;text-align:center" data-fith><div style="width:100%">
      <div style="line-height:1"><span data-fit="${s.fit || 0.9}" data-max="${n(band * 0.56)}" class="f-${s.font || "bebas"}" style="color:var(--fg);letter-spacing:.06em">${esc(s.title)}</span></div>
      ${s.sub ? `<div class="caps" style="font-size:${n(u * 2.6)}px;color:var(--ac);margin-top:${n(u * 1.2)}px">${esc(s.sub)}</div>` : ""}
    </div></div></div>`;
}

/**
 * The picture a custom-photo product shows before the customer adds their own:
 *   { t: "sample", of: { t: "mountains", sky: "dawn" }, label: "Your photo" }
 */
function sample(s, W, H, r, layout) {
  const count = (layout && layout.panels) || 1;
  const gap = (layout && layout.gap) || 0;
  const pw = (W - gap * (count - 1)) / count;
  const u = Math.min(pw / 62, H / 100);
  // the label sits in the middle of one panel, never across a gap
  const cx = Math.floor((count - 1) / 2) * (pw + gap) + pw / 2;
  const inner = BASE[s.of.t](s.of, W, H, r, layout);
  return `<div class="a" style="width:${W}px;height:${H}px;--bg:#fff;--fg:#fff;--ac:#fff;--m0:#fff;--m1:#fff;--m2:#fff">${inner}
    <div style="position:absolute;left:${n(cx)}px;top:50%;transform:translate(-50%,-50%);padding:${n(u * 2.6)}px ${n(u * 4)}px;border-radius:${n(u * 6)}px;background:rgba(20,18,16,.72);color:#fff;display:flex;align-items:center;gap:${n(u * 2)}px;box-shadow:0 ${n(u)}px ${n(u * 3)}px rgba(0,0,0,.3)">
      <svg width="${n(u * 6)}" height="${n(u * 6)}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>
      <span class="caps" style="font-size:${n(u * 3.6)}px;letter-spacing:.18em;white-space:nowrap">${esc(s.label || "Your photo")}</span></div></div>`;
}

export const ART = { ...BASE, poster, sample };
export const ART_CSS = CSS;

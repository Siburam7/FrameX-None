/* ==========================================================================
   Pictures for photo-frame products that have no good photo of their own.

     cd tools/decor
     node frames.mjs

   Draws, with the same parts as the Home Decor pictures (scene.mjs, art/*.mjs):
     assets/img/products/white-texture-set.webp        four white A4 frames on a wall
     assets/img/products/white-texture-set-room.webp   the same set above a sofa, for scale

   Each frame shows a sample picture with a "Your photo" label, because the
   product is sold with the customer's own photos. These are drawings, not
   photographs of a shop's product: replace them with real product photos when
   a shop provides them (js/edit.js, or the shop dashboard).

   Needs Google Chrome. Set CHROME_PATH if it is not in the usual place.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { ART, ART_CSS } from "./art/index.mjs";
import { rng } from "./art/core.mjs";
import * as scene from "./scene.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outDir = path.join(root, "assets", "img", "products");
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));

// Four sample pictures, one per frame (A4 portrait: 210 x 297).
const SAMPLES = [
  { t: "mountains", sky: "dawn", lake: true, sunX: 0.5 },
  { t: "waves", sky: "dawn", sunX: 0.35 },
  { t: "forest", sky: "mist" },
  { t: "palms", sky: "dusk" },
];
const ART_W = 420;
const ART_H = 594;

const wallBg = (wall) => `linear-gradient(180deg,${scene.WALLS[wall][0]},${scene.WALLS[wall][1]})`;

/** One white frame with a white mat at (x, y); the opening shows a sample picture. */
function frame(url, x, y, w, { width = 12, mat = 14 } = {}) {
  const h = Math.round((w * ART_H) / ART_W);
  const f = scene.FRAMES.white;
  const outerW = w + (width + mat) * 2;
  const outerH = h + (width + mat) * 2;
  return `<div class="fr" style="left:${x}px;top:${y}px;width:${outerW}px;height:${outerH}px;background:${f.face};outline:1px solid ${f.lip};outline-offset:-1px">
    <div class="in" style="left:${width}px;top:${width}px;width:${w + mat * 2}px;height:${h + mat * 2}px;background:#fbfaf7">
      <div class="art" style="left:${mat}px;top:${mat}px;width:${w}px;height:${h}px;background-image:url(${url});background-size:${w}px ${h}px"></div><i></i><b></b>
    </div></div>`;
}

/** The "Your photo" label, centred over the set. */
const label = (cx, cy, k = 1) => `<div style="position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);padding:${10 * k}px ${18 * k}px;border-radius:${28 * k}px;background:rgba(20,18,16,.78);color:#fff;display:flex;align-items:center;gap:${9 * k}px;box-shadow:0 ${4 * k}px ${14 * k}px rgba(0,0,0,.3)">
  <svg width="${24 * k}" height="${24 * k}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>
  <span style="font:700 ${15 * k}px Montserrat,sans-serif;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap">Your 4 photos</span></div>`;

/** Four frames, two by two, centred at (cx, cy). w = width of one picture opening. */
function grid(urls, cx, cy, w, gap, opts) {
  const { width = 12, mat = 14 } = opts || {};
  const outerW = w + (width + mat) * 2;
  const outerH = Math.round((w * ART_H) / ART_W) + (width + mat) * 2;
  const left = cx - outerW - gap / 2;
  const top = cy - outerH - gap / 2;
  return urls.map((url, i) => frame(url, Math.round(left + (i % 2) * (outerW + gap)), Math.round(top + Math.floor(i / 2) * (outerH + gap)), w, opts)).join("");
}

async function main() {
  if (!CHROME) throw new Error("Google Chrome was not found. Set CHROME_PATH to chrome.exe.");
  const tmp = path.join(here, ".tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const shell = path.join(tmp, "frames.html");
  const font = pathToFileURL(path.join(here, "fonts", "Montserrat.ttf")).href;
  fs.writeFileSync(shell, `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:"Montserrat";src:url("${font}");font-weight:100 900}\n${scene.CSS}\n${ART_CSS}</style></head><body></body></html>`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--allow-file-access-from-files", "--font-render-hinting=none"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1100, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(shell).href);
  const show = (html) =>
    page.evaluate(async (h) => {
      document.body.innerHTML = h;
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    }, html);

  // 1. the four sample pictures
  const urls = [];
  for (const [i, spec] of SAMPLES.entries()) {
    await show(ART[spec.t](spec, ART_W, ART_H, rng("frame-set-" + i)));
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: ART_W, height: ART_H }, encoding: "base64" });
    urls.push("data:image/png;base64," + png);
  }

  // 2. on a wall (the card picture, 4:5)
  await show(`<div class="scene" style="width:800px;height:1000px;background:${wallBg("linen")}"><div class="light"></div>${grid(urls, 400, 490, 236, 34)}${label(400, 490)}<div class="vig"></div></div>`);
  await page.screenshot({ path: path.join(outDir, "white-texture-set.webp"), clip: { x: 0, y: 0, width: 800, height: 1000 }, type: "webp", quality: 82 });

  // 3. above a sofa, for scale (4:3)
  const sofa = scene.room({ url: urls[0], w: 1, h: 1 }, { panels: 1, wall: "linen", room: "sofa", frame: "white" });
  // the room from scene.mjs, with its single sample frame swapped for the set of four
  const roomShell = sofa.replace(/<div class="fr"[\s\S]*?<\/div><\/div>(?=<div class="vig">)/, "");
  await show(roomShell.replace('<div class="vig">', `${grid(urls, 600, 262, 118, 20, { width: 7, mat: 8 })}<div class="vig">`));
  await page.screenshot({ path: path.join(outDir, "white-texture-set-room.webp"), clip: { x: 0, y: 0, width: 1200, height: 900 }, type: "webp", quality: 76 });

  await browser.close();
  for (const f of ["white-texture-set.webp", "white-texture-set-room.webp"]) console.log(f, Math.round(fs.statSync(path.join(outDir, f)).size / 1024) + " KB");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

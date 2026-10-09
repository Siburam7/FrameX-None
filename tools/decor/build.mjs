/* ==========================================================================
   Builds the product images for FrameX Home Decor & Wall Art.

     cd tools/decor
     npm install            (once)
     npm run build          every design in js/decor.js
     node build.mjs --only=hd-never-give-up,hd-mountain-dawn
     node build.mjs --sheet=sheet.png        also saves one picture of all card images

   For each design it draws the artwork (art/*.mjs) in Chrome, then composes the
   product photos (scene.mjs) and saves them to assets/img/decor/:
     <id>.webp        the framed piece on a wall (card image, front view)
     <id>-room.webp   in a room
     <id>-set.webp    multi-panel sets only: the panels straight on
     art/<id>.webp    the artwork alone, flat and unframed: what "View on My Wall" hangs on the
                      customer's wall, in the frame colour and size they chose (js/decor.js -> decor.art)

     node build.mjs --art-only        only (re)writes the art/ pictures; the product photos are left as they are

   Needs Google Chrome. Set CHROME_PATH if it is not in the usual place.
   Run it again after adding or changing a design in js/decor.js.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { ART, ART_CSS } from "./art/index.mjs";
import { rng } from "./art/core.mjs";
import * as scene from "./scene.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const outDir = path.resolve(args.out ? String(args.out) : path.join(root, "assets", "img", "decor"));
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));

/** The designs: from js/decor.js (FrameX.seed.decorDesigns), or a JSON file given with --file=. */
function loadDesigns() {
  if (args.file) return JSON.parse(fs.readFileSync(path.resolve(String(args.file)), "utf8"));
  const window = { FrameX: {} };
  const context = vm.createContext({ window, console });
  for (const f of ["js/edit.js", "js/decor.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), context, { filename: f });
  return window.FrameX.seed.decorDesigns;
}

/** Artwork size in pixels for a design: one piece, or the whole width of a multi-panel set (gaps included). */
export function artSize(d) {
  const panels = d.panels || 1;
  if (panels > 1) {
    const gap = d.gap ?? 34;
    const h = d.stagger ? 700 : 600;
    return { w: panels * 400 + (panels - 1) * gap, h, gap };
  }
  return { portrait: { w: 800, h: 1000 }, landscape: { w: 1000, h: 800 }, square: { w: 900, h: 900 } }[d.format || "portrait"];
}

const FONT_FILES = { Anton: "Anton", "Bebas Neue": "BebasNeue", "Playfair Display": ["Playfair", "PlayfairItalic"], Montserrat: "Montserrat", Pacifico: "Pacifico", "Dancing Script": "DancingScript", "Space Mono": ["SpaceMono", null, "SpaceMonoBold"], "Press Start 2P": "PressStart", Orbitron: "Orbitron", Monoton: "Monoton", "Abril Fatface": "Abril", Righteous: "Righteous", Caveat: "Caveat", Fredoka: "Fredoka", Oswald: "Oswald" };
function fontCss() {
  const url = (file) => pathToFileURL(path.join(here, "fonts", file + ".ttf")).href;
  return Object.entries(FONT_FILES)
    .map(([family, files]) => {
      const [regular, italic, bold] = Array.isArray(files) ? files : [files];
      const variable = !bold;
      return [
        `@font-face{font-family:"${family}";src:url("${url(regular)}");font-weight:${variable ? "100 900" : "400"};font-style:normal}`,
        italic ? `@font-face{font-family:"${family}";src:url("${url(italic)}");font-weight:100 900;font-style:italic}` : "",
        bold ? `@font-face{font-family:"${family}";src:url("${url(bold)}");font-weight:700;font-style:normal}` : "",
      ].join("");
    })
    .join("\n");
}

/* Runs in the page: scale [data-fit] text to its row, then shrink a block that is taller than its box. */
function fitText() {
  document.querySelectorAll("[data-fit]").forEach((el) => {
    const row = el.parentElement;
    const cs = getComputedStyle(row);
    const target = (row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * (parseFloat(el.dataset.fit) || 1);
    el.style.fontSize = "100px";
    const w = el.getBoundingClientRect().width;
    if (w > 0) el.style.fontSize = Math.min((100 * target) / w, parseFloat(el.dataset.max || 9999)) + "px";
  });
  document.querySelectorAll("[data-fith]").forEach((boxEl) => {
    const inner = boxEl.firstElementChild;
    if (!inner) return;
    const cs = getComputedStyle(boxEl);
    const room = boxEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const h = inner.offsetHeight;
    if (h > room) {
      const k = room / h;
      inner.style.transform = `scale(${k})`;
      inner.style.transformOrigin = "center";
      inner.style.margin = `${(-h * (1 - k)) / 2}px 0`;
    }
  });
}

async function main() {
  if (!CHROME) throw new Error("Google Chrome was not found. Set CHROME_PATH to chrome.exe.");
  let designs = loadDesigns();
  if (args.only) designs = designs.filter((d) => String(args.only).split(",").includes(d.id));
  if (args.slice) designs = designs.slice(...String(args.slice).split(",").map(Number));
  fs.mkdirSync(outDir, { recursive: true });
  const artDir = path.join(outDir, "art");
  fs.mkdirSync(artDir, { recursive: true });
  const artOnly = Boolean(args["art-only"]);
  const tmp = path.join(here, ".tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const shell = path.join(tmp, "render.html");
  fs.writeFileSync(shell, `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}\n${scene.CSS}\n${ART_CSS}</style></head><body></body></html>`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--allow-file-access-from-files", "--font-render-hinting=none"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 2600, height: 1400, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(shell).href);
  page.on("pageerror", (e) => console.error("page error:", e.message));

  const show = async (html) => {
    await page.evaluate(async (h) => {
      document.body.innerHTML = h;
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    }, html);
  };
  const shot = (w, h, file, quality) => page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h }, ...(file.endsWith(".png") ? {} : { type: "webp", quality }) });
  /** Local pictures (public-domain artworks) are handed to the page as data. */
  const dataUrl = (file) => `data:image/${path.extname(file).slice(1).replace("jpg", "jpeg")};base64,${fs.readFileSync(path.join(here, "sources", file)).toString("base64")}`;

  let done = 0;
  const started = Date.now();
  for (const d of args.sheetOnly ? [] : designs) {
    const size = artSize(d);
    const template = ART[d.art.t];
    if (!template) throw new Error(`Design "${d.id}" uses an unknown template "${d.art.t}".`);
    const spec = d.art.src ? { ...d.art, url: dataUrl(d.art.src) } : d.art;
    // 1. the artwork
    await show(template(spec, size.w, size.h, rng(d.art.seed || d.id), { panels: d.panels || 1, gap: size.gap || 0 }));
    await page.evaluate(fitText);
    // The artwork alone, for the Live Demo. A custom-photo design has none: the customer's own photo is the artwork.
    if (!d.custom) await shot(size.w, size.h, path.join(artDir, `${d.id}.webp`), 84);
    if (artOnly) {
      done += 1;
      if (done % 40 === 0) console.log(`${done} / ${designs.length} designs`);
      continue;
    }
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: size.w, height: size.h }, encoding: "base64" });
    const url = await page.evaluate(async (b64) => {
      const blob = await (await fetch("data:image/png;base64," + b64)).blob();
      const u = URL.createObjectURL(blob);
      const img = new Image();
      img.src = u;
      await img.decode();
      return u;
    }, png);
    const art = { url, w: size.w, h: size.h };
    const opts = { panels: d.panels || 1, gap: size.gap || 0, stagger: Boolean(d.stagger), frame: d.frame || "black", wall: d.wall || "linen", room: d.room || "sofa", mat: Boolean(d.mat) };
    // 2. the product photos
    await show(scene.front(art, opts));
    await shot(800, 1000, path.join(outDir, `${d.id}.webp`), 80);
    await show(scene.room(art, opts));
    await shot(1200, 900, path.join(outDir, `${d.id}-room.webp`), 74);
    if (opts.panels > 1) {
      await show(scene.flat(art, opts));
      await shot(1200, 800, path.join(outDir, `${d.id}-set.webp`), 78);
    }
    await page.evaluate((u) => URL.revokeObjectURL(u), url);
    done += 1;
    if (done % 20 === 0) console.log(`${done} / ${designs.length} designs`);
  }

  // Shared views: the back of a frame and a corner close-up, once per frame colour.
  if (!args.only && !args.file && !args.sheetOnly && !artOnly)
    for (const color of Object.keys(scene.FRAMES)) {
      await show(scene.back({ frame: color }));
      await shot(800, 1000, path.join(outDir, `_back-${color}.webp`), 78);
      await show(scene.corner({ frame: color }));
      await shot(800, 1000, path.join(outDir, `_corner-${color}.webp`), 78);
    }

  if (args.sheet) {
    const cols = Number(args.cols) || 8;
    const cell = 300;
    const rows = Math.ceil(designs.length / cols);
    await page.setViewport({ width: cols * cell, height: Math.min(rows * cell * 1.25 + 10, 16000), deviceScaleFactor: 1 });
    await show(`<div style="display:grid;grid-template-columns:repeat(${cols},${cell}px);background:#222">${designs.map((d) => `<div style="position:relative"><img src="${pathToFileURL(path.join(outDir, `${d.id}${args.view ? "-" + args.view : ""}.webp`)).href}?t=${Date.now()}" style="width:${cell}px;display:block"><span style="position:absolute;left:4px;bottom:4px;font:11px monospace;color:#fff;background:rgba(0,0,0,.6);padding:1px 4px">${d.id}</span></div>`).join("")}</div>`);
    await page.screenshot({ path: path.resolve(String(args.sheet)), fullPage: true });
  }

  await browser.close();
  const bytes = fs.readdirSync(outDir).reduce((sum, f) => sum + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`${done} designs rendered in ${Math.round((Date.now() - started) / 1000)} s -> ${outDir} (${(bytes / 1048576).toFixed(1)} MB in the folder)`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

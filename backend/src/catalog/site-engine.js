/* ==========================================================================
   The website's catalogue and pricing code, loaded on the server.

   Products, templates, Studio options and the functions that price them are
   written once, in the website's own files. The backend runs those same files
   (in an isolated context, no browser needed) so that:
     - the catalogue is imported into the database from one source, and
     - the server prices a cart line with exactly the code the customer saw,
       without ever accepting a price from the browser.

   Files are read from CATALOG_DIR (default: the project folder).
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { config } from "../config.js";

// Load order matters: each file adds to one shared "FrameX" object.
const FILES = [
  "assets/js/services/pricing.js", // size options, price for a size
  "js/edit.js", // shops + products
  "js/decor.js", // Home Decor & Wall Art products, and the rules for custom-photo sets
  "js/templates.js", // design templates
  "js/studio.js", // FrameX Studio options and their prices
  "assets/js/services/product-model.js", // product schema, quote(), cartLine()
  "assets/js/services/template-engine.js", // photo slots of a template
  "assets/js/services/studio-engine.js" // design rules, price(), validate(), summary()
];

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// A site published before Home Decor existed has no js/decor.js: it is simply skipped.
const OPTIONAL = new Set(["js/decor.js"]);

let engine = null;

function load() {
  const dir = config.catalogDir;
  const missing = FILES.filter((f) => !OPTIONAL.has(f) && !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    throw new Error(
      `The website's catalogue files were not found in ${dir} (missing: ${missing.join(", ")}). ` +
        "Deploy the backend together with the website's js/ and assets/js/ folders, or set CATALOG_DIR to the folder that contains them."
    );
  }
  const warnings = [];
  const note = (...args) => warnings.push(args.join(" "));
  const window = {
    FrameX: {
      // The only settings and helpers these files read.
      config: { currency: "INR", locale: "en-IN", lowStockThreshold: 5 },
      dom: { escapeHtml }
    }
  };
  const context = vm.createContext({ window, console: { log() {}, info() {}, debug() {}, warn: note, error: note } });
  for (const file of FILES) {
    if (OPTIONAL.has(file) && !fs.existsSync(path.join(dir, file))) continue;
    vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), context, { filename: file });
  }
  const fx = window.FrameX;
  if (!fx.seed || !Array.isArray(fx.seed.products) || !fx.productModel || !fx.productModel.cartLine || !fx.studioEngine) {
    throw new Error(`The website's catalogue files in ${dir} did not load completely.`);
  }
  return { seed: fx.seed, model: fx.productModel, studio: fx.studioEngine, templates: fx.templateEngine, decor: fx.decorRules || null, warnings };
}

/** { seed, model, studio, templates, decor, warnings } — loaded once. */
export function siteEngine() {
  engine = engine || load();
  return engine;
}

/** Tests only: read the files again. */
export function reloadSiteEngine() {
  engine = null;
  return siteEngine();
}

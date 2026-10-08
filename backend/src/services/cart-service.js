/* ==========================================================================
   Cart: one cart per account, kept in the database.

     users ──1:1── carts ──1:n── cart_items

   Rules every function here follows:
     - The cart is found from the logged-in user's id. No function takes a cart
       id from the browser, so there is no id a customer could change to reach
       someone else's cart. An item id only works inside the caller's own cart.
     - The browser sends WHAT it wants (product id, option ids, quantity, or a
       Studio design). Names, option labels, availability and prices are worked
       out here from the catalogue tables with the website's own pricing code
       (src/catalog/site-engine.js). A price sent by a browser is never read.
     - Every read re-checks each line against the current catalogue, so a
       product that was removed, sold out or re-priced shows up as such.
     - A product that is made from the customer's photo (a photo frame, a
       custom frame, a template, a "your photo" wall-art set) can only be added
       with every photo it needs. The photos are uploads of the same account
       (upload-service.js); how many are needed is decided by the product's
       type (productModel.photoRequirement), never by the browser.
   ========================================================================== */
import crypto from "node:crypto";
import { siteEngine } from "../catalog/site-engine.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { HttpError, errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";
import { productsById, templatesById } from "./catalog-service.js";
import { ownUploads, publicUpload } from "./upload-service.js";

const STUDIO_SHOP = { id: "framex-studio", name: "FrameX custom designs" };
const FALLBACK_IMAGE = "assets/img/ui/frame-decor.webp";
const SELECTION_KEYS = ["sizeId", "colorId", "printMaterialId", "protection"];

// What checkout needs from a line but the website never sees (not part of the JSON answer).
const INTERNAL = Symbol("cart line details");

const issue = (code, message) => ({ code, message });
const fail = (status, i) => new HttpError(status, i.code, i.message);
const STATUS_FOR = { PRODUCT_UNAVAILABLE: 409, OUT_OF_STOCK: 409, TEMPLATE_UNAVAILABLE: 409, QUANTITY_LIMIT: 409, OPTION_UNAVAILABLE: 422, DESIGN_INCOMPLETE: 422, CUSTOMIZATION_INVALID: 422, PHOTOS_REQUIRED: 422 };

/* ---------------------------------------------------------------- The customer's photos */

const NO_UPLOADS = new Map();

/** The pixel size as a viewer shows it (a phone photo taken upright is stored on its side with an EXIF note). */
const shownSize = (u) => (u.orientation >= 5 && u.orientation <= 8 ? { width: u.height, height: u.width } : { width: u.width, height: u.height });

/**
 * The photos sent for a line, reduced to the spaces the product has and to
 * uploads that really belong to this account.
 * -> [{ slot, uploadId, placement }]
 */
function photosFor(slots, sent, uploads) {
  return siteEngine()
    .model.cleanPhotos(slots, sent)
    .filter((p) => uploads.has(p.uploadId));
}

/** What the website shows for a line's photos (never where the files are). */
const describePhotos = (photos, uploads) => photos.map((p) => ({ slot: p.slot, placement: p.placement, ...publicUpload(uploads.get(p.uploadId)) }));

/* ---------------------------------------------------------------- Product lines */

/** Keep only the four option ids, as short strings. */
export function cleanSelection(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  for (const key of SELECTION_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value.length <= 80 && value.trim()) out[key] = value.trim();
  }
  return out;
}

/**
 * Home Decor "your photo" sets are made from the customer's own picture: the
 * line carries the layout, spacing, frame thickness and where the photo sits.
 * js/decor.js (the same file the customiser uses) cleans and checks it; for
 * every other product a customisation sent by a browser is ignored.
 * -> { value: the cleaned customisation or null, problems: [text] }
 */
function customFor(p, customization) {
  const rules = siteEngine().decor;
  if (!rules || !rules.isCustomPhoto(p)) return { value: null, problems: [] };
  return rules.cleanCustomization(p, customization);
}

/**
 * Check a product line against the catalogue.
 * -> { issue } when it can't be ordered as asked, otherwise the priced line.
 */
function evaluateProduct(product, selection, customization = null, sentPhotos = null, uploads = NO_UPLOADS) {
  if (!product || product.status !== "ACTIVE") return { issue: issue("PRODUCT_UNAVAILABLE", "This product is no longer available.") };
  const { model } = siteEngine();
  const p = model.normalize(product.data);
  const limits = model.orderLimits(p);
  const line = model.cartLine(p, selection);
  // How many photos this product (in this size) is made from, and which of the sent ones count.
  const need = model.photoRequirement(p, line.selection);
  const photos = photosFor(need.slots, sentPhotos, uploads);
  let given = customization;
  if (need.count === 1 && photos.length === 1 && given && typeof given === "object" && given.photo && typeof given.photo === "object") {
    // A "your photo" set: the file's name and pixel size are the uploaded file's, not what the browser says.
    const u = uploads.get(photos[0].uploadId);
    given = { ...given, photo: { ...given.photo, name: u.original_name, ...shownSize(u) } };
  }
  const custom = customFor(p, given);
  const base = { p, limits, line, customization: custom.value, need, photos };
  if (!limits.orderable) return { ...base, issue: issue("OUT_OF_STOCK", "This product is out of stock.") };
  if (line.problems.length) return { ...base, issue: issue("OPTION_UNAVAILABLE", line.problems[0]) };
  if (photos.length < need.count) return { ...base, issue: issue("PHOTOS_REQUIRED", model.photoProblem(need.count, photos.length)) };
  if (custom.problems.length) return { ...base, issue: issue("CUSTOMIZATION_INVALID", custom.problems[0]) };
  return base;
}

// A personalised line is its own line: the same product with another photo or layout never merges into it.
const productLineKey = (productId, selection, note, customization = null, photos = []) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify([productId, SELECTION_KEYS.map((k) => selection[k] ?? null), note].concat(customization ? [customization] : [], photos.length ? [photos] : [])))
    .digest("hex")
    .slice(0, 40);

/* ---------------------------------------------------------------- Studio designs */

const SAFE_ID = /^[A-Za-z0-9][\w.:-]{0,79}$/;
const DESIGN_ID = /^d-[a-z0-9]{4,40}$/;
const safeId = (value) => (typeof value === "string" && SAFE_ID.test(value) ? value : null);
const within = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// Printable text only: no control characters.
const plainText = (value, max) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, max);

/** A small preview picture: an inline JPEG / PNG / WebP, or one of the site's own images. */
export function cleanThumbnail(value) {
  if (typeof value !== "string" || !value) return null;
  if (value.length <= 48_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  if (value.length <= 200 && /^assets\/[\w\-./]+\.(webp|jpe?g|png)$/i.test(value) && !value.includes("..")) return value;
  return null;
}

/**
 * A design from the browser, rebuilt field by field: start from the defaults
 * for this template / product and copy over only known fields of the expected
 * type. Nothing else from the request reaches the database.
 */
function cleanDesign(input, ctx, studio) {
  const src = input && typeof input === "object" ? input : {};
  const part = (key) => (src[key] && typeof src[key] === "object" && !Array.isArray(src[key]) ? src[key] : {});
  const out = studio.defaults(ctx);
  const copyId = (from, to, key) => {
    if (safeId(from[key])) to[key] = from[key];
  };

  ["typeId", "colorId", "finishId"].forEach((k) => copyId(part("frame"), out.frame, k));
  ["type", "colorId", "color2Id", "widthId"].forEach((k) => copyId(part("mat"), out.mat, k));
  copyId(part("border"), out.border, "colorId");
  out.border.width = within(part("border").width, 0, 1000, out.border.width);
  ["sizeId", "orientation", "protection", "printMaterialId"].forEach((k) => copyId(src, out, k));

  for (const slot of ctx.caps.photoSlots) {
    const photoId = safeId(part("photos")[slot]);
    if (!photoId) continue;
    out.photos[slot] = photoId;
    const meta = part("photoMeta")[slot];
    if (meta && typeof meta === "object") out.photoMeta[slot] = { w: Math.round(within(meta.w, 1, 100_000, 1)), h: Math.round(within(meta.h, 1, 100_000, 1)) };
    const crop = part("crop")[slot];
    if (crop && typeof crop === "object") {
      out.crop[slot] = {
        fit: ["fill", "fit", "crop"].includes(crop.fit) ? crop.fit : "fill",
        zoom: within(crop.zoom, 1, 4, 1),
        px: within(crop.px, 0, 100, 50),
        py: within(crop.py, 0, 100, 50),
        rotate: within(crop.rotate, 0, 359, 0)
      };
    }
  }

  out.text = {};
  out.textStyle = {};
  if (ctx.caps.text) {
    for (const field of ctx.caps.textFields) {
      const given = part("text")[field.id];
      out.text[field.id] = typeof given === "string" ? plainText(given, field.maxLength || 80) : field.defaultValue || "";
      const style = part("textStyle")[field.id];
      if (ctx.caps.textStyle && style && typeof style === "object") {
        const clean = {};
        ["fontId", "sizeId", "colorId"].forEach((k) => copyId(style, clean, k));
        if (["left", "center", "right"].includes(style.align)) clean.align = style.align;
        if (style.dy !== undefined) clean.dy = within(style.dy, -1000, 1000, 0);
        out.textStyle[field.id] = clean;
      }
    }
  }

  const background = src.background;
  out.background = null;
  if (ctx.caps.background && background && typeof background === "object") {
    out.background = { colorId: safeId(background.colorId) || "", pattern: safeId(background.pattern) || "" };
  }
  return out;
}

// The choices that decide what is made and what it costs.
const pricedChoices = (cfg) =>
  JSON.stringify([cfg.frame.typeId, cfg.frame.colorId, cfg.frame.finishId, cfg.mat.type, cfg.sizeId, cfg.orientation, cfg.protection, cfg.printMaterialId, Number(cfg.border.width) || 0].map((x) => x ?? null));

/**
 * Check a Studio design against the catalogue and price it.
 * -> { issue } when it can't be made as designed, otherwise { config, price, ... }.
 */
function evaluateDesign(input, lookups, sentPhotos = null) {
  const { model, studio } = siteEngine();
  const uploads = lookups.uploads || NO_UPLOADS;
  const src = input && typeof input === "object" ? input : {};
  const mode = ["template", "photo", "product"].includes(src.mode) ? src.mode : null;
  if (!mode) return { issue: issue("DESIGN_INCOMPLETE", "This design can't be read. Open it in FrameX Studio and add it again.") };

  let template = null;
  let product = null;
  let normalized = null;
  if (mode === "template") {
    template = lookups.templates.get(src.templateId);
    if (!template || template.status !== "ACTIVE") return { issue: issue("TEMPLATE_UNAVAILABLE", "This design template is no longer available.") };
  }
  if (mode === "product") {
    product = lookups.products.get(src.productId);
    if (!product || product.status !== "ACTIVE") return { issue: issue("PRODUCT_UNAVAILABLE", "This frame is no longer available.") };
    normalized = model.normalize(product.data);
    if (!model.orderLimits(normalized).orderable) return { product, issue: issue("OUT_OF_STOCK", "This frame is out of stock.") };
    if (!model.studioSupport(normalized).ok) return { product, issue: issue("PRODUCT_UNAVAILABLE", "This frame can't be customised in FrameX Studio any more.") };
  }

  const ctx = studio.context({ template: template ? template.data : null, product: normalized });
  const cfg = cleanDesign(src, ctx, studio);
  const asked = pricedChoices(cfg);
  studio.normalize(cfg, ctx);
  // Every photo space of the design needs an uploaded original of this account.
  const slots = ctx.caps.photoSlots;
  const photos = photosFor(slots, sentPhotos, uploads);
  const need = { type: mode === "template" ? "template" : "custom-frame", count: slots.length, slots };
  const base = { template, product, normalized, ctx, config: cfg, need, photos };
  if (pricedChoices(cfg) !== asked) return { ...base, issue: issue("OPTION_UNAVAILABLE", "This design uses an option that is no longer offered. Open it in FrameX Studio and choose again.") };
  if (photos.length < slots.length) return { ...base, issue: issue("PHOTOS_REQUIRED", model.photoProblem(slots.length, photos.length)) };
  // The design's own photo ids only matter to the device that made it; what counts here is the uploads.
  for (const p of photos) cfg.photos[p.slot] = cfg.photos[p.slot] || p.uploadId;
  const check = studio.validate(cfg, ctx);
  if (!check.ok) return { ...base, issue: issue("DESIGN_INCOMPLETE", `This design isn't finished: ${check.issues.map((i) => i.message).join("; ")}.`) };

  const price = studio.price(cfg, ctx);
  const summary = studio.summary(cfg, ctx);
  // A customised product keeps the shop's own discount on the frame.
  const frame = normalized ? model.quote(normalized, { sizeId: cfg.sizeId, printMaterialId: cfg.printMaterialId, protection: cfg.protection }) : null;
  return {
    ...base,
    price,
    summary,
    unitDiscount: frame && frame.discountPercent ? Math.max(0, frame.listPrice - frame.lines[0].amount) : 0,
    name: template ? template.data.title : product ? product.name : "Framed photo",
    maxQty: normalized ? model.orderLimits(normalized).maxQty : model.MAX_CART_QTY
  };
}

/* ---------------------------------------------------------------- Reading a cart */

const emptyCart = () => ({ id: null, items: [], groups: [], count: 0, subtotal: 0, currency: "INR", hasIssues: false, maxQuantity: siteEngine().model.MAX_CART_QTY, updatedAt: null });

/** One stored line + the current catalogue -> what the website shows. */
function describe(row, lookups) {
  const base = {
    id: row.id,
    kind: row.kind === "STUDIO" ? "studio" : "product",
    productId: row.product_id,
    templateId: row.template_id,
    name: row.title,
    image: row.thumbnail || FALLBACK_IMAGE,
    shopId: STUDIO_SHOP.id,
    shopName: STUDIO_SHOP.name,
    size: null,
    color: null,
    options: [],
    note: row.note || "",
    quantity: row.quantity,
    maxQuantity: 0,
    unitPrice: row.unit_price,
    unitListPrice: row.unit_price, // before the product's own discount
    unitDiscount: 0,
    currency: row.currency,
    available: false,
    issue: null,
    priceChange: null,
    design: null,
    // The customer's own photos this line is made from, and how many it needs.
    photos: [],
    photosRequired: 0,
    productType: null,
    addedAt: row.created_at
  };
  const uploads = lookups.uploads || NO_UPLOADS;
  let current;

  if (row.kind === "PRODUCT") {
    const product = lookups.products.get(row.product_id);
    const ev = evaluateProduct(product, row.selection || {}, row.customization, row.photos, uploads);
    if (product) Object.assign(base, { shopId: product.shopRef, shopName: product.shopName });
    if (ev.need) Object.assign(base, { photos: describePhotos(ev.photos, uploads), photosRequired: ev.need.count, productType: ev.need.type });
    // A line made from the customer's photo shows their own preview; everything else shows the product photo.
    if (ev.p) Object.assign(base, { name: ev.p.name, image: ((ev.customization || (ev.photos && ev.photos.length)) && row.thumbnail) || ev.p.image || FALLBACK_IMAGE });
    if (ev.line && !ev.line.problems.length) Object.assign(base, { size: ev.line.size, color: ev.line.color, options: ev.line.options });
    if (ev.customization) base.design = { id: null, type: "decor-photo", summary: siteEngine().decor.describe(ev.customization), customText: {}, photoCount: 1 };
    const q = ev.line ? ev.line.quote : null;
    current = {
      issue: ev.issue || null,
      unitPrice: ev.line ? ev.line.unitPrice : null,
      unitDiscount: q && q.discountPercent ? Math.max(0, q.listPrice - q.lines[0].amount) : 0,
      currency: ev.line ? ev.line.currency : null,
      maxQty: ev.limits ? ev.limits.maxQty : 0
    };
    base[INTERNAL] = {
      cartItemId: row.id,
      kind: "PRODUCT",
      selection: ev.line ? ev.line.selection : row.selection || {},
      customization: ev.customization || null,
      designRef: null,
      cod: !product || product.data.cod !== false,
      giftWrap: !product || product.data.giftWrap !== false,
      photos: ev.photos || [],
      photosRequired: ev.need ? ev.need.count : 0,
      productType: ev.need ? ev.need.type : null
    };
  } else {
    const ev = evaluateDesign(row.customization, lookups, row.photos);
    const cfg = ev.config || row.customization || {};
    if (ev.product) Object.assign(base, { shopId: ev.product.shopRef, shopName: ev.product.shopName });
    if (ev.need) Object.assign(base, { photos: describePhotos(ev.photos, uploads), photosRequired: ev.need.count, productType: ev.need.type });
    if (ev.name) base.name = ev.name;
    base.image = row.thumbnail || (ev.template && cleanThumbnail(ev.template.data.thumbnail)) || (ev.normalized && ev.normalized.image) || FALLBACK_IMAGE;
    base.design = {
      id: row.design_ref,
      type: cfg.mode === "template" ? "template" : cfg.mode === "product" ? "product-frame" : "simple-photo",
      summary: (ev.summary || []).filter((l) => l.key !== "size").map((l) => `${l.label}: ${l.value}`),
      customText: ev.ctx && ev.ctx.caps.text ? cfg.text || {} : {},
      photoCount: Object.keys(cfg.photos || {}).length
    };
    const size = (ev.summary || []).find((l) => l.key === "size");
    if (size) base.size = size.value;
    current = { issue: ev.issue || null, unitPrice: ev.price ? ev.price.total : null, unitDiscount: ev.unitDiscount || 0, currency: ev.price ? ev.price.currency : null, maxQty: ev.maxQty || 0 };
    base.productId = ev.product ? ev.product.id : row.product_id;
    base.templateId = ev.template ? ev.template.id : row.template_id;
    base[INTERNAL] = {
      cartItemId: row.id,
      kind: "STUDIO",
      selection: {},
      customization: cfg,
      designRef: row.design_ref,
      cod: !ev.product || ev.product.data.cod !== false,
      giftWrap: !ev.product || ev.product.data.giftWrap !== false,
      photos: ev.photos || [],
      photosRequired: ev.need ? ev.need.count : 0,
      productType: ev.need ? ev.need.type : null
    };
  }

  if (current.issue) return Object.assign(base, { issue: current.issue, lineTotal: 0 });
  base.available = true;
  base.maxQuantity = current.maxQty;
  if (current.unitPrice !== row.unit_price) base.priceChange = { from: row.unit_price, to: current.unitPrice };
  base.unitPrice = current.unitPrice;
  base.unitDiscount = current.unitDiscount || 0;
  base.unitListPrice = current.unitPrice + base.unitDiscount;
  base.currency = current.currency || row.currency;
  base.lineTotal = current.unitPrice * row.quantity;
  if (row.quantity > current.maxQty) base.issue = issue("QUANTITY_LIMIT", `Only ${current.maxQty} available. Reduce the quantity to continue.`);
  return base;
}

async function loadRows(userId, q = db) {
  const { rows } = await q.query(
    `SELECT i.*, c.id AS own_cart_id, c.updated_at AS cart_updated_at
       FROM carts c
       LEFT JOIN cart_items i ON i.cart_id = c.id
      WHERE c.user_id = $1
      ORDER BY i.created_at, i.id`,
    [userId]
  );
  return rows;
}

/** The upload ids named in what a browser sent, or in a stored line. */
const uploadIdsIn = (photos) =>
  (Array.isArray(photos) ? photos.map((p) => p && p.uploadId) : photos && typeof photos === "object" ? Object.values(photos).map((v) => (typeof v === "string" ? v : v && v.uploadId)) : []).filter((id) => typeof id === "string");

async function lookupsFor(userId, rows, q = db) {
  const designs = rows.filter((r) => r.kind === "STUDIO").map((r) => r.customization || {});
  // One after the other: inside a transaction there is a single connection.
  const products = await productsById([...rows.map((r) => r.product_id), ...designs.map((d) => d.productId)], q);
  const templates = await templatesById([...rows.map((r) => r.template_id), ...designs.map((d) => d.templateId)], q);
  // Only this account's own uploads are ever looked up: someone else's photo id counts as no photo.
  const uploads = await ownUploads(userId, rows.flatMap((r) => uploadIdsIn(r.photos)), q);
  return { products, templates, uploads };
}

function assemble(rows, lookups) {
  if (!rows.length) return emptyCart();
  const items = rows.filter((r) => r.id).map((r) => describe(r, lookups));
  const good = items.filter((i) => i.available);
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.shopId)) groups.set(item.shopId, { shopId: item.shopId, shopName: item.shopName, itemIds: [], subtotal: 0 });
    const g = groups.get(item.shopId);
    g.itemIds.push(item.id);
    if (item.available) g.subtotal += item.lineTotal;
  }
  return {
    ...emptyCart(),
    id: rows[0].own_cart_id,
    items,
    groups: [...groups.values()],
    count: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: good.reduce((sum, i) => sum + i.lineTotal, 0),
    hasIssues: items.some((i) => i.issue || i.priceChange),
    updatedAt: rows[0].cart_updated_at
  };
}

/** The logged-in user's cart, checked against the current catalogue. */
export async function getCart(userId) {
  const rows = await loadRows(userId);
  return assemble(rows, await lookupsFor(userId, rows));
}

/**
 * The cart as checkout needs it: the same lines the customer sees (checked and
 * priced now), each with the details an order line stores.
 * -> { cart, lines: [{ item, cartItemId, kind, selection, customization, designRef, cod }] }
 * `q` is the order's transaction, so the cart can't change while it is read.
 */
export async function checkoutLines(userId, q = db) {
  const rows = await loadRows(userId, q);
  const cart = assemble(rows, await lookupsFor(userId, rows, q));
  return { cart, lines: cart.items.map((item) => ({ item, ...item[INTERNAL] })) };
}

/**
 * "Buy Now": one item ordered directly, without going through the cart.
 * It gets exactly the checks, labels and price a cart line gets (the same
 * code), from what the browser asked for:
 *   { kind: "product", productId, quantity, selection, note, customization?, thumbnail?, photos? }
 *   { kind: "studio", designId, config, thumbnail, quantity, photos? }
 * Nothing is stored and the cart is not touched.
 * -> the shape of checkoutLines(): { cart: { items: [item] }, lines: [...] }
 */
export async function directLines(userId, spec, q = db) {
  const design = spec.kind === "studio";
  if (design && !DESIGN_ID.test(String(spec.designId || ""))) throw errors.validation({ design: "This design can't be read. Save it in FrameX Studio and try again." });
  const row = {
    id: "buy-now",
    kind: design ? "STUDIO" : "PRODUCT",
    product_id: design ? null : spec.productId,
    template_id: null,
    selection: design ? {} : spec.selection || {},
    customization: design ? (spec.config && typeof spec.config === "object" ? spec.config : {}) : spec.customization || null,
    design_ref: design ? spec.designId : null,
    thumbnail: cleanThumbnail(spec.thumbnail),
    photos: spec.photos || [],
    note: design ? "" : spec.note || "",
    title: "Item",
    quantity: spec.quantity,
    unit_price: 0,
    currency: "INR",
    created_at: new Date()
  };
  const item = describe(row, await lookupsFor(userId, [row], q));
  item.priceChange = null; // nothing was stored earlier, so there is no "old price"
  return { cart: { items: [item] }, lines: [{ item, ...item[INTERNAL], cartItemId: null }] };
}

/**
 * Take bought items out of the cart: exactly the lines an order was made from,
 * by the quantity that was bought. Anything else in the cart stays.
 * bought: [{ cartItemId, quantity }]
 */
export async function removePurchased(q, userId, bought) {
  for (const { cartItemId, quantity } of bought) {
    if (!cartItemId) continue;
    await q.query("DELETE FROM cart_items i USING carts c WHERE i.id = $1 AND c.id = i.cart_id AND c.user_id = $2 AND i.quantity <= $3", [cartItemId, userId, quantity]);
    await q.query("UPDATE cart_items i SET quantity = i.quantity - $3, updated_at = now() FROM carts c WHERE i.id = $1 AND c.id = i.cart_id AND c.user_id = $2 AND i.quantity > $3", [cartItemId, userId, quantity]);
  }
  await q.query("UPDATE carts SET updated_at = now() WHERE user_id = $1", [userId]);
}

/* ---------------------------------------------------------------- Changing a cart */

async function ensureCart(q, userId) {
  await q.query("INSERT INTO carts (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING", [newId(), userId]);
  return (await q.query("SELECT id FROM carts WHERE user_id = $1", [userId])).rows[0].id;
}

const touch = (q, cartId) => q.query("UPDATE carts SET updated_at = now() WHERE id = $1", [cartId]);

async function roomFor(q, cartId, lineKey) {
  const { rows } = await q.query("SELECT count(*)::int AS lines, count(*) FILTER (WHERE line_key = $2)::int AS same FROM cart_items WHERE cart_id = $1", [cartId, lineKey]);
  if (!rows[0].same && rows[0].lines >= config.cart.maxLines) throw new HttpError(409, "CART_FULL", `A cart can hold up to ${config.cart.maxLines} different items. Remove one to add another.`);
}

const limitMessage = (max, had) => (had ? `You can have up to ${max} of this item in your cart, and ${had} ${had === 1 ? "is" : "are"} already there.` : `You can add up to ${max} of this item.`);

/**
 * Add a listed product. Same product + options + note (+ the same photos) adds to the existing line.
 * customization is only kept for Home Decor custom-photo sets; photos only for
 * products that are made from the customer's photo, and then all of them are required.
 */
export async function addProduct(userId, { productId, quantity, selection, note, customization = null, thumbnail = null, photos = null }) {
  const product = (await productsById([productId])).get(productId);
  if (!product) throw errors.notFound("We couldn't find that product.", "PRODUCT_NOT_FOUND");
  const ev = evaluateProduct(product, selection, customization, photos, await ownUploads(userId, uploadIdsIn(photos)));
  if (ev.issue) throw fail(STATUS_FOR[ev.issue.code], ev.issue);
  const lineKey = productLineKey(product.id, ev.line.selection, note, ev.customization, ev.photos);
  const personal = Boolean(ev.customization || ev.photos.length);

  const itemId = await db.tx(async (q) => {
    const cartId = await ensureCart(q, userId);
    await roomFor(q, cartId, lineKey);
    const { rows } = await q.query(
      `INSERT INTO cart_items (id, cart_id, kind, product_id, line_key, quantity, selection, note, title, unit_price, currency, customization, thumbnail, photos)
       VALUES ($1, $2, 'PRODUCT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (cart_id, line_key) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, title = EXCLUDED.title,
         unit_price = EXCLUDED.unit_price, currency = EXCLUDED.currency, thumbnail = coalesce(EXCLUDED.thumbnail, cart_items.thumbnail), updated_at = now()
       RETURNING id, quantity`,
      [newId(), cartId, product.id, lineKey, quantity, JSON.stringify(ev.line.selection), note, ev.p.name, ev.line.unitPrice, ev.line.currency, ev.customization ? JSON.stringify(ev.customization) : null, personal ? cleanThumbnail(thumbnail) : null, JSON.stringify(ev.photos)]
    );
    // Over the limit: the whole change is rolled back.
    if (rows[0].quantity > ev.limits.maxQty) throw fail(409, issue("QUANTITY_LIMIT", limitMessage(ev.limits.maxQty, rows[0].quantity - quantity)));
    await touch(q, cartId);
    return rows[0].id;
  });
  return { itemId, cart: await getCart(userId) };
}

/** Add a FrameX Studio design. Adding the same design again replaces it and adds one more. */
export async function addDesign(userId, { designId, config: design, thumbnail, quantity, photos = null }) {
  if (!DESIGN_ID.test(String(designId || ""))) throw errors.validation({ design: "This design can't be read. Save it in FrameX Studio and add it again." });
  const src = design && typeof design === "object" ? design : {};
  const lookups = { products: await productsById([src.productId]), templates: await templatesById([src.templateId]), uploads: await ownUploads(userId, uploadIdsIn(photos)) };
  const ev = evaluateDesign(src, lookups, photos);
  if (ev.issue) throw fail(STATUS_FOR[ev.issue.code], ev.issue);
  const lineKey = `studio:${designId}`;

  const itemId = await db.tx(async (q) => {
    const cartId = await ensureCart(q, userId);
    await roomFor(q, cartId, lineKey);
    const { rows } = await q.query(
      `INSERT INTO cart_items (id, cart_id, kind, product_id, template_id, line_key, quantity, customization, design_ref, thumbnail, title, unit_price, currency, photos)
       VALUES ($1, $2, 'STUDIO', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (cart_id, line_key) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, customization = EXCLUDED.customization,
         product_id = EXCLUDED.product_id, template_id = EXCLUDED.template_id, thumbnail = EXCLUDED.thumbnail, title = EXCLUDED.title,
         unit_price = EXCLUDED.unit_price, currency = EXCLUDED.currency, photos = EXCLUDED.photos, updated_at = now()
       RETURNING id, quantity`,
      [newId(), cartId, ev.product ? ev.product.id : null, ev.template ? ev.template.id : null, lineKey, quantity, JSON.stringify(ev.config), designId, cleanThumbnail(thumbnail), ev.name, ev.price.total, ev.price.currency, JSON.stringify(ev.photos)]
    );
    if (rows[0].quantity > ev.maxQty) throw fail(409, issue("QUANTITY_LIMIT", limitMessage(ev.maxQty, rows[0].quantity - quantity)));
    await touch(q, cartId);
    return rows[0].id;
  });
  return { itemId, cart: await getCart(userId) };
}

/** The caller's own line, or 404. Another user's item id looks exactly like one that doesn't exist. */
async function ownItem(q, userId, itemId) {
  if (!isUuid(itemId)) throw errors.notFound("That item isn't in your cart.", "CART_ITEM_NOT_FOUND");
  const { rows } = await q.query("SELECT i.* FROM cart_items i JOIN carts c ON c.id = i.cart_id WHERE i.id = $1 AND c.user_id = $2", [itemId, userId]);
  if (!rows[0]) throw errors.notFound("That item isn't in your cart.", "CART_ITEM_NOT_FOUND");
  return rows[0];
}

export async function setQuantity(userId, itemId, quantity) {
  await db.tx(async (q) => {
    const row = await ownItem(q, userId, itemId);
    const line = describe(row, await lookupsFor(userId, [row], q));
    if (!line.available) throw fail(409, issue(line.issue.code, `${line.issue.message} Remove it from your cart.`));
    if (quantity > line.maxQuantity) throw fail(409, issue("QUANTITY_LIMIT", `You can have up to ${line.maxQuantity} of this item in your cart.`));
    // The line now carries today's price.
    await q.query("UPDATE cart_items SET quantity = $2, unit_price = $3, title = $4, updated_at = now() WHERE id = $1", [row.id, quantity, line.unitPrice, line.name]);
    await touch(q, row.cart_id);
  });
  return { cart: await getCart(userId) };
}

export async function removeItem(userId, itemId) {
  await db.tx(async (q) => {
    const row = await ownItem(q, userId, itemId);
    await q.query("DELETE FROM cart_items WHERE id = $1", [row.id]);
    await touch(q, row.cart_id);
  });
  return { cart: await getCart(userId) };
}

export async function clearCart(userId) {
  await db.tx(async (q) => {
    const { rows } = await q.query("SELECT id FROM carts WHERE user_id = $1", [userId]);
    if (!rows[0]) return;
    await q.query("DELETE FROM cart_items WHERE cart_id = $1", [rows[0].id]);
    await touch(q, rows[0].id);
  });
  return { cart: await getCart(userId) };
}

/**
 * The check before checkout: every line must still be orderable, in an allowed
 * quantity, at today's price. A changed price is reported once and then
 * becomes the line's price, so the customer always sees it before paying.
 */
export async function validateCart(userId) {
  const rows = await loadRows(userId);
  const cart = assemble(rows, await lookupsFor(userId, rows));
  const issues = [];
  if (!cart.items.length) issues.push({ ...issue("CART_EMPTY", "Your cart is empty."), itemId: null });
  for (const item of cart.items) {
    if (item.issue) issues.push({ ...item.issue, itemId: item.id, name: item.name });
    else if (item.priceChange) issues.push({ ...issue("PRICE_CHANGED", `The price of ${item.name} changed from ₹${item.priceChange.from} to ₹${item.priceChange.to}.`), itemId: item.id, name: item.name });
  }
  const repriced = cart.items.filter((i) => i.available && i.priceChange);
  if (repriced.length) {
    await db.tx(async (q) => {
      for (const item of repriced) await q.query("UPDATE cart_items SET unit_price = $2, updated_at = now() WHERE id = $1 AND cart_id = $3", [item.id, item.unitPrice, cart.id]);
    });
  }
  return { ok: issues.length === 0, issues, cart };
}

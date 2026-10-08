/* ==========================================================================
   Products a shop creates and manages itself.

   A shop decides what it sells: the product type, name, description,
   pictures, prices, sizes, frame and print details, components, options,
   stock, delivery notes, whether customers add their own photo (and how many)
   and whether the product can be gift wrapped.

   What stays with the platform, and is applied here whatever the browser sends:
     - a product always belongs to the logged-in shop (the shop id, Shop ID and
       seller name are never read from the request);
     - the record is rebuilt by the website's own product model
       (productModel.sanitizeShopInput): the rules of the product type decide
       the customer-photo requirement, and nothing a shop saves can claim that
       FrameX verified it;
     - publishing needs a complete product (productModel.validateForPublish),
       and with PRODUCT_MODERATION=true a FrameX admin approves it first;
     - prices are whole rupees inside sane limits; pictures must be files this
       shop uploaded (or the site's own); no scripts, no data: addresses;
     - a product of a shop that is not approved and active is never on sale.

   Shop products live in catalog_products (source = 'shop'), so the cart,
   checkout, stock and orders treat them exactly like catalogue-file products.
   ========================================================================== */
import crypto from "node:crypto";
import { siteEngine } from "../catalog/site-engine.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
import { inspectImage } from "../lib/image-info.js";
import * as storage from "../lib/storage.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

export const PRODUCT_ID = /^lp-[a-z0-9]{6,40}$/;
const STATUSES = ["draft", "pending_review", "published", "unpublished"];
const MAX_PRODUCTS = 500;
const MAX_PRICE = 1_000_000;
const MEDIA_REF = /^media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(:thumb)?$/;
const SITE_ASSET = /^assets\/[\w\-./]+\.(webp|jpe?g|png|mp4|webm)$/i;
const VIDEO_LINK = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//i;

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const notFound = () => errors.notFound("We couldn't find that product.", "PRODUCT_NOT_FOUND");
const LISTED = "s.approval_status = 'APPROVED' AND s.active_status = 'ACTIVE'";

/** The shop a session belongs to: its row, and the reference its products and order lines carry. */
export async function shopForProducts(shopId) {
  const row = (await db.query("SELECT id, shop_code, catalog_ref, name, approval_status, active_status FROM shops WHERE id = $1", [shopId])).rows[0];
  if (!row) throw errors.forbidden();
  return { id: row.id, code: row.shop_code, name: row.name, ref: row.catalog_ref || row.shop_code, listed: row.approval_status === "APPROVED" && row.active_status === "ACTIVE" };
}

/* ---------------------------------------------------------------- Pictures */

/** Every address of a picture or video inside a product record: [{ holder, key, value }]. */
function mediaFields(p) {
  const out = [];
  const add = (holder, key) => typeof holder[key] === "string" && holder[key] && out.push({ holder, key, value: holder[key] });
  (p.views || []).forEach((v) => v && (add(v, "url"), add(v, "thumb")));
  if (p.product360) {
    (p.product360.frames || []).forEach((_, i) => add(p.product360.frames, i));
    (p.product360.thumbs || []).forEach((_, i) => add(p.product360.thumbs, i));
  }
  (p.media || []).forEach((m) => m && (add(m, "url"), add(m, "thumbnail")));
  ((p.print && p.print.materials) || []).forEach((m) => m && add(m, "image"));
  (p.components || []).forEach((c) => c && add(c, "image"));
  return out;
}

/** Pictures must be this shop's own uploads or the site's own files; a video may also be a YouTube / Vimeo link. */
async function checkMedia(p, shop) {
  const fields = mediaFields(p);
  const ids = new Set();
  for (const f of fields) {
    const media = MEDIA_REF.exec(f.value);
    if (media) ids.add(media[1]);
    else if (!SITE_ASSET.test(f.value) && !(VIDEO_LINK.test(f.value) && f.value.length <= 300)) throw errors.validation({ images: "One of the pictures couldn't be used. Upload it again from your device." });
    if (f.value.includes("..")) throw errors.validation({ images: "One of the pictures couldn't be used. Upload it again from your device." });
  }
  if (ids.size) {
    const list = [...ids];
    const { rows } = await db.query(`SELECT id FROM media_files WHERE shop_id = $1 AND id IN (${list.map((_, i) => `$${i + 2}`).join(", ")})`, [shop.id, ...list]);
    if (rows.length !== list.length) throw errors.validation({ images: "One of the pictures belongs to another shop or no longer exists. Upload it again." });
  }
}

/** "media:<id>" -> "/media/<id>" (and ":thumb" -> "/thumb"), everywhere in a record that leaves the server for customers. */
function withMediaPaths(p) {
  const out = JSON.parse(JSON.stringify(p));
  for (const f of mediaFields(out)) {
    const m = MEDIA_REF.exec(f.value);
    if (m) f.holder[f.key] = `/media/${m[1]}${m[2] ? "/thumb" : ""}`;
  }
  if (typeof out.listingImage === "string") {
    const m = MEDIA_REF.exec(out.listingImage);
    if (m) out.listingImage = `/media/${m[1]}${m[2] ? "/thumb" : ""}`;
  }
  return out;
}

/** Receive one product picture from a request body (raw bytes). kind: "view" | "thumb" for an existing picture. */
export async function receiveMedia(shop, user, req, { thumbOf = null } = {}) {
  const max = config.media.maxBytes;
  const declared = Number(req.headers["content-length"]);
  const tooLarge = () => new HttpError(413, "MEDIA_TOO_LARGE", `That picture is larger than ${Math.round(max / (1024 * 1024))} MB. Please choose a smaller one.`);
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
  let parent = null;
  if (thumbOf) {
    if (!isUuid(thumbOf)) throw notFound();
    parent = (await db.query("SELECT * FROM media_files WHERE id = $1 AND shop_id = $2", [thumbOf, shop.id])).rows[0];
    if (!parent) throw errors.notFound("We couldn't find that picture.", "MEDIA_NOT_FOUND");
  } else {
    const count = (await db.query("SELECT count(*)::int AS n FROM media_files WHERE shop_id = $1", [shop.id])).rows[0].n;
    if (count >= config.media.maxPerShop) throw new HttpError(409, "MEDIA_LIMIT", "Your shop has reached its limit of uploaded pictures. Remove pictures you no longer use, or contact FrameX.");
  }
  let received;
  try {
    received = await storage.receive(req, max);
  } catch (error) {
    if (error instanceof storage.TooLarge) throw tooLarge();
    throw new HttpError(400, "MEDIA_FAILED", "We couldn't upload that picture. Please try again.");
  }
  try {
    const info = await inspectImage(received.tempPath);
    if (!info || !received.bytes) throw new HttpError(415, "MEDIA_UNSUPPORTED", "Please upload a JPG, PNG or WebP picture.");
    if (parent) {
      const key = storage.newKey("public", parent.id, "-thumb");
      await storage.keep(received.tempPath, key);
      await db.query("UPDATE media_files SET thumb_key = $2 WHERE id = $1", [parent.id, key]);
      return { id: parent.id, ref: `media:${parent.id}`, thumb: `media:${parent.id}:thumb`, width: parent.width, height: parent.height };
    }
    const id = newId();
    const key = storage.newKey("public", id);
    await storage.keep(received.tempPath, key);
    try {
      await db.query("INSERT INTO media_files (id, shop_id, storage_key, kind, mime_type, bytes, width, height, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [id, shop.id, key, "view", info.mime, received.bytes, info.width, info.height, user.id]);
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    return { id, ref: `media:${id}`, thumb: "", width: info.width, height: info.height };
  } catch (error) {
    await storage.discard(received.tempPath);
    throw error;
  }
}

/** GET /media/<id>[/thumb]: a product picture. Public, and safe to cache: a picture never changes once uploaded. */
export async function sendMedia(req, res, next) {
  const id = String(req.params.id || "");
  if (!isUuid(id)) return next();
  const row = (await db.query("SELECT storage_key, thumb_key, mime_type FROM media_files WHERE id = $1", [id])).rows[0];
  const key = row ? (req.params.variant === "thumb" && row.thumb_key ? row.thumb_key : row.storage_key) : null;
  if (!key || !(await storage.exists(key))) return next();
  res.set({ "Content-Type": key === row.thumb_key ? "image/jpeg" : row.mime_type, "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
  storage.open(key).on("error", next).pipe(res);
}

/**
 * Pictures nothing refers to any more (a picture that was replaced, an upload
 * that was never used) are removed after a week. A picture is kept while any
 * product of its shop names it, or an order shows it.
 */
export async function sweepUnusedMedia({ olderThanDays = 7 } = {}) {
  const { rows } = await db.query(
    `SELECT m.id, m.storage_key, m.thumb_key FROM media_files m
      WHERE m.shop_id IS NOT NULL AND m.created_at < now() - ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM catalog_products p WHERE p.owner_shop_id = m.shop_id AND p.status <> 'REMOVED' AND p.data::text LIKE '%' || m.id::text || '%')
        AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.image LIKE '%' || m.id::text || '%')
      LIMIT 500`,
    [String(olderThanDays)]
  );
  for (const row of rows) {
    await db.query("DELETE FROM media_files WHERE id = $1", [row.id]);
    await storage.remove(row.storage_key);
    if (row.thumb_key) await storage.remove(row.thumb_key);
  }
  return rows.length;
}

/* ---------------------------------------------------------------- Reading */

const SHOP_SQL = `SELECT p.*, s.shop_code, s.catalog_ref, s.name AS owner_name, (${LISTED}) AS owner_listed FROM catalog_products p JOIN shops s ON s.id = p.owner_shop_id`;

/** The record as the shop's dashboard edits it (pictures stay as "media:" references). */
const forOwner = (row) => ({ ...row.data, id: row.id, slug: row.slug, shopId: row.catalog_ref || row.shop_code, status: row.listing_status || "draft", source: "dashboard", onSale: row.status === "ACTIVE" && row.owner_listed });

/** The record as customers get it: resolved picture addresses, the seller's name, stock that orders haven't taken. */
function forCustomers(row) {
  const data = withMediaPaths(row.data);
  const stock = data.availability && typeof data.availability.stock === "number" ? Math.max(0, data.availability.stock - (row.stock_reserved || 0)) : null;
  if (stock !== null) data.availability = { ...data.availability, stock, ...(stock === 0 ? { status: "out_of_stock" } : {}) };
  return { ...data, id: row.id, slug: row.slug, shopId: row.catalog_ref || row.shop_code, shopName: row.owner_name, status: "published", source: "shop" };
}

export async function listOwn(shop) {
  const { rows } = await db.query(`${SHOP_SQL} WHERE p.owner_shop_id = $1 AND p.status <> 'REMOVED' ORDER BY p.updated_at DESC`, [shop.id]);
  return rows.map(forOwner);
}

async function ownRow(shop, id, q = db) {
  if (!PRODUCT_ID.test(String(id || ""))) throw notFound();
  const row = (await q.query(`${SHOP_SQL} WHERE p.id = $1 AND p.owner_shop_id = $2 AND p.status <> 'REMOVED'`, [id, shop.id])).rows[0];
  if (!row) throw notFound();
  return row;
}

export const getOwn = async (shop, id) => forOwner(await ownRow(shop, id));

/** Every product of every listed shop that is on sale: what the website adds to its catalogue. */
export async function publicShopProducts() {
  const { rows } = await db.query(`${SHOP_SQL} WHERE p.source = 'shop' AND p.status = 'ACTIVE' AND ${LISTED} ORDER BY p.updated_at DESC LIMIT 2000`);
  return rows.map(forCustomers);
}

/* ---------------------------------------------------------------- Writing */

function checkNumbers(p) {
  const fields = {};
  const price = (v) => v === null || v === undefined || v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= MAX_PRICE);
  if (!price(p.pricing.basePrice)) fields.price = `Enter a price between 0 and ${MAX_PRICE}.`;
  if ((p.sizes || []).some((s) => !price(s.price))) fields.sizes = "One of the size prices isn't a valid amount.";
  if (((p.print && p.print.materials) || []).some((m) => !price(m.priceModifier))) fields.print = "One of the print prices isn't a valid amount.";
  if (((p.protection && p.protection.options) || []).some((o) => !price(o.priceModifier))) fields.protection = "One of the front-cover prices isn't a valid amount.";
  const discount = Number(p.pricing.discountPercent) || 0;
  if (discount < 0 || discount > 90) fields.discount = "A discount is between 0 and 90 percent.";
  if (Object.keys(fields).length) throw errors.validation(fields);
  // Whole rupees, like every other amount in FrameX.
  if (p.pricing.basePrice !== null && p.pricing.basePrice !== "") p.pricing.basePrice = Math.round(Number(p.pricing.basePrice));
  (p.sizes || []).forEach((s) => s.price !== null && s.price !== undefined && s.price !== "" && (s.price = Math.round(Number(s.price))));
  p.pricing.currency = "INR";
}

/**
 * Create or change one of the shop's own products.
 * `input` is the product record from the dashboard; `input.status` is what the
 * shop wants it to be (draft, published, unpublished).
 */
export async function saveOwn(shop, id, input, { actor, ip = null }) {
  if (!PRODUCT_ID.test(String(id || ""))) throw errors.validation({ id: "This product can't be saved. Create it again from the dashboard." });
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!body) throw errors.validation({ product: "The product couldn't be read." });
  const { model } = siteEngine();

  const existing = (await db.query("SELECT * FROM catalog_products WHERE id = $1", [id])).rows[0];
  // An id that exists but isn't this shop's own product is not reachable from here.
  if (existing && (existing.source !== "shop" || existing.owner_shop_id !== shop.id || existing.status === "REMOVED")) throw notFound();
  if (!existing) {
    const count = (await db.query("SELECT count(*)::int AS n FROM catalog_products WHERE owner_shop_id = $1 AND status <> 'REMOVED'", [shop.id])).rows[0].n;
    if (count >= MAX_PRODUCTS) throw new HttpError(409, "PRODUCT_LIMIT", `A shop can list up to ${MAX_PRODUCTS} products. Remove one you no longer sell, or contact FrameX.`);
  }

  // Rebuild the record with the website's own model: unknown branches get defaults, the type's rules are applied.
  const p = model.sanitizeShopInput(model.normalize({ ...body, schema: model.SCHEMA, legacy: undefined, id, section: undefined }));
  delete p.section;
  p.id = id;
  p.shopId = shop.ref;
  p.name = String(p.name || "").slice(0, 140);
  p.description = String(p.description || "").slice(0, 4000);
  checkNumbers(p);
  await checkMedia(p, shop);

  const wanted = STATUSES.includes(body.status) ? body.status : "draft";
  let listing = wanted === "pending_review" ? "draft" : wanted;
  if (wanted === "published") {
    const check = model.validateForPublish(p);
    if (!check.ready) throw new HttpError(422, "PRODUCT_INCOMPLETE", "This product is missing information, so it can't be published yet.", { details: { issues: check.issues } });
    // With moderation on, a product a FrameX admin has not approved yet waits for review.
    const approved = existing && existing.listing_status === "published";
    listing = config.catalog.productModeration && !approved ? "pending_review" : "published";
  }

  // A product address customers can open: unique among every product.
  const taken = new Set((await db.query("SELECT slug FROM catalog_products WHERE id <> $1", [id])).rows.map((r) => r.slug));
  const base = model.slugify(p.slug || p.name) || "product";
  p.slug = taken.has(base) ? model.uniqueSlug(p.name || "product", [...taken]) : base;

  const now = new Date().toISOString();
  p.status = listing;
  p.createdAt = existing ? existing.data.createdAt || existing.created_at : now;
  p.updatedAt = now;
  p.publishedAt = listing === "published" ? (existing && existing.data.publishedAt) || now : (existing && existing.data.publishedAt) || null;
  // The small picture for cards, carts and orders.
  const main = model.mainView(p);
  p.listingImage = main ? (MEDIA_REF.test(main.url) ? `/media/${MEDIA_REF.exec(main.url)[1]}${main.thumb ? "/thumb" : ""}` : main.url) : "";
  p.listingImageFor = main ? main.url : "";
  const data = model.normalize(p);
  data.status = listing;

  const status = listing === "published" && shop.listed ? "ACTIVE" : "INACTIVE";
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO catalog_products (id, slug, name, shop_ref, shop_name, status, data, source_hash, source, owner_shop_id, listing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'shop', $9, $10)
       ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, shop_ref = EXCLUDED.shop_ref, shop_name = EXCLUDED.shop_name,
         status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, listing_status = EXCLUDED.listing_status, updated_at = now(),
         -- A new stock number is a fresh count: what orders took from the old count no longer applies.
         stock_reserved = CASE WHEN (catalog_products.data->'availability'->>'stock') IS DISTINCT FROM (EXCLUDED.data->'availability'->>'stock') THEN 0 ELSE catalog_products.stock_reserved END,
         data = EXCLUDED.data`,
      [id, data.slug, data.name || "Untitled product", shop.ref, shop.name, status, JSON.stringify(data), hash(data), shop.id, listing]
    );
    await audit(q, { actor, action: ACTIONS.SHOP_PRODUCT_SAVED, targetType: "product", targetId: id, metadata: { shop: shop.code, status: listing, type: data.productType || "" }, ip });
  });
  return getOwn(shop, id);
}

/** Remove one of the shop's own products. It stays in the database (orders and carts point at it) but can't be bought. */
export async function deleteOwn(shop, id, { actor, ip = null }) {
  const row = await ownRow(shop, id);
  await db.tx(async (q) => {
    await q.query("UPDATE catalog_products SET status = 'REMOVED', listing_status = 'unpublished', source_hash = 'removed', updated_at = now() WHERE id = $1", [row.id]);
    await audit(q, { actor, action: ACTIONS.SHOP_PRODUCT_DELETED, targetType: "product", targetId: row.id, metadata: { shop: shop.code, name: row.name }, ip });
  });
}

/* ---------------------------------------------------------------- FrameX staff */

/** Shop products for FrameX staff. status: "" (all) or a listing status, e.g. "pending_review". */
export async function adminList({ status = "" } = {}) {
  const params = [];
  let where = "p.source = 'shop' AND p.status <> 'REMOVED'";
  if (status) where += ` AND p.listing_status = $${params.push(status)}`;
  const { rows } = await db.query(`${SHOP_SQL} WHERE ${where} ORDER BY p.updated_at DESC LIMIT 500`, params);
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, shopCode: r.shop_code, shopName: r.owner_name, status: r.listing_status, onSale: r.status === "ACTIVE" && r.owner_listed, productType: r.data.productType || "", image: withMediaPaths(r.data).listingImage || "", updatedAt: r.updated_at }));
}

/** The platform's own switch: approve a product waiting for review, or take a product off sale. */
export async function adminSetListing(id, listing, { actor, ip = null, note = "" }) {
  if (!["published", "unpublished"].includes(listing)) throw errors.validation({ status: "Choose published or unpublished." });
  const row = (await db.query(`${SHOP_SQL} WHERE p.id = $1 AND p.source = 'shop' AND p.status <> 'REMOVED'`, [id])).rows[0];
  if (!row) throw notFound();
  if (listing === "published") {
    const check = siteEngine().model.validateForPublish(siteEngine().model.normalize(row.data));
    if (!check.ready) throw new HttpError(422, "PRODUCT_INCOMPLETE", "This product is missing information, so it can't be published.", { details: { issues: check.issues } });
  }
  const data = { ...row.data, status: listing, publishedAt: listing === "published" ? row.data.publishedAt || new Date().toISOString() : row.data.publishedAt || null };
  await db.tx(async (q) => {
    await q.query("UPDATE catalog_products SET status = $2, listing_status = $3, data = $4, source_hash = $5, updated_at = now() WHERE id = $1", [id, listing === "published" && row.owner_listed ? "ACTIVE" : "INACTIVE", listing, JSON.stringify(data), hash(data)]);
    await audit(q, { actor, action: ACTIONS.PRODUCT_MODERATED, targetType: "product", targetId: id, metadata: { shop: row.shop_code, to: listing, note }, ip });
  });
  return (await adminList()).find((p) => p.id === id);
}

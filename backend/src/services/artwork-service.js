/* ==========================================================================
   Artworks: an artist's finished work, reviewed by FrameX before anyone can
   see or buy it.

     artist saves an artwork        -> PENDING_REVIEW   (not public)
     FrameX admin approves          -> APPROVED         (public, on sale)
     FrameX admin rejects + reason  -> REJECTED         (not public; the artist sees the reason)
     artist withdraws it            -> CANCELLED        (off the website; the artist can send it for review again)
     artist pauses an approved one  -> INACTIVE  (back to APPROVED without a new review)
     artist changes an artwork      -> PENDING_REVIEW again (what customers see was approved by FrameX)

   An APPROVED artwork is also a row in catalog_products (source 'artist') in
   the shape the website's product model prices, so the cart, checkout, stock
   and orders need nothing special: it is a ready-made product with no
   customer photo. Every other status keeps that row off sale.

   What stays with the platform, whatever the browser sends:
     - an artwork always belongs to the logged-in artist;
     - pictures must be that artist's own uploads;
     - the status only moves along the lines above;
     - an original exists once: its stock is 1.
   ========================================================================== */
import crypto from "node:crypto";
import { siteEngine } from "../catalog/site-engine.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
import { mediaPath, ownMediaIds, publicArtist } from "./artist-service.js";
import { adminUserIds, artistUserIds, notifyUser, notifyUsers } from "./notification-service.js";

export const ARTWORK_ID = /^aw-[a-z0-9]{6,40}$/;
export const ARTWORK_STATUSES = ["PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "INACTIVE"];
export const ART_TYPES = ["painting", "drawing", "canvas-art", "portrait", "handmade", "digital-art", "print", "other"];
const ART_TYPE_NAMES = { painting: "Painting", drawing: "Drawing", "canvas-art": "Canvas art", portrait: "Portrait", handmade: "Handmade artwork", "digital-art": "Digital art", print: "Print", other: "Other artwork" };
const MAX_ARTWORKS = 300;
const MAX_PRICE = 5_000_000;
const MAX_PICTURES = 8;

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const notFound = () => errors.notFound("We couldn't find that artwork.", "ARTWORK_NOT_FOUND");
const text = (value, max) => {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
};
const lines = (value, max = 12) => (Array.isArray(value) ? value : String(value ?? "").split("\n")).map((l) => text(l, 200)).filter(Boolean).slice(0, max);
const like = (value) => `%${String(value).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;

/* ---------------------------------------------------------------- Reading the input */

/** The artwork record made from what the artist sent. Throws 422 with the fields that are wrong. */
async function clean(artist, input, q = db) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const fields = {};
  const title = text(body.title, 140);
  if (title.length < 3) fields.title = "Give the artwork a title.";
  const price = Number(body.price);
  if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) fields.price = `Enter a price in whole rupees, up to ${MAX_PRICE.toLocaleString("en-IN")}.`;
  const artType = ART_TYPES.includes(body.artType) ? body.artType : "";
  if (!artType) fields.artType = "Choose the kind of artwork.";
  const medium = text(body.medium, 80);
  if (!medium) fields.medium = "Say what it is made with, e.g. oil on canvas.";
  const size = text(body.size, 60);
  if (!size) fields.size = "Enter the size, e.g. 18 x 24 in.";
  const images = await ownMediaIds(artist.id, body.images, q);
  if (!images.length) fields.images = "Add at least one picture of the artwork.";
  if (images.length > MAX_PICTURES) fields.images = `An artwork can have up to ${MAX_PICTURES} pictures.`;
  const kind = body.kind === "PRINT" ? "PRINT" : "ORIGINAL";
  const year = body.year === "" || body.year === null || body.year === undefined ? null : Number(body.year);
  if (year !== null && (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear())) fields.year = "Enter the year it was made.";
  // An original exists once. Prints can have more copies.
  const copies = kind === "ORIGINAL" ? 1 : Number(body.stock);
  if (kind === "PRINT" && (!Number.isInteger(copies) || copies < 1 || copies > 500)) fields.stock = "Enter how many prints are available (1 to 500).";
  if (Object.keys(fields).length) throw errors.validation(fields);
  return {
    title,
    price,
    data: {
      description: text(body.description, 3000),
      artType,
      medium,
      size,
      kind,
      handmade: Boolean(body.handmade),
      frameIncluded: Boolean(body.frameIncluded),
      frameDetails: text(body.frameDetails, 200),
      canvasDetails: text(body.canvasDetails, 200),
      year,
      stock: copies,
      shipping: text(body.shipping, 400),
      care: lines(body.care),
      tags: lines(Array.isArray(body.tags) ? body.tags : String(body.tags ?? "").split(","), 12).map((t) => t.slice(0, 30)),
      images
    }
  };
}

/* ---------------------------------------------------------------- Shapes */

const pictures = (data) => (data.images || []).map((id) => mediaPath(id));

/** The artwork as its artist and FrameX staff see it. */
function ownShape(row) {
  const d = row.data || {};
  return {
    id: row.id, title: row.title, slug: row.slug, status: row.status, price: row.price, currency: "INR",
    description: d.description || "", artType: d.artType, artTypeName: ART_TYPE_NAMES[d.artType] || "Artwork", medium: d.medium, size: d.size, kind: d.kind, handmade: Boolean(d.handmade),
    frameIncluded: Boolean(d.frameIncluded), frameDetails: d.frameDetails || "", canvasDetails: d.canvasDetails || "", year: d.year || null, stock: d.stock || 1, shipping: d.shipping || "",
    care: d.care || [], tags: d.tags || [], images: pictures(d), imageRefs: (d.images || []).map((id) => `media:${id}`),
    rejectionReason: row.status === "REJECTED" ? row.rejection_reason || "" : "", reviewedAt: row.reviewed_at, submittedAt: row.submitted_at, updatedAt: row.updated_at,
    onSale: row.status === "APPROVED" && row.artist_status === "ACTIVE",
    artistCode: row.artist_code, artistName: row.artist_name
  };
}

/** The artwork as customers see it. Only ever built from an APPROVED row of a listed artist. */
function publicShape(row) {
  const d = row.data || {};
  const stock = Math.max(0, (d.stock || 1) - (row.stock_reserved || 0));
  return {
    id: row.id, title: row.title, slug: row.slug, price: row.price, currency: "INR", description: d.description || "", artType: d.artType, artTypeName: ART_TYPE_NAMES[d.artType] || "Artwork", medium: d.medium, size: d.size,
    kind: d.kind, handmade: Boolean(d.handmade), frameIncluded: Boolean(d.frameIncluded), frameDetails: d.frameDetails || "", canvasDetails: d.canvasDetails || "", year: d.year || null, shipping: d.shipping || "",
    care: d.care || [], tags: d.tags || [], images: pictures(d), image: pictures(d)[0] || "", available: stock > 0, stock,
    artist: { artistCode: row.artist_code, username: row.username, name: row.artist_name, photo: mediaPath(row.photo_media), city: row.city, state: row.state, customEnabled: Boolean(row.custom_enabled) },
    rating: { average: row.rating_avg === null || row.rating_avg === undefined ? null : Math.round(Number(row.rating_avg) * 10) / 10, count: Number(row.rating_count) || 0 }
  };
}

const SQL = `SELECT w.*, a.artist_code, a.username, a.name AS artist_name, a.status AS artist_status, a.photo_media, a.city, a.state, a.custom_enabled,
    coalesce(p.stock_reserved, 0) AS stock_reserved,
    (SELECT avg(r.rating) FROM reviews r WHERE r.target_type = 'ARTWORK' AND r.target_id = w.id AND r.status = 'PUBLISHED') AS rating_avg,
    (SELECT count(*) FROM reviews r WHERE r.target_type = 'ARTWORK' AND r.target_id = w.id AND r.status = 'PUBLISHED') AS rating_count
  FROM artworks w JOIN artists a ON a.id = w.artist_id LEFT JOIN catalog_products p ON p.id = w.id`;
const PUBLIC = "w.status = 'APPROVED' AND a.status = 'ACTIVE'";

/* ---------------------------------------------------------------- The product row customers buy */

/** The catalogue record of an artwork: what the website's product model, the cart and the orders read. */
function productRecord(row, artist) {
  const d = row.data;
  const images = pictures(d);
  return {
    id: row.id, shopId: artist.artist_code, name: row.title, slug: row.slug, productType: "artwork", image: images[0] || "", images,
    views: images.map((url, i) => ({ type: i === 0 ? "FRONT" : "DETAIL", url, alt: `${row.title} by ${artist.name}` })),
    description: d.description || "", categoryIds: ["art"], tags: d.tags || [], price: row.price, discountPercent: 0, currency: "INR", stock: d.stock || 1, isAvailable: true, isVisible: true,
    material: d.medium, sizes: [d.size], colors: [],
    // Decided by the platform, not by the artist: an artwork is paid online and is not gift wrapped.
    cod: false, giftWrap: false,
    artwork: { artistCode: artist.artist_code, artistName: artist.name, artType: d.artType, medium: d.medium, size: d.size, kind: d.kind, handmade: Boolean(d.handmade), frameIncluded: Boolean(d.frameIncluded), year: d.year || null },
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

/** Bring the catalogue row in line with the artwork: on sale only while APPROVED and the artist is listed. */
async function syncProduct(q, artworkId) {
  const row = (await q.query("SELECT w.*, a.artist_code, a.name AS artist_name, a.status AS artist_status FROM artworks w JOIN artists a ON a.id = w.artist_id WHERE w.id = $1", [artworkId])).rows[0];
  if (!row) return;
  const artist = { artist_code: row.artist_code, name: row.artist_name };
  const data = productRecord(row, artist);
  const listing = row.status === "APPROVED" ? "published" : "unpublished";
  const status = row.status === "CANCELLED" ? "REMOVED" : row.status === "APPROVED" && row.artist_status === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  const exists = (await q.query("SELECT 1 FROM catalog_products WHERE id = $1", [row.id])).rows.length;
  // A row is only created once the artwork has been approved: nothing unreviewed is ever in the catalogue.
  if (!exists && row.status !== "APPROVED") return;
  await q.query(
    `INSERT INTO catalog_products (id, slug, name, shop_ref, shop_name, status, data, source_hash, source, owner_artist_id, listing_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'artist', $9, $10)
     ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, shop_ref = EXCLUDED.shop_ref, shop_name = EXCLUDED.shop_name, status = EXCLUDED.status,
       source_hash = EXCLUDED.source_hash, listing_status = EXCLUDED.listing_status, updated_at = now(),
       stock_reserved = CASE WHEN (catalog_products.data->>'stock') IS DISTINCT FROM (EXCLUDED.data->>'stock') THEN 0 ELSE catalog_products.stock_reserved END,
       -- While an artwork is not approved, customers keep seeing nothing new: the approved record stays as it was.
       data = CASE WHEN EXCLUDED.listing_status = 'published' THEN EXCLUDED.data ELSE catalog_products.data END
     WHERE catalog_products.source = 'artist' AND catalog_products.owner_artist_id = EXCLUDED.owner_artist_id`,
    [row.id, row.slug, row.title, artist.artist_code, artist.name, status, JSON.stringify(data), hash(data), row.artist_id, listing]
  );
}

/* ---------------------------------------------------------------- The artist's own artworks */

async function ownRow(artist, id, q = db) {
  if (!ARTWORK_ID.test(String(id || ""))) throw notFound();
  const row = (await q.query(`${SQL} WHERE w.id = $1 AND w.artist_id = $2`, [id, artist.id])).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function listOwn(artist, { status = "" } = {}) {
  const params = [artist.id];
  const { rows } = await db.query(`${SQL} WHERE w.artist_id = $1 ${status ? `AND w.status = $${params.push(status)}` : ""} ORDER BY w.updated_at DESC LIMIT 500`, params);
  return rows.map(ownShape);
}

export const getOwn = async (artist, id) => ownShape(await ownRow(artist, id));

/** How many artworks the artist has in each status. */
export async function ownCounts(artist) {
  const { rows } = await db.query("SELECT status, count(*)::int AS n FROM artworks WHERE artist_id = $1 GROUP BY status", [artist.id]);
  return Object.fromEntries(ARTWORK_STATUSES.map((s) => [s, (rows.find((r) => r.status === s) || { n: 0 }).n]));
}

/**
 * Add an artwork (id is new) or change one of the artist's own.
 * Either way it waits for FrameX's review afterwards.
 */
export async function saveOwn(artist, id, input, { actor, ip = null }) {
  if (!ARTWORK_ID.test(String(id || ""))) throw errors.validation({ id: "This artwork can't be saved. Add it again from your dashboard." });
  const existing = (await db.query("SELECT * FROM artworks WHERE id = $1", [id])).rows[0];
  // An id that exists but isn't this artist's own is not reachable from here.
  if (existing && existing.artist_id !== artist.id) throw notFound();
  if (existing && existing.status === "CANCELLED") throw new HttpError(409, "ARTWORK_WITHDRAWN", "This artwork was withdrawn. Send it for review again from your artworks list, then change it.");
  // The same id may not be a shop's or the catalogue's product.
  if (!existing && (await db.query("SELECT 1 FROM catalog_products WHERE id = $1", [id])).rows.length) throw errors.validation({ id: "This artwork can't be saved. Add it again from your dashboard." });
  if (!existing) {
    const count = (await db.query("SELECT count(*)::int AS n FROM artworks WHERE artist_id = $1 AND status <> 'CANCELLED'", [artist.id])).rows[0].n;
    if (count >= MAX_ARTWORKS) throw new HttpError(409, "ARTWORK_LIMIT", `An artist can list up to ${MAX_ARTWORKS} artworks. Withdraw one you no longer sell, or contact FrameX.`);
  }
  const { model } = siteEngine();
  await db.tx(async (q) => {
    const a = await clean(artist, input, q);
    // An address customers can open: unique among every product and artwork.
    const taken = new Set([...(await q.query("SELECT slug FROM catalog_products WHERE id <> $1", [id])).rows, ...(await q.query("SELECT slug FROM artworks WHERE id <> $1", [id])).rows].map((r) => r.slug));
    const base = model.slugify(a.title) || "artwork";
    const slug = existing && existing.title === a.title ? existing.slug : taken.has(base) ? model.uniqueSlug(a.title, [...taken]) : base;
    await q.query(
      `INSERT INTO artworks (id, artist_id, title, slug, status, price, data) VALUES ($1, $2, $3, $4, 'PENDING_REVIEW', $5, $6)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, slug = EXCLUDED.slug, status = 'PENDING_REVIEW', price = EXCLUDED.price, data = EXCLUDED.data,
         rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, submitted_at = now(), updated_at = now()`,
      [id, artist.id, a.title, slug, a.price, JSON.stringify(a.data)]
    );
    await syncProduct(q, id);
    await audit(q, { actor, action: ACTIONS.ARTWORK_SUBMITTED, targetType: "artwork", targetId: id, metadata: { artist: artist.code, changed: Boolean(existing) }, ip });
  });
  await notifyUsers(await adminUserIds(), { kind: "ARTWORK_PENDING_REVIEW", ref: `${id}:${Date.now()}`, title: "An artwork is waiting for review", body: `${artist.name} submitted an artwork for review.`, link: "admin.html#/artworks" });
  return getOwn(artist, id);
}

/**
 * What an artist may do with the status themselves:
 *   CANCELLED  withdraw (from any status but CANCELLED)
 *   INACTIVE   pause an APPROVED artwork
 *   APPROVED   show a paused (INACTIVE) artwork again: it was already reviewed
 *   PENDING_REVIEW  bring a withdrawn (CANCELLED) artwork back: FrameX reviews it again before anyone sees it
 */
export async function setOwnStatus(artist, id, status, { actor, ip = null }) {
  const allowed = { CANCELLED: ["PENDING_REVIEW", "APPROVED", "REJECTED", "INACTIVE"], INACTIVE: ["APPROVED"], APPROVED: ["INACTIVE"], PENDING_REVIEW: ["CANCELLED"] };
  if (!allowed[status]) throw errors.validation({ status: "Choose what to do with this artwork." });
  const back = status === "PENDING_REVIEW";
  await db.tx(async (q) => {
    await ownRow(artist, id, q);
    if (back) {
      const count = (await q.query("SELECT count(*)::int AS n FROM artworks WHERE artist_id = $1 AND status <> 'CANCELLED'", [artist.id])).rows[0].n;
      if (count >= MAX_ARTWORKS) throw new HttpError(409, "ARTWORK_LIMIT", `An artist can list up to ${MAX_ARTWORKS} artworks. Withdraw one you no longer sell, or contact FrameX.`);
    }
    // Coming back starts a fresh review: the old decision and its reason no longer apply.
    const fresh = back ? ", rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, submitted_at = now()" : "";
    const done = await q.query(`UPDATE artworks SET status = $3, updated_at = now()${fresh} WHERE id = $1 AND artist_id = $2 AND status IN (${allowed[status].map((s) => `'${s}'`).join(", ")}) RETURNING id`, [id, artist.id, status]);
    if (!done.rows[0]) {
      const why = status === "APPROVED" ? "Only a paused artwork can be shown again. An artwork that was changed or rejected goes through review." : back ? "Only a withdrawn artwork can be sent for review again." : "This artwork can't be changed that way right now.";
      throw new HttpError(409, "ARTWORK_STATUS", why);
    }
    await syncProduct(q, id);
    await audit(q, { actor, action: ACTIONS.ARTWORK_STATUS_CHANGED, targetType: "artwork", targetId: id, metadata: { artist: artist.code, to: status }, ip });
  });
  if (back) await notifyUsers(await adminUserIds(), { kind: "ARTWORK_PENDING_REVIEW", ref: `${id}:${Date.now()}`, title: "An artwork is waiting for review", body: `${artist.name} sent a withdrawn artwork for review again.`, link: "admin.html#/artworks" });
  return getOwn(artist, id);
}

/* ---------------------------------------------------------------- FrameX staff */

export async function adminList({ status = "" } = {}) {
  const params = [];
  const { rows } = await db.query(`${SQL} ${status ? `WHERE w.status = $${params.push(status)}` : ""} ORDER BY (w.status = 'PENDING_REVIEW') DESC, w.submitted_at DESC LIMIT 500`, params);
  return rows.map(ownShape);
}

export async function adminCounts() {
  const { rows } = await db.query("SELECT status, count(*)::int AS n FROM artworks GROUP BY status");
  return Object.fromEntries(ARTWORK_STATUSES.map((s) => [s, (rows.find((r) => r.status === s) || { n: 0 }).n]));
}

/** Approve or reject an artwork that is waiting for review. A rejection needs its reason. */
export async function adminReview(id, { decision, reason = "" }, { actor, ip = null }) {
  if (!ARTWORK_ID.test(String(id || ""))) throw notFound();
  if (!["APPROVED", "REJECTED"].includes(decision)) throw errors.validation({ decision: "Choose approve or reject." });
  const why = text(reason, 500);
  if (decision === "REJECTED" && why.length < 3) throw errors.validation({ reason: "Tell the artist why the artwork was rejected." });
  const row = await db.tx(async (q) => {
    const current = (await q.query("SELECT * FROM artworks WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!current) throw notFound();
    if (current.status !== "PENDING_REVIEW") throw new HttpError(409, "ARTWORK_NOT_PENDING", "This artwork is not waiting for review.");
    await q.query("UPDATE artworks SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() WHERE id = $1", [id, decision, decision === "REJECTED" ? why : null, actor.id]);
    await syncProduct(q, id);
    await audit(q, { actor, action: decision === "APPROVED" ? ACTIONS.ARTWORK_APPROVED : ACTIONS.ARTWORK_REJECTED, targetType: "artwork", targetId: id, metadata: decision === "REJECTED" ? { reason: why } : {}, ip });
    return current;
  });
  await notifyUsers(await artistUserIds(row.artist_id), decision === "APPROVED"
    ? { kind: "ARTWORK_APPROVED", ref: `${id}:${Date.now()}`, title: "Your artwork was approved", body: `"${row.title}" is now visible on FrameX.`, link: "artist-dashboard.html#/artworks", email: true, button: "Open your dashboard" }
    : { kind: "ARTWORK_REJECTED", ref: `${id}:${Date.now()}`, title: "Your artwork was not approved", body: `"${row.title}" was not approved. Reason: ${why}`, link: "artist-dashboard.html#/artworks", email: true, button: "Open your dashboard" });
  return (await adminList()).find((w) => w.id === id);
}

/** Take an approved artwork off the site (or put it back). */
export async function adminSetVisible(id, visible, { actor, ip = null }) {
  if (!ARTWORK_ID.test(String(id || ""))) throw notFound();
  await db.tx(async (q) => {
    const done = await q.query("UPDATE artworks SET status = $2, updated_at = now() WHERE id = $1 AND status = $3 RETURNING id", [id, visible ? "APPROVED" : "INACTIVE", visible ? "INACTIVE" : "APPROVED"]);
    if (!done.rows[0]) throw new HttpError(409, "ARTWORK_STATUS", "This artwork can't be changed that way right now.");
    await syncProduct(q, id);
    await audit(q, { actor, action: ACTIONS.ARTWORK_STATUS_CHANGED, targetType: "artwork", targetId: id, metadata: { to: visible ? "APPROVED" : "INACTIVE", by: "admin" }, ip });
  });
  return (await adminList()).find((w) => w.id === id);
}

/* ---------------------------------------------------------------- Public */

/** Approved artworks of listed artists. q matches title, medium, tags, kind of art or the artist. */
export async function listPublic({ q = "", artType = "", artist = "", page = 1, limit = 12, sort = "new" } = {}) {
  const params = [];
  let where = PUBLIC;
  if (q) {
    params.push(like(q));
    const n = params.length;
    where += ` AND (lower(w.title) LIKE $${n} OR lower(w.data->>'medium') LIKE $${n} OR lower(w.data->>'description') LIKE $${n} OR lower((w.data->'tags')::text) LIKE $${n} OR lower(w.data->>'artType') LIKE $${n} OR lower(a.name) LIKE $${n} OR lower(a.username) LIKE $${n})`;
  }
  if (artType) where += ` AND w.data->>'artType' = $${params.push(artType)}`;
  if (artist) where += ` AND (a.artist_code = $${params.push(String(artist).toUpperCase())} OR lower(a.username) = $${params.push(String(artist).toLowerCase().replace(/^@/, ""))})`;
  const size = Math.min(Math.max(1, limit), 48);
  const total = (await db.query(`SELECT count(*)::int AS n FROM artworks w JOIN artists a ON a.id = w.artist_id WHERE ${where}`, params)).rows[0].n;
  const order = sort === "price-low" ? "w.price ASC" : sort === "price-high" ? "w.price DESC" : "w.reviewed_at DESC NULLS LAST";
  params.push(size, (Math.max(1, page) - 1) * size);
  const { rows } = await db.query(`${SQL} WHERE ${where} ORDER BY ${order}, w.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows.map(publicShape), total, page: Math.max(1, page), limit: size };
}

/** One approved artwork by id or by its address name. */
export async function getPublic(ref) {
  const value = String(ref || "");
  const { rows } = await db.query(`${SQL} WHERE ${PUBLIC} AND (w.id = $1 OR w.slug = $1)`, [value]);
  if (!rows[0]) throw notFound();
  return publicShape(rows[0]);
}

export { ART_TYPE_NAMES, publicArtist };

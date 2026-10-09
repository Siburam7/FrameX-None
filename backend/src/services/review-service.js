/* ==========================================================================
   Reviews and ratings.

   Only someone who received the thing can review it. A review names where it
   comes from (a delivered order, or a delivered custom painting), and the
   server checks that this order or painting is the reviewer's own, was
   delivered, and really contained what is being reviewed:

     PRODUCT   a product in one of the customer's delivered orders
     ARTWORK   an artwork in one of the customer's delivered orders
     SHOP      a shop that made a line of one of the customer's delivered orders
     ARTIST    an artist whose artwork was in a delivered order, or who
               painted a delivered custom painting

   One review per customer, target and purchase. No review is ever created
   by the platform itself.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
import { inspectImage } from "../lib/image-info.js";
import * as storage from "../lib/storage.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

export const TARGET_TYPES = ["PRODUCT", "SHOP", "ARTIST", "ARTWORK"];
const notAllowed = () => new HttpError(403, "REVIEW_NOT_ALLOWED", "You can review something once it has been delivered to you.");
const text = (value, max) => {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
};
/** "Asha Rao" -> "Asha R." */
const displayName = (name) => {
  const parts = String(name || "Customer").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

// The photo's public address. It only answers while the review is published (sendReviewPhoto).
const photoOf = (r) => (r.photo_key ? `/media/review/${r.id}?v=${new Date(r.updated_at || r.created_at).getTime()}` : null);

const shape = (r) => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, rating: r.rating, body: r.body, author: r.author_name, verified: true, photo: photoOf(r), ...(r.target_name ? { targetName: r.target_name } : {}), source: r.source_type === "PAINTING" ? "Custom painting" : "Order", createdAt: r.created_at, ...(r.status ? { status: r.status } : {}) });

/** Does this delivered purchase of this user really contain the target? -> the canonical target id, or null. */
async function purchased(userId, { targetType, targetId, sourceType, sourceId }) {
  if (sourceType === "PAINTING") {
    if (targetType !== "ARTIST") return null;
    const row = (await db.query("SELECT a.artist_code FROM painting_requests r JOIN artists a ON a.id = r.artist_id WHERE r.request_number = $1 AND r.user_id = $2 AND r.status = 'DELIVERED'", [sourceId, userId])).rows[0];
    return row && row.artist_code === String(targetId).toUpperCase() ? row.artist_code : null;
  }
  const order = (await db.query("SELECT id FROM orders WHERE order_number = $1 AND user_id = $2 AND status = 'DELIVERED'", [sourceId, userId])).rows[0];
  if (!order) return null;
  const { rows } = await db.query("SELECT i.product_id, i.shop_ref, i.seller_type, a.artist_code FROM order_items i LEFT JOIN artists a ON a.id = i.artist_id WHERE i.order_id = $1", [order.id]);
  if (targetType === "PRODUCT") return rows.some((i) => i.product_id === targetId && i.seller_type !== "ARTIST") ? targetId : null;
  if (targetType === "ARTWORK") return rows.some((i) => i.product_id === targetId && i.seller_type === "ARTIST") ? targetId : null;
  if (targetType === "ARTIST") return rows.some((i) => i.artist_code === String(targetId).toUpperCase()) ? String(targetId).toUpperCase() : null;
  if (targetType === "SHOP") {
    // A shop is named by its Shop ID or by the catalogue reference its order lines carry.
    const shop = (await db.query("SELECT shop_code, catalog_ref FROM shops WHERE shop_code = $1 OR catalog_ref = $2", [String(targetId).toUpperCase(), String(targetId)])).rows[0];
    const refs = shop ? [shop.shop_code, shop.catalog_ref].filter(Boolean) : [String(targetId)];
    return rows.some((i) => i.seller_type !== "ARTIST" && refs.includes(i.shop_ref)) ? (shop ? shop.shop_code : String(targetId)) : null;
  }
  return null;
}

/** Write (or change) the caller's review of something they received. */
export async function saveReview(user, { targetType, targetId, sourceType, sourceId, rating, body }) {
  if (!TARGET_TYPES.includes(targetType) || !["ORDER", "PAINTING"].includes(sourceType)) throw errors.validation({ targetType: "This can't be reviewed." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw errors.validation({ rating: "Choose 1 to 5 stars." });
  const canonical = await purchased(user.id, { targetType, targetId: String(targetId || ""), sourceType, sourceId: String(sourceId || "") });
  if (!canonical) throw notAllowed();
  const { rows } = await db.query(
    `INSERT INTO reviews (id, user_id, target_type, target_id, source_type, source_id, rating, body, author_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, target_type, target_id, source_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now() RETURNING *`,
    [newId(), user.id, targetType, canonical, sourceType, String(sourceId), rating, text(body, 1500), displayName(user.name)]
  );
  return shape({ ...rows[0], status: undefined });
}

/** Published reviews of one thing, newest first, with the average. */
export async function listFor(targetType, targetId, { page = 1, limit = 10 } = {}) {
  if (!TARGET_TYPES.includes(targetType)) throw errors.validation({ targetType: "Unknown kind of review." });
  const id = targetType === "ARTIST" ? String(targetId).toUpperCase() : String(targetId);
  const size = Math.min(Math.max(1, limit), 50);
  const stats = (await db.query("SELECT avg(rating) AS average, count(*)::int AS n FROM reviews WHERE target_type = $1 AND target_id = $2 AND status = 'PUBLISHED'", [targetType, id])).rows[0];
  const { rows } = await db.query("SELECT id, target_type, target_id, source_type, rating, body, author_name, created_at, updated_at, photo_key FROM reviews WHERE target_type = $1 AND target_id = $2 AND status = 'PUBLISHED' ORDER BY created_at DESC, id LIMIT $3 OFFSET $4", [targetType, id, size, (Math.max(1, page) - 1) * size]);
  return { items: rows.map(shape), total: stats.n, rating: { average: stats.average === null ? null : Math.round(Number(stats.average) * 10) / 10, count: stats.n }, page: Math.max(1, page), limit: size };
}

/** The newest published reviews across the site (the home page's "Customer stories"). */
export async function latest({ limit = 8 } = {}) {
  const { rows } = await db.query("SELECT id, target_type, target_id, source_type, rating, body, author_name, created_at, updated_at, photo_key FROM reviews WHERE status = 'PUBLISHED' AND body <> '' ORDER BY created_at DESC, id LIMIT $1", [Math.min(Math.max(1, limit), 24)]);
  return rows.map(shape);
}

/** What the customer can still review from one of their delivered orders or paintings, and what they already wrote. */
export async function reviewable(userId, { sourceType, sourceId }) {
  const out = [];
  const mine = new Map((await db.query("SELECT * FROM reviews WHERE user_id = $1 AND source_type = $2 AND source_id = $3", [userId, sourceType, String(sourceId)])).rows.map((r) => [`${r.target_type}:${r.target_id}`, r]));
  const add = (targetType, targetId, name) => {
    if (out.some((t) => t.targetType === targetType && t.targetId === targetId)) return;
    const r = mine.get(`${targetType}:${targetId}`);
    out.push({ targetType, targetId, name, review: r ? { id: r.id, rating: r.rating, body: r.body, photo: photoOf(r), hidden: r.status === "HIDDEN" } : null });
  };
  if (sourceType === "PAINTING") {
    const row = (await db.query("SELECT a.artist_code, a.name FROM painting_requests r JOIN artists a ON a.id = r.artist_id WHERE r.request_number = $1 AND r.user_id = $2 AND r.status = 'DELIVERED'", [String(sourceId), userId])).rows[0];
    if (row) add("ARTIST", row.artist_code, row.name);
    return out;
  }
  const order = (await db.query("SELECT id FROM orders WHERE order_number = $1 AND user_id = $2 AND status = 'DELIVERED'", [String(sourceId), userId])).rows[0];
  if (!order) return out;
  const { rows } = await db.query("SELECT i.product_id, i.name, i.seller_type, a.artist_code, a.name AS artist_name FROM order_items i LEFT JOIN artists a ON a.id = i.artist_id WHERE i.order_id = $1 ORDER BY i.position", [order.id]);
  for (const i of rows) {
    if (i.seller_type === "ARTIST") {
      if (i.product_id) add("ARTWORK", i.product_id, i.name);
      if (i.artist_code) add("ARTIST", i.artist_code, i.artist_name);
    } else if (i.product_id) add("PRODUCT", i.product_id, i.name);
  }
  return out;
}

/* ---------------------------------------------------------------- The customer gallery */

/**
 * Published reviews across the site, newest first, the ones with a photo or with words.
 * Each says what was reviewed (its name), for the "Customer Gallery" page.
 */
export async function gallery({ page = 1, limit = 12 } = {}) {
  const size = Math.min(Math.max(1, Math.floor(Number(limit)) || 12), 48);
  const at = Math.max(1, Math.floor(Number(page)) || 1);
  const WHERE = "r.status = 'PUBLISHED' AND (r.photo_key IS NOT NULL OR r.body <> '')";
  const total = (await db.query(`SELECT count(*)::int AS n FROM reviews r WHERE ${WHERE}`)).rows[0].n;
  const { rows } = await db.query(
    `SELECT r.id, r.target_type, r.target_id, r.source_type, r.rating, r.body, r.author_name, r.created_at, r.updated_at, r.photo_key,
            coalesce(p.name, a.name, s.name) AS target_name
       FROM reviews r
       LEFT JOIN catalog_products p ON r.target_type IN ('PRODUCT', 'ARTWORK') AND p.id = r.target_id
       LEFT JOIN artists a ON r.target_type = 'ARTIST' AND a.artist_code = r.target_id
       LEFT JOIN shops s ON r.target_type = 'SHOP' AND s.shop_code = r.target_id
      WHERE ${WHERE}
      ORDER BY (r.photo_key IS NOT NULL) DESC, r.created_at DESC, r.id LIMIT ${size} OFFSET ${(at - 1) * size}`
  );
  return { items: rows.map(shape), total, page: at, limit: size };
}

/* ---------------------------------------------------------------- A review's photo */

const ownReview = async (userId, id) => {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that review.");
  const row = (await db.query("SELECT * FROM reviews WHERE id = $1 AND user_id = $2", [id, userId])).rows[0];
  if (!row) throw errors.notFound("We couldn't find that review.");
  return row;
};

/**
 * The writer of a review adds (or replaces) its photo. The request body is the picture's own bytes.
 * Only a real JPG, PNG or WebP is kept; its type and size are read from the file, not from what the browser says.
 */
export async function savePhoto(user, id, req) {
  const review = await ownReview(user.id, id);
  const max = config.media.maxBytes;
  const tooLarge = () => new HttpError(413, "MEDIA_TOO_LARGE", `That picture is larger than ${Math.round(max / (1024 * 1024))} MB. Please choose a smaller one.`);
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
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
    const key = storage.newKey("public");
    await storage.keep(received.tempPath, key);
    try {
      await db.query("UPDATE reviews SET photo_key = $2, photo_mime = $3, updated_at = now() WHERE id = $1", [review.id, key, info.mime]);
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    if (review.photo_key) await storage.remove(review.photo_key).catch(() => {});
  } finally {
    await storage.discard(received.tempPath).catch(() => {});
  }
  return shape((await db.query("SELECT * FROM reviews WHERE id = $1", [review.id])).rows[0]);
}

export async function removePhoto(user, id) {
  const review = await ownReview(user.id, id);
  if (review.photo_key) {
    await db.query("UPDATE reviews SET photo_key = NULL, photo_mime = NULL, updated_at = now() WHERE id = $1", [review.id]);
    await storage.remove(review.photo_key).catch(() => {});
  }
  return shape((await db.query("SELECT * FROM reviews WHERE id = $1", [review.id])).rows[0]);
}

/** GET /media/review/:id — the photo of a PUBLISHED review. A hidden review's photo is not served. */
export async function sendReviewPhoto(req, res, next) {
  const id = String(req.params.id || "");
  if (!isUuid(id)) return next();
  const row = (await db.query("SELECT photo_key, photo_mime FROM reviews WHERE id = $1 AND status = 'PUBLISHED'", [id])).rows[0];
  if (!row || !row.photo_key || !(await storage.exists(row.photo_key))) return next();
  // Short cache: the customer can replace the photo, and FrameX can hide the review.
  res.set({ "Content-Type": row.photo_mime || "image/jpeg", "Cache-Control": "public, max-age=300", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
  storage.open(row.photo_key).on("error", next).pipe(res);
}

/* ---------------------------------------------------------------- FrameX staff */

export async function adminList({ status = "" } = {}) {
  const { rows } = await db.query(`SELECT * FROM reviews ${status ? "WHERE status = $1" : ""} ORDER BY created_at DESC LIMIT 300`, status ? [status] : []);
  return rows.map(shape);
}

/** Hide a review that breaks the rules, or show it again. Its text is never edited by FrameX. */
export async function adminSetStatus(id, status, { actor, ip = null }) {
  if (!isUuid(id) || !["PUBLISHED", "HIDDEN"].includes(status)) throw errors.notFound("We couldn't find that review.");
  const row = await db.tx(async (q) => {
    const { rows } = await q.query("UPDATE reviews SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, status]);
    if (rows[0]) await audit(q, { actor, action: ACTIONS.REVIEW_MODERATED, targetType: "review", targetId: id, metadata: { to: status }, ip });
    return rows[0];
  });
  if (!row) throw errors.notFound("We couldn't find that review.");
  return shape(row);
}

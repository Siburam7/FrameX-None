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
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
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

const shape = (r) => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, rating: r.rating, body: r.body, author: r.author_name, verified: true, source: r.source_type === "PAINTING" ? "Custom painting" : "Order", createdAt: r.created_at, ...(r.status ? { status: r.status } : {}) });

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
  const { rows } = await db.query("SELECT id, target_type, target_id, source_type, rating, body, author_name, created_at FROM reviews WHERE target_type = $1 AND target_id = $2 AND status = 'PUBLISHED' ORDER BY created_at DESC, id LIMIT $3 OFFSET $4", [targetType, id, size, (Math.max(1, page) - 1) * size]);
  return { items: rows.map(shape), total: stats.n, rating: { average: stats.average === null ? null : Math.round(Number(stats.average) * 10) / 10, count: stats.n }, page: Math.max(1, page), limit: size };
}

/** The newest published reviews across the site (the home page's "Customer stories"). */
export async function latest({ limit = 8 } = {}) {
  const { rows } = await db.query("SELECT id, target_type, target_id, source_type, rating, body, author_name, created_at FROM reviews WHERE status = 'PUBLISHED' AND body <> '' ORDER BY created_at DESC, id LIMIT $1", [Math.min(Math.max(1, limit), 24)]);
  return rows.map(shape);
}

/** What the customer can still review from one of their delivered orders or paintings, and what they already wrote. */
export async function reviewable(userId, { sourceType, sourceId }) {
  const out = [];
  const mine = new Map((await db.query("SELECT * FROM reviews WHERE user_id = $1 AND source_type = $2 AND source_id = $3", [userId, sourceType, String(sourceId)])).rows.map((r) => [`${r.target_type}:${r.target_id}`, r]));
  const add = (targetType, targetId, name) => {
    if (out.some((t) => t.targetType === targetType && t.targetId === targetId)) return;
    const r = mine.get(`${targetType}:${targetId}`);
    out.push({ targetType, targetId, name, review: r ? { rating: r.rating, body: r.body } : null });
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

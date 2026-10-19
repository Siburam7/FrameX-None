/* ==========================================================================
   FrameX Studio designs saved in the customer's account (table saved_designs).

   The browser sends the Studio's configuration and, for each photo slot, the
   account's own upload of that photo; another device opens the design and
   fetches the photos back through the usual short-lived links. Only the
   account's own, kept uploads can be named. At most MAX designs per account.
   ========================================================================== */
import { db } from "../db/index.js";
import { errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";
import { ownUploads } from "./upload-service.js";

export const MAX = 30;
const MAX_CONFIG_BYTES = 100 * 1024;
const MAX_THUMB_BYTES = 200 * 1024;
const THUMB = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const view = (r, { full = false } = {}) => ({
  id: r.id,
  kind: "studio",
  title: r.title,
  mode: r.mode,
  templateId: r.template_id,
  productId: r.product_id,
  thumbnail: r.thumbnail || null,
  photos: r.photos || {},
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(full ? { config: r.config } : {})
});

/** The account's designs, newest first (without their full configuration). */
export async function list(userId) {
  const { rows } = await db.query("SELECT id, title, mode, template_id, product_id, thumbnail, photos, created_at, updated_at FROM saved_designs WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
  return rows.map((r) => view(r));
}

/** One design with its configuration (only the account's own). */
export async function get(userId, id) {
  if (!isUuid(id)) throw errors.notFound("That design doesn't exist.");
  const r = (await db.query("SELECT * FROM saved_designs WHERE id = $1 AND user_id = $2", [id, userId])).rows[0];
  if (!r) throw errors.notFound("That design doesn't exist.");
  return view(r, { full: true });
}

/** Checked input -> the columns. Throws 422 with the field that is wrong. */
async function clean(userId, body) {
  const b = body && typeof body === "object" ? body : {};
  const fields = {};
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 120) : "";
  if (!title) fields.title = "A design needs a name.";
  const mode = typeof b.mode === "string" && /^[a-z-]{1,20}$/.test(b.mode) ? b.mode : null;
  if (!mode) fields.mode = "Unknown kind of design.";
  const ref = (v) => (typeof v === "string" && /^[a-z0-9-]{1,80}$/i.test(v) ? v : null);
  const config = b.config && typeof b.config === "object" && !Array.isArray(b.config) ? b.config : null;
  if (!config) fields.config = "The design is missing.";
  else if (Buffer.byteLength(JSON.stringify(config)) > MAX_CONFIG_BYTES) fields.config = "This design is too large to save.";
  let thumbnail = null;
  if (b.thumbnail !== undefined && b.thumbnail !== null && b.thumbnail !== "") {
    if (typeof b.thumbnail !== "string" || !THUMB.test(b.thumbnail) || b.thumbnail.length > MAX_THUMB_BYTES) fields.thumbnail = "The design's picture isn't valid.";
    else thumbnail = b.thumbnail;
  }
  const photos = {};
  const given = b.photos && typeof b.photos === "object" && !Array.isArray(b.photos) ? b.photos : {};
  const entries = Object.entries(given).slice(0, 20);
  const own = await ownUploads(userId, entries.map(([, id]) => id));
  for (const [slot, id] of entries) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(slot) || !own.has(id)) {
      fields.photos = "A photo in this design isn't one of your uploads any more. Add it again.";
      break;
    }
    photos[slot] = id;
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
  return { title, mode, templateId: ref(b.templateId), productId: ref(b.productId), config, photos, thumbnail };
}

/** Save a new design, or replace one of the account's own (id). -> the saved design */
export async function save(userId, body, id = null) {
  const d = await clean(userId, body);
  return db.tx(async (q) => {
    if (id) {
      if (!isUuid(id)) throw errors.notFound("That design doesn't exist.");
      const r = await q.query(
        `UPDATE saved_designs SET title = $3, mode = $4, template_id = $5, product_id = $6, config = $7, photos = $8, thumbnail = $9, updated_at = now()
          WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId, d.title, d.mode, d.templateId, d.productId, JSON.stringify(d.config), JSON.stringify(d.photos), d.thumbnail]
      );
      if (!r.rows[0]) throw errors.notFound("That design doesn't exist.");
      return view(r.rows[0], { full: true });
    }
    const n = (await q.query("SELECT count(*)::int AS n FROM saved_designs WHERE user_id = $1", [userId])).rows[0].n;
    if (n >= MAX) throw errors.conflict(`You have ${MAX} saved designs. Delete one you don't need, then save again.`, null, "TOO_MANY_DESIGNS");
    const r = await q.query(
      `INSERT INTO saved_designs (id, user_id, title, mode, template_id, product_id, config, photos, thumbnail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [newId(), userId, d.title, d.mode, d.templateId, d.productId, JSON.stringify(d.config), JSON.stringify(d.photos), d.thumbnail]
    );
    return view(r.rows[0], { full: true });
  });
}

/** Delete one of the account's designs. Its photos stay in the photo list (and are tidied later if nothing uses them). */
export async function remove(userId, id) {
  if (!isUuid(id)) throw errors.notFound("That design doesn't exist.");
  const r = await db.query("DELETE FROM saved_designs WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!r.rowCount) throw errors.notFound("That design doesn't exist.");
}


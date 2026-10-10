/* ==========================================================================
   Customer photos: the originals a personalised order is printed from.

   What this file guarantees:
     - The file is stored exactly as it was uploaded. Nothing here resizes,
       re-encodes, sharpens or "improves" it; its SHA-256 is kept as proof.
     - Its format, size and pixel dimensions are read from the file itself
       (lib/image-info.js). The name and type a browser sends are not trusted.
     - It is private. There is no public address for it. It is only sent
       through a signed link that lasts a few minutes (lib/file-links.js), and
       a link is only made for: the customer who uploaded it, FrameX staff, and
       the shop that has to make the order line it belongs to.
     - Once it is part of an order it is kept (status ATTACHED). A photo that
       never reached an order is removed after UPLOAD_UNUSED_DAYS.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { HttpError, errors } from "../lib/errors.js";
import { makeFileToken, readFileToken } from "../lib/file-links.js";
import { inspectImage } from "../lib/image-info.js";
import * as storage from "../lib/storage.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

const EXT = { jpeg: "jpg", png: "png", webp: "webp" };
const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));

/* The messages a customer sees. Technical details stay in the server log. */
export const MESSAGES = {
  unsupported: "Please upload a supported image format (JPG, PNG or WebP).",
  failed: "We couldn't upload your image. Please try again.",
  tooLarge: () => `That photo is larger than ${megabytes(config.uploads.maxBytes)} MB. Please choose a smaller file.`,
  tooMany: "You have a lot of photos waiting that aren't in an order yet. Remove some items from your cart, then try again."
};

const notFound = () => errors.notFound("We couldn't find that photo.", "UPLOAD_NOT_FOUND");

/** A file name that is safe to store and to offer back as a download name. */
export function cleanFileName(value, format) {
  let name = "";
  try {
    name = decodeURIComponent(String(value || ""));
  } catch {
    name = String(value || "");
  }
  name = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120);
  if (!name || /^\.+$/.test(name)) name = `photo.${EXT[format]}`;
  return name;
}

/** What the website may know about a photo (never where it is stored). */
export const publicUpload = (row) => ({
  id: row.id,
  name: row.original_name,
  format: row.format,
  mime: row.mime_type,
  bytes: Number(row.bytes),
  width: row.width,
  height: row.height,
  orientation: row.orientation,
  megapixels: Math.round((row.width * row.height) / 100000) / 10,
  uploadedAt: row.created_at,
  inOrder: row.status === "ATTACHED"
});

/**
 * Receive one photo from a request body (the raw bytes of the file).
 * -> the stored upload's row
 */
export async function receiveUpload(user, req) {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > config.uploads.maxBytes) throw new HttpError(413, "UPLOAD_TOO_LARGE", MESSAGES.tooLarge());
  const waiting = (await db.query("SELECT count(*)::int AS n FROM uploads WHERE user_id = $1 AND status = 'UPLOADED'", [user.id])).rows[0].n;
  if (waiting >= config.uploads.maxWaitingPerUser) throw new HttpError(409, "UPLOAD_LIMIT", MESSAGES.tooMany);

  let received;
  try {
    received = await storage.receive(req, config.uploads.maxBytes);
  } catch (error) {
    if (error instanceof storage.TooLarge) throw new HttpError(413, "UPLOAD_TOO_LARGE", MESSAGES.tooLarge());
    console.error(`[uploads] receiving a file failed: ${error.message}`);
    throw new HttpError(400, "UPLOAD_FAILED", MESSAGES.failed);
  }
  try {
    // A connection that dropped half-way must not leave half a photo behind.
    if (!received.bytes || (Number.isFinite(declared) && declared !== received.bytes)) throw new HttpError(400, "UPLOAD_FAILED", MESSAGES.failed);
    const info = await inspectImage(received.tempPath);
    if (!info) throw new HttpError(415, "UPLOAD_UNSUPPORTED", MESSAGES.unsupported);
    if (Math.max(info.width, info.height) > config.uploads.maxSide) throw new HttpError(422, "UPLOAD_TOO_LARGE", `That photo is larger than ${config.uploads.maxSide} pixels on one side. Please choose a smaller one.`);

    const id = newId();
    const key = storage.newKey("private", id);
    await storage.keep(received.tempPath, key);
    try {
      const { rows } = await db.query(
        `INSERT INTO uploads (id, user_id, storage_key, original_name, mime_type, format, bytes, width, height, orientation, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, user.id, key, cleanFileName(req.headers["x-file-name"], info.format), info.mime, info.format, received.bytes, info.width, info.height, info.orientation, received.sha256]
      );
      return rows[0];
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
  } catch (error) {
    await storage.discard(received.tempPath);
    throw error;
  }
}

/** The caller's own photo, or 404 (someone else's id looks exactly like one that doesn't exist). */
export async function ownUpload(userId, id, q = db) {
  if (!isUuid(id)) throw notFound();
  const { rows } = await q.query("SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND status <> 'DELETED'", [id, userId]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

/** The caller's own photos by id, as a Map. Ids that aren't theirs are simply absent. */
export async function ownUploads(userId, ids, q = db) {
  const wanted = [...new Set(ids.filter(isUuid))];
  if (!wanted.length) return new Map();
  const marks = wanted.map((_, i) => `$${i + 2}`).join(", ");
  const { rows } = await q.query(`SELECT * FROM uploads WHERE user_id = $1 AND status <> 'DELETED' AND id IN (${marks})`, [userId, ...wanted]);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Remove a photo that is not used by any cart line or order. */
export async function deleteOwnUpload(userId, id) {
  const row = await ownUpload(userId, id);
  if (row.status === "ATTACHED") throw new HttpError(409, "UPLOAD_IN_ORDER", "This photo belongs to an order, so it is kept with that order.");
  const inCart = (await db.query("SELECT 1 FROM cart_items i JOIN carts c ON c.id = i.cart_id WHERE c.user_id = $1 AND i.photos @> $2::jsonb LIMIT 1", [userId, JSON.stringify([{ uploadId: id }])])).rows.length;
  if (inCart) throw new HttpError(409, "UPLOAD_IN_CART", "This photo is used by an item in your cart. Remove that item first.");
  await db.query("UPDATE uploads SET status = 'DELETED', deleted_at = now() WHERE id = $1", [id]);
  await storage.remove(row.storage_key);
}

/** Photos become part of an order: they are kept from now on. `q` is the order's transaction. */
export async function attachUploads(q, ids) {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const marks = wanted.map((_, i) => `$${i + 1}`).join(", ");
  await q.query(`UPDATE uploads SET status = 'ATTACHED', attached_at = coalesce(attached_at, now()) WHERE id IN (${marks}) AND status <> 'DELETED'`, wanted);
}

/* ---------------------------------------------------------------- Links + sending */

/** A short-lived link to an upload. The caller has already checked that the asker may see it. */
export function linkTo(row, { download = true, name = "" } = {}) {
  const { token, expiresAt } = makeFileToken(row.id, { download });
  // A name chosen for the asker (e.g. "FX-100012-item1-photo1-<file name>") travels with the link.
  return { path: `/files/${token}${name ? `?name=${encodeURIComponent(name)}` : ""}`, expiresAt, name: name || row.original_name, download };
}

/** GET /api/files/<token>: send the file a signed link names. */
export async function sendLinkedFile(req, res) {
  const link = readFileToken(req.params.token);
  if (!link) throw errors.notFound("This link has expired. Open the order again to get a new one.", "FILE_LINK_EXPIRED");
  const row = (await db.query("SELECT * FROM uploads WHERE id = $1 AND status <> 'DELETED'", [link.uploadId])).rows[0];
  if (!row || !(await storage.exists(row.storage_key))) throw notFound();
  const asked = typeof req.query.name === "string" ? cleanFileName(req.query.name, row.format) : row.original_name;
  const ascii = asked.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  res.set({
    "Content-Type": row.mime_type,
    "Content-Length": String(row.bytes),
    "Content-Disposition": `${link.download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(asked)}`,
    "Cache-Control": "private, no-store",
    // The website (possibly on another address) may show the customer's own photo.
    "Cross-Origin-Resource-Policy": "cross-origin",
    // Opened in a tab of its own, an uploaded file is only ever a picture: nothing in it can run.
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
  });
  await new Promise((resolve, reject) => {
    const stream = storage.open(row.storage_key);
    stream.on("error", reject);
    res.on("close", resolve);
    stream.pipe(res);
  });
}

/* ---------------------------------------------------------------- Housekeeping */

/** Photos that never reached an order and are no longer in any cart: removed after UPLOAD_UNUSED_DAYS. */
export async function sweepUnusedUploads() {
  const { rows } = await db.query(
    `SELECT u.id, u.storage_key FROM uploads u
      WHERE u.status = 'UPLOADED' AND u.created_at < now() - ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM cart_items i WHERE i.photos @> jsonb_build_array(jsonb_build_object('uploadId', u.id::text)))
        AND NOT EXISTS (SELECT 1 FROM order_item_photos p WHERE p.upload_id = u.id)
      LIMIT 500`,
    [String(config.uploads.unusedDays)]
  );
  for (const row of rows) {
    await db.query("UPDATE uploads SET status = 'DELETED', deleted_at = now() WHERE id = $1 AND status = 'UPLOADED'", [row.id]);
    await storage.remove(row.storage_key);
  }
  await storage.sweepTemp();
  // Files whose record is gone (an account that was deleted): nothing points at them any more.
  if (!storage.ownsEveryFile()) return rows.length; // a development machine sharing the live bucket: its files are not ours to remove
  const files = (await storage.listFiles("private")).filter((f) => f.ageMs > 24 * 60 * 60 * 1000);
  for (let i = 0; i < files.length; i += 200) {
    const batch = files.slice(i, i + 200);
    const known = new Set((await db.query(`SELECT id FROM uploads WHERE status <> 'DELETED' AND id IN (${batch.map((_, n) => `$${n + 1}`).join(", ")})`, batch.map((f) => f.id))).rows.map((r) => r.id));
    for (const f of batch) if (!known.has(f.id)) await storage.remove(f.key);
  }
  return rows.length;
}

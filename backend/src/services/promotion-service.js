/* ==========================================================================
   Promotions (owner, 2026-10-26): the home page's picture banners and the
   slim promotion strips on the home, shop, product and Home Decor pages,
   managed in Admin -> Promotions (migration 023).

   Each promotion is a picture with its words drawn in: a laptop picture and
   a phone picture (the phone one may be left out: the laptop one is used).
   An uploaded picture is made into a WebP no wider than the place needs
   (nothing is drawn on it, only the size and file type change), kept in the
   file storage's public area and served from /media/promo/<id>/<laptop|phone>.

     publicList()                 the promotions to show now (on, inside their days)
     adminList()                  every promotion, for the admin panel
     create(data) / update(id, data) / remove(id)
     savePicture(id, which, req)  the request body is the picture's own bytes
     sendPicture(req, res, next)  GET /media/promo/:id/:which
   ========================================================================== */
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors, HttpError } from "../lib/errors.js";
import { inspectImage } from "../lib/image-info.js";
import { toView } from "../lib/heif.js";
import * as storage from "../lib/storage.js";
import { newId } from "../lib/tokens.js";

/** Where a promotion can be shown, with the picture sizes that fit there (pixels). */
export const PLACEMENTS = {
  "home-banners": { label: "Home: big banners (slides)", kind: "banner", laptop: [2400, 760], phone: [1080, 608] },
  "home-after-banners": { label: "Home: strip under the banners", kind: "strip", laptop: [2400, 300], phone: [1080, 260] },
  "home-after-recommended": { label: "Home: strip under Recommended", kind: "strip", laptop: [2400, 300], phone: [1080, 260] },
  "home-after-shops": { label: "Home: strip under Shops", kind: "strip", laptop: [2400, 300], phone: [1080, 260] },
  "shop-after-shops": { label: "Shop page: strip under the shops list", kind: "strip", laptop: [2400, 300], phone: [1080, 260] },
  "product-before-related": { label: "Product page: strip above “You may also like”", kind: "strip", laptop: [2400, 300], phone: [1080, 260] },
  "decor-after-featured": { label: "Home Decor page: strip under Featured", kind: "strip", laptop: [2400, 300], phone: [1080, 260] }
};
const MAX_BYTES = 15 * 1024 * 1024;
const COUPON_RULE = /^COUPON:[A-Z0-9_-]{2,40}$/;

const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const day = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);
const stamp = (r) => new Date(r.updated_at).getTime();
const picture = (r, which) => (r[`${which}_key`] ? `/media/promo/${r.id}/${which}?v=${stamp(r)}` : r[`${which}_src`] || null);

function shape(r, { admin = false } = {}) {
  const laptop = picture(r, "laptop");
  const out = {
    id: r.id,
    placement: r.placement,
    kind: (PLACEMENTS[r.placement] || {}).kind || "strip",
    title: r.title,
    link: r.link,
    laptop,
    phone: picture(r, "phone") || laptop,
    // What hides it by itself: { coupon: "XUSE10" } or { feature: "firstOrderFree" }
    hide: r.hide_when.startsWith("COUPON:") ? { coupon: r.hide_when.slice(7) } : r.hide_when === "FIRST_ORDER_FREE" ? { feature: "firstOrderFree" } : null
  };
  if (!admin) return out;
  const today = todayIst();
  const startsOn = day(r.starts_on);
  const endsOn = day(r.ends_on);
  return {
    ...out,
    position: r.position,
    active: r.active,
    startsOn,
    endsOn,
    hideWhen: r.hide_when,
    hasPhonePicture: Boolean(r.phone_key || r.phone_src),
    // What a visitor sees today
    state: !r.active ? "OFF" : startsOn && startsOn > today ? "SCHEDULED" : endsOn && endsOn < today ? "ENDED" : !laptop ? "NO_PICTURE" : "LIVE",
    updatedAt: r.updated_at
  };
}

export async function publicList() {
  const today = todayIst();
  const { rows } = await db.query(
    `SELECT * FROM promotions WHERE active AND (starts_on IS NULL OR starts_on <= $1::date) AND (ends_on IS NULL OR ends_on >= $1::date)
       AND (laptop_key IS NOT NULL OR laptop_src IS NOT NULL) ORDER BY placement, position, created_at`,
    [today]
  );
  return rows.map((r) => shape(r));
}

export async function adminList() {
  const { rows } = await db.query("SELECT * FROM promotions ORDER BY placement, position, created_at");
  return { items: rows.map((r) => shape(r, { admin: true })), placements: PLACEMENTS };
}

/** A link on the website ("shop.html?x=1", "#shops") or a full https address. Nothing that could run. */
function cleanLink(value) {
  const link = String(value || "").trim();
  if (!link) return "";
  if (link.length > 500) throw errors.validation({ link: "That link is too long." });
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"<>]*)?$/i.test(link)) return link;
  if (/^(#[\w-]+|[a-z0-9-]+\.html([?#][^\s"<>]*)?)$/i.test(link)) return link;
  throw errors.validation({ link: 'Use a page of the website (like "shop.html" or "studio.html") or a full address starting with https://.' });
}

function cleanDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(value))) throw errors.validation({ [field]: "Choose a date." });
  return String(value);
}

function clean(data, current = null) {
  const out = {};
  const fields = {};
  const has = (k) => data[k] !== undefined;
  if (!current || has("placement")) {
    if (!PLACEMENTS[data.placement]) fields.placement = "Choose where it is shown.";
    else out.placement = data.placement;
  }
  if (!current || has("title")) {
    const title = String(data.title || "").replace(/\s+/g, " ").trim();
    if (title.length < 2 || title.length > 200) fields.title = "Write what the picture says (2 to 200 characters). Screen readers and search engines read it.";
    else out.title = title;
  }
  try {
    if (!current || has("link")) out.link = cleanLink(data.link);
    if (!current || has("startsOn")) out.starts_on = cleanDate(data.startsOn, "startsOn");
    if (!current || has("endsOn")) out.ends_on = cleanDate(data.endsOn, "endsOn");
  } catch (error) {
    Object.assign(fields, error.fields || {});
  }
  const starts = out.starts_on !== undefined ? out.starts_on : current && day(current.starts_on);
  const ends = out.ends_on !== undefined ? out.ends_on : current && day(current.ends_on);
  if (starts && ends && ends < starts) fields.endsOn = "The last day is before the first day.";
  if (!current || has("hideWhen")) {
    const rule = String(data.hideWhen || "").trim().toUpperCase();
    if (rule && rule !== "FIRST_ORDER_FREE" && !COUPON_RULE.test(rule)) fields.hideWhen = "Type the coupon code (letters and numbers).";
    else out.hide_when = rule;
  }
  if (has("active")) out.active = Boolean(data.active);
  if (has("position")) {
    const n = Number(data.position);
    if (!Number.isInteger(n) || n < 0 || n > 1000) fields.position = "Choose a number from 0 to 1000.";
    else out.position = n;
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
  return out;
}

const row = async (id, q = db) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw errors.notFound("That promotion doesn't exist.");
  const r = (await q.query("SELECT * FROM promotions WHERE id = $1", [id])).rows[0];
  if (!r) throw errors.notFound("That promotion doesn't exist.");
  return r;
};

export async function create(data, { actor, ip = null }) {
  const values = clean(data);
  const id = newId();
  await db.tx(async (q) => {
    const last = (await q.query("SELECT coalesce(max(position), 0) AS n FROM promotions WHERE placement = $1", [values.placement])).rows[0].n;
    await q.query(
      `INSERT INTO promotions (id, placement, title, link, position, active, starts_on, ends_on, hide_when)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, values.placement, values.title, values.link, values.position ?? Number(last) + 1, values.active ?? true, values.starts_on, values.ends_on, values.hide_when]
    );
    await audit(q, { actor, action: ACTIONS.PROMOTION_CHANGED, targetType: "promotion", targetId: id, metadata: { change: "created", placement: values.placement }, ip });
  });
  return shape(await row(id), { admin: true });
}

export async function update(id, data, { actor, ip = null }) {
  const current = await row(id);
  const values = clean(data, current);
  const sets = Object.keys(values);
  if (sets.length) {
    await db.tx(async (q) => {
      await q.query(`UPDATE promotions SET ${sets.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...sets.map((k) => values[k])]);
      await audit(q, { actor, action: ACTIONS.PROMOTION_CHANGED, targetType: "promotion", targetId: id, metadata: { change: "updated", fields: sets }, ip });
    });
  }
  return shape(await row(id), { admin: true });
}

/** Up or down in its place: swaps the order with the neighbour. */
export async function move(id, direction, { actor, ip = null }) {
  const current = await row(id);
  const { rows } = await db.query("SELECT id, position FROM promotions WHERE placement = $1 ORDER BY position, created_at", [current.placement]);
  const at = rows.findIndex((r) => r.id === id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (to >= 0 && to < rows.length) {
    await db.tx(async (q) => {
      // Positions are renumbered 1..n in the new order, so equal numbers can't get stuck
      const order = rows.map((r) => r.id);
      [order[at], order[to]] = [order[to], order[at]];
      for (let i = 0; i < order.length; i++) await q.query("UPDATE promotions SET position = $2 WHERE id = $1", [order[i], i + 1]);
      await q.query("UPDATE promotions SET updated_at = now() WHERE id = $1", [id]);
      await audit(q, { actor, action: ACTIONS.PROMOTION_CHANGED, targetType: "promotion", targetId: id, metadata: { change: "moved", direction }, ip });
    });
  }
  return adminList();
}

export async function remove(id, { actor, ip = null }) {
  const current = await row(id);
  await db.tx(async (q) => {
    await q.query("DELETE FROM promotions WHERE id = $1", [id]);
    await audit(q, { actor, action: ACTIONS.PROMOTION_CHANGED, targetType: "promotion", targetId: id, metadata: { change: "deleted", placement: current.placement }, ip });
  });
  for (const key of [current.laptop_key, current.phone_key]) if (key) await storage.remove(key).catch(() => {});
  return adminList();
}

/** The laptop or phone picture of a promotion. The body is the picture's own bytes (JPG, PNG, WebP, HEIC or AVIF). */
export async function savePicture(id, which, req, { actor, ip = null }) {
  if (!["laptop", "phone"].includes(which)) throw errors.notFound("Not found.");
  const current = await row(id);
  const size = PLACEMENTS[current.placement][which];
  const tooLarge = () => new HttpError(413, "MEDIA_TOO_LARGE", "That picture is larger than 15 MB. Please choose a smaller one.");
  if (Number(req.headers["content-length"]) > MAX_BYTES) throw tooLarge();
  let received;
  try {
    received = await storage.receive(req, MAX_BYTES);
  } catch (error) {
    if (error instanceof storage.TooLarge) throw tooLarge();
    throw new HttpError(400, "MEDIA_FAILED", "We couldn't upload that picture. Please try again.");
  }
  try {
    const info = await inspectImage(received.tempPath);
    if (!info || !received.bytes) throw new HttpError(415, "MEDIA_UNSUPPORTED", "Please upload a JPG, PNG, WebP or HEIC picture.");
    // A WebP no wider than the place needs (a 2400 px banner, a 1080 px phone picture): pages stay fast
    let webp;
    try {
      webp = (await toView(received.tempPath, info.format, { edge: size[0], fit: "width", quality: 86 })).webp;
    } catch {
      throw new HttpError(415, "MEDIA_UNSUPPORTED", "We couldn't read that picture. Please try another one.");
    }
    const key = storage.newKey("public");
    await storage.put(key, webp);
    try {
      await db.tx(async (q) => {
        await q.query(`UPDATE promotions SET ${which}_key = $2, ${which}_src = NULL, updated_at = now() WHERE id = $1`, [id, key]);
        await audit(q, { actor, action: ACTIONS.PROMOTION_CHANGED, targetType: "promotion", targetId: id, metadata: { change: `${which} picture`, width: info.width, height: info.height }, ip });
      });
    } catch (error) {
      await storage.remove(key).catch(() => {});
      throw error;
    }
    if (current[`${which}_key`]) await storage.remove(current[`${which}_key`]).catch(() => {});
    // A different shape than the place expects is allowed (it is shown in the place's shape): the admin is told
    const expected = size[0] / size[1];
    const ratio = info.width / info.height;
    const warning = Math.abs(ratio - expected) / expected > 0.08 ? `This picture is ${info.width} × ${info.height}. This place shows ${size[0]} × ${size[1]} (the same shape), so its edges may be cut off.` : null;
    return { promotion: shape(await row(id), { admin: true }), warning };
  } finally {
    await storage.discard(received.tempPath).catch(() => {});
  }
}

/** GET /media/promo/:id/:which: an uploaded promotion picture (only one that is switched on). */
export async function sendPicture(req, res, next) {
  const { id, which } = req.params;
  if (!["laptop", "phone"].includes(which) || !/^[0-9a-f-]{36}$/i.test(String(id))) return next();
  const r = (await db.query("SELECT laptop_key, phone_key FROM promotions WHERE id = $1", [id])).rows[0];
  const key = r && (r[`${which}_key`] || (which === "phone" ? r.laptop_key : null));
  if (!key || !(await storage.exists(key))) return next();
  // The address changes with every new picture (?v=), so it may be kept for a day
  res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
  storage.open(key).on("error", next).pipe(res);
}

/** Every stored promotion picture (the storage check). */
export async function storedKeys() {
  const { rows } = await db.query("SELECT id, placement, laptop_key, phone_key, created_at FROM promotions WHERE laptop_key IS NOT NULL OR phone_key IS NOT NULL");
  return rows;
}

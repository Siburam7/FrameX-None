/* ==========================================================================
   Cart reminder emails (owner, 2026-10-31).

   A customer who left items in the cart and did not touch it for a day gets ONE
   email that shows the cart and, when the admin chose one, a coupon. Rules:
     - only CUSTOMER accounts that are active and did not turn reminders off;
     - one email per cart state (carts.reminded_at): a cart changed later can be
       reminded again; a cart is not reminded after an order or when nothing in it
       can be bought any more;
     - only between fromHour and toHour (India time) and at most dailyLimit a day,
       so the free email quota always has room for login codes and order emails;
     - the email shows the products' own pictures, never a customer's photo.
   runDue() is started by the server every few minutes; an admin can also send one
   from the admin panel. Settings: config.cartReminders (Admin -> Settings).
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { errors } from "../lib/errors.js";
import { linkBase } from "../lib/context.js";
import { emailStatus, messages, sendMail } from "../lib/mailer.js";
import { newId } from "../lib/tokens.js";
import { indianMobile, whatsappStatus } from "../lib/whatsapp.js";
import { getCart } from "./cart-service.js";
import { cartReminder as whatsappCartReminder } from "./whatsapp-service.js";
import { productsById, templatesById } from "./catalog-service.js";
import * as coupons from "./coupon-service.js";

const R = () => config.cartReminders;
const offsetMs = () => config.analytics.utcOffsetMinutes * 60_000;
const localHour = (now) => new Date(now.getTime() + offsetMs()).getUTCHours();
/** The start of today in India time (as a real moment). */
function startOfLocalDay(now) {
  const local = new Date(now.getTime() + offsetMs());
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs());
}
// A cart older than this is not reminded any more (e.g. when reminders are switched on after a long time)
const MAX_AGE_DAYS = 14;

/* ---------------------------------------------------------------- "Don't send me cart reminders" */
const sig = (payload) => crypto.createHmac("sha256", config.authSecret).update("cart-reminders-off:" + payload).digest("base64url");
export const unsubscribeToken = (userId) => {
  const payload = Buffer.from(String(userId)).toString("base64url");
  return `${payload}.${sig(payload)}`;
};
const unsubscribeUrl = (userId) => `${linkBase()}/index.html?reminders=off&t=${encodeURIComponent(unsubscribeToken(userId))}`;

/** The link in the email (no login needed): this customer gets no more cart reminders. */
export async function unsubscribe(token) {
  const [payload, given] = String(token || "").split(".");
  const want = payload ? sig(payload) : "";
  if (!payload || !given || given.length !== want.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) throw errors.badRequest("This link isn't valid.", "LINK_INVALID");
  await db.query("UPDATE users SET cart_reminders_off = true, updated_at = now() WHERE id = $1", [Buffer.from(payload, "base64url").toString()]);
  return { ok: true };
}

/** The customer's own choice on the account page. */
export async function setOwnChoice(userId, wanted) {
  await db.query("UPDATE users SET cart_reminders_off = $2, updated_at = now() WHERE id = $1", [userId, !wanted]);
  return { cartReminders: Boolean(wanted) };
}

/* ---------------------------------------------------------------- What goes in the email */

/** A product's or template's own first picture (from the catalogue), never what the customer uploaded. */
function firstPicture(data) {
  if (!data || typeof data !== "object") return "";
  const pick = (v) => (typeof v === "string" ? v : v && typeof v === "object" ? v.src || v.url || "" : "");
  for (const key of ["image", "cover", "preview"]) if (pick(data[key])) return pick(data[key]);
  for (const key of ["images", "gallery", "photos"]) if (Array.isArray(data[key]) && pick(data[key][0])) return pick(data[key][0]);
  return "";
}

/** An address a mail program can load: the website's pictures, or the API's own (when its public address is known). */
function pictureUrl(src) {
  const s = String(src || "");
  if (/^https:\/\//.test(s)) return s;
  if (/^assets\//.test(s)) return `${config.frontendUrl}/${s}`;
  if (/^\/(media|api)\//.test(s) && config.publicApiUrl) return config.publicApiUrl.replace(/\/api$/, "") + s;
  return "";
}

async function picturesFor(items) {
  const products = await productsById(items.map((i) => i.productId));
  const templates = await templatesById(items.map((i) => i.templateId));
  return items.map((i) => {
    const data = (products.get(i.productId) || {}).data || (templates.get(i.templateId) || {}).data;
    return pictureUrl(firstPicture(data));
  });
}

/** The coupon to offer (Admin -> Settings), only while the customer can still use it. -> { code, text } | null */
async function couponFor(userId) {
  const code = coupons.normalizeCode(R().coupon);
  if (!code) return null;
  const found = await coupons.lookup(code, userId);
  const row = found && found.row;
  const now = new Date();
  if (!row || !row.active || (row.ends_at && new Date(row.ends_at) < now) || (row.starts_at && new Date(row.starts_at) > now)) return null;
  if (row.per_user_limit && found.uses >= row.per_user_limit) return null;
  const upTo = row.max_discount ? ` (up to ₹${Number(row.max_discount).toLocaleString("en-IN")})` : "";
  const from = row.min_order ? ` on orders of ₹${Number(row.min_order).toLocaleString("en-IN")} and more` : "";
  return { code, text: `${row.percent_off}% off${upTo}${from}.` };
}

/* ---------------------------------------------------------------- Sending */

/** Carts that are due now, oldest first. */
async function dueCarts(limit) {
  const { rows } = await db.query(
    `SELECT c.id AS cart_id, c.user_id
       FROM carts c JOIN users u ON u.id = c.user_id
      WHERE c.updated_at <= now() - make_interval(hours => $1)
        AND c.updated_at > now() - make_interval(days => $3)
        AND (c.reminded_at IS NULL OR c.reminded_at < c.updated_at)
        AND EXISTS (SELECT 1 FROM cart_items i WHERE i.cart_id = c.id)
        AND u.role = 'CUSTOMER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND NOT u.cart_reminders_off AND u.email IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id AND o.created_at > c.updated_at AND o.status <> 'CANCELLED')
      ORDER BY c.updated_at
      LIMIT $2`,
    [R().hours, limit, MAX_AGE_DAYS]
  );
  return rows;
}

/** Reminders sent today (India time) on one channel: the email and the WhatsApp limits are counted apart. */
const sentToday = async (now, channel = "EMAIL") =>
  Number((await db.query("SELECT count(*)::int AS n FROM cart_reminders WHERE sent_at >= $1 AND channel = $2", [startOfLocalDay(now), channel])).rows[0].n);

/**
 * One cart's email. Claims the cart first (so two runs can't both send it); gives the claim back when the email
 * could not be sent. -> { sent, reason }
 */
async function remind(cartId, userId, how) {
  const user = (await db.query("SELECT id, name, email FROM users WHERE id = $1", [userId])).rows[0];
  const cart = await getCart(userId);
  const items = cart.items.filter((i) => i.available);
  const claim = await db.query("UPDATE carts SET reminded_at = now() WHERE id = $1 AND (reminded_at IS NULL OR reminded_at < updated_at) RETURNING id", [cartId]);
  if (!claim.rows.length) return { sent: false, reason: "ALREADY_REMINDED" };
  // Nothing in it can be bought: no email (the claim stays, so it isn't looked at again until the cart changes)
  if (!user || !items.length) return { sent: false, reason: "NOTHING_TO_BUY" };

  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const pictures = await picturesFor(items);
  const coupon = await couponFor(userId);
  const reminderId = newId();
  await db.query("INSERT INTO cart_reminders (id, user_id, cart_id, items, value, coupon_code, how) VALUES ($1, $2, $3, $4, $5, $6, $7)", [reminderId, userId, cartId, items.reduce((n, i) => n + i.quantity, 0), total, coupon ? coupon.code : null, how]);
  const lines = items.map((i, k) => ({ name: i.name, quantity: i.quantity, lineTotal: i.lineTotal, image: pictures[k] }));
  const result = await sendMail({ to: user.email, ...messages.cartReminder(user.name, lines, total, coupon, `${linkBase()}/checkout.html`, unsubscribeUrl(userId)) });
  if (!result.delivered && result.reason !== "dev") {
    // Not sent: it doesn't count, and the cart can be tried again later
    await db.query("DELETE FROM cart_reminders WHERE id = $1", [reminderId]);
    await db.query("UPDATE carts SET reminded_at = NULL WHERE id = $1", [cartId]);
    return { sent: false, reason: result.reason || "SEND_FAILED" };
  }
  return { sent: true };
}

/** The server's timer: every cart that is due, within the hours and the daily limit. -> { sent, skipped, why } */
export async function runDue(now = new Date()) {
  const s = R();
  if (!s.enabled) return { sent: 0, why: "off" };
  if (emailStatus().mode === "none") return { sent: 0, why: "no email service" };
  const hour = localHour(now);
  if (hour < s.fromHour || hour >= s.toHour) return { sent: 0, why: "outside sending hours" };
  const room = s.dailyLimit - (await sentToday(now));
  if (room <= 0) return { sent: 0, why: "daily limit reached" };
  let sent = 0;
  let skipped = 0;
  for (const c of await dueCarts(room)) {
    const r = await remind(c.cart_id, c.user_id, "AUTO");
    if (r.sent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

/* ---------------------------------------------------------------- On WhatsApp (owner, 2026-11-09)
   "WhatsApp 3 ghante, email 24 ghante": a customer who said yes to offers and reminders on WhatsApp (users.whatsapp_offers:
   the account page or the checkout tick) gets ONE WhatsApp per cart state after config.cartReminders.whatsappHours,
   9 am to 9 pm, at most whatsappDailyLimit a day (each is a paid "Marketing" message). The email still comes later. */
const WHATSAPP_MAX_AGE_DAYS = 3; // switched on after a while: old carts are not messaged
const itemsText = (items) => {
  const first = String(items[0].name || "your frame").slice(0, 60);
  return items.length > 1 ? `${first} and ${items.length - 1} more` : first;
};

async function dueOnWhatsApp(limit) {
  const { rows } = await db.query(
    `SELECT c.id AS cart_id, c.user_id
       FROM carts c JOIN users u ON u.id = c.user_id
      WHERE c.updated_at <= now() - make_interval(hours => $1)
        AND c.updated_at > now() - make_interval(days => $3)
        AND (c.wa_reminded_at IS NULL OR c.wa_reminded_at < c.updated_at)
        AND EXISTS (SELECT 1 FROM cart_items i WHERE i.cart_id = c.id)
        AND u.role = 'CUSTOMER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.whatsapp_offers AND u.whatsapp_offers_phone IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id AND o.created_at > c.updated_at AND o.status <> 'CANCELLED')
      ORDER BY c.updated_at
      LIMIT $2`,
    [R().whatsappHours, limit, WHATSAPP_MAX_AGE_DAYS]
  );
  return rows;
}

/** One cart's WhatsApp. Claimed first (two runs can't both send it); a failed message isn't tried again for this cart state. */
async function remindOnWhatsApp(cartId, userId) {
  const claim = await db.query("UPDATE carts SET wa_reminded_at = now() WHERE id = $1 AND (wa_reminded_at IS NULL OR wa_reminded_at < updated_at) RETURNING updated_at", [cartId]);
  if (!claim.rows.length) return { sent: false, reason: "ALREADY_REMINDED" };
  const user = (await db.query("SELECT name, whatsapp_offers, whatsapp_offers_phone FROM users WHERE id = $1", [userId])).rows[0];
  if (!user || !user.whatsapp_offers || !user.whatsapp_offers_phone) return { sent: false, reason: "NO_CONSENT" };
  const items = (await getCart(userId)).items.filter((i) => i.available);
  if (!items.length) return { sent: false, reason: "NOTHING_TO_BUY" };
  const ref = `${cartId}:${new Date(claim.rows[0].updated_at).toISOString()}`;
  const result = await whatsappCartReminder({ ref, name: user.name, phone: user.whatsapp_offers_phone, items: itemsText(items) });
  if (result !== "sent" && result !== "dev") return { sent: false, reason: result };
  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
  await db.query("INSERT INTO cart_reminders (id, user_id, cart_id, items, value, coupon_code, how, channel) VALUES ($1, $2, $3, $4, $5, NULL, 'AUTO', 'WHATSAPP')", [
    newId(),
    userId,
    cartId,
    items.reduce((n, i) => n + i.quantity, 0),
    total
  ]);
  return { sent: true };
}

/** The server's timer (with runDue): every cart due on WhatsApp, within the hours and the WhatsApp daily limit. */
export async function runDueWhatsApp(now = new Date()) {
  const s = R();
  if (!config.whatsapp.cartReminders) return { sent: 0, why: "off" };
  if (whatsappStatus().mode === "none") return { sent: 0, why: "no WhatsApp service" };
  const hour = localHour(now);
  if (hour < s.fromHour || hour >= s.toHour) return { sent: 0, why: "outside sending hours" };
  const room = s.whatsappDailyLimit - (await sentToday(now, "WHATSAPP"));
  if (room <= 0) return { sent: 0, why: "daily limit reached" };
  let sent = 0;
  let skipped = 0;
  for (const c of await dueOnWhatsApp(room)) {
    const r = await remindOnWhatsApp(c.cart_id, c.user_id);
    if (r.sent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

/* ---------------------------------------------------------------- A customer's yes / no to WhatsApp offers */
/** The account page's switch. On needs a mobile number: the one given, or the account's, or the newest address's. */
export async function setWhatsAppOffers(userId, wanted, phone = "") {
  if (!wanted) {
    await db.query("UPDATE users SET whatsapp_offers = false, updated_at = now() WHERE id = $1", [userId]);
    return { whatsappOffers: false, whatsappOffersPhone: null };
  }
  const u = (await db.query("SELECT phone FROM users WHERE id = $1", [userId])).rows[0];
  const address = (await db.query("SELECT phone FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC LIMIT 1", [userId])).rows[0];
  const number = indianMobile(phone) || indianMobile(u && u.phone) || indianMobile(address && address.phone);
  if (!number) throw errors.validation({ phone: "Add your 10-digit mobile number first." });
  await db.query("UPDATE users SET whatsapp_offers = true, whatsapp_offers_phone = $2, whatsapp_offers_at = now(), updated_at = now() WHERE id = $1", [userId, "+91" + number]);
  return { whatsappOffers: true, whatsappOffersPhone: "+91" + number };
}

/** The checkout tick "Send order updates and reminders to my WhatsApp" said yes for this number. */
export async function whatsappOffersFromCheckout(userId, phone) {
  const number = indianMobile(phone);
  if (!userId || !number) return;
  await db.query("UPDATE users SET whatsapp_offers = true, whatsapp_offers_phone = $2, whatsapp_offers_at = now() WHERE id = $1", [userId, "+91" + number]);
}

/** An admin presses "Send reminder" (no waiting time, no sending hours; the daily limit still applies). */
export async function sendNow(cartId) {
  const row = (
    await db.query(
      `SELECT c.id, c.user_id, u.role, u.status, u.deleted_at, u.cart_reminders_off, u.email,
              EXISTS (SELECT 1 FROM cart_items i WHERE i.cart_id = c.id) AS has_items
         FROM carts c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [cartId]
    )
  ).rows[0];
  if (!row || !row.has_items) throw errors.notFound("That cart is empty or no longer exists.");
  if (row.role !== "CUSTOMER" || row.status !== "ACTIVE" || row.deleted_at) throw errors.badRequest("This account can't get cart reminders.", "NOT_A_CUSTOMER");
  if (!row.email) throw errors.badRequest("This customer joined with a mobile number and has no email address.", "NO_EMAIL");
  if (row.cart_reminders_off) throw errors.badRequest("This customer turned cart reminders off.", "REMINDERS_OFF");
  if (emailStatus().mode === "none") throw errors.badRequest("Emails can't be sent: no email service is set up.", "EMAIL_NOT_CONFIGURED");
  if ((await sentToday(new Date())) >= R().dailyLimit) throw errors.badRequest("Today's cart reminder limit is reached (Admin → Settings). Try again tomorrow.", "DAILY_LIMIT");
  const r = await remind(row.id, row.user_id, "ADMIN");
  if (r.reason === "ALREADY_REMINDED") throw errors.conflict("This cart was already reminded. A cart gets one reminder until it changes.", null, "ALREADY_REMINDED");
  if (r.reason === "NOTHING_TO_BUY") throw errors.badRequest("Nothing in this cart can be bought at the moment, so no reminder was sent.", "NOTHING_TO_BUY");
  if (!r.sent) throw errors.badRequest("The email couldn't be sent right now. Please try again later.", "SEND_FAILED");
  return { ok: true };
}

/* ---------------------------------------------------------------- For the admin's pages */

/** Carts with items that were left untouched for the reminder wait (newest first), with their reminder. */
export async function leftCarts(limit = 50) {
  const { rows } = await db.query(
    `SELECT c.id, c.updated_at, c.reminded_at, u.id AS user_id, u.name, u.cart_reminders_off,
            sum(i.quantity)::int AS items, coalesce(sum(i.unit_price * i.quantity), 0)::int AS value,
            (SELECT max(r.sent_at) FROM cart_reminders r WHERE r.cart_id = c.id AND r.sent_at >= c.updated_at) AS reminder_sent
       FROM carts c JOIN users u ON u.id = c.user_id JOIN cart_items i ON i.cart_id = c.id
      WHERE c.updated_at <= now() - make_interval(hours => $1) AND u.role = 'CUSTOMER' AND u.deleted_at IS NULL
      GROUP BY c.id, u.id
      ORDER BY c.updated_at DESC
      LIMIT $2`,
    [R().hours, limit]
  );
  const all = await db.query(
    `SELECT count(*)::int AS carts, coalesce(sum(t.value), 0)::int AS value FROM (
       SELECT c.id, sum(i.unit_price * i.quantity) AS value FROM carts c JOIN users u ON u.id = c.user_id JOIN cart_items i ON i.cart_id = c.id
        WHERE c.updated_at <= now() - make_interval(hours => $1) AND u.role = 'CUSTOMER' AND u.deleted_at IS NULL GROUP BY c.id) t`,
    [R().hours]
  );
  return {
    afterHours: R().hours,
    carts: all.rows[0].carts,
    value: all.rows[0].value,
    items: rows.map((r) => ({
      cartId: r.id,
      customer: r.name,
      items: r.items,
      value: r.value,
      leftAt: r.updated_at,
      reminderSentAt: r.reminder_sent,
      remindersOff: r.cart_reminders_off,
    })),
  };
}

/**
 * Reminders sent in a period, and how many came back: an order (not cancelled, not a test, not waiting for
 * payment) by the same customer within 7 days after the email.
 */
export async function reminderFigures(from, to) {
  const { rows } = await db.query(
    `SELECT r.id, r.sent_at, r.value, r.how, u.name,
            (SELECT o.total FROM orders o WHERE o.user_id = r.user_id AND o.created_at > r.sent_at AND o.created_at < r.sent_at + interval '7 days'
                AND o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT') AND NOT coalesce(o.is_test, false) ORDER BY o.created_at LIMIT 1) AS came_back
       FROM cart_reminders r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.sent_at >= $1 AND r.sent_at < $2
      ORDER BY r.sent_at DESC`,
    [from, to]
  );
  const back = rows.filter((r) => r.came_back !== null);
  return {
    sent: rows.length,
    cameBack: back.length,
    cameBackValue: back.reduce((sum, r) => sum + Number(r.came_back), 0),
    recent: rows.slice(0, 20).map((r) => ({ customer: r.name || "Deleted account", sentAt: r.sent_at, value: r.value, how: r.how, ordered: r.came_back !== null })),
    settings: { enabled: R().enabled, hours: R().hours, coupon: R().coupon, dailyLimit: R().dailyLimit, fromHour: R().fromHour, toHour: R().toHour },
  };
}

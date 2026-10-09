/* ==========================================================================
   Analytics: what is collected, and how carefully.

   Business figures (orders, payments, refunds, accounts) are NOT collected
   here: the admin reports read them straight from the tables that the
   checkout and the payment gateway write (admin-analytics-service.js).

   This file records the three things those tables don't know:

   1. Visitor statistics (recordWebEvents): pages, products, templates and
      searches, sent by the website's analytics module. A batch is stored only
      when it says the visitor allowed analytics. Every field is checked and
      cut to size here; what does not fit a known shape is dropped. Nothing
      that identifies a person is kept: no IP address, no account id, no
      email or phone (search words that look like one are removed), only the
      page's path (never its query string) and only the host of a referrer.

   2. What a logged-in customer put in their cart (recordServerEvent), written
      by the cart itself. The cart is emptied by an order, so this is the only
      lasting count of "added to cart". No visitor id, no account id.

   3. Logins and failed logins (recordAuthEvent), for the security figures.

   Recording must never break what it records: these functions log a failure
   and carry on, so a customer can always log in or add to their cart.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { newId } from "../lib/tokens.js";

/** What the website may send. (add_to_cart is counted by the cart; purchases by the orders table.) */
export const WEB_EVENTS = ["page_view", "view_item", "view_item_list", "view_template", "view_artwork", "view_artist", "view_shop", "search", "begin_checkout", "live_demo_opened"];
export const ITEM_TYPES = ["product", "template", "artwork", "artist", "shop", "category", "design"];
export const CHANNELS = ["direct", "search", "social", "referral", "campaign", "email", "paid"];
export const MAX_BATCH = 20;

const ID = /^[A-Za-z0-9_-]{16,40}$/;
const PAGE = /^[a-z0-9-]{1,30}$/;
const PATH = /^\/[A-Za-z0-9._~/-]{0,120}$/;
const ITEM_ID = /^[A-Za-z0-9._:-]{1,80}$/;
// Programs, not people: search engines' crawlers, link previews, uptime checks, scripted browsers.
const BOT = /bot[/\-;) ]|bot$|crawl|spider|slurp|headless|lighthouse|pagespeed|bingpreview|uptime|curl\/|wget\/|python-requests|okhttp|facebookexternalhit|whatsapp\//i;
const WEBMAIL = /(^|\.)mail\.(google|yahoo)\.|(^|\.)outlook\.(live|office|office365)\.com$|(^|\.)(proton|tutanota)\.(me|com)$/;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|startpage)\.|(^|\.)search\.brave\.com$/;
const SOCIAL = /(^|\.)(facebook|instagram|twitter|x|t|youtube|youtu|linkedin|pinterest|reddit|telegram|whatsapp|threads|snapchat)\.(com|co|be|net|me|org)$|(^|\.)(wa\.me|t\.me|lnkd\.in|fb\.me)$/;

/** Plain text of a known length: no control characters, single spaces. */
export function cleanText(value, max) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s || null;
}

/** Search words as they are kept: lower case, and without anything that looks like an email address or a phone number. */
export function scrubQuery(value) {
  const s = cleanText(value, 200);
  if (!s) return null;
  return (
    s
      .toLowerCase()
      .replace(/[^\s@]+@[^\s@]+/g, " ")
      .replace(/\+?\d[\d\s().-]{5,}\d/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || null
  );
}

const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The host a visit came from, or null when there is none or it is this website itself. */
export function referrerHost(value, ownHosts = []) {
  const s = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (!s) return null;
  const host = /^https?:\/\//i.test(s) ? hostOf(s) : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase().replace(/^www\./, "") : "";
  if (!host || host.length > 100) return null;
  return ownHosts.includes(host) ? null : host;
}

/** How a visit arrived. A tagged link (utm_medium) says it itself; otherwise the referrer's host decides. */
export function channelOf({ referrer = null, utmSource = null, utmMedium = null } = {}) {
  const medium = String(utmMedium || "").toLowerCase();
  if (medium) {
    if (/^(cpc|ppc|paid|paidsearch|paid-social|paid_social|display|ads?)$/.test(medium)) return "paid";
    if (/^e-?mail$/.test(medium)) return "email";
    if (/^(social|social-media|social_media|sm)$/.test(medium)) return "social";
    if (medium === "organic") return "search";
    if (medium === "referral") return "referral";
    return "campaign";
  }
  if (utmSource) return "campaign";
  if (!referrer) return "direct";
  if (WEBMAIL.test(referrer)) return "email";
  if (SEARCH.test(referrer)) return "search";
  if (SOCIAL.test(referrer)) return "social";
  return "referral";
}

export const deviceOf = (ua) => (/ipad|tablet|(android(?!.*mobile))/i.test(ua || "") ? "tablet" : /mobi|iphone|ipod|android/i.test(ua || "") ? "mobile" : "desktop");
export const isBot = (ua) => !ua || BOT.test(ua);

/* ---------------------------------------------------------------- Visitors on the site now
   Kept in memory (one server process), not in the database: who is here now is
   not history. Counted from the batches and the once-a-minute signals of
   visitors who allowed analytics, so it is a floor, not a head count. */
const live = new Map(); // visitor id -> last time heard from (ms)
export const LIVE_WINDOW_MS = 5 * 60 * 1000;

export function liveVisitors(now = Date.now()) {
  for (const [id, at] of live) if (now - at > LIVE_WINDOW_MS) live.delete(id);
  return live.size;
}
export const resetLive = () => live.clear();

/* ---------------------------------------------------------------- Visitor statistics from the website */

function shapeEvent(e, { ownHosts }) {
  if (!e || typeof e !== "object" || !WEB_EVENTS.includes(e.name)) return null;
  const utm = e.utm && typeof e.utm === "object" ? e.utm : {};
  const landing = e.landing === true;
  const referrer = landing ? referrerHost(e.referrer, ownHosts) : null;
  const utmSource = landing ? cleanText(utm.source, 60) : null;
  const utmMedium = landing ? cleanText(utm.medium, 60) : null;
  const itemType = ITEM_TYPES.includes(e.itemType) ? e.itemType : null;
  const value = Number.isInteger(e.value) && e.value >= 0 && e.value <= 10_000_000 ? e.value : null;
  return {
    name: e.name,
    page: typeof e.page === "string" && PAGE.test(e.page) ? e.page : null,
    path: typeof e.path === "string" && PATH.test(e.path) ? e.path : null,
    landing,
    referrer,
    channel: landing ? channelOf({ referrer, utmSource, utmMedium }) : null,
    utmSource,
    utmMedium,
    utmCampaign: landing ? cleanText(utm.campaign, 60) : null,
    itemType,
    itemId: itemType && typeof e.itemId === "string" && ITEM_ID.test(e.itemId) ? e.itemId : null,
    itemName: itemType ? cleanText(e.itemName, 120) : null,
    category: cleanText(e.category, 60),
    query: e.name === "search" ? scrubQuery(e.query) : null,
    value
  };
}

/**
 * Store one batch from the website.
 *   body: { consent: true, visitorId, sessionId, events: [...] }   (events may be empty: "still here")
 * Returns { stored, reason }. Nothing is stored unless the visitor allowed analytics.
 */
export async function recordWebEvents(body, { userAgent = "", ownHosts = [], user = null } = {}) {
  if (!config.analytics.enabled) return { stored: 0, reason: "off" };
  if (!body || body.consent !== true) return { stored: 0, reason: "no-consent" };
  if (isBot(userAgent)) return { stored: 0, reason: "bot" };
  // FrameX staff looking at the site are not visitors.
  if (user && user.role === "ADMIN") return { stored: 0, reason: "staff" };
  const { visitorId, sessionId } = body;
  if (typeof visitorId !== "string" || !ID.test(visitorId) || typeof sessionId !== "string" || !ID.test(sessionId)) return { stored: 0, reason: "bad-id" };

  live.set(visitorId, Date.now());
  if (live.size > 50_000) liveVisitors();

  const events = (Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : []).map((e) => shapeEvent(e, { ownHosts })).filter(Boolean);
  if (!events.length) return { stored: 0, reason: "" };
  const device = deviceOf(userAgent);
  const params = [];
  const rows = events.map((e) => {
    const values = [newId(), e.name, visitorId, sessionId, e.page, e.path, e.landing, e.referrer, e.channel, e.utmSource, e.utmMedium, e.utmCampaign, e.itemType, e.itemId, e.itemName, e.category, e.query, e.value, device, Boolean(user)];
    return `(${values.map((v) => `$${params.push(v)}`).join(", ")}, 'web')`;
  });
  await db.query(
    `INSERT INTO analytics_events (id, name, visitor_id, session_id, page, path, landing, referrer, channel, utm_source, utm_medium, utm_campaign,
                                   item_type, item_id, item_name, category, query, value, device, logged_in, source)
     VALUES ${rows.join(", ")}`,
    params
  );
  return { stored: events.length, reason: "" };
}

/* ---------------------------------------------------------------- Written by the backend itself */

/** Something the server saw happen (today: a customer added an item to their cart). Never throws. */
export async function recordServerEvent(name, { itemType = null, itemId = null, itemName = null, value = null } = {}) {
  try {
    await db.query("INSERT INTO analytics_events (id, name, source, item_type, item_id, item_name, value, logged_in) VALUES ($1, $2, 'server', $3, $4, $5, $6, true)", [
      newId(),
      name,
      ITEM_TYPES.includes(itemType) ? itemType : null,
      typeof itemId === "string" && ITEM_ID.test(itemId) ? itemId : null,
      cleanText(itemName, 120),
      Number.isInteger(value) && value >= 0 ? value : null
    ]);
  } catch (error) {
    console.error("[analytics] could not record", name, error.message);
  }
}

export const AUTH_REASONS = ["INVALID_CREDENTIALS", "ACCOUNT_DISABLED", "ACCOUNT_NOT_READY", "SHOP_NOT_APPROVED"];

/** A login, or an attempt that failed. Never throws: logging in must not depend on this table. */
export async function recordAuthEvent({ kind, userId = null, role = null, accountType = null, reason = null, ip = null }) {
  try {
    await db.query("INSERT INTO auth_events (id, kind, user_id, role, account_type, reason, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
      newId(),
      kind === "LOGIN" ? "LOGIN" : "LOGIN_FAILED",
      userId,
      role,
      accountType === "shop" ? "shop" : "customer",
      kind === "LOGIN" ? null : AUTH_REASONS.includes(reason) ? reason : "OTHER",
      ip ? String(ip).slice(0, 64) : null
    ]);
  } catch (error) {
    console.error("[analytics] could not record a login event:", error.message);
  }
}

/* ---------------------------------------------------------------- Test orders */

/** True while the payment gateway is in TEST mode: money "paid" then is not real money. */
export const gatewayInTestMode = () => config.payments.mode !== "live";

/**
 * Orders and painting requests from before the is_test column existed get their label once:
 * an order paid online (or a painting with a payment attempt) is a test when the gateway is in
 * TEST mode now. Cash on Delivery has no gateway, so those stay real orders; an admin can mark
 * one as a test by hand (admin-analytics-service.js -> setOrderTest).
 */
export async function labelOlderOrders({ log = () => {} } = {}) {
  const test = gatewayInTestMode();
  const orders = (await db.query("UPDATE orders SET is_test = (payment_method = 'ONLINE' AND $1::boolean) WHERE is_test IS NULL RETURNING is_test", [test])).rows;
  const paintings = (
    await db.query("UPDATE painting_requests r SET is_test = ($1::boolean AND EXISTS (SELECT 1 FROM painting_payments p WHERE p.request_id = r.id)) WHERE r.is_test IS NULL RETURNING is_test", [test])
  ).rows;
  if (orders.length || paintings.length)
    log(`Labelled ${orders.length} earlier order(s) and ${paintings.length} painting request(s): ${orders.filter((r) => r.is_test).length + paintings.filter((r) => r.is_test).length} made with the payment gateway in TEST mode are kept out of sales.`);
}

/* ---------------------------------------------------------------- Housekeeping */

/** Visitor and login records are kept ANALYTICS_RETENTION_DAYS, then deleted. Orders and payments are never touched. */
export async function sweepAnalytics() {
  const days = config.analytics.retentionDays;
  await db.query(`DELETE FROM analytics_events WHERE occurred_at < now() - interval '${days} days'`);
  await db.query(`DELETE FROM auth_events WHERE created_at < now() - interval '${days} days'`);
}

/* ==========================================================================
   FrameX Care live chat (owner, 2026-10-24).

   The customer's chat answers common questions by itself (ui/help-chat.js).
   When they still want a person they press "Connect with FrameX Care":

     requestLive   inside the team's hours (CARE_HOURS, 10am–8pm India time)
                   and with at least one care person Available with their care
                   desk open, the conversation becomes WAITING and every such
                   person gets a popup; otherwise the customer is told at once
                   and can leave a message (the ordinary help chat).
     acceptLive    the first care person to accept gets it (LIVE); the
                   customer sees "You're chatting with <first name>".
     (2 minutes)   nobody accepted: MISSED (support-service expireWaiting); the
                   customer leaves a message instead.
     endLive       either side ends it; the conversation is closed, the
                   customer can rate it and start a new one.

   Care people are users with the CARE role, made only by an admin
   (Admin -> Care team). They log in with their own email and open only the
   chats and the orders (admin panel: Live chats + Orders; /api/care, /api/admin/orders); admins can use the care desk too.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { setAvailable, staffOnline, toCustomer, toStaff } from "../lib/live-bus.js";
import { hashPassword } from "../lib/passwords.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";
import { adminGet, expireWaiting, firstName, liveOf, ownThread } from "./support-service.js";

/* ---------------------------------------------------------------- Hours */

const indiaHour = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour").value) % 24;
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h + m / 60;
};
const twelve = (h) => (h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);
/** "10am–8pm" (or "any time" for 0-24). */
export const hoursLabel = () => (config.care.hours.from === 0 && config.care.hours.to === 24 ? "any time" : `${twelve(config.care.hours.from)}–${twelve(config.care.hours.to)}`);
export const isOpenNow = (date = new Date()) => {
  const h = indiaHour(date);
  return h >= config.care.hours.from && h < config.care.hours.to;
};
/** For the website (public /api/config): the hours and whether someone can join right now. */
export const publicStatus = () => ({ hours: hoursLabel(), open: isOpenNow(), online: isOpenNow() && staffOnline() > 0, waitSeconds: config.care.waitSeconds });

/* ---------------------------------------------------------------- The customer */

const ownOpen = async (q, userId, lock = true) => (await q.query(`SELECT * FROM support_threads WHERE user_id = $1 AND status = 'OPEN'${lock ? " FOR UPDATE" : ""}`, [userId])).rows[0];

const system = (q, threadId, body) => q.query("INSERT INTO support_messages (id, thread_id, author, body) VALUES ($1, $2, 'SYSTEM', $3)", [newId(), threadId, body]);

/**
 * The customer asks for a person. -> { thread, live: { state, reason? } }
 *   state WAITING              the request is out; popups on every Available care desk
 *   state NOBODY, reason HOURS outside the team's hours        (nothing is stored)
 *   state NOBODY, reason BUSY  nobody is Available right now   (nothing is stored)
 */
export async function requestLive(user, { question = "", topic = "", orderNumber = "" } = {}) {
  await expireWaiting();
  if (!isOpenNow()) return { thread: await ownThread(user.id), live: { state: "NOBODY", reason: "HOURS", hours: hoursLabel() } };
  if (staffOnline() === 0) return { thread: await ownThread(user.id), live: { state: "NOBODY", reason: "BUSY", hours: hoursLabel() } };
  let order = null;
  if (orderNumber) {
    order = (await db.query("SELECT order_number FROM orders WHERE order_number = $1 AND user_id = $2", [orderNumber, user.id])).rows[0];
    if (!order) throw errors.validation({ orderNumber: "That isn't one of your orders." });
  }
  const t = await db.tx(async (q) => {
    let row = await ownOpen(q, user.id);
    if (row && row.live_state === "LIVE") return row; // already talking to someone
    if (row && row.live_state === "WAITING") return row; // already asked
    if (!row) row = (await q.query("INSERT INTO support_threads (id, user_id, topic, order_number) VALUES ($1, $2, $3, $4) RETURNING *", [newId(), user.id, topic || "", order ? order.order_number : null])).rows[0];
    return (await q.query(
      `UPDATE support_threads SET live_state = 'WAITING', live_question = $2, live_requested_at = now(), live_accepted_at = NULL, live_ended_at = NULL,
              agent_user_id = NULL, agent_name = NULL, rating = NULL, order_number = coalesce($3, order_number),
              topic = CASE WHEN topic = '' THEN $4 ELSE topic END, last_message_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id, String(question || "").slice(0, 200), order ? order.order_number : null, topic || ""]
    )).rows[0];
  });
  if (t.live_state === "WAITING") {
    toStaff("request", { threadId: t.id, customer: { name: shortName(user.name) }, question: t.live_question, orderNumber: t.order_number, requestedAt: t.live_requested_at, waitUntil: liveOf(t).waitUntil });
    // The request runs out by itself after the wait, even if no page asks in between.
    const timer = setTimeout(() => expireWaiting().catch(() => {}), config.care.waitSeconds * 1000 + 500);
    if (timer.unref) timer.unref();
  }
  return { thread: await ownThread(user.id), live: { state: t.live_state } };
}

/** "Asha Verma" -> "Asha V." on the care desk's popup (the full name is in the chat itself). */
const shortName = (name) => {
  const [a, b] = String(name || "").trim().split(/\s+/);
  return b ? `${a} ${b[0].toUpperCase()}.` : a || "Customer";
};

/** The customer stops waiting (back to the quick answers; nothing else changes). */
export async function cancelLive(user) {
  const t = (await db.query("UPDATE support_threads SET live_state = NULL, live_requested_at = NULL, updated_at = now() WHERE user_id = $1 AND status = 'OPEN' AND live_state = 'WAITING' RETURNING id", [user.id])).rows[0];
  if (t) toStaff("queue", { threadId: t.id, state: "CANCELLED" });
  return { thread: await ownThread(user.id) };
}

/** The customer ends the live chat. */
export async function customerEnd(user) {
  const t = (await db.query("SELECT id FROM support_threads WHERE user_id = $1 AND status = 'OPEN' AND live_state = 'LIVE'", [user.id])).rows[0];
  if (t) await finish(t.id, { by: "customer", name: user.name });
  return { thread: await ownThread(user.id) };
}

/** 👍 / 👎 after a live chat (the latest conversation that had one). */
export async function rateLive(user, rating) {
  const t = (await db.query("SELECT id FROM support_threads WHERE user_id = $1 AND live_state = 'ENDED' ORDER BY live_ended_at DESC LIMIT 1", [user.id])).rows[0];
  if (!t) throw errors.notFound("There is no finished live chat to rate.");
  await db.query("UPDATE support_threads SET rating = $2 WHERE id = $1", [t.id, rating === "up" ? 1 : -1]);
  toStaff("queue", { threadId: t.id });
  return { thread: await ownThread(user.id) };
}

/** "typing…" from the customer, to the care person on their live chat. */
export async function customerTyping(user) {
  const t = (await db.query("SELECT id, agent_user_id FROM support_threads WHERE user_id = $1 AND status = 'OPEN' AND live_state = 'LIVE'", [user.id])).rows[0];
  if (t && t.agent_user_id) toStaff("typing", { threadId: t.id }, { only: t.agent_user_id });
  return { ok: true };
}

/* ---------------------------------------------------------------- Care people */

const threadFound = (row) => {
  if (!row) throw errors.notFound("We couldn't find that conversation.");
  return row;
};

/** Accept a waiting request. Two people pressing at once: the second is told someone else has it. */
export async function acceptLive(id, actor) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  await expireWaiting();
  const name = firstName(actor.name);
  const t = await db.tx(async (q) => {
    const row = (await q.query(
      `UPDATE support_threads SET live_state = 'LIVE', live_accepted_at = now(), agent_user_id = $2, agent_name = $3, staff_read_at = now(), updated_at = now()
        WHERE id = $1 AND live_state = 'WAITING' RETURNING *`,
      [id, actor.id, name]
    )).rows[0];
    if (!row) {
      const now = (await q.query("SELECT live_state, agent_name FROM support_threads WHERE id = $1", [id])).rows[0];
      threadFound(now);
      if (now.live_state === "LIVE") throw errors.conflict(`${now.agent_name || "Someone else"} already accepted this chat.`, null, "ALREADY_TAKEN");
      throw errors.conflict("This request isn't waiting any more.", null, "NOT_WAITING");
    }
    await system(q, id, `${name} joined the chat`);
    return row;
  });
  toCustomer(t.user_id, "live", { threadId: id, state: "LIVE", agentName: name });
  toStaff("queue", { threadId: id, state: "LIVE", agentId: actor.id, agentName: name });
  return adminGet(id);
}

/** End a live chat (care person or customer): a note in the chat, and the conversation is closed. */
async function finish(id, { by, name }) {
  const t = await db.tx(async (q) => {
    const row = (await q.query("UPDATE support_threads SET live_state = 'ENDED', live_ended_at = now(), status = 'CLOSED', updated_at = now() WHERE id = $1 AND live_state = 'LIVE' RETURNING *", [id])).rows[0];
    if (!row) return null;
    await system(q, id, by === "customer" ? "The customer ended the chat" : `${firstName(name)} ended the chat`);
    return row;
  });
  if (!t) return null;
  toCustomer(t.user_id, "live", { threadId: id, state: "ENDED", by });
  toStaff("queue", { threadId: id, state: "ENDED" });
  return t;
}

export async function staffEnd(id, actor) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  const row = threadFound((await db.query("SELECT live_state, agent_user_id FROM support_threads WHERE id = $1", [id])).rows[0]);
  if (row.live_state !== "LIVE") throw errors.conflict("This chat isn't live.", null, "NOT_LIVE");
  await finish(id, { by: "staff", name: actor.name });
  return adminGet(id);
}

export async function staffTyping(id, actor) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  const t = threadFound((await db.query("SELECT user_id, live_state FROM support_threads WHERE id = $1", [id])).rows[0]);
  if (t.live_state === "LIVE") toCustomer(t.user_id, "typing", { threadId: id, name: firstName(actor.name) });
  return { ok: true };
}

/** The care desk's lists: requests waiting, my live chats, other live chats, and messages left. */
export async function queue(actor) {
  await expireWaiting();
  const { rows } = await db.query(
    `SELECT t.*, u.name AS customer_name, u.email AS customer_email,
            (SELECT body FROM support_messages m WHERE m.thread_id = t.id AND m.author <> 'SYSTEM' ORDER BY created_at DESC LIMIT 1) AS last_body,
            (SELECT count(*)::int FROM support_messages m WHERE m.thread_id = t.id AND m.author = 'CUSTOMER' AND (t.staff_read_at IS NULL OR m.created_at > t.staff_read_at)) AS unread
       FROM support_threads t JOIN users u ON u.id = t.user_id
      WHERE t.live_state IN ('WAITING', 'LIVE')
         OR (t.status = 'OPEN' AND EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id AND m.author = 'CUSTOMER'))
      ORDER BY t.live_requested_at NULLS LAST, t.last_message_at DESC LIMIT 200`
  );
  const item = (r) => ({ id: r.id, customer: { name: r.customer_name, short: shortName(r.customer_name), email: r.customer_email }, question: r.live_question || "", orderNumber: r.order_number, lastMessage: r.last_body || "", unread: r.unread, lastMessageAt: r.last_message_at, live: liveOf(r), agentId: r.agent_user_id || null });
  return {
    waiting: rows.filter((r) => r.live_state === "WAITING").map(item),
    mine: rows.filter((r) => r.live_state === "LIVE" && r.agent_user_id === actor.id).map(item),
    others: rows.filter((r) => r.live_state === "LIVE" && r.agent_user_id !== actor.id).map(item),
    messages: rows.filter((r) => r.live_state !== "WAITING" && r.live_state !== "LIVE").map(item),
    status: { ...publicStatus(), available: await isAvailable(actor.id) }
  };
}

const isAvailable = async (userId) => Boolean((await db.query("SELECT care_available FROM users WHERE id = $1", [userId])).rows[0]?.care_available);
export { isAvailable };

/** "Available" / "Away" on the care desk. */
export async function setPresence(actor, available) {
  await db.query("UPDATE users SET care_available = $2 WHERE id = $1", [actor.id, Boolean(available)]);
  setAvailable(actor.id, Boolean(available));
  return { available: Boolean(available), ...publicStatus() };
}

/* ---------------------------------------------------------------- Admin -> Care team */

const member = (r) => ({ id: r.id, name: r.name, email: r.email, active: r.status === "ACTIVE", available: r.care_available, chatsThisWeek: r.chats_week || 0, createdAt: r.created_at });

export async function team() {
  const { rows } = await db.query(
    `SELECT u.*, (SELECT count(*)::int FROM support_threads t WHERE t.agent_user_id = u.id AND t.live_accepted_at > now() - interval '7 days') AS chats_week
       FROM users u WHERE u.role = 'CARE' ORDER BY u.status = 'ACTIVE' DESC, u.created_at`
  );
  return { items: rows.map(member) };
}

/** A new care login: first name (what customers see), email, password. */
export async function createMember({ name, email, password }, { actor, ip = null }) {
  if ((await db.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [email])).rows.length)
    throw errors.conflict("This email already has a FrameX account. Use another email for the care login.", { email: "This email already has a FrameX account." }, "EMAIL_TAKEN");
  const id = newId();
  await db.tx(async (q) => {
    await q.query("INSERT INTO users (id, name, email, password_hash, role, status, password_changed_at) VALUES ($1, $2, $3, $4, 'CARE', 'ACTIVE', now())", [id, name, email, await hashPassword(password)]);
    await audit(q, { actor, action: ACTIONS.CARE_STAFF_CREATED, targetType: "user", targetId: id, ip, metadata: { name } });
  });
  return team();
}

/** Change the name, switch the login off / on, or set a new password. Switching off or a new password logs them out. */
export async function updateMember(id, { name, active, password }, { actor, ip = null }) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that care login.");
  await db.tx(async (q) => {
    const row = (await q.query("SELECT * FROM users WHERE id = $1 AND role = 'CARE' FOR UPDATE", [id])).rows[0];
    if (!row) throw errors.notFound("We couldn't find that care login.");
    if (name) await q.query("UPDATE users SET name = $2 WHERE id = $1", [id, name]);
    if (typeof active === "boolean") await q.query("UPDATE users SET status = $2, care_available = care_available AND $3 WHERE id = $1", [id, active ? "ACTIVE" : "DISABLED", active]);
    if (password) await q.query("UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1", [id, await hashPassword(password)]);
    if (active === false || password) await q.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [id]);
    await audit(q, { actor, action: ACTIONS.CARE_STAFF_UPDATED, targetType: "user", targetId: id, ip, metadata: { name: name || undefined, active, newPassword: Boolean(password) } });
  });
  if (active === false) setAvailable(id, false);
  return team();
}

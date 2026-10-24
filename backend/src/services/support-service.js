/* ==========================================================================
   FrameX's own help chat (owner, 2026-10-23).

   A logged-in customer writes from any page (ui/help-chat.js); the message is
   kept here and FrameX is emailed (ADMIN_NOTIFY_EMAIL, else the admin
   accounts; at most once per 15 minutes per conversation). FrameX staff answer
   in Admin -> Chats; the customer then gets an email at their own account
   address and sees the answer in the chat. Nothing is ever sent to an address
   someone typed: only to the account's own email.

   A customer has at most one OPEN conversation. Writing after FrameX closed
   it starts a new one. Account deletion removes the conversations.

   FrameX Care live chat (owner, 2026-10-24; services/care-service.js): a
   conversation can also be live — the customer asked for a person, a care
   person accepted, and both see each other's messages at once through their
   live connections (lib/live-bus.js). Staff messages carry the first name of
   whoever wrote them; the chat's own notes ("Siburam joined the chat") are
   SYSTEM messages.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { linkBase } from "../lib/context.js";
import { errors } from "../lib/errors.js";
import { customerOnline, toCustomer, toStaff } from "../lib/live-bus.js";
import { esc, htmlEmail, sendMail } from "../lib/mailer.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

export const TOPICS = ["order", "address", "photo", "advice", "other"];
const TOPIC_NAME = { order: "Track my order", address: "Change address", photo: "Photo & print help", advice: "Size / frame advice", other: "Something else" };
const ALERT_EVERY_MINUTES = 15;
const MESSAGES_SHOWN = 200;

const sending = new Set();
/** Tests: wait until every email that was started has been handed to the mailer. */
export const supportSettled = () => Promise.all([...sending]);
function later(job) {
  const p = job().catch((error) => console.error(`[support] email failed: ${error.message}`));
  sending.add(p);
  p.finally(() => sending.delete(p));
}

const FROM = { STAFF: "framex", SYSTEM: "system", CUSTOMER: "you" };
const message = (r) => ({ id: r.id, from: FROM[r.author] || "you", name: r.author === "STAFF" ? r.author_name || "FrameX" : null, body: r.body, orderNumber: r.order_number || null, at: r.created_at });
/** "Siburam Nayak" -> "Siburam": customers only ever see a care person's first name (owner). */
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "FrameX";

/** The live part of a conversation, as both sides see it (null = an ordinary conversation). */
export function liveOf(t) {
  if (!t.live_state) return null;
  const waitUntil = t.live_state === "WAITING" && t.live_requested_at ? new Date(new Date(t.live_requested_at).getTime() + config.care.waitSeconds * 1000) : null;
  return { state: t.live_state, agentName: t.agent_name || null, question: t.live_question || "", requestedAt: t.live_requested_at, acceptedAt: t.live_accepted_at, endedAt: t.live_ended_at, waitUntil };
}

/** Requests nobody accepted within the wait (CARE_WAIT_SECONDS, 2 minutes) become MISSED; both sides are told. */
export async function expireWaiting() {
  const { rows } = await db.query(
    `UPDATE support_threads SET live_state = 'MISSED', live_ended_at = now(), updated_at = now()
      WHERE live_state = 'WAITING' AND live_requested_at < now() - make_interval(secs => $1) RETURNING id, user_id`,
    [config.care.waitSeconds]
  );
  for (const r of rows) {
    toCustomer(r.user_id, "live", { threadId: r.id, state: "MISSED" });
    toStaff("queue", { threadId: r.id, state: "MISSED" });
  }
  return rows.length;
}

async function messagesOf(threadId) {
  const { rows } = await db.query(
    `SELECT * FROM (SELECT * FROM support_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT ${MESSAGES_SHOWN}) m ORDER BY created_at, id`,
    [threadId]
  );
  return rows;
}

const unreadFor = (thread, rows, side) => {
  const seen = side === "customer" ? thread.customer_read_at : thread.staff_read_at;
  const theirs = side === "customer" ? "STAFF" : "CUSTOMER";
  return rows.filter((m) => m.author === theirs && (!seen || new Date(m.created_at) > new Date(seen))).length;
};

/* ---------------------------------------------------------------- The customer */

/** The customer's open conversation, else the latest one (or null), with its messages. */
export async function ownThread(userId) {
  await expireWaiting();
  const thread = (await db.query("SELECT * FROM support_threads WHERE user_id = $1 ORDER BY (status = 'OPEN') DESC, last_message_at DESC LIMIT 1", [userId])).rows[0];
  if (!thread) return null;
  const rows = await messagesOf(thread.id);
  return { id: thread.id, status: thread.status, topic: thread.topic, orderNumber: thread.order_number, unread: unreadFor(thread, rows, "customer"), live: liveOf(thread), rating: thread.rating, messages: rows.map(message) };
}

/** Just the number of FrameX answers the customer hasn't seen (for the chat button). */
export async function unreadCount(userId) {
  const r = (await db.query(
    `SELECT count(*)::int AS n FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
      WHERE t.user_id = $1 AND m.author = 'STAFF' AND (t.customer_read_at IS NULL OR m.created_at > t.customer_read_at)`,
    [userId]
  )).rows[0];
  return r.n;
}

/** { body, orderNumber?, topic? } from the customer. -> the conversation */
export async function customerSend(user, { body, orderNumber = "", topic = "" }) {
  let order = null;
  if (orderNumber) {
    order = (await db.query("SELECT order_number FROM orders WHERE order_number = $1 AND user_id = $2", [orderNumber, user.id])).rows[0];
    if (!order) throw errors.validation({ orderNumber: "That isn't one of your orders." });
  }
  const now = new Date();
  const thread = await db.tx(async (q) => {
    let t = (await q.query("SELECT * FROM support_threads WHERE user_id = $1 AND status = 'OPEN' FOR UPDATE", [user.id])).rows[0];
    if (!t) {
      t = (await q.query("INSERT INTO support_threads (id, user_id, topic, order_number) VALUES ($1, $2, $3, $4) RETURNING *", [newId(), user.id, topic || "", order ? order.order_number : null])).rows[0];
    }
    await q.query("INSERT INTO support_messages (id, thread_id, author, author_user_id, body, order_number) VALUES ($1, $2, 'CUSTOMER', $3, $4, $5)", [newId(), t.id, user.id, body, order ? order.order_number : null]);
    await q.query(
      "UPDATE support_threads SET last_message_at = $2, customer_read_at = $2, topic = CASE WHEN topic = '' THEN $3 ELSE topic END, order_number = coalesce($4, order_number), updated_at = $2 WHERE id = $1",
      [t.id, now, topic || "", order ? order.order_number : null]
    );
    // While the customer waits for or talks to a care person, the care desk shows it at once: no email then.
    const live = t.live_state === "WAITING" || t.live_state === "LIVE";
    const alert = !live && (!t.staff_alerted_at || now - new Date(t.staff_alerted_at) > ALERT_EVERY_MINUTES * 60_000);
    if (alert) await q.query("UPDATE support_threads SET staff_alerted_at = $2 WHERE id = $1", [t.id, now]);
    const sent = (await q.query("SELECT * FROM support_messages WHERE thread_id = $1 AND author = 'CUSTOMER' ORDER BY created_at DESC, id DESC LIMIT 1", [t.id])).rows[0];
    return { ...t, alert, sent };
  });
  const out = { threadId: thread.id, message: { ...message(thread.sent), from: "customer" } };
  if (thread.live_state === "LIVE" && thread.agent_user_id) toStaff("message", out, { only: thread.agent_user_id });
  toStaff("queue", { threadId: thread.id });
  if (thread.alert) {
    const panelUrl = `${linkBase()}/admin.html#/chats/${thread.id}`;
    later(() => alertStaff({ user, body, orderNumber: order ? order.order_number : "", topic: topic || thread.topic, panelUrl }));
  }
  return ownThread(user.id);
}

export async function customerRead(userId) {
  await db.query("UPDATE support_threads SET customer_read_at = now() WHERE user_id = $1", [userId]);
  return { ok: true };
}

async function staffAddresses() {
  const fixed = String(config.email.adminNotify || "").split(/[,;\s]+/).filter((a) => a.includes("@"));
  if (fixed.length) return fixed.slice(0, 5);
  return (await db.query("SELECT email FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND email IS NOT NULL ORDER BY created_at LIMIT 5")).rows.map((r) => r.email);
}

async function alertStaff({ user, body, orderNumber, topic, panelUrl }) {
  const to = await staffAddresses();
  const subject = `New chat message on FrameX from ${user.name}`;
  const lines = [["Customer", esc(user.name)], ["Email", esc(user.email || "")], ...(orderNumber ? [["Order", esc(orderNumber)]] : []), ...(topic ? [["About", esc(TOPIC_NAME[topic] || topic)]] : [])];
  for (const address of to)
    await sendMail({
      to: address,
      subject,
      text: `${user.name} wrote in the FrameX help chat:\n\n${body}\n\n${orderNumber ? `Order: ${orderNumber}\n` : ""}Answer it in the admin panel: ${panelUrl}`,
      html: htmlEmail({ preview: body.slice(0, 120), heading: "New message in the help chat", paragraphs: [esc(body).replace(/\r?\n/g, "<br>")], tables: [{ title: "From", rows: lines }], button: { label: "Answer in the admin panel", url: panelUrl }, notice: "You received this because this address receives messages for FrameX administrators.", account: false }),
      links: [{ label: "Answer in the admin panel", url: panelUrl }]
    });
}

/* ---------------------------------------------------------------- FrameX staff */

const found = (row) => {
  if (!row) throw errors.notFound("We couldn't find that conversation.");
  return row;
};

/** Conversations, the ones with something new from the customer first. status: OPEN | CLOSED | "" (all) */
export async function adminList({ status = "" } = {}) {
  const where = status ? "WHERE t.status = $1" : "";
  const { rows } = await db.query(
    `SELECT t.*, u.name AS customer_name, u.email AS customer_email,
            (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_body,
            (SELECT author FROM support_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_author,
            (SELECT count(*)::int FROM support_messages m WHERE m.thread_id = t.id AND m.author = 'CUSTOMER' AND (t.staff_read_at IS NULL OR m.created_at > t.staff_read_at)) AS unread
       FROM support_threads t JOIN users u ON u.id = t.user_id ${where}
      ORDER BY (t.status = 'OPEN') DESC, last_message_at DESC LIMIT 200`,
    status ? [status] : []
  );
  return {
    items: rows.map((r) => ({ id: r.id, status: r.status, customer: { name: r.customer_name, email: r.customer_email }, topic: r.topic, topicName: TOPIC_NAME[r.topic] || "", orderNumber: r.order_number, lastMessage: r.last_body || "", lastFrom: r.last_author === "STAFF" ? "framex" : r.last_author === "SYSTEM" ? "system" : "customer", unread: r.unread, lastMessageAt: r.last_message_at, live: liveOf(r), agentId: r.agent_user_id || null })),
    unread: await adminUnread()
  };
}

/** Customer messages no admin has read yet, across open conversations (for the menu and the overview). */
export async function adminUnread() {
  return (await db.query(
    `SELECT count(*)::int AS n FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
      WHERE t.status = 'OPEN' AND m.author = 'CUSTOMER' AND (t.staff_read_at IS NULL OR m.created_at > t.staff_read_at)`
  )).rows[0].n;
}

/** One conversation (marks it read by staff). */
export async function adminGet(id) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  const t = found((await db.query("SELECT t.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone FROM support_threads t JOIN users u ON u.id = t.user_id WHERE t.id = $1", [id])).rows[0]);
  await db.query("UPDATE support_threads SET staff_read_at = now() WHERE id = $1", [id]);
  const rows = await messagesOf(id);
  const orders = (await db.query("SELECT order_number, status, total, created_at FROM orders WHERE user_id = $1 AND placed_at IS NOT NULL ORDER BY created_at DESC LIMIT 5", [t.user_id])).rows;
  return {
    id: t.id,
    status: t.status,
    topic: t.topic,
    topicName: TOPIC_NAME[t.topic] || "",
    orderNumber: t.order_number,
    customer: { name: t.customer_name, email: t.customer_email, phone: t.customer_phone },
    live: liveOf(t),
    agentId: t.agent_user_id || null,
    rating: t.rating,
    recentOrders: orders.map((o) => ({ orderNumber: o.order_number, status: o.status, total: o.total, createdAt: o.created_at })),
    messages: rows.map((r) => ({ ...message(r), from: r.author === "STAFF" ? "framex" : r.author === "SYSTEM" ? "system" : "customer" }))
  };
}

/** FrameX answers. The customer is emailed at their own account address. */
export async function adminReply(id, body, { actor, ip = null }) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  const t = await db.tx(async (q) => {
    const row = found((await q.query("SELECT t.*, u.name AS customer_name, u.email AS customer_email, u.status AS customer_status FROM support_threads t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE", [id])).rows[0]);
    await q.query("INSERT INTO support_messages (id, thread_id, author, author_user_id, author_name, body) VALUES ($1, $2, 'STAFF', $3, $4, $5)", [newId(), id, actor.id, firstName(actor.name), body]);
    // An answer on a closed conversation opens it again, unless the customer has already started a new one
    const reopen = row.status === "CLOSED" && !(await q.query("SELECT 1 FROM support_threads WHERE user_id = $1 AND status = 'OPEN'", [row.user_id])).rows.length;
    await q.query(`UPDATE support_threads SET last_message_at = now(), staff_read_at = now(), updated_at = now()${reopen ? ", status = 'OPEN'" : ""} WHERE id = $1`, [id]);
    await audit(q, { actor, action: ACTIONS.SUPPORT_REPLIED, targetType: "support_thread", targetId: id, ip });
    row.sent = (await q.query("SELECT * FROM support_messages WHERE thread_id = $1 AND author = 'STAFF' ORDER BY created_at DESC, id DESC LIMIT 1", [id])).rows[0];
    return row;
  });
  toCustomer(t.user_id, "message", { threadId: id, message: message(t.sent) });
  toStaff("queue", { threadId: id });
  // In a live chat the customer reads it on the spot; an email is sent only if their chat isn't open.
  const watching = t.live_state === "LIVE" && customerOnline(t.user_id);
  if (!watching && t.customer_email && t.customer_status === "ACTIVE") {
    const url = `${linkBase()}/?chat=1`;
    later(() =>
      sendMail({
        to: t.customer_email,
        subject: "FrameX Care replied to your message",
        text: `Hi ${t.customer_name},\n\n${firstName(actor.name)} from FrameX Care replied:\n\n${body}\n\nOpen the chat on the website to answer: ${url}`,
        html: htmlEmail({ preview: body.slice(0, 120), heading: "FrameX Care replied", paragraphs: [`Hi ${esc(t.customer_name)},`, `${esc(firstName(actor.name))} from FrameX Care replied:`, esc(body).replace(/\r?\n/g, "<br>")], button: { label: "Open the chat", url }, notice: "You received this because you wrote to FrameX in the help chat.", account: false }),
        links: [{ label: "Open the chat", url }]
      })
    );
  }
  return adminGet(id);
}

export async function adminSetStatus(id, status, { actor, ip = null }) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that conversation.");
  await db.tx(async (q) => {
    const row = found((await q.query("SELECT * FROM support_threads WHERE id = $1 FOR UPDATE", [id])).rows[0]);
    if (status === "OPEN" && row.status !== "OPEN" && (await q.query("SELECT 1 FROM support_threads WHERE user_id = $1 AND status = 'OPEN'", [row.user_id])).rows.length)
      throw errors.conflict("This customer already has another open conversation.");
    await q.query("UPDATE support_threads SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
    await audit(q, { actor, action: status === "CLOSED" ? ACTIONS.SUPPORT_CLOSED : ACTIONS.SUPPORT_REOPENED, targetType: "support_thread", targetId: id, ip });
  });
  return adminGet(id);
}

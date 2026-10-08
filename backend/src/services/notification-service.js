/* ==========================================================================
   Notifications: what a user is told about, in their account and by email.

   notifyUser(userId, { kind, ref, title, body, link, email })
     - writes one row per (user, kind, ref): the same event reported twice
       (a repeated webhook, a second callback) is stored and emailed once;
     - `email: true` also sends the same text by email, through the provider
       that is configured (lib/mailer.js). No provider = nothing is sent, and
       the notification is still in the account.

   Order emails keep their own, fuller templates (lib/order-emails.js); the
   order service adds the short in-account notification through orderEvent().
   ========================================================================== */
import { db } from "../db/index.js";
import { linkBase } from "../lib/context.js";
import { esc, htmlEmail, sendMail } from "../lib/mailer.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

const sending = new Set();
/** Tests: wait until every notification email that was started has been handed to the mailer. */
export const notificationsSettled = () => Promise.all([...sending]);

const absolute = (link) => (link ? `${linkBase()}/${String(link).replace(/^\/+/, "")}` : "");

/**
 * Tell one user about something. Safe to repeat: the second call for the same
 * (kind, ref) does nothing. -> true when this call stored the notification.
 */
export async function notifyUser(userId, { kind, ref = "", title, body = "", link = null, email = false, button = "Open FrameX" }, q = db) {
  if (!userId) return false;
  const stored = await q.query("INSERT INTO notifications (id, user_id, kind, title, body, link, ref) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, kind, ref) DO NOTHING RETURNING id", [newId(), userId, kind, String(title).slice(0, 160), String(body).slice(0, 600), link, String(ref)]);
  if (!stored.rows[0]) return false;
  if (email) {
    // The address is read after the transaction that called us, so a rolled-back change never emails anyone.
    const url = absolute(link);
    const job = (async () => {
      try {
        const user = (await db.query("SELECT name, email FROM users WHERE id = $1 AND status <> 'DISABLED'", [userId])).rows[0];
        const kept = user && (await db.query("SELECT 1 FROM notifications WHERE id = $1", [stored.rows[0].id])).rows[0];
        if (!kept) return;
        await sendMail({
          to: user.email,
          subject: String(title),
          text: `Hi ${user.name},\n\n${body || title}${url ? `\n\n${url}` : ""}\n\nFrameX`,
          html: htmlEmail({ preview: String(title), heading: String(title), paragraphs: [`Hi ${esc(user.name)},`, esc(body || title)], button: url ? { label: button, url } : null, notice: "You received this because of activity on your FrameX account.", account: false }),
          links: url ? [{ label: button, url }] : []
        });
      } catch (error) {
        console.error(`[notifications] email "${kind}" failed: ${error.message}`);
      }
    })();
    sending.add(job);
    job.finally(() => sending.delete(job));
  }
  return true;
}

/** The same notification for several users (e.g. every login of an artist, every admin). */
export async function notifyUsers(userIds, message, q = db) {
  for (const id of [...new Set(userIds.filter(Boolean))]) await notifyUser(id, message, q);
}

export const artistUserIds = async (artistId, q = db) => (await q.query("SELECT id FROM users WHERE artist_id = $1 AND role = 'ARTIST' AND status <> 'DISABLED'", [artistId])).rows.map((r) => r.id);
export const adminUserIds = async (q = db) => (await q.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'")).rows.map((r) => r.id);

/* ---------------------------------------------------------------- Orders */

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const ORDER_COPY = {
  ORDER_PLACED_COD: (o) => ({ title: `Order ${o.order_number} placed`, body: `Your order is placed. Pay ${rupees(o.total)} in cash on delivery.` }),
  ORDER_PLACED_PAID: (o) => ({ title: `Payment received for order ${o.order_number}`, body: `We received ${rupees(o.total)}. Your order is placed.` }),
  PAYMENT_FAILED: (o) => ({ title: `Payment failed for order ${o.order_number}`, body: "The payment didn't go through. Your order is saved: you can try the payment again." }),
  ORDER_CONFIRMED: (o) => ({ title: `Order ${o.order_number} confirmed`, body: "Your order has been confirmed." }),
  ORDER_PROCESSING: (o) => ({ title: `Order ${o.order_number} is being prepared`, body: "Your order is being prepared." }),
  ORDER_SHIPPED: (o) => ({ title: `Order ${o.order_number} shipped`, body: "Your order is on its way." }),
  ORDER_OUT_FOR_DELIVERY: (o) => ({ title: `Order ${o.order_number} is out for delivery`, body: "Your order will reach you today." }),
  ORDER_DELIVERED: (o) => ({ title: `Order ${o.order_number} delivered`, body: "Your order has been delivered. We hope you love it." }),
  ORDER_CANCELLED: (o) => ({ title: `Order ${o.order_number} cancelled`, body: "This order has been cancelled." }),
  REFUND_INITIATED: (o) => ({ title: `Refund started for order ${o.order_number}`, body: "Your refund has been started. Banks usually take a few working days." }),
  REFUND_COMPLETED: (o) => ({ title: `Refund completed for order ${o.order_number}`, body: "Your refund has been completed." })
};

/** The in-account notification for an order email of the same kind (the email itself is sent by the order service). */
export async function orderEvent(order, kind, ref = "") {
  const copy = ORDER_COPY[kind];
  if (!copy) return;
  await notifyUser(order.user_id, { kind, ref: `${order.order_number}:${ref}`, link: `order.html?id=${encodeURIComponent(order.order_number)}`, ...copy(order) }).catch((error) => console.error(`[notifications] ${kind} failed: ${error.message}`));
}

/* ---------------------------------------------------------------- The user's own list */

const shape = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, read: Boolean(r.read_at), createdAt: r.created_at });

export async function listOwn(userId, { page = 1, limit = 20 } = {}) {
  const size = Math.min(Math.max(1, limit), 50);
  const total = (await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1", [userId])).rows[0].n;
  const unread = (await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId])).rows[0].n;
  const { rows } = await db.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3", [userId, size, (Math.max(1, page) - 1) * size]);
  return { items: rows.map(shape), total, unread, page: Math.max(1, page), limit: size };
}

export const unreadCount = async (userId) => (await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId])).rows[0].n;

/** Mark one notification (or, without an id, all of them) as read. Only ever the caller's own. */
export async function markRead(userId, id = null) {
  if (id && !isUuid(id)) return unreadCount(userId);
  if (id) await db.query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, userId]);
  else await db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
  return unreadCount(userId);
}

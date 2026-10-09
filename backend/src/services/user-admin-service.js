/* ==========================================================================
   FrameX staff: looking up accounts and switching one off or on.

   An admin can disable (and re-enable) a customer, shop or artist login.
   Admin accounts can't be changed from here: they are created and reset only
   from the server (npm run admin:create), so a stolen admin session can't
   lock the other admins out. Nobody's password is ever shown or set here.
   ========================================================================== */
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { isUuid } from "../lib/validate.js";
import { revokeSessions } from "./auth-service.js";
import { listOwnOrders } from "./order-service.js";

export const ROLES = ["CUSTOMER", "SHOP", "ARTIST", "ADMIN"];

const shape = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, createdAt: u.created_at, lastLoginAt: u.last_login_at,
  shopCode: u.shop_code || null, artistCode: u.artist_code || null, orders: Number(u.orders) || 0
});

const SQL = `SELECT u.*, sh.shop_code, ar.artist_code, (SELECT count(*) FROM orders o WHERE o.user_id = u.id) AS orders
  FROM users u LEFT JOIN shops sh ON sh.id = u.shop_id LEFT JOIN artists ar ON ar.id = u.artist_id`;

export async function listUsers({ q = "", role = "", page = 1, limit = 30 } = {}) {
  const where = [];
  const params = [];
  if (role) where.push(`u.role = $${params.push(role)}`);
  if (q) where.push(`(lower(u.name) LIKE $${params.push(`%${String(q).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`)} OR lower(u.email) LIKE $${params.length} OR coalesce(u.phone, '') LIKE $${params.length})`);
  const sql = where.length ? "WHERE " + where.join(" AND ") : "";
  const size = Math.min(Math.max(1, limit), 100);
  const total = (await db.query(`SELECT count(*)::int AS n FROM users u ${sql}`, params)).rows[0].n;
  params.push(size, (Math.max(1, page) - 1) * size);
  const { rows } = await db.query(`${SQL} ${sql} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const counts = (await db.query("SELECT role, count(*)::int AS n FROM users GROUP BY role")).rows;
  return { items: rows.map(shape), total, page: Math.max(1, page), limit: size, counts: Object.fromEntries(ROLES.map((r) => [r, (counts.find((c) => c.role === r) || { n: 0 }).n])) };
}

/**
 * One account as FrameX staff may see it: who it is, how to reach them, what they ordered.
 * Never the password (not even its hash), never a session, never a payment credential:
 * a payment appears only as its status and the gateway's reference on the order itself.
 * Looking a record up is written to the audit log.
 */
export async function getUser(id, { page: asked = 1, actor, ip = null } = {}) {
  const page = Math.max(1, Math.floor(Number(asked)) || 1);
  if (!isUuid(id)) throw errors.notFound("That account doesn't exist.");
  const user = (await db.query(`${SQL} WHERE u.id = $1`, [id])).rows[0];
  if (!user) throw errors.notFound("That account doesn't exist.");
  const stats = (
    await db.query(
      `SELECT count(*)::int AS orders,
              count(*) FILTER (WHERE coalesce(is_test, false))::int AS test_orders,
              count(*) FILTER (WHERE status = 'CANCELLED' AND NOT coalesce(is_test, false))::int AS cancelled,
              count(*) FILTER (WHERE paid_at IS NOT NULL AND NOT coalesce(is_test, false))::int AS paid_orders,
              coalesce(sum(total) FILTER (WHERE paid_at IS NOT NULL AND NOT coalesce(is_test, false)), 0)::float8 AS paid,
              coalesce(sum(amount_refunded) FILTER (WHERE NOT coalesce(is_test, false)), 0)::float8 AS refunded,
              max(created_at) AS last_order
         FROM orders WHERE user_id = $1`,
      [id]
    )
  ).rows[0];
  const addresses = (await db.query("SELECT full_name, phone, line1, line2, landmark, city, state, postal_code, country, is_default FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at", [id])).rows;
  const paintings = (
    await db.query(
      `SELECT r.request_number, r.status, r.payment_status, r.refund_status, r.price, r.amount_paid, r.created_at, coalesce(r.is_test, false) AS is_test, a.name AS artist
         FROM painting_requests r JOIN artists a ON a.id = r.artist_id WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [id]
    )
  ).rows;
  const cart = (await db.query("SELECT count(*)::int AS lines, coalesce(sum(i.unit_price * i.quantity), 0)::float8 AS value, max(c.updated_at) AS updated FROM carts c JOIN cart_items i ON i.cart_id = c.id WHERE c.user_id = $1", [id])).rows[0];
  const lastFailed = (await db.query("SELECT count(*)::int AS n, max(created_at) AS last FROM auth_events WHERE user_id = $1 AND kind = 'LOGIN_FAILED' AND created_at > now() - interval '30 days'", [id])).rows[0];
  if (actor) await audit(db, { actor, action: ACTIONS.CUSTOMER_RECORD_VIEWED, targetType: "user", targetId: id, metadata: { role: user.role }, ip });
  return {
    user: shape(user),
    stats: {
      orders: stats.orders,
      testOrders: stats.test_orders,
      cancelled: stats.cancelled,
      paidOrders: stats.paid_orders,
      paid: Number(stats.paid) || 0,
      refunded: Number(stats.refunded) || 0,
      lastOrderAt: stats.last_order,
      failedLogins30Days: lastFailed.n,
      lastFailedLoginAt: lastFailed.last
    },
    addresses: addresses.map((a) => ({ fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postalCode: a.postal_code, country: a.country, isDefault: a.is_default })),
    cart: { lines: cart.lines, value: Number(cart.value) || 0, updatedAt: cart.updated },
    // Newest first, ten a page: order number, what was ordered, payment status and delivery status.
    orders: await listOwnOrders(id, { page, limit: 10 }),
    paintings: paintings.map((r) => ({ number: r.request_number, status: r.status, paymentStatus: r.payment_status, refundStatus: r.refund_status, price: r.price, amountPaid: r.amount_paid, artist: r.artist, isTest: r.is_test, createdAt: r.created_at }))
  };
}

/** Disable (the account is logged out everywhere at once) or re-enable a login. */
export async function setEnabled(id, enabled, { actor, ip = null }) {
  if (!isUuid(id)) throw errors.notFound("That account doesn't exist.");
  const user = (await db.query("SELECT * FROM users WHERE id = $1", [id])).rows[0];
  if (!user) throw errors.notFound("That account doesn't exist.");
  if (user.role === "ADMIN") throw errors.forbidden("Admin accounts can't be changed here.");
  // An account that never finished its setup link stays as it is when re-enabled.
  if (enabled && user.status !== "DISABLED") return shape((await db.query(`${SQL} WHERE u.id = $1`, [id])).rows[0]);
  await db.tx(async (q) => {
    await q.query("UPDATE users SET status = $2, updated_at = now() WHERE id = $1", [id, enabled ? (user.password_hash ? "ACTIVE" : "PENDING_SETUP") : "DISABLED"]);
    if (!enabled) await revokeSessions(q, id);
    await audit(q, { actor, action: ACTIONS.USER_STATUS_CHANGED, targetType: "user", targetId: id, metadata: { enabled, role: user.role }, ip });
  });
  return shape((await db.query(`${SQL} WHERE u.id = $1`, [id])).rows[0]);
}

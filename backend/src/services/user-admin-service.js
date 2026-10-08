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

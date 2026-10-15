/* ==========================================================================
   Coupons: a code typed at checkout for a percentage off the items of the
   order (table "coupons", migration 011).

   The coupon is always looked up and worked out here, for the quote and
   again when the order is placed: a code or an amount sent by a browser is
   never trusted. What it takes off is a percentage of the items total (after
   each product's own discount), rounded to the rupee, never more than
   max_discount and never more than the items themselves.
   ========================================================================== */
import { db } from "../db/index.js";

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

/** The code as it is stored: capitals, no spaces. */
export const normalizeCode = (code) =>
  String(code || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 30);

/** The coupon row for a code (or null), and how many orders this customer has already used it on. */
export async function lookup(code, userId, q = db) {
  const c = normalizeCode(code);
  if (!c) return null;
  const row = (await q.query("SELECT * FROM coupons WHERE code = $1", [c])).rows[0] || null;
  if (!row) return { code: c, row: null, uses: 0 };
  const uses = row.per_user_limit
    ? Number((await q.query("SELECT count(*) AS n FROM orders WHERE user_id = $1 AND coupon_code = $2 AND status <> 'CANCELLED'", [userId, c])).rows[0].n)
    : 0;
  return { code: c, row, uses };
}

/**
 * What a looked-up coupon does for an order whose items come to `base` rupees.
 * -> { code, title, percentOff, minOrder, applied, discount, reason }
 */
export function apply(found, base, now = new Date()) {
  if (!found) return null;
  const { code, row, uses } = found;
  const out = (applied, discount, reason) => ({
    code,
    title: row ? row.title : null,
    percentOff: row ? row.percent_off : null,
    minOrder: row ? row.min_order : null,
    applied,
    discount,
    reason
  });
  if (!row) return out(false, 0, `"${code}" is not a valid coupon code.`);
  if (!row.active || (row.ends_at && new Date(row.ends_at) < now)) return out(false, 0, `The coupon ${code} has ended.`);
  if (row.starts_at && new Date(row.starts_at) > now) return out(false, 0, `The coupon ${code} can't be used yet.`);
  if (row.per_user_limit && uses >= row.per_user_limit) return out(false, 0, `You have already used the coupon ${code}.`);
  if (base < row.min_order) return out(false, 0, `${code} is for orders of ${rupees(row.min_order)} and more. Add ${rupees(row.min_order - base)} more to use it.`);
  let discount = Math.round((base * row.percent_off) / 100);
  if (row.max_discount) discount = Math.min(discount, row.max_discount);
  discount = Math.min(discount, base);
  return out(true, discount, null);
}

/** The coupons a customer can use now, for the checkout page and the home page (no limits or counts). */
export async function activeCoupons(now = new Date()) {
  const { rows } = await db.query(
    `SELECT code, title, percent_off, min_order, max_discount, ends_at FROM coupons
      WHERE active AND (starts_at IS NULL OR starts_at <= $1) AND (ends_at IS NULL OR ends_at > $1)
      ORDER BY created_at`,
    [now.toISOString()]
  );
  return rows.map((r) => ({ code: r.code, title: r.title, percentOff: r.percent_off, minOrder: r.min_order, maxDiscount: r.max_discount, endsAt: r.ends_at }));
}

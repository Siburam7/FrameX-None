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
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { v, validate } from "../lib/validate.js";

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

/* ---------------------------------------------------------------- FrameX staff: the coupons screen */

// Dates are whole days in India time: a coupon starts at 00:00 of its first day and ends at 23:59 of its last day.
const IST = "+05:30";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (at) => (at ? new Date(new Date(at).getTime() + 330 * 60000).toISOString().slice(0, 10) : null);

/** A coupon as the admin screen shows it, with how often it was used (orders that weren't cancelled). */
const adminView = (r) => ({
  code: r.code,
  title: r.title,
  percentOff: r.percent_off,
  minOrder: r.min_order,
  maxDiscount: r.max_discount,
  perUserLimit: r.per_user_limit,
  startsOn: dayOf(r.starts_at),
  endsOn: dayOf(r.ends_at),
  active: r.active,
  createdAt: r.created_at,
  orders: Number(r.orders || 0),
  discountGiven: Number(r.discount_given || 0)
});

export async function adminList() {
  const { rows } = await db.query(
    `SELECT c.*, count(o.id) AS orders, coalesce(sum(o.coupon_discount), 0) AS discount_given
       FROM coupons c LEFT JOIN orders o ON o.coupon_code = c.code AND o.status <> 'CANCELLED'
      GROUP BY c.code ORDER BY c.created_at`
  );
  return rows.map(adminView);
}

// What the admin can set. Empty = no limit / no date.
const whole = (label, min, max) => v.number({ min, max, label, required: false });
const RULES = {
  title: v.string({ min: 3, max: 120, label: "The text customers see" }),
  percentOff: v.number({ min: 1, max: 90, label: "Percent off" }),
  minOrder: whole("Minimum order", 0, 1000000),
  maxDiscount: whole("Most it can take off", 1, 1000000),
  perUserLimit: whole("Uses per customer", 1, 1000),
  startsOn: v.string({ max: 10, label: "Start date", pattern: DAY, patternMessage: "Use a date like 2026-11-01." }),
  endsOn: v.string({ max: 10, label: "Last day", pattern: DAY, patternMessage: "Use a date like 2026-11-30." }),
  active: v.boolean({ fallback: true })
};
const CODE = v.string({ min: 3, max: 20, label: "Code", pattern: /^[A-Z0-9]+$/, patternMessage: "Use only letters and numbers (no spaces)." });

/** Checked values -> the table's columns. Whole numbers only; the last day must not be before the first. */
function columns(d) {
  const fields = {};
  for (const k of ["percentOff", "minOrder", "maxDiscount", "perUserLimit"]) if (d[k] !== undefined && d[k] !== null && !Number.isInteger(d[k])) fields[k] = "Use a whole number.";
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) fields.endsOn = "The last day can't be before the start date.";
  if (Object.keys(fields).length) throw errors.validation(fields);
  const out = {};
  if (d.title !== undefined) out.title = d.title;
  if (d.percentOff !== undefined) out.percent_off = d.percentOff;
  if (d.minOrder !== undefined) out.min_order = d.minOrder ?? 0;
  if (d.maxDiscount !== undefined) out.max_discount = d.maxDiscount;
  if (d.perUserLimit !== undefined) out.per_user_limit = d.perUserLimit;
  if (d.startsOn !== undefined) out.starts_at = d.startsOn ? `${d.startsOn}T00:00:00${IST}` : null;
  if (d.endsOn !== undefined) out.ends_at = d.endsOn ? `${d.endsOn}T23:59:59.999${IST}` : null;
  if (d.active !== undefined) out.active = d.active;
  return out;
}

const one = async (code, q = db) => {
  const r = (await q.query(`SELECT c.*, (SELECT count(*) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'CANCELLED') AS orders, (SELECT coalesce(sum(o.coupon_discount), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'CANCELLED') AS discount_given FROM coupons c WHERE c.code = $1`, [code])).rows[0];
  return r ? adminView(r) : null;
};

/** A new coupon. Codes are stored in capitals and can't be changed later (orders refer to them). */
export async function adminCreate(body, { actor, ip = null }) {
  const input = { ...(body || {}), code: normalizeCode(body && body.code) };
  const d = validate(input, { code: CODE, ...RULES });
  const cols = columns(d);
  return db.tx(async (q) => {
    if ((await q.query("SELECT 1 FROM coupons WHERE code = $1", [d.code])).rows.length) throw errors.conflict("A coupon with this code already exists.", { code: "This code is already used." });
    await q.query(
      "INSERT INTO coupons (code, title, percent_off, min_order, max_discount, starts_at, ends_at, active, per_user_limit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [d.code, cols.title, cols.percent_off, cols.min_order ?? 0, cols.max_discount ?? null, cols.starts_at ?? null, cols.ends_at ?? null, cols.active ?? true, cols.per_user_limit ?? null]
    );
    await audit(q, { actor, action: ACTIONS.COUPON_CREATED, targetType: "coupon", targetId: d.code, metadata: { ...d }, ip });
    return one(d.code, q);
  });
}

/** Change a coupon (only the fields sent; null = no limit / no date). Switching it off is how a coupon ends. */
export async function adminUpdate(code, body, { actor, ip = null }) {
  const c = normalizeCode(code);
  const d = validate(body, Object.fromEntries(Object.entries(RULES).map(([k, rule]) => [k, v.optional(rule)])));
  const cols = columns(d);
  if (!Object.keys(cols).length) throw errors.validation({ title: "Nothing to change." });
  return db.tx(async (q) => {
    const row = (await q.query("SELECT * FROM coupons WHERE code = $1 FOR UPDATE", [c])).rows[0];
    if (!row) throw errors.notFound("That coupon doesn't exist.");
    const starts = cols.starts_at !== undefined ? cols.starts_at : row.starts_at;
    const ends = cols.ends_at !== undefined ? cols.ends_at : row.ends_at;
    if (starts && ends && new Date(ends) < new Date(starts)) throw errors.validation({ endsOn: "The last day can't be before the start date." });
    const keys = Object.keys(cols);
    await q.query(`UPDATE coupons SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE code = $1`, [c, ...keys.map((k) => cols[k])]);
    await audit(q, { actor, action: ACTIONS.COUPON_UPDATED, targetType: "coupon", targetId: c, metadata: { ...d }, ip });
    return one(c, q);
  });
}

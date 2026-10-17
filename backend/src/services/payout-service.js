/* ==========================================================================
   Payouts: FrameX sends each shop and artist their share of what they sold.

   The money: a customer who pays online pays FrameX (the gateway account is
   FrameX's). Cash on Delivery is collected by the seller. So for each seller,
   over the sales not paid out yet:

     sales           their items in delivered, paid, unrefunded orders (and,
                     for an artist, delivered and fully paid custom paintings)
     online sales    of which paid online: the money FrameX holds for them
     extras          their part of the delivery fee, gift wrap fee and tax of
                     the orders paid online (shared by item value when an order
                     has several sellers)
     commission      FrameX's share of ALL their sales (shops' or artists'
                     rate, platform settings); on Cash on Delivery sales it is
                     taken from the online money, since that cash is with them
     payout charge   a percentage (platform settings) of what is left
     payout          online sales + extras − commission − payout charge

   A payout is made by FrameX outside the site (bank transfer or UPI, to the
   account the seller gave) and then recorded here with the bank's reference.
   Every order line and painting can be paid out once only (payout_lines).
   Orders that are test orders, not delivered, or (partly) refunded are left
   out until an admin settles them by hand.

   The payout account: a bank account (holder, number, IFSC) or a UPI ID.
   The number / UPI ID is sealed (lib/sealed.js); pages show a masked hint.
   Changing it needs the seller's password and is emailed to them. Only FrameX
   admins see the full details, and every look is written to the audit log.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors, HttpError } from "../lib/errors.js";
import { verifyPassword } from "../lib/passwords.js";
import { open, seal, sealingReady } from "../lib/sealed.js";
import { newId } from "../lib/tokens.js";
import { isUuid, v, validate } from "../lib/validate.js";
import { artistUserIds, notifyUsers } from "./notification-service.js";

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;
const METHOD_LABEL = { BANK: "bank account", UPI: "UPI" };

/* ---------------------------------------------------------------- Who */

// A seller: { type: "shop" | "artist", id, code, name, refs }. refs are what their order lines carry as seller.
const column = (owner) => (owner.type === "shop" ? "shop_id" : "artist_id");
const dashboard = (owner) => (owner.type === "shop" ? "shop-dashboard.html#/payouts" : "artist-dashboard.html#/payouts");
const ownerUsers = async (owner, q = db) =>
  owner.type === "shop" ? (await q.query("SELECT id FROM users WHERE shop_id = $1 AND role = 'SHOP' AND status <> 'DISABLED'", [owner.id])).rows.map((r) => r.id) : artistUserIds(owner.id, q);

/** FrameX staff: a seller by type and id (or 404). */
export async function ownerById(type, id) {
  if (!["shop", "artist"].includes(type) || !isUuid(id)) throw errors.notFound("We couldn't find that seller.");
  if (type === "shop") {
    const s = (await db.query("SELECT id, shop_code, catalog_ref, name, phone, email FROM shops WHERE id = $1", [id])).rows[0];
    if (!s) throw errors.notFound("We couldn't find that shop.");
    return { type, id: s.id, code: s.shop_code, name: s.name, phone: s.phone, email: s.email, refs: [s.catalog_ref, s.shop_code].filter(Boolean) };
  }
  const a = (await db.query("SELECT id, artist_code, name, phone, email FROM artists WHERE id = $1", [id])).rows[0];
  if (!a) throw errors.notFound("We couldn't find that artist.");
  return { type, id: a.id, code: a.artist_code, name: a.name, phone: a.phone, email: a.email, refs: [a.artist_code] };
}

/* ---------------------------------------------------------------- What is due */

/** The sales of a seller not paid out yet, one entry per order / painting, oldest first. */
async function unpaid(owner, q = db) {
  const shop = owner.type === "shop";
  if (shop && !owner.refs.length) return [];
  const sellerSql = shop ? `i.seller_type = 'SHOP' AND i.shop_ref IN (${owner.refs.map((_, n) => `$${n + 1}`).join(", ")})` : "i.seller_type = 'ARTIST' AND i.artist_id = $1";
  const params = shop ? owner.refs : [owner.id];
  const { rows } = await q.query(
    `SELECT i.id, i.line_total, i.quantity, o.order_number, o.payment_method, o.delivered_at,
            (o.subtotal - o.discount) AS items_total, (o.tax + o.shipping_fee + o.gift_wrap_fee) AS order_extras
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN payout_lines pl ON pl.order_item_id = i.id
      WHERE pl.id IS NULL AND ${sellerSql}
        AND o.status = 'DELIVERED' AND o.payment_status = 'PAID' AND o.amount_refunded = 0 AND coalesce(o.is_test, false) = false
      ORDER BY o.delivered_at, o.order_number, i.position`,
    params
  );
  const byOrder = new Map();
  for (const r of rows) {
    if (!byOrder.has(r.order_number))
      byOrder.set(r.order_number, { ref: r.order_number, kind: "ORDER", date: r.delivered_at, online: r.payment_method === "ONLINE", itemsTotal: r.items_total, orderExtras: r.order_extras, sales: 0, items: 0, lines: [] });
    const e = byOrder.get(r.order_number);
    e.sales += r.line_total;
    e.items += r.quantity;
    e.lines.push({ orderItemId: r.id, amount: r.line_total });
  }
  const entries = [...byOrder.values()].map((e) => ({ ...e, extras: e.online && e.itemsTotal > 0 ? Math.round((e.orderExtras * e.sales) / e.itemsTotal) : 0 }));
  if (owner.type === "artist") {
    const paintings = (await q.query(
      `SELECT r.id, r.request_number, r.price, r.delivered_at FROM painting_requests r
         LEFT JOIN payout_lines pl ON pl.painting_request_id = r.id
        WHERE pl.id IS NULL AND r.artist_id = $1 AND r.status = 'DELIVERED' AND r.refund_status = 'NONE'
          AND r.amount_paid = r.price AND coalesce(r.is_test, false) = false
        ORDER BY r.delivered_at, r.request_number`,
      [owner.id]
    )).rows;
    for (const p of paintings) entries.push({ ref: p.request_number, kind: "PAINTING", date: p.delivered_at, online: true, sales: p.price, items: 1, extras: 0, lines: [{ paintingRequestId: p.id, amount: p.price }] });
  }
  return entries;
}

const rateFor = (owner) => (owner.type === "shop" ? config.platform.commissionPercent : config.platform.artistCommissionPercent);

/** The sums for a set of entries, at the rates of today. */
export function workOut(entries, { commissionPercent, feePercent }) {
  const sales = entries.reduce((n, e) => n + e.sales, 0);
  const onlineSales = entries.reduce((n, e) => n + (e.online ? e.sales : 0), 0);
  const extras = entries.reduce((n, e) => n + e.extras, 0);
  const commission = Math.round((sales * commissionPercent) / 100);
  const beforeFee = onlineSales + extras - commission;
  const fee = beforeFee > 0 ? Math.round((beforeFee * feePercent) / 100) : 0;
  const amount = beforeFee - fee;
  return { sales, onlineSales, codSales: sales - onlineSales, extras, commissionPercent, commission, feePercent, fee, amount, payable: amount > 0 };
}

async function due(owner, q = db) {
  const entries = await unpaid(owner, q);
  const sums = workOut(entries, { commissionPercent: rateFor(owner), feePercent: config.payouts.feePercent });
  return { ...sums, entries, orders: entries.map((e) => ({ ref: e.ref, kind: e.kind, date: e.date, payment: e.online ? "ONLINE" : "COD", items: e.items, sales: e.sales, extras: e.extras })) };
}

/* ---------------------------------------------------------------- The payout account */

const accountRow = async (owner, q = db) => (await q.query(`SELECT * FROM payout_accounts WHERE ${column(owner)} = $1`, [owner.id])).rows[0] || null;
const accountView = (row) => (row ? { method: row.method, holderName: row.holder_name, hint: row.hint, updatedAt: row.updated_at } : null);

const maskUpi = (upi) => {
  const [name, handle] = upi.split("@");
  return `${name.slice(0, 2)}•••@${handle}`;
};

function accountDetails(body) {
  const method = String((body && body.method) || "").trim().toUpperCase();
  const spec = {
    method: v.enumOf(["BANK", "UPI"], { label: "How you get paid" }),
    holderName: v.string({ min: 2, max: 80, label: "Account holder's name" }),
    password: v.secret({ label: "Your password" })
  };
  if (method === "BANK") {
    const digits = (value) => String(value || "").replace(/[\s-]/g, "");
    Object.assign(spec, {
      accountNumber: (value) => (/^\d{9,18}$/.test(digits(value)) ? { value: digits(value) } : { error: digits(value) ? "An account number has 9 to 18 digits." : "Account number is required." }),
      confirmAccountNumber: (value) => ({ value: digits(value) }),
      ifsc: (value) => {
        const s = String(value || "").trim().toUpperCase();
        return IFSC.test(s) ? { value: s } : { error: s ? "An IFSC has 11 characters, like HDFC0001234 (the fifth is a zero)." : "IFSC is required." };
      },
      bankName: v.string({ max: 80, label: "Bank name" })
    });
  }
  if (method === "UPI")
    spec.upiId = (value) => {
      const s = String(value || "").trim().toLowerCase();
      return UPI.test(s) ? { value: s } : { error: s ? "A UPI ID looks like name@bank, for example 9876543210@ybl." : "UPI ID is required." };
    };
  const f = validate({ ...body, method }, spec);
  if (method === "BANK" && f.confirmAccountNumber !== f.accountNumber) throw errors.validation({ confirmAccountNumber: "The two account numbers don't match." });
  return method === "BANK"
    ? { f, details: { accountNumber: f.accountNumber, ifsc: f.ifsc, bankName: f.bankName || "" }, hint: `${f.ifsc} · ••••${f.accountNumber.slice(-4)}` }
    : { f, details: { upiId: f.upiId }, hint: maskUpi(f.upiId) };
}

const notReady = () => new HttpError(503, "PAYOUTS_NOT_READY", "Payout accounts can't be saved yet: FrameX is still setting this up. Please try again later.");

/** The seller's own view: their account (masked), what is due, and their payouts. */
export async function ownView(owner) {
  const [account, d, payouts] = await Promise.all([accountRow(owner), due(owner), history(owner)]);
  const { entries, ...shown } = d;
  return { account: accountView(account), ready: sealingReady(), due: shown, payouts };
}

/** The seller adds or changes their payout account (their password confirms it). */
export async function saveAccount(owner, body, { actor, ip = null }) {
  if (!sealingReady()) throw notReady();
  const { f, details, hint } = accountDetails(body);
  const user = (await db.query("SELECT password_hash FROM users WHERE id = $1", [actor.id])).rows[0];
  if (!user || !user.password_hash || !(await verifyPassword(f.password, user.password_hash))) throw errors.validation({ password: "That isn't your password." });
  const sealed = seal(details);
  const col = column(owner);
  const before = await accountRow(owner);
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO payout_accounts (id, ${col}, method, holder_name, details, hint, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (${col}) DO UPDATE SET method = EXCLUDED.method, holder_name = EXCLUDED.holder_name, details = EXCLUDED.details,
         hint = EXCLUDED.hint, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [newId(), owner.id, f.method, f.holderName, sealed, hint, actor.id]
    );
    await audit(q, { actor, action: ACTIONS.PAYOUT_ACCOUNT_CHANGED, targetType: owner.type, targetId: owner.code, metadata: { method: f.method, hint, first: !before }, ip });
  });
  // Told by email every time: a stolen password must not be able to quietly move a seller's money.
  await notifyUsers(await ownerUsers(owner), {
    kind: "PAYOUT_ACCOUNT_CHANGED",
    ref: `${Date.now()}`,
    title: before ? "Your payout account was changed" : "Your payout account was added",
    body: `FrameX will send your payouts to this ${METHOD_LABEL[f.method]}: ${hint} (${f.holderName}). If you didn't do this, contact FrameX straight away.`,
    link: dashboard(owner),
    email: true,
    button: "Open Payouts"
  });
  return ownView(owner);
}

/* ---------------------------------------------------------------- Payouts made */

const payoutView = (r, refs = []) => ({
  number: r.payout_number,
  paidAt: r.paid_at,
  amount: r.amount,
  sales: r.sales,
  onlineSales: r.online_sales,
  codSales: r.sales - r.online_sales,
  extras: r.extras,
  commissionPercent: Number(r.commission_percent),
  commission: r.commission,
  feePercent: Number(r.fee_percent),
  fee: r.fee,
  method: r.method,
  accountHint: r.account_hint,
  reference: r.reference,
  note: r.note || "",
  refs
});

async function history(owner, { limit = 50 } = {}) {
  const rows = (await db.query(`SELECT * FROM payouts WHERE ${column(owner)} = $1 ORDER BY paid_at DESC LIMIT ${Math.min(200, limit)}`, [owner.id])).rows;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const refs = new Map();
  for (const l of (await db.query(`SELECT payout_id, ref FROM payout_lines WHERE payout_id IN (${ids.map((_, n) => `$${n + 1}`).join(", ")}) ORDER BY ref`, ids)).rows) {
    if (!refs.has(l.payout_id)) refs.set(l.payout_id, new Set());
    refs.get(l.payout_id).add(l.ref);
  }
  return rows.map((r) => payoutView(r, [...(refs.get(r.id) || [])]));
}

/* ---------------------------------------------------------------- FrameX staff */

/** Every approved shop and every artist, with what is due to them now (largest first) and the last payouts. */
export async function adminOverview() {
  const shops = (await db.query("SELECT id FROM shops WHERE approval_status = 'APPROVED' ORDER BY name")).rows;
  const artists = (await db.query("SELECT id FROM artists WHERE is_demo = false ORDER BY name")).rows;
  const accounts = new Map((await db.query("SELECT * FROM payout_accounts")).rows.map((r) => [r.shop_id || r.artist_id, r]));
  const sellers = [];
  for (const [type, list] of [["shop", shops], ["artist", artists]])
    for (const { id } of list) {
      const owner = await ownerById(type, id);
      const d = await due(owner);
      sellers.push({ type, id, code: owner.code, name: owner.name, phone: owner.phone, account: accountView(accounts.get(id)), amount: d.amount, sales: d.sales, orders: d.orders.length, payable: d.payable });
    }
  sellers.sort((a, b) => b.amount - a.amount || b.sales - a.sales || a.name.localeCompare(b.name));
  const recent = (await db.query(
    `SELECT p.*, coalesce(s.name, a.name) AS seller_name, CASE WHEN p.shop_id IS NULL THEN 'artist' ELSE 'shop' END AS seller_type, coalesce(p.shop_id, p.artist_id) AS seller_id
       FROM payouts p LEFT JOIN shops s ON s.id = p.shop_id LEFT JOIN artists a ON a.id = p.artist_id
      ORDER BY p.paid_at DESC LIMIT 30`
  )).rows.map((r) => ({ ...payoutView(r), seller: { type: r.seller_type, id: r.seller_id, name: r.seller_name } }));
  return { sellers, recent, ready: sealingReady(), commissionPercent: config.platform.commissionPercent, artistCommissionPercent: config.platform.artistCommissionPercent, feePercent: config.payouts.feePercent };
}

/** One seller: what is due (order by order), the FULL payout account (logged), and their payouts. */
export async function adminSeller(type, id, { actor, ip = null }) {
  const owner = await ownerById(type, id);
  const [row, d, payouts] = await Promise.all([accountRow(owner), due(owner), history(owner)]);
  let account = accountView(row);
  if (row) {
    let details = null;
    try {
      details = sealingReady() ? open(row.details) : null;
    } catch {
      details = null; // sealed with another key
    }
    account = { ...account, details, readable: Boolean(details) };
    if (details) await audit(db, { actor, action: ACTIONS.PAYOUT_ACCOUNT_VIEWED, targetType: owner.type, targetId: owner.code, metadata: { hint: row.hint }, ip });
  }
  const { entries, ...shown } = d;
  return { seller: { type, id: owner.id, code: owner.code, name: owner.name, phone: owner.phone, email: owner.email }, account, due: shown, payouts, ready: sealingReady() };
}

/**
 * FrameX has paid a seller (outside the site) and records it. The amount is worked out again here, and must be
 * the one the admin saw: if orders changed in between, nothing is recorded and the new amount is given.
 */
export async function adminRecord(type, id, body, { actor, ip = null }) {
  const owner = await ownerById(type, id);
  const f = validate(body, {
    expectedAmount: v.number({ min: 1, max: 100000000, label: "Amount" }),
    reference: v.string({ min: 4, max: 60, label: "Payment reference (UTR)" }),
    note: v.string({ max: 300, label: "Note" })
  });
  const payout = await db.tx(async (q) => {
    // One payout at a time per seller: a second admin (or a double click) waits here, then finds nothing due.
    await q.query(`SELECT id FROM ${owner.type === "shop" ? "shops" : "artists"} WHERE id = $1 FOR UPDATE`, [owner.id]);
    const account = await accountRow(owner, q);
    if (!account) throw errors.conflict("This seller hasn't added a payout account yet.", null, "NO_PAYOUT_ACCOUNT");
    const d = await due(owner, q);
    if (!d.payable) throw errors.conflict("There is nothing to pay out to this seller right now.", null, "NOTHING_DUE");
    if (d.amount !== f.expectedAmount) throw errors.conflict(`The amount due is now ${rupees(d.amount)}: orders changed since this page was opened. Check it, then record the payout again.`, { expectedAmount: `Now ${rupees(d.amount)}.` }, "AMOUNT_CHANGED");
    const number = "PO-" + (await q.query("SELECT nextval('payout_number_seq')::int AS n")).rows[0].n;
    const payoutId = newId();
    await q.query(
      `INSERT INTO payouts (id, payout_number, ${column(owner)}, sales, online_sales, extras, commission_percent, commission, fee_percent, fee, amount, method, account_hint, reference, note, paid_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [payoutId, number, owner.id, d.sales, d.onlineSales, d.extras, d.commissionPercent, d.commission, d.feePercent, d.fee, d.amount, account.method, account.hint, f.reference, f.note || null, actor.id]
    );
    for (const e of d.entries)
      for (const l of e.lines)
        await q.query("INSERT INTO payout_lines (id, payout_id, order_item_id, painting_request_id, ref, amount) VALUES ($1, $2, $3, $4, $5, $6)", [newId(), payoutId, l.orderItemId || null, l.paintingRequestId || null, e.ref, l.amount]);
    await audit(q, { actor, action: ACTIONS.PAYOUT_RECORDED, targetType: owner.type, targetId: owner.code, metadata: { payout: number, amount: d.amount, reference: f.reference, orders: d.entries.length }, ip });
    return (await q.query("SELECT * FROM payouts WHERE id = $1", [payoutId])).rows[0];
  });
  const shown = payoutView(payout);
  await notifyUsers(await ownerUsers(owner), {
    kind: "PAYOUT_SENT",
    ref: shown.number,
    title: `FrameX sent you ${rupees(shown.amount)}`,
    body: `Payout ${shown.number}: ${rupees(shown.amount)} to your ${METHOD_LABEL[shown.method]} ${shown.accountHint}. Reference: ${shown.reference}. Sales ${rupees(shown.sales)}, FrameX commission ${rupees(shown.commission)}, payout charge ${rupees(shown.fee)}.`,
    link: dashboard(owner),
    email: true,
    button: "See the details"
  });
  return { payout: shown };
}

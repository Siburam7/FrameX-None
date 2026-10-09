/* ==========================================================================
   Orders as records: reading them, their history, their emails, giving stock
   back, and the status changes that don't involve the payment gateway.

   Two separate statuses, never mixed:
     ORDER status    PENDING_PAYMENT (online order waiting for its payment)
                     PLACED -> CONFIRMED -> PROCESSING -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED
                     CANCELLED, RETURNED
     PAYMENT status  PENDING, PAID, FAILED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED

   Money moves (payment attempts, verification, refunds) are in
   payment-service.js; creating an order is in checkout-service.js.
   A customer only ever reaches their own orders: every customer query has
   "AND user_id = <session user>", and another user's order number answers 404.

   The customer's photos an order line is printed from are part of the order
   (order_item_photos). A link to an original is only made here, after checking
   that the asker is the customer, FrameX staff, or (shop-order-service.js) the
   shop that makes that line.
   ========================================================================== */
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { sendMail } from "../lib/mailer.js";
import { orderEmail } from "../lib/order-emails.js";
import { newId } from "../lib/tokens.js";
import { onlinePaymentsReady } from "../payments/index.js";
import { releaseStock } from "./catalog-service.js";
import { orderEvent } from "./notification-service.js";
import { linkTo, publicUpload } from "./upload-service.js";

export const ORDER_STATUSES = ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"];
export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];
const FLOW = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
// "Orders can be cancelled only before production begins."
export const CUSTOMER_CAN_CANCEL = ["PENDING_PAYMENT", "PLACED", "CONFIRMED"];
export const ADMIN_CAN_CANCEL = ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING"];
export const EXPIRED_REASON = "The payment was not completed in time.";
export const SYSTEM = { id: null, role: "SYSTEM" };

const ORDER_NUMBER = /^FX-\d{6,12}$/;
const notFound = () => errors.notFound("We couldn't find that order.", "ORDER_NOT_FOUND");
/** "$2, $3, $4" for a list of values starting at parameter `from`. */
export const marks = (values, from = 1) => values.map((_, i) => `$${from + i}`).join(", ");

/* ---------------------------------------------------------------- Shapes */

export const FULFILMENT_STATUSES = ["NEW", "ACCEPTED", "IN_PRODUCTION", "READY", "HANDED_OVER"];
/** While an order is in one of these, its photos can be downloaded for printing and its lines can be worked on. */
export const ACTIVE_FOR_FULFILMENT = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

/** One photo of an order line: what it is, never where it is stored. */
const photo = (p) => ({ slot: p.slot, placement: p.placement || null, ...publicUpload({ ...p, id: p.upload_id, created_at: p.uploaded_at, status: p.upload_status }) });

/** Does this line still wait for photos? Lines ordered before photos were uploaded to FrameX were sent separately. */
const photosMissing = (r, photos) => (r.photos_required === null || r.photos_required === undefined ? r.kind === "STUDIO" || Boolean(r.design_summary && r.design_summary.photoCount) : photos.length < r.photos_required);

export const item = (r, photos = []) => ({
  id: r.id,
  kind: r.kind === "STUDIO" ? "studio" : "product",
  productId: r.product_id,
  templateId: r.template_id,
  shopId: r.shop_ref,
  shopName: r.shop_name,
  name: r.name,
  image: r.image,
  size: r.size,
  color: r.color,
  options: r.options || [],
  note: r.note || "",
  quantity: r.quantity,
  unitListPrice: r.unit_list_price,
  unitDiscount: r.unit_discount,
  unitPrice: r.unit_price,
  lineTotal: r.line_total,
  design: r.design_summary || null,
  productType: r.product_type || null,
  // The customer's original photos this line is printed from.
  photosRequired: r.photos_required ?? null,
  photos: photos.map(photo),
  photosMissing: photosMissing(r, photos),
  // Where the shop is with making it.
  fulfilment: { status: r.fulfilment_status || "NEW", note: r.fulfilment_note || "", updatedAt: r.fulfilment_updated_at || null }
});

/** order_item_photos rows grouped by order line. */
export function photosByItem(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.order_item_id)) map.set(row.order_item_id, []);
    map.get(row.order_item_id).push(row);
  }
  return map;
}

export const PHOTOS_SQL = `
  SELECT p.order_item_id, p.order_id, p.upload_id, p.slot, p.position, p.placement,
         u.original_name, u.format, u.mime_type, u.bytes, u.width, u.height, u.orientation, u.status AS upload_status, u.created_at AS uploaded_at
    FROM order_item_photos p JOIN uploads u ON u.id = p.upload_id`;

/** What an admin may do next with an order. */
export function nextStatuses(row) {
  if (row.status === "PENDING_PAYMENT") return ["CANCELLED"];
  const at = FLOW.indexOf(row.status);
  if (at < 0) return [];
  return [...FLOW.slice(at + 1), ...(ADMIN_CAN_CANCEL.includes(row.status) ? ["CANCELLED"] : []), ...(row.status === "DELIVERED" ? ["RETURNED"] : [])];
}

const refundable = (row) => (["PAID", "PARTIALLY_REFUNDED"].includes(row.payment_status) ? row.total - row.amount_refunded : 0);
const stillPayable = (row) => row.status === "PENDING_PAYMENT" && row.payment_method === "ONLINE" && (!row.expires_at || new Date(row.expires_at) > new Date());

function summary(row) {
  return {
    orderNumber: row.order_number,
    // true = paid through a gateway in TEST mode, or marked as a test by an admin: never counted as a sale.
    isTest: Boolean(row.is_test),
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paymentInstrument: row.payment_instrument,
    paymentGateway: row.payment_gateway,
    currency: row.currency,
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    taxPercent: Number(row.tax_percent),
    shippingFee: row.shipping_fee,
    giftWrap: Boolean(row.gift_wrap),
    giftWrapFee: row.gift_wrap_fee || 0,
    codFee: row.cod_fee,
    total: row.total,
    amountRefunded: row.amount_refunded,
    itemCount: row.item_count,
    createdAt: row.created_at,
    placedAt: row.placed_at,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    deliveredAt: row.delivered_at,
    expiresAt: row.status === "PENDING_PAYMENT" ? row.expires_at : null,
    cancelReason: row.cancel_reason,
    canPay: stillPayable(row) && onlinePaymentsReady(),
    canCancel: CUSTOMER_CAN_CANCEL.includes(row.status)
  };
}

/** The complete order. `admin` adds what only FrameX staff may see. */
export function shape(row, parts, { admin = false } = {}) {
  const byItem = photosByItem(parts.photos || []);
  const items = parts.items.map((r) => item(r, byItem.get(r.id) || []));
  return {
    ...summary(row),
    shippingAddress: row.shipping_address,
    customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
    items,
    // true = a personalised line has no uploaded photos (an order from before photos were uploaded to
    // FrameX): the customer was asked to send them separately.
    needsPhotos: items.some((i) => i.photosMissing),
    photoCount: items.reduce((sum, i) => sum + i.photos.length, 0),
    payments: parts.payments.map((p) => ({
      attempt: p.attempt,
      status: p.status,
      provider: p.provider,
      method: p.method_requested,
      instrument: p.instrument,
      amount: p.amount,
      amountRefunded: p.amount_refunded,
      reference: p.gateway_payment_id,
      failureReason: p.failure_reason,
      createdAt: p.created_at,
      paidAt: p.paid_at,
      ...(admin ? { gatewayOrderId: p.gateway_order_id, failureCode: p.failure_code, verifiedVia: p.verified_via } : {})
    })),
    refunds: parts.refunds.map((f) => ({ amount: f.amount, status: f.status, reason: f.reason, createdAt: f.created_at, ...(admin ? { reference: f.gateway_refund_id } : {}) })),
    events: parts.events.map((e) => ({ kind: e.kind, status: e.status, detail: e.detail, by: e.actor_role, at: e.created_at })),
    ...(admin ? { userId: row.user_id, gatewayOrderId: row.gateway_order_id, nextStatuses: nextStatuses(row), refundable: refundable(row), stockHeld: row.stock_held, testNote: row.test_note || "" } : {})
  };
}

async function partsOf(orderId, q = db) {
  const [items, payments, refunds, events, photos] = [
    (await q.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY position", [orderId])).rows,
    (await q.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY attempt", [orderId])).rows,
    (await q.query("SELECT * FROM refunds WHERE order_id = $1 ORDER BY created_at", [orderId])).rows,
    (await q.query("SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at, id", [orderId])).rows,
    (await q.query(`${PHOTOS_SQL} WHERE p.order_id = $1 ORDER BY p.order_item_id, p.position`, [orderId])).rows
  ];
  return { items, payments, refunds, events, photos };
}

/* ---------------------------------------------------------------- Links to an order's photos */

const photoNotFound = () => errors.notFound("We couldn't find that photo in this order.", "ORDER_PHOTO_NOT_FOUND");

/** The upload row of a photo that belongs to this order (optionally: to a line of one of these shops), or 404. */
export async function orderPhotoRow(orderId, uploadId, { shopRefs = null } = {}, q = db) {
  if (!/^[0-9a-f-]{36}$/i.test(String(uploadId || ""))) throw photoNotFound();
  const params = [orderId, uploadId];
  let shopSql = "";
  if (shopRefs) {
    shopSql = ` AND i.shop_ref IN (${marks(shopRefs, 3)})`;
    params.push(...shopRefs);
  }
  const { rows } = await q.query(
    `SELECT u.*, p.slot, i.name AS item_name, i.position AS item_position
       FROM order_item_photos p
       JOIN order_items i ON i.id = p.order_item_id
       JOIN uploads u ON u.id = p.upload_id
      WHERE p.order_id = $1 AND p.upload_id = $2 AND u.status <> 'DELETED'${shopSql}
      LIMIT 1`,
    params
  );
  if (!rows[0]) throw photoNotFound();
  return rows[0];
}

/** A download name that says which order and which photo it is: "FX-100012-item1-photo2-family.jpg". */
export const photoFileName = (orderNumber, row) => `${orderNumber}-item${row.item_position}-${row.slot}-${row.original_name}`.slice(0, 180);

/** The customer's own link to a photo of their own order. */
export async function ownPhotoLink(userId, orderNumber, uploadId, { download = false } = {}) {
  const order = await ownOrderRow(userId, orderNumber);
  const row = await orderPhotoRow(order.id, uploadId);
  return linkTo(row, { download, name: row.original_name });
}

/** FrameX staff: a link to any photo of any order. Every link that is made is written to the audit log. */
export async function adminPhotoLink(orderNumber, uploadId, { actor, ip = null }) {
  const order = await adminOrderRow(orderNumber);
  const row = await orderPhotoRow(order.id, uploadId);
  await audit(db, { actor, action: ACTIONS.ORDER_PHOTO_ACCESSED, targetType: "order", targetId: order.order_number, metadata: { uploadId: row.id, slot: row.slot, item: row.item_name }, ip });
  return linkTo(row, { download: true, name: photoFileName(order.order_number, row) });
}

/* ---------------------------------------------------------------- Reading */

/** A customer's own order row (or 404). The number alone is never enough: it must be theirs. */
export async function ownOrderRow(userId, orderNumber, q = db) {
  if (!ORDER_NUMBER.test(String(orderNumber || ""))) throw notFound();
  const { rows } = await q.query("SELECT * FROM orders WHERE order_number = $1 AND user_id = $2", [orderNumber, userId]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function orderRowById(id, q = db) {
  return (await q.query("SELECT * FROM orders WHERE id = $1", [id])).rows[0] || null;
}

export const getOwnOrder = async (userId, orderNumber) => {
  const row = await ownOrderRow(userId, orderNumber);
  return shape(row, await partsOf(row.id));
};

export const orderForCustomer = async (orderId) => {
  const row = await orderRowById(orderId);
  return row ? shape(row, await partsOf(row.id)) : null;
};

/** A page of order rows with the first item of each (for lists). */
async function page(where, params, { page: p = 1, limit = 10 } = {}) {
  const size = Math.min(Math.max(1, limit), 50);
  const at = Math.max(1, p);
  const total = (await db.query(`SELECT count(*)::int AS n FROM orders o WHERE ${where}`, params)).rows[0].n;
  const { rows } = await db.query(`SELECT o.* FROM orders o WHERE ${where} ORDER BY o.created_at DESC, o.order_number DESC LIMIT ${size} OFFSET ${(at - 1) * size}`, params);
  const first = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const items = (await db.query(`SELECT order_id, name, image, quantity FROM order_items WHERE order_id IN (${marks(ids)}) ORDER BY position`, ids)).rows;
    for (const i of items) if (!first.has(i.order_id)) first.set(i.order_id, i);
  }
  return {
    items: rows.map((r) => ({ ...summary(r), firstItem: first.has(r.id) ? { name: first.get(r.id).name, image: first.get(r.id).image } : null, customer: { name: r.customer_name, email: r.customer_email } })),
    total,
    page: at,
    limit: size
  };
}

export const listOwnOrders = (userId, paging) => page("o.user_id = $1", [userId], paging);

export function adminListOrders({ status = "", paymentStatus = "", q = "", page: p, limit }) {
  const where = ["true"];
  const params = [];
  if (status) where.push(`o.status = $${params.push(status)}`);
  if (paymentStatus) where.push(`o.payment_status = $${params.push(paymentStatus)}`);
  if (q) {
    const n = params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(o.order_number) LIKE $${n} OR lower(o.customer_name) LIKE $${n} OR lower(o.customer_email) LIKE $${n} OR o.customer_phone LIKE $${n})`);
  }
  return page(where.join(" AND "), params, { page: p, limit: limit || 20 });
}

export async function adminOrderRow(orderNumber, q = db) {
  if (!ORDER_NUMBER.test(String(orderNumber || ""))) throw notFound();
  const { rows } = await q.query("SELECT * FROM orders WHERE order_number = $1", [orderNumber]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export const adminGetOrder = async (orderNumber) => {
  const row = await adminOrderRow(orderNumber);
  return shape(row, await partsOf(row.id), { admin: true });
};

/**
 * An admin says an order is (or is not) a test: an order someone placed to try the shop, for example
 * with Cash on Delivery, which no gateway can label. Test orders stay in every list; the sales
 * reports show them on their own and leave them out of orders, sales and revenue.
 */
export async function adminSetTest(orderNumber, { test, note = "" }, { actor, ip = null }) {
  await db.tx(async (q) => {
    const row = await adminOrderRow(orderNumber, q);
    if (Boolean(row.is_test) === Boolean(test) && (row.test_note || "") === note) return;
    await q.query("UPDATE orders SET is_test = $2, test_note = $3, updated_at = now() WHERE id = $1", [row.id, Boolean(test), test ? note || null : null]);
    await addEvent(q, row.id, { kind: "NOTE", detail: test ? `Marked as a test order${note ? `: ${note}` : ""}. It is not counted in sales.` : "No longer marked as a test order. It is counted in sales.", actor: { id: actor.id, role: "ADMIN" } });
    await audit(q, { actor, action: ACTIONS.ORDER_TEST_LABEL_CHANGED, targetType: "order", targetId: row.order_number, metadata: { test: Boolean(test), note }, ip });
  });
  return adminGetOrder(orderNumber);
}

export async function adminOrderCounts() {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'PLACED')::int AS placed,
            count(*) FILTER (WHERE status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'))::int AS in_progress,
            count(*) FILTER (WHERE status = 'PENDING_PAYMENT')::int AS awaiting_payment,
            count(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered
       FROM orders`
  );
  return { placed: rows[0].placed, inProgress: rows[0].in_progress, awaitingPayment: rows[0].awaiting_payment, delivered: rows[0].delivered };
}

/* ---------------------------------------------------------------- History + emails */

export const addEvent = (q, orderId, { kind, status = null, detail = null, actor = SYSTEM }) =>
  q.query("INSERT INTO order_events (id, order_id, kind, status, detail, actor_user_id, actor_role) VALUES ($1, $2, $3, $4, $5, $6, $7)", [newId(), orderId, kind, status, detail, actor.id || null, actor.role || "SYSTEM"]);

// Emails are sent after the database change is saved, without making the customer wait for them.
const sending = new Set();
/** Tests: wait until every email that was started has been handed to the mailer. */
export const emailsSettled = () => Promise.all([...sending]);

/**
 * Email the customer about their order: once per (order, kind, ref).
 * The row in order_notifications is written first; if it is already there
 * (a repeated webhook, a second callback), nothing is sent again.
 */
export function notify(orderId, kind, { ref = "", extra = {} } = {}) {
  const job = (async () => {
    try {
      const row = await orderRowById(orderId);
      if (!row) return;
      const id = newId();
      const claimed = await db.query("INSERT INTO order_notifications (id, order_id, kind, ref, recipient) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (order_id, kind, ref) DO NOTHING RETURNING id", [id, orderId, kind, ref, row.customer_email]);
      if (!claimed.rows[0]) return;
      // The same news, short, in the customer's account (the email below is the full version).
      await orderEvent(row, kind, ref);
      const result = await sendMail({ to: row.customer_email, ...orderEmail(kind, shape(row, await partsOf(orderId)), extra) });
      await db.query("UPDATE order_notifications SET delivered = $2, detail = $3 WHERE id = $1", [id, result.delivered, result.delivered ? String(result.id || "") : [result.reason, result.detail].filter(Boolean).join(": ")]);
    } catch (error) {
      console.error(`[orders] email ${kind} for order ${orderId} failed: ${error.message}`);
    }
  })();
  sending.add(job);
  job.finally(() => sending.delete(job));
  return job;
}

/* ---------------------------------------------------------------- Stock */

/** Units of each product an order holds: Map(productId -> units). */
export async function orderUnits(q, orderId) {
  const { rows } = await q.query("SELECT product_id, sum(quantity)::int AS units FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL GROUP BY product_id", [orderId]);
  return new Map(rows.map((r) => [r.product_id, r.units]));
}

async function giveStockBack(q, row) {
  if (!row.stock_held) return;
  await releaseStock(q, await orderUnits(q, row.id));
  await q.query("UPDATE orders SET stock_held = false WHERE id = $1", [row.id]);
}

/* ---------------------------------------------------------------- Status changes */

/**
 * Cancel an order inside a transaction, only if it is still in one of `from`.
 * The stock goes back. A payment that was never made becomes CANCELLED; one
 * that WAS made stays PAID here, and the caller starts the refund.
 * Returns the updated row, or null when the order had already moved on.
 */
export async function markCancelled(q, orderId, { from, reason, actor = SYSTEM }) {
  const { rows } = await q.query(
    `UPDATE orders SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = $2, expires_at = NULL, updated_at = now(),
            payment_status = CASE WHEN payment_status IN ('PENDING', 'FAILED') THEN 'CANCELLED' ELSE payment_status END
      WHERE id = $1 AND status IN (${marks(from, 3)}) RETURNING *`,
    [orderId, reason, ...from]
  );
  const row = rows[0];
  if (!row) return null;
  await q.query("UPDATE payments SET status = 'CANCELLED', updated_at = now() WHERE order_id = $1 AND status = 'PENDING'", [orderId]);
  await giveStockBack(q, row);
  await addEvent(q, orderId, { kind: "ORDER", status: "CANCELLED", detail: reason, actor });
  return { ...row, stock_held: false };
}

/**
 * An admin moves an order forward (CONFIRMED ... DELIVERED) or marks it RETURNED.
 * Cash on Delivery is paid when the order is delivered.
 * Cancelling is not done here: it may need a refund (payment-service -> cancelOrder).
 */
export async function adminAdvance(orderNumber, status, { note = "", actor, ip = null }) {
  const row = await db.tx(async (q) => {
    const current = (await q.query("SELECT * FROM orders WHERE order_number = $1 FOR UPDATE", [orderNumber])).rows[0];
    if (!current) throw notFound();
    if (status === "CANCELLED" || !nextStatuses(current).includes(status)) throw errors.conflict(`An order that is ${current.status.replace(/_/g, " ").toLowerCase()} can't be set to ${status.replace(/_/g, " ").toLowerCase()}.`, null, "ORDER_STATUS_NOT_ALLOWED");
    const codPaid = status === "DELIVERED" && current.payment_method === "COD" && current.payment_status === "PENDING";
    const { rows } = await q.query(
      `UPDATE orders SET status = $2, updated_at = now(),
              delivered_at = CASE WHEN $2 = 'DELIVERED' THEN now() ELSE delivered_at END,
              payment_status = CASE WHEN $3 THEN 'PAID' ELSE payment_status END,
              paid_at = CASE WHEN $3 THEN now() ELSE paid_at END
        WHERE id = $1 RETURNING *`,
      [current.id, status, codPaid]
    );
    await addEvent(q, current.id, { kind: "ORDER", status, detail: note || null, actor });
    if (codPaid) {
      await q.query("UPDATE payments SET status = 'PAID', paid_at = now(), verified_via = 'delivery', updated_at = now() WHERE order_id = $1 AND provider = 'cod' AND status = 'PENDING'", [current.id]);
      await addEvent(q, current.id, { kind: "PAYMENT", status: "PAID", detail: "Cash collected on delivery.", actor });
    }
    await audit(q, { actor, action: ACTIONS.ORDER_STATUS_CHANGED, targetType: "order", targetId: current.order_number, metadata: { from: current.status, to: status }, ip });
    return rows[0];
  });
  if (status === "SHIPPED") notify(row.id, "ORDER_SHIPPED");
  if (status === "DELIVERED") notify(row.id, "ORDER_DELIVERED");
  return adminGetOrder(orderNumber);
}

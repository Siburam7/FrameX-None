/* ==========================================================================
   Changing an order after it was placed (owner, 2026-10-24): FrameX staff —
   admins and FrameX Care — do it when a customer asks in the chat.

   Size  (before the shop starts making it: PLACED or CONFIRMED; product lines
         only; not when the new size needs a different number of photos)
         The line is priced again exactly as the cart prices it. The order's
         coupon is worked out again on the new items total (its own percent and
         cap; the "once per customer" limit doesn't count this same order), tax
         again at the order's own rate; delivery, gift wrap and COD fees stay.
           Cash on Delivery           the new total is collected on delivery.
           paid online, cheaper       the difference is refunded at once.
           paid online, same price    nothing to pay.
           paid online, dearer        refused for now: the customer would have to
                                      pay the difference (not built yet).
  Address  (before it is shipped) the order's delivery address is replaced.

   Every change is written to the order's history and the audit log, and the
   customer gets an email.
   ========================================================================== */
import { siteEngine } from "../catalog/site-engine.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { esc, htmlEmail, sendMail } from "../lib/mailer.js";
import { isUuid } from "../lib/validate.js";
import { getProduct } from "./catalog-service.js";
import * as orders from "./order-service.js";
import { refundPayment } from "./payment-service.js";

export const SIZE_CHANGE_STATUSES = ["PLACED", "CONFIRMED"];
export const ADDRESS_CHANGE_STATUSES = ["PLACED", "CONFIRMED", "PROCESSING"];

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const conflict = (code, message) => errors.conflict(message, null, code);
const notFound = () => errors.notFound("We couldn't find that order.", "ORDER_NOT_FOUND");
const staffName = (actor) => String(actor.name || "FrameX").trim().split(/\s+/)[0];
const byWhom = (actor) => `${staffName(actor)} (${actor.role === "CARE" ? "FrameX Care" : "FrameX"})`;

/** A product line priced for another size, as the cart would price it. */
function priceFor(product, selection, sizeId) {
  const { model } = siteEngine();
  const p = model.normalize(product.data);
  const line = model.cartLine(p, { ...selection, sizeId });
  if (line.problems.length || line.selection.sizeId !== sizeId) return null;
  const q = line.quote;
  const unitDiscount = q && q.discountPercent ? Math.max(0, q.listPrice - q.lines[0].amount) : 0;
  return { p, line, unitPrice: line.unitPrice, unitDiscount, unitListPrice: line.unitPrice + unitDiscount, photos: model.photoRequirement(p, line.selection).count };
}

/** The order's money worked out again from its lines (coupon and tax again; the fees as they were). */
async function totalsFor(q, order, items) {
  const subtotal = items.reduce((s, i) => s + i.unit_list_price * i.quantity, 0);
  const discount = items.reduce((s, i) => s + i.unit_discount * i.quantity, 0);
  const itemsTotal = subtotal - discount;
  let couponDiscount = 0;
  if (order.coupon_code && order.coupon_discount > 0) {
    const c = (await q.query("SELECT percent_off, max_discount FROM coupons WHERE code = $1", [order.coupon_code])).rows[0];
    if (c) {
      couponDiscount = Math.round((itemsTotal * c.percent_off) / 100);
      if (c.max_discount) couponDiscount = Math.min(couponDiscount, c.max_discount);
      couponDiscount = Math.min(couponDiscount, itemsTotal);
    } else couponDiscount = Math.min(order.coupon_discount, itemsTotal);
  }
  const afterCoupon = itemsTotal - couponDiscount;
  const tax = Math.round((afterCoupon * Number(order.tax_percent || 0)) / 100);
  const total = afterCoupon + tax + order.shipping_fee + (order.gift_wrap_fee || 0) + order.cod_fee;
  return { subtotal, discount, couponDiscount, tax, total };
}

const lockOrder = async (q, orderNumber) => {
  const row = (await q.query("SELECT * FROM orders WHERE order_number = $1 FOR UPDATE", [orderNumber])).rows[0];
  if (!row) throw notFound();
  return row;
};
const lineOf = async (q, order, itemId) => {
  if (!isUuid(itemId)) throw errors.notFound("We couldn't find that line of the order.");
  const item = (await q.query("SELECT * FROM order_items WHERE id = $1 AND order_id = $2", [itemId, order.id])).rows[0];
  if (!item) throw errors.notFound("We couldn't find that line of the order.");
  return item;
};

function sizeRules(order, item) {
  if (!SIZE_CHANGE_STATUSES.includes(order.status)) throw conflict("ORDER_NOT_EDITABLE", "The size can be changed only before the shop starts making the order (Placed or Confirmed).");
  if (order.payment_method === "ONLINE" && !["PAID", "PARTIALLY_REFUNDED"].includes(order.payment_status)) throw conflict("ORDER_NOT_PAID", "This order isn't paid yet: the customer can simply order again in the size they want.");
  if (item.kind !== "PRODUCT" || !item.product_id) throw conflict("LINE_NOT_EDITABLE", "The size of a FrameX Studio design or a template can't be changed here.");
}

/** The sizes this line can be changed to, each with what the order would cost and what that means for payment. */
export async function sizeOptions(orderNumber, itemId) {
  const order = (await db.query("SELECT * FROM orders WHERE order_number = $1", [orderNumber])).rows[0];
  if (!order) throw notFound();
  const item = await lineOf(db, order, itemId);
  sizeRules(order, item);
  const product = await getProduct(item.product_id);
  if (!product) throw conflict("PRODUCT_GONE", "This product isn't in the catalogue any more, so its sizes can't be priced.");
  const { model } = siteEngine();
  const p = model.normalize(product.data);
  const items = (await db.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY position", [order.id])).rows;
  const current = (item.selection && item.selection.sizeId) || null;
  const out = [];
  for (const s of p.sizes || []) {
    const priced = priceFor(product, item.selection || {}, s.id);
    if (!priced) continue;
    const next = items.map((i) => (i.id === item.id ? { ...i, unit_list_price: priced.unitListPrice, unit_discount: priced.unitDiscount } : i));
    const t = await totalsFor(db, order, next);
    const difference = t.total - order.total;
    out.push({
      sizeId: s.id,
      label: priced.line.size,
      unitPrice: priced.unitPrice,
      current: s.id === current,
      newTotal: t.total,
      difference,
      allowed: priced.photos === item.photos_required && !(order.payment_method === "ONLINE" && difference > 0),
      why: priced.photos !== item.photos_required ? "Needs a different number of photos" : order.payment_method === "ONLINE" && difference > 0 ? `Costs ${rupees(difference)} more: the customer would have to pay the difference` : null
    });
  }
  return { orderNumber, itemId, name: item.name, quantity: item.quantity, paymentMethod: order.payment_method, total: order.total, sizes: out };
}

/** Change a line's size. -> { order, change: { from, to, oldTotal, newTotal, refunded } } */
export async function changeSize(orderNumber, itemId, sizeId, { actor, ip = null }) {
  const done = await db.tx(async (q) => {
    const order = await lockOrder(q, orderNumber);
    const item = await lineOf(q, order, itemId);
    sizeRules(order, item);
    if (item.selection && item.selection.sizeId === sizeId) throw conflict("SAME_SIZE", "That is already the size of this line.");
    const product = await getProduct(item.product_id, q);
    if (!product) throw conflict("PRODUCT_GONE", "This product isn't in the catalogue any more, so its sizes can't be priced.");
    const priced = priceFor(product, item.selection || {}, sizeId);
    if (!priced) throw errors.validation({ sizeId: "That size isn't offered for this product." });
    if (priced.photos !== item.photos_required) throw conflict("PHOTOS_DIFFER", "That size needs a different number of photos than the customer uploaded.");
    const items = (await q.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY position", [order.id])).rows;
    const next = items.map((i) => (i.id === item.id ? { ...i, unit_list_price: priced.unitListPrice, unit_discount: priced.unitDiscount } : i));
    const t = await totalsFor(q, order, next);
    const difference = t.total - order.total;
    const online = order.payment_method === "ONLINE";
    if (online && difference > 0) throw conflict("NEEDS_PAYMENT", `This size costs ${rupees(difference)} more, and the order was paid online: the customer would have to pay the difference. That isn't possible yet.`);
    await q.query(
      `UPDATE order_items SET size = $2, selection = $3, options = $4, unit_list_price = $5, unit_discount = $6, unit_price = $7, line_total = $8 WHERE id = $1`,
      [item.id, priced.line.size, JSON.stringify(priced.line.selection), JSON.stringify(priced.line.options || []), priced.unitListPrice, priced.unitDiscount, priced.unitPrice, priced.unitPrice * item.quantity]
    );
    await q.query("UPDATE orders SET subtotal = $2, discount = $3, coupon_discount = $4, tax = $5, total = $6, updated_at = now() WHERE id = $1", [order.id, t.subtotal, t.discount, t.couponDiscount, t.tax, t.total]);
    // A COD order's payment record carries what is to be collected
    if (!online) await q.query("UPDATE payments SET amount = $2, updated_at = now() WHERE order_id = $1 AND provider = 'cod' AND status = 'PENDING'", [order.id, t.total]);
    const detail = `Size changed by ${byWhom(actor)}: ${item.name} — ${item.size || "—"} → ${priced.line.size}. Total ${rupees(order.total)} → ${rupees(t.total)}.`;
    await orders.addEvent(q, order.id, { kind: "NOTE", status: null, detail, actor });
    await audit(q, { actor, action: ACTIONS.ORDER_EDITED, targetType: "order", targetId: order.order_number, metadata: { change: "size", item: item.id, from: item.size, to: priced.line.size, oldTotal: order.total, newTotal: t.total }, ip });
    return { order, item, to: priced.line.size, newTotal: t.total, difference, online };
  });
  let refunded = 0;
  if (done.online && done.difference < 0) {
    try {
      refunded = (await refundPayment(done.order.id, { amount: -done.difference, reason: `Size changed to ${done.to}`, actor, ip })).amount;
    } catch (error) {
      await orders.addEvent(db, done.order.id, { kind: "REFUND", status: "FAILED", detail: `The refund of ${rupees(-done.difference)} for the size change could not be started automatically. FrameX will refund it manually.` });
    }
  }
  tell(done.order, {
    subject: `Your FrameX order ${done.order.order_number} was updated`,
    lines: [`As you asked, ${esc(done.item.name)} is now in size <strong>${esc(done.to)}</strong> (was ${esc(done.item.size || "—")}).`, `New order total: <strong>${esc(rupees(done.newTotal))}</strong>.`, ...(refunded ? [`${esc(rupees(refunded))} is being refunded to the payment method you used.`] : []), ...(!done.online && done.difference ? ["You pay the new total on delivery."] : [])],
    text: `As you asked, ${done.item.name} is now in size ${done.to} (was ${done.item.size || "—"}). New order total: ${rupees(done.newTotal)}.${refunded ? ` ${rupees(refunded)} is being refunded to the payment method you used.` : ""}`
  });
  return { order: await orders.adminGetOrder(orderNumber), change: { from: done.item.size, to: done.to, oldTotal: done.order.total, newTotal: done.newTotal, refunded } };
}

/** Replace the delivery address (before the order is shipped). address: the fields of address-service readAddress. */
export async function changeAddress(orderNumber, address, { actor, ip = null }) {
  const done = await db.tx(async (q) => {
    const order = await lockOrder(q, orderNumber);
    if (!ADDRESS_CHANGE_STATUSES.includes(order.status)) throw conflict("ORDER_NOT_EDITABLE", "The address can be changed only before the order is shipped.");
    const old = order.shipping_address || {};
    const snapshot = { fullName: address.fullName, phone: address.phone, line1: address.line1, line2: address.line2 || "", landmark: address.landmark || "", city: address.city, state: address.state, postalCode: address.postalCode, country: old.country || "IN" };
    await q.query("UPDATE orders SET shipping_address = $2, customer_phone = coalesce($3, customer_phone), updated_at = now() WHERE id = $1", [order.id, JSON.stringify(snapshot), snapshot.phone || null]);
    const where = (a) => [a.line1, a.city, a.postalCode].filter(Boolean).join(", ");
    await orders.addEvent(q, order.id, { kind: "NOTE", status: null, detail: `Delivery address changed by ${byWhom(actor)}: ${where(old)} → ${where(snapshot)}.`, actor });
    await audit(q, { actor, action: ACTIONS.ORDER_EDITED, targetType: "order", targetId: order.order_number, metadata: { change: "address", from: where(old), to: where(snapshot) }, ip });
    return { order, snapshot };
  });
  const a = done.snapshot;
  const block = [a.fullName, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.postalCode}`, a.phone].filter(Boolean);
  tell(done.order, {
    subject: `The delivery address of your FrameX order ${done.order.order_number} was changed`,
    lines: ["As you asked, your order will now be delivered to:", block.map(esc).join("<br>")],
    text: `As you asked, your order will now be delivered to:\n${block.join("\n")}`
  });
  return { order: await orders.adminGetOrder(orderNumber) };
}

const sending = new Set();
/** Tests: wait for the change emails. */
export const editsSettled = () => Promise.all([...sending]);
function tell(order, { subject, lines, text }) {
  if (!order.customer_email) return;
  const p = sendMail({
    to: order.customer_email,
    subject,
    text: `Hi ${order.customer_name || ""},\n\n${text}\n\nIf you didn't ask for this, reply in the FrameX Care chat on the website.`,
    html: htmlEmail({ preview: subject, heading: `Order ${esc(order.order_number)} updated`, paragraphs: [`Hi ${esc(order.customer_name || "")},`, ...lines, "If you didn't ask for this, write to us in the FrameX Care chat on the website."], notice: "You received this because your FrameX order was changed.", account: false })
  }).catch((error) => console.error(`[orders] change email failed: ${error.message}`));
  sending.add(p);
  p.finally(() => sending.delete(p));
}

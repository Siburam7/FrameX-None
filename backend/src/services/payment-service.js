/* ==========================================================================
   Payments: attempts, verification, webhooks, refunds, and cancelling.

   The rule everything here follows: an order becomes PAID only in
   confirmPaid(), and confirmPaid() is only reached with a payment that the
   SERVER got from the gateway itself:
     - the gateway's answer to "what is the status of payment X?"
       (after checking the checkout signature), or
     - a webhook whose signature was verified, or
     - the gateway's list of payments for our order (reconcile).
   What the browser says ("it worked", "it failed") only makes the server go
   and ask the gateway. It never changes a payment by itself.

   Safe to repeat: the same callback, webhook or refresh, any number of times,
   in any order, ends in the same state. One order, one PAID payment, one email.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { linkBase } from "../lib/context.js";
import { HttpError, errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { gateway, gatewayNamed } from "../payments/index.js";
import { removePurchased } from "./cart-service.js";
import { reserveStock } from "./catalog-service.js";
import * as orders from "./order-service.js";
import { webhookPayment as paintingWebhook } from "./painting-payment-service.js";

const MAX_ATTEMPTS = 8;
const INSTRUMENT = { upi: "UPI", card: "card", netbanking: "net banking", wallet: "wallet", emi: "EMI" };
const conflict = (code, message, extra) => new HttpError(409, code, message, extra);
const log = (message) => {
  if (!config.isTest) console.log(`[payments] ${message}`);
};

/* ---------------------------------------------------------------- Starting an attempt */

/** What the browser needs to open the gateway's checkout for an order. No secret is in here. */
function session(order, payment) {
  const gw = gateway();
  return {
    ...gw.clientConfig(),
    orderNumber: order.order_number,
    gatewayOrderId: payment.gateway_order_id,
    // Cashfree: the session its checkout opens with. It names this one order and amount; it is not a key.
    ...(order.gateway_session ? { paymentSessionId: order.gateway_session } : {}),
    amount: order.total * 100, // in paise, as the gateway's checkout expects; fixed by the server
    currency: order.currency,
    name: config.payments.brandName,
    description: `Order ${order.order_number}`,
    prefill: { name: order.customer_name, email: order.customer_email, contact: order.customer_phone || "" },
    method: payment.method_requested || null
  };
}

/**
 * Open a payment attempt for an order that is waiting for its payment.
 * The gateway's order is created once per FrameX order and reused for every
 * retry: the gateway accepts one successful payment per order, so a customer
 * can't pay twice. Earlier attempts stay in the table.
 */
export async function openAttempt(order, method) {
  const gw = gateway();
  // An order whose gateway order was made with another provider (the provider was changed meanwhile) starts a new one.
  let gatewayOrderId = order.payment_gateway && order.payment_gateway !== gw.name ? null : order.gateway_order_id;
  let gatewaySession = gatewayOrderId ? order.gateway_session : null;
  let replaced = false;
  try {
    // A gateway that closes its orders after a while (Cashfree): an order it closed unpaid can't take another try.
    if (gatewayOrderId && gw.orderState && (await gw.orderState(gatewayOrderId)) === "EXPIRED") {
      gatewayOrderId = null;
      replaced = true;
    }
    if (!gatewayOrderId) {
      const address = order.shipping_address || {};
      const created = await gw.createOrder({
        amount: order.total,
        currency: order.currency,
        receipt: order.order_number,
        notes: { order_number: order.order_number },
        customer: { id: order.user_id, name: order.customer_name, email: order.customer_email, phone: order.customer_phone || address.phone || "" },
        returnUrl: `${linkBase()}/order.html?id=${encodeURIComponent(order.order_number)}`,
        expiresAt: new Date(Date.now() + config.payments.pendingMinutes * 60_000)
      });
      if (created.amountMinor !== order.total * 100) throw new Error("the gateway answered with a different amount");
      gatewayOrderId = created.gatewayOrderId;
      gatewaySession = created.session || null;
    }
  } catch (error) {
    console.error(`[payments] could not create the ${gw.name} order for ${order.order_number}: ${error.message}`);
    if (error.code === "PHONE_REQUIRED") throw new HttpError(422, "PHONE_REQUIRED", "Add a 10-digit phone number to your delivery address to pay online.");
    throw new HttpError(502, "PAYMENT_GATEWAY_ERROR", "We couldn't reach the payment gateway. Your order is saved: please try the payment again.");
  }
  const payment = await db.tx(async (q) => {
    const fresh = (await q.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [order.id])).rows[0];
    if (!fresh || fresh.status !== "PENDING_PAYMENT") throw conflict("ORDER_NOT_PAYABLE", "This order is no longer waiting for a payment.");
    // Two requests at once: the first gateway order wins, the other is simply never paid.
    if (fresh.gateway_order_id && fresh.payment_gateway === gw.name && !replaced) {
      gatewayOrderId = fresh.gateway_order_id;
      gatewaySession = fresh.gateway_session;
    } else await q.query("UPDATE orders SET payment_gateway = $2, gateway_order_id = $3, gateway_session = $4 WHERE id = $1", [fresh.id, gw.name, gatewayOrderId, gatewaySession]);
    const count = (await q.query("SELECT coalesce(max(attempt), 0)::int AS n FROM payments WHERE order_id = $1", [fresh.id])).rows[0].n;
    if (count >= MAX_ATTEMPTS) throw conflict("TOO_MANY_ATTEMPTS", "This order has had too many payment attempts. Please check out again.");
    await q.query("UPDATE payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Not completed'), updated_at = now() WHERE order_id = $1 AND status = 'PENDING'", [fresh.id]);
    const id = newId();
    await q.query("INSERT INTO payments (id, order_id, attempt, provider, method_requested, status, amount, currency, gateway_order_id) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8)", [id, fresh.id, count + 1, gw.name, method || null, fresh.total, fresh.currency, gatewayOrderId]);
    await q.query(`UPDATE orders SET payment_status = 'PENDING', expires_at = now() + interval '${config.payments.pendingMinutes} minutes', updated_at = now() WHERE id = $1`, [fresh.id]);
    if (count > 0) await orders.addEvent(q, fresh.id, { kind: "PAYMENT", status: "PENDING", detail: `Payment attempt ${count + 1} started.`, actor: { id: fresh.user_id, role: "CUSTOMER" } });
    return (await q.query("SELECT * FROM payments WHERE id = $1", [id])).rows[0];
  });
  return { session: session({ ...order, gateway_session: gatewaySession }, payment), payment };
}

/* ---------------------------------------------------------------- The only way to PAID */

/**
 * Record a payment the gateway reports as captured.
 * `gp` is the gateway's own description of the payment (never browser input).
 * `via` says how the server learned of it: checkout | webhook | reconcile.
 * -> { placed } first time, { already } on any repeat, { mismatch } / { late } / { duplicate } otherwise.
 */
export async function confirmPaid(orderId, gp, via) {
  const outcome = await db.tx(async (q) => {
    const order = (await q.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
    if (!order) return { missing: true };

    // The amount is the one the server asked for, in the same currency. Anything else is not a payment for this order.
    if (gp.amountMinor !== order.total * 100 || gp.currency !== order.currency || (gp.gatewayOrderId && gp.gatewayOrderId !== order.gateway_order_id)) {
      await orders.addEvent(q, order.id, { kind: "PAYMENT", status: "FAILED", detail: "A payment with a different amount or order reference was reported by the gateway and was not accepted." });
      return { mismatch: true };
    }
    if (order.payment_status === "PAID" || order.payment_status === "REFUNDED" || order.payment_status === "PARTIALLY_REFUNDED") {
      // The callback after the webhook, the webhook twice, a page refresh: nothing left to do.
      if (order.gateway_payment_id === gp.gatewayPaymentId) return { already: true };
      return { duplicate: true };
    }

    // The attempt this payment belongs to: the one already carrying its id, else the newest open one.
    const byId = (await q.query("SELECT * FROM payments WHERE provider = $1 AND gateway_payment_id = $2", [order.payment_gateway, gp.gatewayPaymentId])).rows[0];
    if (byId && byId.order_id !== order.id) return { mismatch: true };
    const attempt = byId || (await q.query("SELECT * FROM payments WHERE order_id = $1 AND provider = $2 AND gateway_payment_id IS NULL ORDER BY (status = 'PENDING') DESC, attempt DESC LIMIT 1", [order.id, order.payment_gateway])).rows[0];
    let attemptId = attempt ? attempt.id : newId();
    if (!attempt) {
      const n = (await q.query("SELECT coalesce(max(attempt), 0)::int + 1 AS n FROM payments WHERE order_id = $1", [order.id])).rows[0].n;
      await q.query("INSERT INTO payments (id, order_id, attempt, provider, status, amount, currency, gateway_order_id) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)", [attemptId, order.id, n, order.payment_gateway, order.total, order.currency, order.gateway_order_id]);
    }
    await q.query("UPDATE payments SET status = 'PAID', gateway_payment_id = $2, instrument = $3, verified_via = $4, paid_at = now(), failure_code = NULL, failure_reason = NULL, updated_at = now() WHERE id = $1", [attemptId, gp.gatewayPaymentId, gp.method, via]);
    const paid = "payment_status = 'PAID', paid_at = now(), gateway_payment_id = $2, payment_instrument = $3, updated_at = now()";
    const how = `Paid by ${INSTRUMENT[gp.method] || "online payment"}.`;

    if (order.status === "PENDING_PAYMENT") {
      await q.query(`UPDATE orders SET status = 'PLACED', placed_at = now(), expires_at = NULL, ${paid} WHERE id = $1`, [order.id, gp.gatewayPaymentId, gp.method]);
      await orders.addEvent(q, order.id, { kind: "PAYMENT", status: "PAID", detail: how });
      await orders.addEvent(q, order.id, { kind: "ORDER", status: "PLACED" });
      await clearBoughtItems(q, order);
      return { placed: true };
    }
    if (order.status === "CANCELLED") {
      // The money arrived after the order had timed out. If the items are still there the order goes ahead;
      // otherwise the payment is recorded and refunded straight away.
      const revive = order.cancel_reason === orders.EXPIRED_REASON && !(await reserveStock(q, await orders.orderUnits(q, order.id))).length;
      if (revive) {
        await q.query(`UPDATE orders SET status = 'PLACED', placed_at = now(), cancelled_at = NULL, cancel_reason = NULL, stock_held = true, ${paid} WHERE id = $1`, [order.id, gp.gatewayPaymentId, gp.method]);
        await orders.addEvent(q, order.id, { kind: "PAYMENT", status: "PAID", detail: how });
        await orders.addEvent(q, order.id, { kind: "ORDER", status: "PLACED", detail: "The payment arrived late; the order was reopened." });
        await clearBoughtItems(q, order);
        return { placed: true };
      }
      await q.query(`UPDATE orders SET ${paid} WHERE id = $1`, [order.id, gp.gatewayPaymentId, gp.method]);
      await orders.addEvent(q, order.id, { kind: "PAYMENT", status: "PAID", detail: "The payment arrived after the order was cancelled. It is being refunded." });
      return { late: true };
    }
    // Any other state: the order is already on its way; just record the money.
    await q.query(`UPDATE orders SET ${paid} WHERE id = $1`, [order.id, gp.gatewayPaymentId, gp.method]);
    await orders.addEvent(q, order.id, { kind: "PAYMENT", status: "PAID", detail: how });
    return { placed: true };
  });

  if (outcome.placed) {
    log(`order ${orderId} paid (${via})`);
    orders.notify(orderId, "ORDER_PLACED_PAID");
  }
  if (outcome.late) await refundPayment(orderId, { reason: "The order had already been cancelled.", actor: orders.SYSTEM }).catch((error) => console.error(`[payments] automatic refund for order ${orderId} failed: ${error.message}`));
  if (outcome.duplicate) console.error(`[payments] order ${orderId} is already paid; a second payment ${gp.gatewayPaymentId} was reported and needs a manual refund.`);
  return outcome;
}

async function clearBoughtItems(q, order) {
  const { rows } = await q.query("SELECT cart_item_id, quantity FROM order_items WHERE order_id = $1 AND cart_item_id IS NOT NULL", [order.id]);
  await removePurchased(q, order.user_id, rows.map((r) => ({ cartItemId: r.cart_item_id, quantity: r.quantity })));
}

/**
 * Record that an attempt did not succeed. Never touches an order that is paid.
 * cancelled = the customer closed the checkout; otherwise the payment failed.
 */
export async function markAttemptFailed(orderId, { gatewayPaymentId = null, code = null, reason = null, method = null, cancelled = false }) {
  const status = cancelled ? "CANCELLED" : "FAILED";
  const outcome = await db.tx(async (q) => {
    const order = (await q.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
    if (!order || order.status !== "PENDING_PAYMENT" || order.payment_status === "PAID") return { ignored: true };
    if (gatewayPaymentId && (await q.query("SELECT 1 FROM payments WHERE provider = $1 AND gateway_payment_id = $2", [order.payment_gateway, gatewayPaymentId])).rows[0]) return { already: true };
    let attempt = (await q.query("SELECT * FROM payments WHERE order_id = $1 AND status = 'PENDING' ORDER BY attempt DESC LIMIT 1", [order.id])).rows[0];
    if (!attempt) {
      // Nothing open (already recorded as cancelled or failed). A NEW failed gateway payment still gets its own row.
      if (!gatewayPaymentId) return { already: true };
      const n = (await q.query("SELECT coalesce(max(attempt), 0)::int + 1 AS n FROM payments WHERE order_id = $1", [order.id])).rows[0].n;
      attempt = { id: newId() };
      await q.query("INSERT INTO payments (id, order_id, attempt, provider, status, amount, currency, gateway_order_id) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)", [attempt.id, order.id, n, order.payment_gateway, order.total, order.currency, order.gateway_order_id]);
    }
    await q.query("UPDATE payments SET status = $2, gateway_payment_id = $3, failure_code = $4, failure_reason = $5, instrument = coalesce($6, instrument), updated_at = now() WHERE id = $1", [attempt.id, status, gatewayPaymentId, code, reason, method]);
    await q.query("UPDATE orders SET payment_status = $2, updated_at = now() WHERE id = $1", [order.id, status]);
    await orders.addEvent(q, order.id, { kind: "PAYMENT", status, detail: reason || (cancelled ? "The payment window was closed before paying." : "The payment failed.") });
    return { changed: true, attemptId: attempt.id };
  });
  if (outcome.changed && !cancelled) orders.notify(orderId, "PAYMENT_FAILED", { ref: outcome.attemptId, extra: { reason } });
  return outcome;
}

/* ---------------------------------------------------------------- Asking the gateway */

/**
 * Ask the gateway what really happened with an order's payment and bring the
 * order in line. Used after a refresh, before a retry or a cancel, and when
 * the browser reports an outcome. -> { placed } | { already } | { open, payments } | { unknown }
 */
export async function reconcile(order) {
  if (order.payment_method !== "ONLINE" || !order.gateway_order_id) return { open: true, payments: [] };
  if (order.payment_status === "PAID") return { already: true };
  const gw = gatewayNamed(order.payment_gateway);
  if (!gw) return { unknown: true };
  let list;
  try {
    list = await gw.listOrderPayments(order.gateway_order_id);
  } catch (error) {
    return { unknown: true };
  }
  let captured = list.find((p) => p.status === "captured");
  const authorised = !captured && list.find((p) => p.status === "authorized");
  if (authorised) {
    try {
      captured = await gw.capture(authorised.gatewayPaymentId, order.total, order.currency, { gatewayOrderId: order.gateway_order_id });
    } catch (error) {
      console.error(`[payments] capture of ${authorised.gatewayPaymentId} failed: ${error.message}`);
    }
  }
  if (captured && captured.status === "captured") return confirmPaid(order.id, { ...captured, gatewayOrderId: order.gateway_order_id }, "reconcile");
  return { open: true, payments: list };
}

/* ---------------------------------------------------------------- From the customer's browser */

/** "Retry payment": a new attempt for the same order (after checking it wasn't paid meanwhile). */
export async function retryPayment(userId, orderNumber, method) {
  const order = await orders.ownOrderRow(userId, orderNumber);
  if (order.payment_method !== "ONLINE") throw conflict("ORDER_NOT_PAYABLE", "This order is not paid online.");
  const state = await reconcile(order);
  if (state.placed || state.already) return { order: await orders.getOwnOrder(userId, orderNumber), payment: null };
  if (order.status !== "PENDING_PAYMENT") throw conflict("ORDER_NOT_PAYABLE", "This order is no longer waiting for a payment.");
  if (order.expires_at && new Date(order.expires_at) <= new Date()) throw conflict("ORDER_EXPIRED", "This order has expired. Please check out again.");
  const { session: payment } = await openAttempt(order, method);
  return { order: await orders.getOwnOrder(userId, orderNumber), payment };
}

/**
 * The gateway's checkout handed the browser a payment id and a signature.
 * 1. The signature must be the gateway's (made with the key secret).
 * 2. The payment's status and amount are then fetched from the gateway.
 * Only a captured payment for the right order and amount marks the order paid.
 * A gateway whose checkout gives no signature (Cashfree) has nothing to verify
 * here: the server asks the gateway what happened to the order instead.
 */
export async function verifyCheckout(userId, orderNumber, { gatewayOrderId, gatewayPaymentId, signature }) {
  const order = await orders.ownOrderRow(userId, orderNumber);
  if (order.payment_method !== "ONLINE" || !order.gateway_order_id) throw conflict("ORDER_NOT_PAYABLE", "This order is not paid online.");
  const gw = gatewayNamed(order.payment_gateway);
  if (!gw) throw new HttpError(503, "PAYMENT_NOT_CONFIGURED", "Online payment is not available right now.");
  if (gw.signedCheckout === false) return reportOutcome(userId, orderNumber, { reason: "returned" });
  const invalid = () => new HttpError(400, "PAYMENT_NOT_VERIFIED", "We couldn't verify this payment. If money left your account, it will show on this order shortly or be returned by your bank.");
  if (gatewayOrderId !== order.gateway_order_id || !gw.verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature })) {
    log(`rejected a payment callback for ${order.order_number}: signature or order reference did not match`);
    throw invalid();
  }
  let gp;
  try {
    gp = await gw.fetchPayment(gatewayPaymentId, { gatewayOrderId: order.gateway_order_id });
    if (gp.status === "authorized") gp = await gw.capture(gatewayPaymentId, order.total, order.currency, { gatewayOrderId: order.gateway_order_id });
  } catch (error) {
    // The gateway can't be asked right now. Nothing is marked paid; the webhook or the next refresh settles it.
    throw new HttpError(502, "PAYMENT_CHECK_PENDING", "We're still confirming your payment with the bank. This page will update: please don't pay again.");
  }
  if (gp.gatewayOrderId !== order.gateway_order_id) throw invalid();
  if (gp.status === "captured") await confirmPaid(order.id, gp, "checkout");
  else if (gp.status === "failed") await markAttemptFailed(order.id, { gatewayPaymentId, code: gp.errorCode, reason: gp.errorDescription, method: gp.method });
  return orders.getOwnOrder(userId, orderNumber);
}

/**
 * The browser says the payment failed or the window was closed. That is only
 * a hint: the gateway is asked first (a UPI payment can succeed after the
 * window closes). If nothing was captured, the attempt is recorded as failed
 * or cancelled, with the gateway's reason when it has one.
 * reason: "failed" | "dismissed" | "returned" (the window closed after the
 * customer went through it: a payment that is still being confirmed is left open).
 */
export async function reportOutcome(userId, orderNumber, { gatewayPaymentId = null, reason }) {
  const order = await orders.ownOrderRow(userId, orderNumber);
  if (order.payment_method !== "ONLINE" || order.status !== "PENDING_PAYMENT") return orders.getOwnOrder(userId, orderNumber);
  const state = await reconcile(order);
  if (!state.placed && !state.already) {
    const failed = (state.payments || []).filter((p) => p.status === "failed");
    const seen = failed.find((p) => p.gatewayPaymentId === gatewayPaymentId) || failed[failed.length - 1];
    const waiting = (state.payments || []).some((p) => p.status === "created" && p.rawStatus === "PENDING");
    if (seen && !waiting) await markAttemptFailed(order.id, { gatewayPaymentId: seen.gatewayPaymentId, code: seen.errorCode, reason: seen.errorDescription, method: seen.method, cancelled: seen.errorCode === "USER_DROPPED" });
    else if (reason !== "returned" && !waiting && !state.unknown) await markAttemptFailed(order.id, { cancelled: reason !== "failed", reason: reason === "failed" ? "The payment could not be completed." : null });
  }
  return orders.getOwnOrder(userId, orderNumber);
}

/** The order page of an order that is waiting for a payment asks: did it arrive? */
export async function refresh(userId, orderNumber) {
  const order = await orders.ownOrderRow(userId, orderNumber);
  if (order.status === "PENDING_PAYMENT") await reconcile(order);
  return orders.getOwnOrder(userId, orderNumber);
}

/* ---------------------------------------------------------------- Refunds */

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

/** Apply the gateway's news about a refund. Safe to repeat. */
async function applyRefund(refundId, { gatewayRefundId = null, status }) {
  return db.tx(async (q) => {
    const refund = (await q.query("SELECT * FROM refunds WHERE id = $1 FOR UPDATE", [refundId])).rows[0];
    if (!refund || refund.status === status || refund.status === "PROCESSED") return { changed: false, refund };
    await q.query("UPDATE refunds SET status = $2, gateway_refund_id = coalesce($3, gateway_refund_id), updated_at = now() WHERE id = $1", [refundId, status, gatewayRefundId]);
    if (status === "PROCESSED") {
      const pay = (await q.query("UPDATE payments SET amount_refunded = amount_refunded + $2, updated_at = now() WHERE id = $1 RETURNING amount, amount_refunded", [refund.payment_id, refund.amount])).rows[0];
      await q.query("UPDATE payments SET status = $2 WHERE id = $1", [refund.payment_id, pay.amount_refunded >= pay.amount ? "REFUNDED" : "PARTIALLY_REFUNDED"]);
      const order = (await q.query("UPDATE orders SET amount_refunded = amount_refunded + $2, updated_at = now() WHERE id = $1 RETURNING total, amount_refunded", [refund.order_id, refund.amount])).rows[0];
      await q.query("UPDATE orders SET payment_status = $2 WHERE id = $1", [refund.order_id, order.amount_refunded >= order.total ? "REFUNDED" : "PARTIALLY_REFUNDED"]);
      await orders.addEvent(q, refund.order_id, { kind: "REFUND", status: "PROCESSED", detail: `${rupees(refund.amount)} refunded.` });
    }
    if (status === "FAILED") await orders.addEvent(q, refund.order_id, { kind: "REFUND", status: "FAILED", detail: `The refund of ${rupees(refund.amount)} could not be made.` });
    return { changed: true, refund: { ...refund, status } };
  });
}

/**
 * Refund a paid order, in full (amount left out) or in part.
 * Online: the gateway sends the money back to the method that paid.
 * Cash on Delivery: nothing can be sent automatically, so the refund is
 * recorded as given by FrameX.
 */
export async function refundPayment(orderId, { amount = null, reason = "", actor = orders.SYSTEM, ip = null } = {}) {
  const pending = await db.tx(async (q) => {
    const order = (await q.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
    if (!order) throw errors.notFound("We couldn't find that order.", "ORDER_NOT_FOUND");
    if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.payment_status)) throw conflict("NOTHING_TO_REFUND", "This order has no payment that can be refunded.");
    const pay = (await q.query("SELECT * FROM payments WHERE order_id = $1 AND status IN ('PAID', 'PARTIALLY_REFUNDED') ORDER BY attempt DESC LIMIT 1", [order.id])).rows[0];
    if (!pay) throw conflict("NOTHING_TO_REFUND", "This order has no payment that can be refunded.");
    const underway = (await q.query("SELECT coalesce(sum(amount), 0)::int AS n FROM refunds WHERE payment_id = $1 AND status = 'PENDING'", [pay.id])).rows[0].n;
    const left = pay.amount - pay.amount_refunded - underway;
    const value = amount === null ? left : amount;
    if (!Number.isInteger(value) || value < 1 || value > left) throw errors.validation({ amount: left > 0 ? `Enter an amount from ₹1 to ${rupees(left)}.` : "This payment has already been refunded." });
    const id = newId();
    await q.query("INSERT INTO refunds (id, order_id, payment_id, provider, amount, status, reason, created_by) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)", [id, order.id, pay.id, pay.provider, value, reason || null, actor.id || null]);
    await orders.addEvent(q, order.id, { kind: "REFUND", status: "PENDING", detail: `Refund of ${rupees(value)} started${reason ? `: ${reason}` : "."}`, actor });
    if (actor.role === "ADMIN") await audit(q, { actor, action: ACTIONS.ORDER_REFUNDED, targetType: "order", targetId: order.order_number, metadata: { amount: value }, ip });
    return { id, amount: value, order, pay };
  });

  if (pending.pay.provider === "cod") {
    await applyRefund(pending.id, { status: "PROCESSED" });
    orders.notify(orderId, "REFUND_COMPLETED", { ref: pending.id, extra: { amount: pending.amount } });
    return { amount: pending.amount, status: "PROCESSED" };
  }
  let result;
  try {
    const gw = gatewayNamed(pending.pay.provider);
    if (!gw) throw new Error("the payment gateway is not configured");
    result = await gw.refund({ gatewayOrderId: pending.pay.gateway_order_id, gatewayPaymentId: pending.pay.gateway_payment_id, amount: pending.amount, refundRef: pending.id, notes: { order_number: pending.order.order_number, refund: pending.id } });
  } catch (error) {
    console.error(`[payments] refund for ${pending.order.order_number} failed: ${error.message}`);
    await applyRefund(pending.id, { status: "FAILED" });
    throw new HttpError(502, "REFUND_FAILED", "The payment gateway did not accept the refund. Nothing was refunded; please try again.");
  }
  await db.query("UPDATE refunds SET gateway_refund_id = $2 WHERE id = $1 AND gateway_refund_id IS NULL", [pending.id, result.gatewayRefundId]);
  orders.notify(orderId, "REFUND_INITIATED", { ref: pending.id, extra: { amount: pending.amount } });
  if (result.status !== "PENDING") {
    await applyRefund(pending.id, { gatewayRefundId: result.gatewayRefundId, status: result.status });
    if (result.status === "PROCESSED") orders.notify(orderId, "REFUND_COMPLETED", { ref: pending.id, extra: { amount: pending.amount } });
  }
  return { amount: pending.amount, status: result.status };
}

/* ---------------------------------------------------------------- Cancelling */

/**
 * Cancel an order (customer, admin, or the timer for unpaid orders).
 * An unpaid online order is checked with the gateway first: if the money has
 * arrived, the order is placed instead of cancelled. A paid online order is
 * refunded in full.
 */
export async function cancelOrder(order, { from, reason, actor = orders.SYSTEM, ip = null, email = true }) {
  if (order.status === "PENDING_PAYMENT") {
    const state = await reconcile(order);
    if (state.placed) throw conflict("ORDER_ALREADY_PAID", "The payment for this order went through, so it has been placed.");
  }
  const cancelled = await db.tx(async (q) => {
    const row = await orders.markCancelled(q, order.id, { from, reason, actor });
    if (row && actor.role === "ADMIN") await audit(q, { actor, action: ACTIONS.ORDER_CANCELLED, targetType: "order", targetId: row.order_number, metadata: { reason }, ip });
    return row;
  });
  if (!cancelled) throw conflict("ORDER_NOT_CANCELLABLE", "This order can't be cancelled any more.");
  let refundAmount = 0;
  if (cancelled.payment_method === "ONLINE" && ["PAID", "PARTIALLY_REFUNDED"].includes(cancelled.payment_status)) {
    try {
      refundAmount = (await refundPayment(cancelled.id, { reason: "Order cancelled", actor })).amount;
    } catch (error) {
      await orders.addEvent(db, cancelled.id, { kind: "REFUND", status: "FAILED", detail: "The refund could not be started automatically. FrameX will refund this order manually." });
    }
  }
  if (email) orders.notify(cancelled.id, "ORDER_CANCELLED", { extra: { reason, refundAmount } });
  return cancelled;
}

/** Unpaid online orders past their time: cancel them and give the stock back (unless the money did arrive). */
export async function expireUnpaidOrders() {
  const { rows } = await db.query("SELECT * FROM orders WHERE status = 'PENDING_PAYMENT' AND expires_at IS NOT NULL AND expires_at < now() ORDER BY expires_at LIMIT 50");
  let cancelled = 0;
  for (const order of rows) {
    try {
      await cancelOrder(order, { from: ["PENDING_PAYMENT"], reason: orders.EXPIRED_REASON, email: false });
      cancelled += 1;
    } catch (error) {
      if (error.code !== "ORDER_ALREADY_PAID" && error.code !== "ORDER_NOT_CANCELLABLE") console.error(`[payments] could not expire ${order.order_number}: ${error.message}`);
    }
  }
  return cancelled;
}

/* ---------------------------------------------------------------- Webhooks */

/**
 * A message from the gateway's servers. Verified with the webhook secret over
 * the exact bytes received, stored once by its event id, then applied.
 * A repeat of an event that was already applied changes nothing.
 */
export async function handleWebhook(providerName, rawBody, headers) {
  const gw = gatewayNamed(providerName);
  if (!gw) throw errors.notFound();
  if (!gw.webhookReady()) throw new HttpError(503, "WEBHOOK_NOT_CONFIGURED", "The webhook secret is not configured.");
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : "";
  if (!raw || !gw.verifyWebhookSignature(raw, headers)) {
    log(`rejected a ${providerName} webhook: bad signature`);
    throw new HttpError(400, "WEBHOOK_SIGNATURE_INVALID", "Signature check failed.");
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw errors.badRequest("The webhook body could not be read.");
  }
  const ev = gw.parseWebhook(body, headers, raw);
  const gp = ev.payment;
  // Only ids, status, amount and method are kept. No card, bank account, VPA, email or phone.
  const summary = { status: gp ? gp.status : null, amountMinor: gp ? gp.amountMinor : ev.refund ? ev.refund.amountMinor : null, currency: gp ? gp.currency : null, method: gp ? gp.method : null, refund: ev.refund ? { id: ev.refund.gatewayRefundId, status: ev.refund.status } : null };

  const id = newId();
  const stored = await db.query(
    "INSERT INTO payment_events (id, provider, event_id, event_type, gateway_order_id, gateway_payment_id, summary) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id",
    [id, gw.name, ev.eventId, ev.rawType, gp ? gp.gatewayOrderId : null, gp ? gp.gatewayPaymentId : ev.refund ? ev.refund.gatewayPaymentId : null, JSON.stringify(summary)]
  );
  let eventRow = id;
  if (!stored.rows[0]) {
    const earlier = (await db.query("SELECT id, processed_at, result FROM payment_events WHERE provider = $1 AND event_id = $2", [gw.name, ev.eventId])).rows[0];
    if (earlier.processed_at) return { duplicate: true, result: earlier.result };
    eventRow = earlier.id; // received before but not finished (the server stopped half way): do it now
  }

  let result = "IGNORED";
  let orderId = null;
  if (ev.type !== "ignored") {
    const paymentRef = gp ? gp.gatewayPaymentId : ev.refund ? ev.refund.gatewayPaymentId : null;
    const order =
      (gp && gp.gatewayOrderId && (await db.query("SELECT * FROM orders WHERE payment_gateway = $1 AND gateway_order_id = $2", [gw.name, gp.gatewayOrderId])).rows[0]) ||
      (paymentRef && (await db.query("SELECT o.* FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.provider = $1 AND p.gateway_payment_id = $2", [gw.name, paymentRef])).rows[0]) ||
      null;
    // Not an order's payment: it may be the advance or the balance of a custom painting.
    const painting = !order && gp ? await paintingWebhook(gw, ev) : null;
    if (painting) result = painting.result;
    else if (!order) result = "NO_MATCHING_ORDER";
    else {
      orderId = order.id;
      if (ev.type === "payment.captured") result = describeOutcome(await confirmPaid(order.id, gp, "webhook"));
      else if (ev.type === "payment.authorized") result = describeOutcome(await reconcile(order));
      else if (ev.type === "payment.failed") result = describeOutcome(await markAttemptFailed(order.id, { gatewayPaymentId: gp.gatewayPaymentId, code: gp.errorCode, reason: gp.errorDescription, method: gp.method }));
      else result = await refundNews(order, ev.refund);
    }
  }
  await db.query("UPDATE payment_events SET processed_at = now(), result = $2, order_id = $3 WHERE id = $1", [eventRow, result, orderId]);
  log(`${providerName} webhook ${ev.rawType}: ${result}`);
  return { ok: true, result };
}

const describeOutcome = (o) => (o.placed ? "ORDER_PLACED" : o.already ? "ALREADY_APPLIED" : o.changed ? "ATTEMPT_FAILED" : o.late ? "LATE_PAYMENT_REFUNDED" : o.duplicate ? "DUPLICATE_PAYMENT" : o.mismatch ? "MISMATCH_REJECTED" : o.open ? "STILL_OPEN" : "IGNORED");

/** refund.created / refund.processed / refund.failed (also for refunds made in the gateway's own dashboard). */
async function refundNews(order, news) {
  if (!news || !news.gatewayRefundId) return "IGNORED";
  let refund = (await db.query("SELECT * FROM refunds WHERE provider = $1 AND gateway_refund_id = $2", [order.payment_gateway, news.gatewayRefundId])).rows[0];
  if (!refund) {
    const pay = (await db.query("SELECT * FROM payments WHERE provider = $1 AND gateway_payment_id = $2", [order.payment_gateway, news.gatewayPaymentId])).rows[0];
    if (!pay) return "NO_MATCHING_PAYMENT";
    // Our own refund whose id hasn't been saved yet (the webhook was faster), or one made in the gateway's dashboard.
    refund = (await db.query("SELECT * FROM refunds WHERE payment_id = $1 AND gateway_refund_id IS NULL AND amount = $2 AND status = 'PENDING' ORDER BY created_at LIMIT 1", [pay.id, news.amount])).rows[0];
    if (refund) await db.query("UPDATE refunds SET gateway_refund_id = $2 WHERE id = $1", [refund.id, news.gatewayRefundId]);
    else {
      const id = newId();
      await db.query("INSERT INTO refunds (id, order_id, payment_id, provider, gateway_refund_id, amount, status, reason) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'Refunded from the payment gateway') ON CONFLICT DO NOTHING", [id, order.id, pay.id, pay.provider, news.gatewayRefundId, news.amount]);
      refund = (await db.query("SELECT * FROM refunds WHERE provider = $1 AND gateway_refund_id = $2", [pay.provider, news.gatewayRefundId])).rows[0];
    }
  }
  if (news.status === "PENDING") return "REFUND_PENDING";
  const applied = await applyRefund(refund.id, { gatewayRefundId: news.gatewayRefundId, status: news.status });
  if (applied.changed && news.status === "PROCESSED") orders.notify(order.id, "REFUND_COMPLETED", { ref: refund.id, extra: { amount: refund.amount } });
  return applied.changed ? `REFUND_${news.status}` : "ALREADY_APPLIED";
}

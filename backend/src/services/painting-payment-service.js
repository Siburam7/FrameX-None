/* ==========================================================================
   The two payments of a custom painting: the ADVANCE (before the artist
   starts) and the BALANCE (when the painting is finished).

   The same rule as for orders (payment-service.js): a stage becomes paid only
   in confirmPaid(), and confirmPaid() is only reached with a payment that the
   SERVER got from the gateway itself:
     - the gateway's list of payments for our gateway order, or
     - the gateway's answer about one payment (after checking the checkout
       signature, for a gateway that signs its checkout), or
     - a webhook whose signature was verified.
   What the browser says only makes the server go and ask the gateway.

   What can be paid, and when:
     ADVANCE  only while the request is ADVANCE_PAYMENT_PENDING (the artist accepted)
     BALANCE  only while the request is REMAINING_PAYMENT_PENDING (the artist finished)
   A request that was declined, or not answered yet, has nothing payable.
   The amount is the one stored with the request; nothing about money comes
   from the browser. Each stage can be paid exactly once (the database has a
   unique index for it), and a payment with another amount, currency or
   gateway order is refused.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { linkBase } from "../lib/context.js";
import { HttpError } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { gateway, gatewayNamed } from "../payments/index.js";
import { gatewayInTestMode } from "./analytics-service.js";
import { artistUserIds, notifyUser, notifyUsers } from "./notification-service.js";
import * as paintings from "./painting-service.js";

const MAX_ATTEMPTS = 8;
const INSTRUMENT = { upi: "UPI", card: "card", netbanking: "net banking", wallet: "wallet", emi: "EMI" };
const STAGE_OF = { ADVANCE_PAYMENT_PENDING: "ADVANCE", REMAINING_PAYMENT_PENDING: "BALANCE" };
const conflict = (code, message) => new HttpError(409, code, message);
const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const amountOf = (request, stage) => (stage === "ADVANCE" ? request.advance_amount : request.balance_amount);
const log = (message) => {
  if (!config.isTest) console.log(`[paintings] ${message}`);
};

/** What the browser needs to open the gateway's checkout. No secret is in here. */
function session(request, payment, stage) {
  const gw = gateway();
  return {
    ...gw.clientConfig(),
    requestNumber: request.request_number,
    stage,
    gatewayOrderId: payment.gateway_order_id,
    ...(payment.gateway_session ? { paymentSessionId: payment.gateway_session } : {}),
    amount: payment.amount * 100, // paise; fixed by the server
    currency: payment.currency,
    name: config.payments.brandName,
    description: `${stage === "ADVANCE" ? "Advance" : "Remaining payment"} for painting ${request.request_number}`,
    prefill: { name: request.customer_name, email: request.customer_email, contact: request.customer_phone || "" },
    method: payment.method_requested || null
  };
}

/** The gateway order already made for this stage with the current gateway (reused for every retry), if any. */
async function stageOrder(requestId, stage, provider, q = db) {
  return (await q.query("SELECT gateway_order_id, gateway_session FROM painting_payments WHERE request_id = $1 AND stage = $2 AND provider = $3 AND gateway_order_id IS NOT NULL ORDER BY attempt DESC LIMIT 1", [requestId, stage, provider])).rows[0] || null;
}

/* ---------------------------------------------------------------- The only way to "paid" */

/**
 * Record a payment the gateway reports as captured for one stage of a request.
 * `gp` is the gateway's own description of the payment (never browser input).
 * -> { paid } first time, { already } on any repeat, { mismatch } / { duplicate } / { late } otherwise.
 */
export async function confirmPaid(requestId, stage, gp, via) {
  const outcome = await db.tx(async (q) => {
    const request = (await q.query("SELECT * FROM painting_requests WHERE id = $1 FOR UPDATE", [requestId])).rows[0];
    if (!request) return { missing: true };
    const expected = amountOf(request, stage);
    const known = (await q.query("SELECT * FROM painting_payments WHERE request_id = $1 AND stage = $2 AND gateway_order_id = $3 ORDER BY attempt DESC", [request.id, stage, gp.gatewayOrderId || ""])).rows;

    // The amount is the one the server asked for, in the same currency, on a gateway order the server made for this stage.
    if (gp.amountMinor !== expected * 100 || gp.currency !== request.currency || !known.length) {
      await paintings.addEvent(q, request.id, { detail: "A payment with a different amount or reference was reported by the gateway and was not accepted." });
      return { mismatch: true };
    }
    const paid = (await q.query("SELECT * FROM painting_payments WHERE request_id = $1 AND stage = $2 AND status = 'PAID'", [request.id, stage])).rows[0];
    if (paid) return paid.gateway_payment_id === gp.gatewayPaymentId ? { already: true } : { duplicate: true };
    // A payment id belongs to one attempt only, ever.
    const elsewhere = (await q.query("SELECT request_id, stage FROM painting_payments WHERE provider = $1 AND gateway_payment_id = $2", [known[0].provider, gp.gatewayPaymentId])).rows[0];
    if (elsewhere && (elsewhere.request_id !== request.id || elsewhere.stage !== stage)) return { mismatch: true };

    const attempt = known.find((p) => p.gateway_payment_id === gp.gatewayPaymentId) || known.find((p) => p.status === "PENDING") || known[0];
    await q.query("UPDATE painting_payments SET status = 'PAID', gateway_payment_id = $2, instrument = $3, verified_via = $4, paid_at = now(), failure_code = NULL, failure_reason = NULL, updated_at = now() WHERE id = $1", [attempt.id, gp.gatewayPaymentId, gp.method, via]);
    await q.query("UPDATE painting_payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Not completed'), updated_at = now() WHERE request_id = $1 AND stage = $2 AND status = 'PENDING'", [request.id, stage]);
    const how = `${stage === "ADVANCE" ? "Advance" : "Remaining payment"} of ${rupees(expected)} paid by ${INSTRUMENT[gp.method] || "online payment"}.`;
    const money = { amount_paid: request.amount_paid + expected, payment_status: stage === "ADVANCE" ? "ADVANCE_PAID" : "FULLY_PAID" };
    await audit(q, { action: ACTIONS.PAINTING_PAYMENT_VERIFIED, targetType: "painting_request", targetId: request.request_number, metadata: { stage, amount: expected, via, gatewayPaymentId: gp.gatewayPaymentId } });

    const waitingFor = stage === "ADVANCE" ? "ADVANCE_PAYMENT_PENDING" : "REMAINING_PAYMENT_PENDING";
    if (request.status !== waitingFor) {
      // The money arrived after the request was closed (cancelled meanwhile). It is recorded and waits for a refund.
      await q.query("UPDATE painting_requests SET amount_paid = $2, payment_status = $3, refund_status = 'REFUND_PENDING', updated_at = now() WHERE id = $1", [request.id, money.amount_paid, money.payment_status]);
      await paintings.addEvent(q, request.id, { detail: `${how} It arrived after the request was closed and is waiting for a refund.` });
      return { late: true, request };
    }
    const moved = await paintings.move(q, request, stage === "ADVANCE" ? "ADVANCE_PAID" : "READY_FOR_DISPATCH", { detail: how, set: money, verifiedPayment: true });
    return { paid: true, request: moved };
  });

  if (outcome.paid) {
    const r = outcome.request;
    log(`${r.request_number} ${stage} paid (${via})`);
    const customerLink = `painting.html?id=${r.request_number}`;
    const artistLink = `artist-dashboard.html#/requests/${r.request_number}`;
    if (stage === "ADVANCE") {
      await notifyUser(r.user_id, { kind: "PAINTING_ADVANCE_PAID", ref: r.request_number, title: "Advance payment received", body: "Advance payment received. The artist can now start your painting.", link: customerLink, email: true, button: "View your painting" });
      await notifyUsers(await artistUserIds(r.artist_id), { kind: "PAINTING_ADVANCE_PAID", ref: r.request_number, title: `Advance paid for ${r.request_number}`, body: "Advance Paid — Painting Can Start. The customer has paid the advance.", link: artistLink, email: true, button: "Open the request" });
    } else {
      await notifyUser(r.user_id, { kind: "PAINTING_FULLY_PAID", ref: r.request_number, title: "Remaining payment received", body: "Your painting is fully paid. The artist will dispatch it now.", link: customerLink, email: true, button: "View your painting" });
      await notifyUsers(await artistUserIds(r.artist_id), { kind: "PAINTING_FULLY_PAID", ref: r.request_number, title: `${r.request_number} is fully paid`, body: "The remaining payment was received. The painting is ready to dispatch.", link: artistLink, email: true, button: "Open the request" });
    }
  }
  if (outcome.duplicate || outcome.late) console.error(`[paintings] request ${requestId} ${stage}: a payment ${gp.gatewayPaymentId} needs a manual refund (${outcome.duplicate ? "the stage was already paid" : "the request was closed"}).`);
  return outcome;
}

/** Record that an attempt did not succeed. Never touches a stage that is paid. */
async function markFailed(request, stage, { gatewayPaymentId = null, code = null, reason = null, method = null, cancelled = false }) {
  const status = cancelled ? "CANCELLED" : "FAILED";
  const outcome = await db.tx(async (q) => {
    const fresh = (await q.query("SELECT * FROM painting_requests WHERE id = $1 FOR UPDATE", [request.id])).rows[0];
    if (!fresh || STAGE_OF[fresh.status] !== stage) return { ignored: true };
    if (gatewayPaymentId && (await q.query("SELECT 1 FROM painting_payments WHERE request_id = $1 AND gateway_payment_id = $2", [fresh.id, gatewayPaymentId])).rows[0]) return { already: true };
    const attempt = (await q.query("SELECT * FROM painting_payments WHERE request_id = $1 AND stage = $2 AND status = 'PENDING' ORDER BY attempt DESC LIMIT 1", [fresh.id, stage])).rows[0];
    if (!attempt) return { already: true };
    await q.query("UPDATE painting_payments SET status = $2, gateway_payment_id = $3, failure_code = $4, failure_reason = $5, instrument = coalesce($6, instrument), updated_at = now() WHERE id = $1", [attempt.id, status, gatewayPaymentId, code, reason, method]);
    await paintings.addEvent(q, fresh.id, { detail: reason || (cancelled ? "The payment window was closed before paying." : "The payment failed."), actor: { id: fresh.user_id, role: "CUSTOMER" } });
    return { changed: true };
  });
  if (outcome.changed && !cancelled) await notifyUser(request.user_id, { kind: "PAINTING_PAYMENT_FAILED", ref: `${request.request_number}:${stage}:${gatewayPaymentId || Date.now()}`, title: "Payment failed", body: "The payment for your painting didn't go through. Nothing was charged: you can try again.", link: `painting.html?id=${request.request_number}` });
  return outcome;
}

/* ---------------------------------------------------------------- Asking the gateway */

/**
 * Ask the gateway what really happened with the stage that is waiting to be
 * paid, and bring the request in line. -> { paid } | { already } | { open, payments } | { unknown }
 */
export async function reconcile(request) {
  const stage = STAGE_OF[request.status];
  if (!stage) return { open: true, payments: [] };
  const rows = (await db.query("SELECT DISTINCT provider, gateway_order_id FROM painting_payments WHERE request_id = $1 AND stage = $2 AND gateway_order_id IS NOT NULL", [request.id, stage])).rows;
  const seen = [];
  for (const row of rows) {
    const gw = gatewayNamed(row.provider);
    if (!gw) return { unknown: true };
    let list;
    try {
      list = await gw.listOrderPayments(row.gateway_order_id);
    } catch {
      return { unknown: true };
    }
    const captured = list.find((p) => p.status === "captured");
    if (captured) return confirmPaid(request.id, stage, { ...captured, gatewayOrderId: row.gateway_order_id }, "reconcile");
    seen.push(...list);
  }
  return { open: true, payments: seen };
}

/* ---------------------------------------------------------------- From the customer's browser */

/**
 * "Pay the advance" / "Pay the remaining amount": open a payment attempt for
 * the stage that is waiting. One gateway order per stage, reused for every
 * retry, so the stage can't be paid twice.
 */
export async function startPayment(userId, number, method = null) {
  let request = await paintings.ownRequestRow(userId, number);
  const state = await reconcile(request);
  if (state.paid || state.already) return { request: await paintings.getOwnRequest(userId, number), payment: null };
  request = await paintings.ownRequestRow(userId, number);
  const stage = STAGE_OF[request.status];
  if (!stage) {
    if (request.status === "PENDING_ARTIST_RESPONSE") throw conflict("PAINTING_NOT_PAYABLE", "The artist hasn't accepted this request yet. Nothing is payable until they do.");
    if (request.status === "DECLINED") throw conflict("PAINTING_NOT_PAYABLE", "The artist declined this request. Nothing is payable.");
    throw conflict("PAINTING_NOT_PAYABLE", "There is nothing to pay for this request right now.");
  }
  const gw = gateway();
  const amount = amountOf(request, stage);
  let existing = await stageOrder(request.id, stage, gw.name);
  let made = null;
  let replaced = false; // the gateway closed the earlier order unpaid: a new one takes its place
  try {
    if (existing && gw.orderState && (await gw.orderState(existing.gateway_order_id)) === "EXPIRED") {
      existing = null;
      replaced = true;
    }
    if (!existing) {
      const address = request.shipping_address || {};
      made = await gw.createOrder({
        amount,
        currency: request.currency,
        receipt: `${request.request_number}-${stage === "ADVANCE" ? "ADV" : "BAL"}`,
        notes: { painting_request: request.request_number, stage },
        customer: { id: request.user_id, name: request.customer_name, email: request.customer_email, phone: request.customer_phone || address.phone || "" },
        returnUrl: `${linkBase()}/painting.html?id=${encodeURIComponent(request.request_number)}`,
        expiresAt: new Date(Date.now() + config.payments.pendingMinutes * 60_000)
      });
      if (made.amountMinor !== amount * 100) throw new Error("the gateway answered with a different amount");
    }
  } catch (error) {
    console.error(`[paintings] could not create the ${gw.name} order for ${request.request_number} ${stage}: ${error.message}`);
    if (error.code === "PHONE_REQUIRED") throw new HttpError(422, "PHONE_REQUIRED", "A 10-digit phone number is needed to pay online. Please contact FrameX to add it to this request.");
    throw new HttpError(502, "PAYMENT_GATEWAY_ERROR", "We couldn't reach the payment gateway. Nothing was charged: please try again.");
  }
  const payment = await db.tx(async (q) => {
    const fresh = (await q.query("SELECT * FROM painting_requests WHERE id = $1 FOR UPDATE", [request.id])).rows[0];
    if (!fresh || STAGE_OF[fresh.status] !== stage) throw conflict("PAINTING_NOT_PAYABLE", "There is nothing to pay for this request right now.");
    // Two requests at once: the first gateway order wins, the other is simply never paid.
    const mine = made ? { gateway_order_id: made.gatewayOrderId, gateway_session: made.session || null } : null;
    const winner = !made ? existing : replaced ? mine : (await stageOrder(fresh.id, stage, gw.name, q)) || mine;
    const count = (await q.query("SELECT coalesce(max(attempt), 0)::int AS n FROM painting_payments WHERE request_id = $1 AND stage = $2", [fresh.id, stage])).rows[0].n;
    if (count >= MAX_ATTEMPTS) throw conflict("TOO_MANY_ATTEMPTS", "This payment has been tried too many times. Please contact FrameX.");
    await q.query("UPDATE painting_payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Not completed'), updated_at = now() WHERE request_id = $1 AND stage = $2 AND status = 'PENDING'", [fresh.id, stage]);
    const id = newId();
    await q.query(
      "INSERT INTO painting_payments (id, request_id, stage, attempt, provider, status, amount, currency, gateway_order_id, gateway_session) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9)",
      [id, fresh.id, stage, count + 1, gw.name, amount, fresh.currency, winner.gateway_order_id, winner.gateway_session]
    );
    // A payment through a gateway in TEST mode is not real money: the reports keep this painting out of sales.
    if (gatewayInTestMode()) await q.query("UPDATE painting_requests SET is_test = true WHERE id = $1 AND is_test IS DISTINCT FROM true", [fresh.id]);
    return { ...(await q.query("SELECT * FROM painting_payments WHERE id = $1", [id])).rows[0], method_requested: method };
  });
  return { request: await paintings.getOwnRequest(userId, number), payment: session(request, payment, stage) };
}

/**
 * A gateway whose checkout signs its result (Razorpay) handed the browser a
 * payment id and a signature: check the signature, then ask the gateway.
 */
export async function verifyCheckout(userId, number, { gatewayOrderId, gatewayPaymentId, signature }) {
  const request = await paintings.ownRequestRow(userId, number);
  const stage = STAGE_OF[request.status];
  const row = stage && (await db.query("SELECT * FROM painting_payments WHERE request_id = $1 AND stage = $2 AND gateway_order_id = $3 ORDER BY attempt DESC LIMIT 1", [request.id, stage, gatewayOrderId])).rows[0];
  const invalid = () => new HttpError(400, "PAYMENT_NOT_VERIFIED", "We couldn't verify this payment. If money left your account, it will show on this request shortly or be returned by your bank.");
  if (!row) throw invalid();
  const gw = gatewayNamed(row.provider);
  if (!gw) throw new HttpError(503, "PAYMENT_NOT_CONFIGURED", "Online payment is not available right now.");
  if (gw.signedCheckout === false) return reportOutcome(userId, number, { reason: "returned" });
  if (!gw.verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature })) throw invalid();
  let gp;
  try {
    gp = await gw.fetchPayment(gatewayPaymentId, { gatewayOrderId });
    if (gp.status === "authorized") gp = await gw.capture(gatewayPaymentId, row.amount, row.currency, { gatewayOrderId });
  } catch {
    throw new HttpError(502, "PAYMENT_CHECK_PENDING", "We're still confirming your payment with the bank. This page will update: please don't pay again.");
  }
  if (gp.gatewayOrderId !== gatewayOrderId) throw invalid();
  if (gp.status === "captured") await confirmPaid(request.id, stage, gp, "checkout");
  else if (gp.status === "failed") await markFailed(request, stage, { gatewayPaymentId, code: gp.errorCode, reason: gp.errorDescription, method: gp.method });
  return paintings.getOwnRequest(userId, number);
}

/**
 * The browser says the window was closed, the payment failed, or the customer
 * came back from it. Only a hint: the gateway is asked what happened.
 */
export async function reportOutcome(userId, number, { reason, gatewayPaymentId = null }) {
  const request = await paintings.ownRequestRow(userId, number);
  const stage = STAGE_OF[request.status];
  if (!stage) return paintings.getOwnRequest(userId, number);
  const state = await reconcile(request);
  if (!state.paid && !state.already && !state.unknown) {
    const failed = (state.payments || []).filter((p) => p.status === "failed");
    const seen = failed.find((p) => p.gatewayPaymentId === gatewayPaymentId) || failed[failed.length - 1];
    const waiting = (state.payments || []).some((p) => p.status === "created" && p.rawStatus === "PENDING");
    if (seen && !waiting) await markFailed(request, stage, { gatewayPaymentId: seen.gatewayPaymentId, code: seen.errorCode, reason: seen.errorDescription, method: seen.method, cancelled: seen.errorCode === "USER_DROPPED" });
    else if (reason !== "returned" && !waiting) await markFailed(request, stage, { cancelled: reason !== "failed", reason: reason === "failed" ? "The payment could not be completed." : null });
  }
  return paintings.getOwnRequest(userId, number);
}

/** The request page of a painting that is waiting for a payment asks: did it arrive? */
export async function refresh(userId, number) {
  const request = await paintings.ownRequestRow(userId, number);
  if (STAGE_OF[request.status]) await reconcile(request);
  return paintings.getOwnRequest(userId, number);
}

/* ---------------------------------------------------------------- Webhooks */

/**
 * A verified webhook about a payment that belongs to no order: is it one of
 * ours? -> a result word for the webhook log, or null when it isn't a
 * painting payment. (Called by payment-service.handleWebhook.)
 */
export async function webhookPayment(gw, ev) {
  const gp = ev.payment;
  if (!gp || !gp.gatewayOrderId) return null;
  const row = (await db.query("SELECT request_id, stage FROM painting_payments WHERE provider = $1 AND gateway_order_id = $2 LIMIT 1", [gw.name, gp.gatewayOrderId])).rows[0];
  if (!row) return null;
  const request = (await db.query("SELECT * FROM painting_requests WHERE id = $1", [row.request_id])).rows[0];
  if (ev.type === "payment.captured") {
    const o = await confirmPaid(row.request_id, row.stage, gp, "webhook");
    return { result: o.paid ? "PAINTING_STAGE_PAID" : o.already ? "ALREADY_APPLIED" : o.mismatch ? "MISMATCH_REJECTED" : o.duplicate ? "DUPLICATE_PAYMENT" : o.late ? "LATE_PAYMENT_NEEDS_REFUND" : "IGNORED", requestId: row.request_id };
  }
  if (ev.type === "payment.failed") {
    const o = await markFailed(request, row.stage, { gatewayPaymentId: gp.gatewayPaymentId, code: gp.errorCode, reason: gp.errorDescription, method: gp.method, cancelled: gp.errorCode === "USER_DROPPED" });
    return { result: o.changed ? "ATTEMPT_FAILED" : o.already ? "ALREADY_APPLIED" : "IGNORED", requestId: row.request_id };
  }
  return { result: "IGNORED", requestId: row.request_id };
}

/* ---------------------------------------------------------------- Timer */

/** Accepted requests whose advance never came are closed after CUSTOM_PAINTING_ADVANCE_DAYS (unless the money did arrive). */
export async function expireUnpaidAdvances() {
  const { rows } = await db.query(`SELECT * FROM painting_requests WHERE status = 'ADVANCE_PAYMENT_PENDING' AND responded_at < now() - ($1 || ' days')::interval ORDER BY responded_at LIMIT 50`, [String(config.paintings.advanceDays)]);
  let closed = 0;
  for (const request of rows) {
    try {
      const state = await reconcile(request);
      if (state.paid || state.already || state.unknown) continue;
      await db.tx(async (q) => {
        const fresh = (await q.query("SELECT * FROM painting_requests WHERE id = $1 FOR UPDATE", [request.id])).rows[0];
        if (fresh.status !== "ADVANCE_PAYMENT_PENDING") return;
        await paintings.move(q, fresh, "CANCELLED", { detail: "The advance was not paid in time.", set: { cancel_reason: "The advance was not paid in time.", cancelled_at: new Date() } });
        await q.query("UPDATE painting_payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Request closed'), updated_at = now() WHERE request_id = $1 AND status = 'PENDING'", [fresh.id]);
        closed += 1;
      });
      await notifyUser(request.user_id, { kind: "PAINTING_CANCELLED", ref: request.request_number, title: `Painting request ${request.request_number} was closed`, body: "The advance was not paid in time, so this request was closed. You can send a new request to the artist.", link: `painting.html?id=${request.request_number}` });
      await notifyUsers(await artistUserIds(request.artist_id), { kind: "PAINTING_CANCELLED", ref: request.request_number, title: `Request ${request.request_number} was closed`, body: "The customer did not pay the advance in time.", link: `artist-dashboard.html#/requests/${request.request_number}` });
    } catch (error) {
      console.error(`[paintings] could not close ${request.request_number}: ${error.message}`);
    }
  }
  return closed;
}

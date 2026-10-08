/* ==========================================================================
   Cashfree Payments: orders, payments, refunds and webhooks.

   Everything specific to Cashfree lives in this file. The rest of the backend
   talks to the interface described in payments/index.js.

   How Cashfree works, as far as FrameX uses it:
     1. The server creates a Cashfree order for an amount (POST /orders) and
        gets a "payment session id" back.
     2. The browser opens Cashfree's own checkout with that session id
        (Cashfree's JavaScript SDK). Card numbers, UPI ids and bank logins are
        typed into Cashfree's window, never into a FrameX page.
     3. The server asks Cashfree what happened (GET /orders/{id}/payments) and
        also receives signed webhooks. Cashfree's checkout hands the browser
        no signature, so nothing the browser reports is ever taken as proof.

   Amounts: FrameX keeps whole rupees; Cashfree takes rupees with decimals.
   This file reports both rupees (`amount`) and paise (`amountMinor`) so the
   callers can compare exact integers.
   The client secret and the webhook secret are used only here, on the server.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";

const c = () => config.payments.cashfree;
const toMinor = (rupees) => Math.round(Number(rupees) * 100);
const fromMinor = (paise) => Number(paise) / 100;

class GatewayError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
  }
}

async function call(method, path, body, { idempotencyKey = "" } = {}) {
  let response;
  try {
    response = await fetch(c().apiBase + path, {
      method,
      headers: {
        "x-client-id": c().clientId,
        "x-client-secret": c().clientSecret,
        "x-api-version": c().apiVersion,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new GatewayError(error.name === "TimeoutError" ? "Cashfree did not answer in time." : "Cashfree could not be reached.", { code: "UNREACHABLE" });
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON answer */
  }
  if (!response.ok) {
    // Cashfree's own description, e.g. "authentication Failed". Never the request body.
    throw new GatewayError((data && data.message) || `Cashfree answered ${response.status}.`, { status: response.status, code: (data && data.code) || "" });
  }
  return data === null ? {} : data;
}

function sameSignature(expected, given) {
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(String(given || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const METHOD = { upi: "upi", credit_card: "card", debit_card: "card", prepaid_card: "card", card: "card", net_banking: "netbanking", wallet: "wallet", credit_card_emi: "emi", debit_card_emi: "emi", cardless_emi: "emi", pay_later: "wallet" };
// SUCCESS is the only state that means money was taken. PENDING / NOT_ATTEMPTED may still become either.
const STATUS = { SUCCESS: "captured", FAILED: "failed", CANCELLED: "failed", VOID: "failed", USER_DROPPED: "failed" };

/** Cashfree's payment -> the few fields FrameX uses. Card, bank and contact details are dropped here. */
function payment(p, orderId = null) {
  const err = p.error_details || {};
  return {
    gatewayPaymentId: String(p.cf_payment_id),
    gatewayOrderId: p.order_id || orderId || null,
    status: STATUS[p.payment_status] || "created",
    rawStatus: p.payment_status || "",
    amountMinor: toMinor(p.payment_amount || 0),
    amount: Number(p.payment_amount) || 0,
    currency: p.payment_currency || "INR",
    method: METHOD[p.payment_group] || p.payment_group || null,
    amountRefundedMinor: 0,
    errorCode: err.error_code || (p.payment_status === "USER_DROPPED" ? "USER_DROPPED" : null),
    errorDescription: err.error_description || (p.payment_status === "USER_DROPPED" ? "The payment window was closed before paying." : p.payment_status === "FAILED" ? p.payment_message || null : null)
  };
}

function refund(f) {
  return {
    gatewayRefundId: String(f.refund_id || f.cf_refund_id),
    gatewayPaymentId: f.cf_payment_id ? String(f.cf_payment_id) : null,
    amountMinor: toMinor(f.refund_amount || 0),
    amount: Number(f.refund_amount) || 0,
    status: f.refund_status === "SUCCESS" ? "PROCESSED" : f.refund_status === "CANCELLED" ? "FAILED" : "PENDING"
  };
}

/** A phone number the way Cashfree wants it: the 10 digits of an Indian mobile. */
const phone10 = (value) => String(value || "").replace(/\D/g, "").slice(-10);
/** Letters, digits, "_" and "-" only, 3 to 50 characters. */
const safeRef = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50);

export const cashfree = {
  name: "cashfree",
  label: "Cashfree Payments",
  // Cashfree's checkout hands the browser no signature: the server always asks Cashfree itself.
  signedCheckout: false,
  // The ways to pay that Cashfree's checkout offers.
  methods: [
    { id: "upi", label: "UPI", hint: "Any UPI app, UPI ID or QR code" },
    { id: "card", label: "Credit / Debit Card", hint: "Visa, Mastercard, RuPay and more" },
    { id: "netbanking", label: "Net Banking", hint: "All major banks" },
    { id: "wallet", label: "Wallets & other methods", hint: "Wallets, EMI and pay later, where available" }
  ],

  /** What the browser needs to open the checkout. No key is in here: the payment session id is added per order. */
  clientConfig: () => ({ provider: "cashfree", mode: config.payments.mode }),

  /**
   * Create Cashfree's order for an amount in rupees.
   * receipt becomes Cashfree's order id (ours to choose), made unique with a short random tail
   * so a development database that starts its numbers again never collides with an old order.
   */
  async createOrder({ amount, currency = "INR", receipt, notes = {}, customer = {}, returnUrl = "", expiresAt = null }) {
    const orderId = safeRef(`${receipt}-${crypto.randomBytes(4).toString("hex")}`);
    const mobile = phone10(customer.phone);
    if (mobile.length !== 10) throw new GatewayError("A 10-digit phone number is needed to pay online.", { code: "PHONE_REQUIRED" });
    // Cashfree keeps an order open for at least 16 minutes; ours follow the order's own waiting time.
    const expiry = expiresAt ? new Date(Math.max(new Date(expiresAt).getTime(), Date.now() + 17 * 60_000)) : null;
    const o = await call(
      "POST",
      "/orders",
      {
        order_id: orderId,
        order_amount: Number(amount),
        order_currency: currency,
        customer_details: { customer_id: safeRef(customer.id || "customer").padEnd(3, "0"), customer_phone: mobile, ...(customer.email ? { customer_email: customer.email } : {}), ...(customer.name ? { customer_name: String(customer.name).slice(0, 100) } : {}) },
        order_meta: { ...(returnUrl ? { return_url: returnUrl } : {}), ...(config.publicApiUrl ? { notify_url: `${config.publicApiUrl}/api/payments/webhook/cashfree` } : {}) },
        ...(expiry ? { order_expiry_time: expiry.toISOString() } : {}),
        order_note: String(receipt).slice(0, 200),
        order_tags: Object.fromEntries(Object.entries(notes).map(([k, v]) => [String(k).slice(0, 30), String(v).slice(0, 250)]))
      },
      { idempotencyKey: orderId }
    );
    if (!o.order_id || !o.payment_session_id) throw new GatewayError("Cashfree did not return a payment session.");
    return { gatewayOrderId: o.order_id, amountMinor: toMinor(o.order_amount), currency: o.order_currency || currency, session: o.payment_session_id };
  },

  /** "ACTIVE" (can still be paid), "PAID", or "EXPIRED" (Cashfree closed it; a new one is needed for another try). */
  async orderState(gatewayOrderId) {
    const o = await call("GET", `/orders/${encodeURIComponent(gatewayOrderId)}`);
    if (o.order_status === "PAID") return "PAID";
    return o.order_status === "ACTIVE" ? "ACTIVE" : "EXPIRED";
  },

  async fetchPayment(gatewayPaymentId, { gatewayOrderId } = {}) {
    return payment(await call("GET", `/orders/${encodeURIComponent(gatewayOrderId)}/payments/${encodeURIComponent(gatewayPaymentId)}`), gatewayOrderId);
  },

  /** Every payment attempt Cashfree has seen for one of its orders. */
  async listOrderPayments(gatewayOrderId) {
    const data = await call("GET", `/orders/${encodeURIComponent(gatewayOrderId)}/payments`);
    return (Array.isArray(data) ? data : []).map((p) => payment(p, gatewayOrderId));
  },

  /** Cashfree captures a successful payment by itself: there is nothing to do. */
  capture: async (gatewayPaymentId, amount, currency, { gatewayOrderId } = {}) => cashfree.fetchPayment(gatewayPaymentId, { gatewayOrderId }),

  /** refundRef: our own id for this refund (Cashfree answers a repeat of the same id with the same refund). */
  async refund({ gatewayOrderId, gatewayPaymentId, amount, refundRef, notes = {} }) {
    const f = await call("POST", `/orders/${encodeURIComponent(gatewayOrderId)}/refunds`, {
      refund_amount: Number(amount),
      refund_id: safeRef(String(refundRef || crypto.randomUUID()).replace(/-/g, "")).slice(0, 40),
      refund_note: String(notes.order_number || notes.reference || "Refund").slice(0, 100),
      refund_speed: "STANDARD"
    });
    return { ...refund(f), gatewayPaymentId: gatewayPaymentId || refund(f).gatewayPaymentId };
  },

  /**
   * Webhooks: Cashfree signs "timestamp + exact body" with HMAC-SHA256 and sends it base64-encoded.
   * The key is the API secret, unless a separate webhook secret was configured.
   */
  webhookReady: () => Boolean(c().webhookSecret || c().clientSecret),
  verifyWebhookSignature(rawBody, headers) {
    const secret = c().webhookSecret || c().clientSecret;
    const timestamp = String(headers["x-webhook-timestamp"] || "");
    const given = headers["x-webhook-signature"];
    if (!secret || !timestamp || !given) return false;
    const expected = crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
    return sameSignature(expected, given);
  },

  /**
   * A verified webhook -> { eventId, rawType, type, payment?, refund? }.
   * type: payment.captured | payment.failed | refund.created | refund.processed | refund.failed | ignored
   */
  parseWebhook(body, headers, rawBody) {
    const rawType = String(body.type || "");
    const data = body.data || {};
    const order = data.order || {};
    const p = data.payment && data.payment.cf_payment_id ? payment({ ...data.payment, error_details: data.error_details || data.payment.error_details }, order.order_id || null) : null;
    const f = data.refund && (data.refund.refund_id || data.refund.cf_refund_id) ? refund(data.refund) : null;
    let type = "ignored";
    if (rawType === "PAYMENT_SUCCESS_WEBHOOK" && p && p.status === "captured") type = "payment.captured";
    else if ((rawType === "PAYMENT_FAILED_WEBHOOK" || rawType === "PAYMENT_USER_DROPPED_WEBHOOK") && p) type = "payment.failed";
    else if (rawType === "REFUND_STATUS_WEBHOOK" && f) type = f.status === "PROCESSED" ? "refund.processed" : f.status === "FAILED" ? "refund.failed" : "refund.created";
    if (type === "payment.failed" && p) p.status = "failed";
    return {
      // The same event sent again has the same body: its hash is the event's identity.
      eventId: crypto.createHash("sha256").update(rawBody).digest("hex"),
      rawType,
      type,
      payment: p,
      refund: f && data.refund.order_id ? { ...f, gatewayOrderId: data.refund.order_id } : f
    };
  },

  /** Check the credentials without taking any money: ask for an order that does not exist. */
  async check() {
    try {
      await call("GET", "/orders/framex-credential-check");
      return { ok: true, detail: `Cashfree accepted the credentials (${config.payments.mode} mode).` };
    } catch (error) {
      // 404 "order not found" means the credentials were accepted; 401 means they were not.
      if (error.status === 404) return { ok: true, detail: `Cashfree accepted the credentials (${config.payments.mode} mode).` };
      return { ok: false, detail: error.status === 401 || error.status === 403 ? "Cashfree rejected CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET." : error.message };
    }
  }
};

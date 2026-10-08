/* ==========================================================================
   Razorpay: orders, payments, refunds and webhooks.

   Everything specific to Razorpay lives in this file. The rest of the backend
   talks to the interface described in payments/index.js, so another gateway
   is one more file like this one.

   Amounts: FrameX keeps whole rupees; Razorpay works in paise. This file
   converts at the boundary and reports both (`amount` rupees, `amountMinor` paise).
   The key secret and the webhook secret are used only here, on the server.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";

const r = () => config.payments.razorpay;
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

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(r().apiBase + path, {
      method,
      headers: {
        Authorization: "Basic " + Buffer.from(`${r().keyId}:${r().keySecret}`).toString("base64"),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new GatewayError(error.name === "TimeoutError" ? "Razorpay did not answer in time." : "Razorpay could not be reached.", { code: "UNREACHABLE" });
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON answer */
  }
  if (!response.ok) {
    const e = (data && data.error) || {};
    // Razorpay's own description, e.g. "Authentication failed" for a wrong key. Never the request body.
    throw new GatewayError(e.description || `Razorpay answered ${response.status}.`, { status: response.status, code: e.code || "" });
  }
  return data || {};
}

const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");
function sameSignature(expected, given) {
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(String(given || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Razorpay's payment -> the few fields FrameX uses. Card, bank and contact details are dropped here. */
function payment(p) {
  return {
    gatewayPaymentId: p.id,
    gatewayOrderId: p.order_id || null,
    status: p.status, // created | authorized | captured | refunded | failed
    amountMinor: Number(p.amount) || 0,
    amount: fromMinor(p.amount || 0),
    currency: p.currency || "INR",
    method: p.method || null, // card | upi | netbanking | wallet | emi
    amountRefundedMinor: Number(p.amount_refunded) || 0,
    errorCode: p.error_code || null,
    errorDescription: p.error_description || null
  };
}

function refund(f) {
  return {
    gatewayRefundId: f.id,
    gatewayPaymentId: f.payment_id || null,
    amountMinor: Number(f.amount) || 0,
    amount: fromMinor(f.amount || 0),
    status: f.status === "processed" ? "PROCESSED" : f.status === "failed" ? "FAILED" : "PENDING"
  };
}

export const razorpay = {
  name: "razorpay",
  label: "Razorpay",
  // The ways to pay that Razorpay's checkout offers; the customer's pick opens that tab first.
  methods: [
    { id: "upi", label: "UPI", hint: "Any UPI app, UPI ID or QR code" },
    { id: "card", label: "Credit / Debit Card", hint: "Visa, Mastercard, RuPay and more" },
    { id: "netbanking", label: "Net Banking", hint: "All major banks" },
    { id: "wallet", label: "Wallets & other methods", hint: "Wallets, EMI and pay later, where available" }
  ],

  /** What the browser needs to open the checkout. The key id is public by design; the secret is not here. */
  clientConfig: () => ({ provider: "razorpay", keyId: r().keyId, mode: config.payments.mode }),

  /** Create the gateway's order for an amount in rupees. */
  async createOrder({ amount, currency = "INR", receipt, notes = {} }) {
    const o = await call("POST", "/v1/orders", { amount: toMinor(amount), currency, receipt: String(receipt).slice(0, 40), notes });
    if (!o.id) throw new GatewayError("Razorpay did not return an order id.");
    return { gatewayOrderId: o.id, amountMinor: Number(o.amount), currency: o.currency || currency };
  },

  /** The signature Razorpay's checkout hands to the browser: HMAC(order_id|payment_id, key secret). */
  verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature }) {
    if (!gatewayOrderId || !gatewayPaymentId || !signature) return false;
    return sameSignature(hmac(r().keySecret, `${gatewayOrderId}|${gatewayPaymentId}`), signature);
  },

  fetchPayment: async (gatewayPaymentId) => payment(await call("GET", `/v1/payments/${encodeURIComponent(gatewayPaymentId)}`)),

  /** Every payment attempt Razorpay has seen for one of its orders. */
  async listOrderPayments(gatewayOrderId) {
    const data = await call("GET", `/v1/orders/${encodeURIComponent(gatewayOrderId)}/payments`);
    return (data.items || []).map(payment);
  },

  /** Take the money of an authorised payment (accounts without automatic capture). */
  capture: async (gatewayPaymentId, amount, currency = "INR") => payment(await call("POST", `/v1/payments/${encodeURIComponent(gatewayPaymentId)}/capture`, { amount: toMinor(amount), currency })),

  async refund({ gatewayPaymentId, amount, notes = {} }) {
    return refund(await call("POST", `/v1/payments/${encodeURIComponent(gatewayPaymentId)}/refund`, { amount: toMinor(amount), speed: "normal", notes }));
  },

  /** Webhooks are signed with the webhook secret over the exact bytes received. */
  webhookReady: () => Boolean(r().webhookSecret),
  verifyWebhookSignature(rawBody, headers) {
    if (!r().webhookSecret) return false;
    return sameSignature(hmac(r().webhookSecret, rawBody), headers["x-razorpay-signature"]);
  },

  /**
   * A verified webhook -> { eventId, type, payment?, refund? }.
   * type: payment.captured | payment.authorized | payment.failed |
   *       refund.created | refund.processed | refund.failed | ignored
   */
  parseWebhook(body, headers, rawBody) {
    const type = String(body.event || "");
    const p = body.payload && body.payload.payment && body.payload.payment.entity;
    const f = body.payload && body.payload.refund && body.payload.refund.entity;
    const known = ["payment.captured", "payment.authorized", "payment.failed", "refund.created", "refund.processed", "refund.failed"];
    return {
      // Razorpay repeats a delivery with the same event id.
      eventId: String(headers["x-razorpay-event-id"] || crypto.createHash("sha256").update(rawBody).digest("hex")),
      rawType: type,
      type: type === "order.paid" ? "payment.captured" : known.includes(type) ? type : "ignored",
      payment: p ? payment(p) : null,
      refund: f ? refund(f) : null
    };
  },

  /** Check the credentials without creating anything. */
  async check() {
    try {
      await call("GET", "/v1/payments?count=1");
      return { ok: true, detail: `Razorpay accepted the key (${config.payments.mode} mode).` };
    } catch (error) {
      return { ok: false, detail: error.status === 401 ? "Razorpay rejected RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET." : error.message };
    }
  }
};

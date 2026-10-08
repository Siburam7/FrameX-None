/* ==========================================================================
   A stand-in for Cashfree's servers, for automated tests only.

   It speaks the same HTTP API the backend uses (create order, get order, list
   an order's payments, get one payment, refunds), checks the same headers
   (x-client-id, x-client-secret, x-api-version) and signs webhooks with the
   same rule as Cashfree: base64(HMAC-SHA256(timestamp + body, secret)).
   The backend under test runs its real Cashfree code against it
   (CASHFREE_API_BASE points here).

   Nothing in src/ knows about this file. It can also run on its own for
   browser tests:  node test/support/mock-cashfree.js <port>
   In that mode it also serves a stand-in for Cashfree's browser SDK at
   /sdk.js: its checkout "pays" the order straight away (or fails / is closed,
   see window.__mockCashfree).
   ========================================================================== */
import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

const digits = (n = 10) => String(crypto.randomInt(10 ** (n - 1), 10 ** n - 1));
const now = () => new Date().toISOString();

export function createMockCashfree({ clientId = "TEST10mockClient0123456789", clientSecret = "cfsk_ma_test_mock_secret_0123456789", webhookSecret = "" } = {}) {
  const orders = new Map(); // order_id -> order
  const payments = new Map(); // cf_payment_id -> payment
  const refunds = new Map(); // refund_id -> refund
  const calls = []; // every API call the backend made: "POST /orders"
  const state = { down: false, refundStatus: "SUCCESS" };

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, message, code = "request_failed") => send(res, status, { message, code, type: "invalid_request_error" });

  const orderView = (o) => ({ cf_order_id: o.cf_order_id, order_id: o.order_id, entity: "order", order_currency: o.order_currency, order_amount: o.order_amount, order_status: o.order_status, payment_session_id: o.payment_session_id, order_expiry_time: o.order_expiry_time, order_note: o.order_note, created_at: o.created_at, customer_details: o.customer_details, order_meta: o.order_meta, order_tags: o.order_tags });

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const url = new URL(req.url, "http://mock");
      const path = url.pathname;

      /* ---- browser helpers (stand-alone mode; never called by the backend) ---- */
      if (req.method === "OPTIONS") return send(res, 204, {}, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST" });
      if (path === "/sdk.js") {
        res.writeHead(200, { "Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*" });
        return res.end(SDK.replace("__ORIGIN__", `http://${req.headers.host}`));
      }
      if (path === "/_browser/pay" && req.method === "POST") {
        const body = JSON.parse(raw || "{}");
        const order = [...orders.values()].find((o) => o.payment_session_id === body.paymentSessionId);
        if (!order) return send(res, 404, { message: "unknown session" }, { "Access-Control-Allow-Origin": "*" });
        const p = api.pay(order.order_id, { status: body.status || "SUCCESS", group: body.group || "upi" });
        return send(res, 200, { cf_payment_id: p.cf_payment_id, payment_status: p.payment_status }, { "Access-Control-Allow-Origin": "*" });
      }

      /* ---- Cashfree's API ---- */
      calls.push(`${req.method} ${path}`);
      if (state.down) return fail(res, 503, "service unavailable");
      if (req.headers["x-client-id"] !== clientId || req.headers["x-client-secret"] !== clientSecret) return fail(res, 401, "authentication Failed", "request_failed");
      if (!req.headers["x-api-version"]) return fail(res, 400, "x-api-version is missing");
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return fail(res, 400, "bad json");
      }

      let m;
      if (req.method === "POST" && path === "/orders") {
        if (!/^[A-Za-z0-9_-]{3,50}$/.test(body.order_id || "")) return fail(res, 400, "order_id : invalid value");
        if (orders.has(body.order_id)) return fail(res, 409, "order with same id is already present", "order_already_exists");
        if (!(Number(body.order_amount) >= 1)) return fail(res, 400, "order_amount : should be at least 1");
        const cd = body.customer_details || {};
        if (!cd.customer_id || !/^\d{10}$/.test(cd.customer_phone || "")) return fail(res, 400, "customer_details.customer_phone : invalid value");
        const order = {
          cf_order_id: digits(10), order_id: body.order_id, order_currency: body.order_currency || "INR", order_amount: Number(body.order_amount), order_status: "ACTIVE",
          payment_session_id: "session_" + crypto.randomBytes(24).toString("base64url"), order_expiry_time: body.order_expiry_time || new Date(Date.now() + 30 * 86400_000).toISOString(),
          order_note: body.order_note || "", created_at: now(), customer_details: cd, order_meta: body.order_meta || {}, order_tags: body.order_tags || {}
        };
        orders.set(order.order_id, order);
        return send(res, 200, orderView(order));
      }
      if (req.method === "GET" && (m = /^\/orders\/([^/]+)$/.exec(path))) {
        const order = orders.get(decodeURIComponent(m[1]));
        if (!order) return fail(res, 404, "order not found", "order_not_found");
        return send(res, 200, orderView(order));
      }
      if (req.method === "GET" && (m = /^\/orders\/([^/]+)\/payments$/.exec(path))) {
        const id = decodeURIComponent(m[1]);
        if (!orders.has(id)) return fail(res, 404, "order not found", "order_not_found");
        return send(res, 200, [...payments.values()].filter((p) => p.order_id === id));
      }
      if (req.method === "GET" && (m = /^\/orders\/([^/]+)\/payments\/([^/]+)$/.exec(path))) {
        const p = payments.get(decodeURIComponent(m[2]));
        if (!p || p.order_id !== decodeURIComponent(m[1])) return fail(res, 404, "payment not found", "payment_not_found");
        return send(res, 200, p);
      }
      if (req.method === "POST" && (m = /^\/orders\/([^/]+)\/refunds$/.exec(path))) {
        const id = decodeURIComponent(m[1]);
        const paid = [...payments.values()].find((p) => p.order_id === id && p.payment_status === "SUCCESS");
        if (!paid) return fail(res, 400, "refund cannot be created: order is not paid");
        if (refunds.has(body.refund_id)) return send(res, 200, refunds.get(body.refund_id));
        const done = [...refunds.values()].filter((f) => f.order_id === id && f.refund_status !== "CANCELLED").reduce((sum, f) => sum + f.refund_amount, 0);
        if (Number(body.refund_amount) > paid.payment_amount - done) return fail(res, 400, "refund amount exceeds the amount that can be refunded");
        const refund = { cf_refund_id: digits(8), cf_payment_id: paid.cf_payment_id, refund_id: body.refund_id, order_id: id, entity: "refund", refund_amount: Number(body.refund_amount), refund_currency: "INR", refund_note: body.refund_note || "", refund_status: state.refundStatus, created_at: now() };
        refunds.set(refund.refund_id, refund);
        return send(res, 200, refund);
      }
      return fail(res, 404, "not found");
    });
  });

  const sign = (timestamp, bodyText, secret = webhookSecret || clientSecret) => crypto.createHmac("sha256", secret).update(String(timestamp) + bodyText).digest("base64");

  const api = {
    clientId,
    clientSecret,
    webhookSecret,
    url: "",
    orders,
    payments,
    refunds,
    calls,
    state,
    server,
    async listen(port = 0) {
      await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
      api.url = `http://127.0.0.1:${server.address().port}`;
      return api;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
    order: (orderId) => orders.get(orderId),
    paymentsOf: (orderId) => [...payments.values()].filter((p) => p.order_id === orderId),

    /**
     * What a customer does in Cashfree's window. status: SUCCESS | FAILED | USER_DROPPED | PENDING.
     * amount: leave out to pay the order's amount (a different one simulates a tampered payment).
     */
    pay(orderId, { status = "SUCCESS", amount = null, group = "upi", error = "Payment declined by the bank" } = {}) {
      const order = orders.get(orderId);
      if (!order) throw new Error("mock cashfree: no such order " + orderId);
      const p = {
        cf_payment_id: digits(10), order_id: orderId, entity: "payment", payment_currency: order.order_currency, order_amount: order.order_amount,
        payment_amount: amount === null ? order.order_amount : amount, payment_status: status, payment_group: group, payment_time: now(), payment_completion_time: now(),
        payment_message: status === "SUCCESS" ? "Transaction successful" : status === "FAILED" ? error : "", is_captured: status === "SUCCESS",
        ...(status === "FAILED" ? { error_details: { error_code: "TRANSACTION_DECLINED", error_description: error, error_reason: "bank_declined", error_source: "bank" } } : {})
      };
      payments.set(p.cf_payment_id, p);
      if (status === "SUCCESS") order.order_status = "PAID";
      return p;
    },
    /** A PENDING payment later becomes SUCCESS or FAILED. */
    settle(cfPaymentId, status) {
      const p = payments.get(String(cfPaymentId));
      p.payment_status = status;
      if (status === "SUCCESS") orders.get(p.order_id).order_status = "PAID";
      return p;
    },
    /** Cashfree closes an order nobody paid. */
    expire(orderId) {
      orders.get(orderId).order_status = "EXPIRED";
    },

    /** The webhook Cashfree would send for a payment or a refund: { body (text), headers }. */
    webhook(type, { payment = null, refund = null, secret = undefined, timestamp = String(Date.now()) } = {}) {
      const order = orders.get(payment ? payment.order_id : refund.order_id);
      const data = payment
        ? { order: { order_id: order.order_id, order_amount: order.order_amount, order_currency: order.order_currency, order_tags: order.order_tags }, payment: { ...payment }, customer_details: order.customer_details, ...(payment.error_details ? { error_details: payment.error_details } : {}) }
        : { refund: { ...refund } };
      const body = JSON.stringify({ data, event_time: now(), type });
      return { body, headers: { "content-type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": sign(timestamp, body, secret), "x-webhook-version": "2025-01-01" } };
    },
    sign
  };
  return api;
}

/* A stand-in for Cashfree's browser SDK (stand-alone mode only). */
const SDK = `
window.__mockCashfree = window.__mockCashfree || { next: "SUCCESS" };
window.Cashfree = function (options) {
  return {
    checkout: async function (args) {
      var next = window.__mockCashfree.next;
      window.__mockCashfree.opened = (window.__mockCashfree.opened || 0) + 1;
      window.__mockCashfree.lastMode = options && options.mode;
      if (next === "CLOSE") return { error: { message: "User closed the popup" } };
      var r = await fetch("__ORIGIN__/_browser/pay", { method: "POST", body: JSON.stringify({ paymentSessionId: args.paymentSessionId, status: next }) });
      if (!r.ok) return { error: { message: "payment session not found" } };
      if (next === "SUCCESS") return { paymentDetails: { paymentMessage: "Payment finished. Check Order Status" } };
      return { error: { message: "Payment failed" } };
    }
  };
};
`;

// Stand-alone: node test/support/mock-cashfree.js 4011
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await createMockCashfree().listen(Number(process.argv[2]) || 4011);
  console.log(`Mock Cashfree on ${mock.url}  (client id ${mock.clientId}, secret ${mock.clientSecret})`);
}

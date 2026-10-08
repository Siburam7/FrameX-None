/* ==========================================================================
   A stand-in for Razorpay's servers, for automated tests only.

   It speaks the same HTTP API the backend uses (orders, payments, capture,
   refunds), checks the same Basic authentication, and signs checkout results
   and webhooks with the same HMAC rules as Razorpay. The backend under test
   runs its real Razorpay code against it (RAZORPAY_API_BASE points here).

   Nothing in src/ knows about this file. It can also run on its own for
   browser tests:  node test/support/mock-razorpay.js <port>
   ========================================================================== */
import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

const rand = (n = 14) => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, n).padEnd(n, "x");
const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");
const now = () => Math.floor(Date.now() / 1000);

export function createMockRazorpay({ keyId = "rzp_test_mockKey12345", keySecret = "mock_key_secret_0123456789", webhookSecret = "mock_webhook_secret_0123456789" } = {}) {
  const orders = new Map();
  const payments = new Map();
  const refunds = new Map();
  const calls = []; // every API call the backend made: "POST /v1/orders"
  const state = { down: false, refundStatus: "processed" };

  const error = (res, status, description) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description } }));
  };
  const send = (res, body) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://mock");
      // Browser tests: the stand-in checkout page asks this to "pay" (see pay() below).
      if (url.pathname === "/__test/pay") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.end();
        try {
          const b = JSON.parse(raw || "{}");
          return send(res, api.pay(b.order_id, { method: b.method, outcome: b.outcome }));
        } catch (e) {
          return error(res, 400, e.message);
        }
      }
      if (state.down) return req.socket.destroy(); // "Razorpay could not be reached"
      calls.push(`${req.method} ${url.pathname}`);
      if (req.headers.authorization !== "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64")) return error(res, 401, "Authentication failed");
      const body = raw ? JSON.parse(raw) : {};
      const parts = url.pathname.split("/").filter(Boolean); // v1, orders|payments, id, action

      if (req.method === "POST" && url.pathname === "/v1/orders") {
        if (!Number.isInteger(body.amount) || body.amount < 100) return error(res, 400, "Order amount less than minimum amount allowed");
        const order = { id: "order_" + rand(), entity: "order", amount: body.amount, amount_paid: 0, amount_due: body.amount, currency: body.currency, receipt: body.receipt, status: "created", attempts: 0, notes: body.notes || {}, created_at: now() };
        orders.set(order.id, order);
        return send(res, order);
      }
      if (req.method === "GET" && parts[1] === "orders" && parts[3] === "payments") {
        if (!orders.has(parts[2])) return error(res, 400, "The id provided does not exist");
        const items = [...payments.values()].filter((p) => p.order_id === parts[2]);
        return send(res, { entity: "collection", count: items.length, items });
      }
      if (req.method === "GET" && url.pathname === "/v1/payments") return send(res, { entity: "collection", count: 0, items: [] });
      if (parts[1] === "payments" && parts[2]) {
        const p = payments.get(parts[2]);
        if (!p) return error(res, 400, "The id provided does not exist");
        if (req.method === "GET" && !parts[3]) return send(res, p);
        if (req.method === "POST" && parts[3] === "capture") {
          if (p.status !== "authorized") return error(res, 400, "This payment has already been captured");
          if (body.amount !== p.amount) return error(res, 400, "Capture amount must be equal to the amount authorized");
          Object.assign(p, { status: "captured", captured: true });
          Object.assign(orders.get(p.order_id), { status: "paid", amount_paid: p.amount, amount_due: 0 });
          return send(res, p);
        }
        if (req.method === "POST" && parts[3] === "refund") {
          if (p.status !== "captured" && p.status !== "refunded") return error(res, 400, "The payment has not been captured");
          const amount = body.amount || p.amount - p.amount_refunded;
          if (amount > p.amount - p.amount_refunded) return error(res, 400, "The refund amount provided is greater than amount captured");
          const refund = { id: "rfnd_" + rand(), entity: "refund", amount, currency: p.currency, payment_id: p.id, notes: body.notes || {}, status: state.refundStatus, created_at: now() };
          refunds.set(refund.id, refund);
          p.amount_refunded += amount;
          p.refund_status = p.amount_refunded >= p.amount ? "full" : "partial";
          if (p.refund_status === "full") p.status = "refunded";
          return send(res, refund);
        }
      }
      return error(res, 404, "The requested URL was not found on the server.");
    });
  });

  const api = {
    keyId,
    keySecret,
    webhookSecret,
    orders,
    payments,
    refunds,
    calls,
    state,
    server,
    get url() {
      return `http://127.0.0.1:${server.address().port}`;
    },
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(api))),
    close: () => new Promise((resolve) => server.close(resolve)),

    /**
     * The customer "pays" in Razorpay's checkout.
     * outcome: captured | authorized | failed. Returns the payment and, like the
     * real checkout, what the browser is handed: order id, payment id, signature.
     * The payment carries card / contact details, as Razorpay's do.
     */
    pay(orderId, { method = "upi", outcome = "captured", amount = null, reason = "Payment was declined by the bank" } = {}) {
      const order = orders.get(orderId);
      if (!order) throw new Error("The id provided does not exist");
      if (order.status === "paid") throw new Error("This order has already been paid"); // Razorpay accepts one successful payment per order
      const p = {
        id: "pay_" + rand(), entity: "payment", amount: amount ?? order.amount, currency: order.currency, status: outcome, order_id: order.id, method, captured: outcome === "captured", amount_refunded: 0, refund_status: null,
        email: "customer@example.com", contact: "+919876500011", vpa: method === "upi" ? "customer@okbank" : null, bank: method === "netbanking" ? "HDFC" : null,
        card: method === "card" ? { last4: "1111", network: "Visa", type: "credit", issuer: "HDFC" } : null,
        error_code: outcome === "failed" ? "BAD_REQUEST_ERROR" : null, error_description: outcome === "failed" ? reason : null, created_at: now()
      };
      payments.set(p.id, p);
      order.attempts += 1;
      if (outcome === "captured") Object.assign(order, { status: "paid", amount_paid: p.amount, amount_due: 0 });
      else if (order.status === "created") order.status = "attempted";
      return { payment: p, proof: { gatewayOrderId: order.id, gatewayPaymentId: p.id, signature: hmac(keySecret, `${order.id}|${p.id}`) } };
    },

    /** A webhook as Razorpay would send it: { body, headers }. Pass the same eventId to repeat a delivery. */
    webhook(event, { payment = null, refund = null, eventId = "evt_" + rand(), secret = webhookSecret } = {}) {
      const payload = {};
      if (payment) payload.payment = { entity: payment };
      if (refund) payload.refund = { entity: refund };
      if (event === "order.paid" && payment) payload.order = { entity: orders.get(payment.order_id) };
      const body = JSON.stringify({ entity: "event", account_id: "acc_mock", event, contains: Object.keys(payload), payload, created_at: now() });
      return { body, headers: { "Content-Type": "application/json", "X-Razorpay-Signature": hmac(secret, body), "X-Razorpay-Event-Id": eventId } };
    }
  };
  return api;
}

// Standalone: node test/support/mock-razorpay.js 4010
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await createMockRazorpay().listen(Number(process.argv[2]) || 4010);
  console.log(`Mock Razorpay listening on ${mock.url}  (key ${mock.keyId})`);
}

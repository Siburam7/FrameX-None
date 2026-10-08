/* ==========================================================================
   Checkout, orders and payments: run with "npm test" in backend/.

   A real server on a random port, an in-memory PostgreSQL (PGlite), the real
   catalogue files, and the backend's real Razorpay code talking to a stand-in
   for Razorpay's servers (test/support/mock-razorpay.js) that uses the same
   API, the same authentication and the same signatures.

   What these tests can't show is a payment going through Razorpay itself:
   that needs Razorpay test keys (see backend/README.md -> Payments).
   ========================================================================== */
import crypto from "node:crypto";
import { createMockRazorpay } from "./support/mock-razorpay.js";

const mock = await createMockRazorpay().listen();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev"; // development mailbox, so the tests can read the emails
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.PAYMENT_MODE = "test";
process.env.RAZORPAY_KEY_ID = mock.keyId;
process.env.RAZORPAY_KEY_SECRET = mock.keySecret;
process.env.RAZORPAY_WEBHOOK_SECRET = mock.webhookSecret;
process.env.RAZORPAY_API_BASE = mock.url;
process.env.PAYMENT_PENDING_MINUTES = "30";
// Non-zero fees, so the arithmetic is really tested.
process.env.TAX_PERCENT = "5";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "5000";
process.env.COD_FEE = "40";
process.env.COD_MAX_ORDER_VALUE = "20000";
process.env.COD_BLOCKED_PINCODES = "7999";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { expireUnpaidOrders } = await import("../src/services/payment-service.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const c of response.headers.getSetCookie()) this.cookie = /fx_session=;|Expires=Thu, 01 Jan 1970/i.test(c) ? "" : c.split(";")[0];
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, text };
  }
  get = (path) => this.request("GET", path);
  post = (path, body = {}) => this.request("POST", path, body);
  patch = (path, body = {}) => this.request("PATCH", path, body);
  del = (path) => this.request("DELETE", path);
}

const PASSWORD = "Sunrise-Frame-42";
// A product that is made from the customer's photo can't be ordered without one:
// items these tests add or buy get the uploads they need (test/support/photos.js).
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const ASHA = { name: "Asha Rout", email: "asha@example.com", phone: "9876500011", password: PASSWORD, confirmPassword: PASSWORD };
const BINOD = { name: "Binod Das", email: "binod@example.com", phone: "9876500022", password: PASSWORD, confirmPassword: PASSWORD };
const HOME = { fullName: "Asha Rout", phone: "98765 00011", line1: "12 Station Road", line2: "Near Bus Stand", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client();
const binod = new Client();
const admin = new Client();
const S = {}; // ids shared between tests

const { seed, model } = siteEngine();
const all = seed.products.map((p) => model.normalize(p));
const roomy = all.find((p) => p.sizes.length > 1 && model.orderLimits(p).maxQty === model.MAX_CART_QTY && !p.pricing.discountPercent);
const discounted = all.find((p) => p.pricing.discountPercent > 0 && model.orderLimits(p).maxQty === model.MAX_CART_QTY);
const scarce = all.find((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty <= 5);
const unit = (p, sel = {}) => model.cartLine(p, sel).unitPrice;
const newKey = () => crypto.randomUUID();

const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const orderRow = (number) => row("SELECT * FROM orders WHERE order_number = $1", [number]);
const attempts = async (number) => (await db.query("SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.order_number = $1 ORDER BY p.attempt", [number])).rows;
const ordersOf = async (email) => (await db.query("SELECT o.* FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email = $1 ORDER BY o.created_at", [email])).rows;
const reserved = async (id) => (await row("SELECT stock_reserved FROM catalog_products WHERE id = $1", [id])).stock_reserved;
const mails = async (to, subject) => {
  await emailsSettled();
  return devOutbox().filter((m) => m.to === to && subject.test(m.subject));
};

async function fillCart(client, items) {
  assert.equal((await client.del("/api/cart")).status, 200);
  for (const item of items) assert.equal((await client.post("/api/cart/items", item)).status, 201);
  return (await client.get("/api/cart")).json.cart;
}
const getQuote = async (client, addressId, method) => (await client.get(`/api/checkout/quote?addressId=${addressId}${method ? `&paymentMethod=${method}` : ""}`)).json.quote;
/** Quote, then place with the total the customer saw. */
async function place(client, addressId, method, { channel = null, key = newKey(), total = null } = {}) {
  const quote = await getQuote(client, addressId, method);
  return client.post("/api/checkout/orders", { addressId, paymentMethod: method, paymentChannel: channel, expectedTotal: total ?? quote.total, idempotencyKey: key });
}
const webhook = (wh) => fetch(base + "/api/payments/webhook/razorpay", { method: "POST", headers: wh.headers, body: wh.body }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const proofOf = (paid) => paid.proof;

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", ASHA)).status, 201);
  assert.equal((await binod.post("/api/auth/signup", BINOD)).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  clearDevOutbox();
});

after(async () => {
  await emailsSettled();
  server.close();
  await mock.close();
  await db.close();
});

describe("before checkout", () => {
  test("checkout, addresses and orders need a login", async () => {
    const visitor = new Client();
    for (const path of ["/api/addresses", "/api/checkout/quote", "/api/orders", "/api/orders/FX-100001"]) assert.equal((await visitor.get(path)).status, 401, path);
    assert.equal((await visitor.post("/api/checkout/orders", {})).status, 401);
    assert.equal((await visitor.post("/api/addresses", HOME)).status, 401);
  });

  test("the public settings say what can be paid, without any key", async () => {
    const { text, json } = await new Client().get("/api/config");
    assert.deepEqual(json.features.payments, { online: true, provider: "razorpay", mode: "test", cod: true });
    assert.equal(text.includes(mock.keySecret), false);
    assert.equal(text.includes(mock.webhookSecret), false);
  });

  test("addresses are validated and belong to their owner", async () => {
    const bad = await asha.post("/api/addresses", { ...HOME, postalCode: "12", phone: "abc", state: "Atlantis", line1: "" });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["line1", "phone", "postalCode", "state"]);
    const ok = await asha.post("/api/addresses", { ...HOME, userId: "someone-else" });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.address.phone, "+919876500011");
    assert.equal(ok.json.address.isDefault, true, "the first address is the default");
    S.home = ok.json.address.id;
    const far = await asha.post("/api/addresses", { ...HOME, line1: "4 Hill View", city: "Angul", postalCode: "799901" });
    S.noCodPin = far.json.address.id;
    S.binodHome = (await binod.post("/api/addresses", { ...HOME, fullName: "Binod Das", phone: "9876500022" })).json.address.id;

    assert.deepEqual((await binod.get("/api/addresses")).json.items.map((a) => a.id), [S.binodHome]);
    assert.equal((await binod.patch(`/api/addresses/${S.home}`, HOME)).status, 404);
    assert.equal((await binod.del(`/api/addresses/${S.home}`)).status, 404);
    assert.equal((await binod.get(`/api/checkout/quote?addressId=${S.home}`)).status, 404);
  });
});

describe("the server works out the price", () => {
  test("subtotal, product discount, tax, shipping and COD fee add up to the total", async () => {
    const cart = await fillCart(asha, [{ productId: roomy.id, quantity: 2, selection: { sizeId: roomy.sizes[0].id } }, { productId: discounted.id, quantity: 1 }]);
    const q = await getQuote(asha, S.home, "ONLINE");
    const dLine = model.cartLine(discounted, model.defaultSelection(discounted));
    const dDiscount = dLine.quote.listPrice - dLine.quote.lines[0].amount;
    const itemsTotal = unit(roomy, { sizeId: roomy.sizes[0].id }) * 2 + dLine.unitPrice;
    assert.ok(dDiscount > 0);
    assert.equal(q.ok, true);
    assert.equal(q.discount, dDiscount);
    assert.equal(q.subtotal, itemsTotal + dDiscount, "subtotal is at list price");
    assert.equal(q.subtotal - q.discount, cart.subtotal, "what the cart shows");
    assert.equal(q.tax, Math.round((itemsTotal * 5) / 100));
    assert.equal(q.shippingFee, 60);
    assert.equal(q.codFee, 0);
    assert.equal(q.total, itemsTotal + q.tax + 60);
    assert.equal(q.payment.online.available, true);
    assert.deepEqual(q.payment.online.methods.map((m) => m.id), ["upi", "card", "netbanking", "wallet"]);
    assert.deepEqual(q.payment.cod, { available: true, fee: 40, reason: null });

    const cod = await getQuote(asha, S.home, "COD");
    assert.equal(cod.codFee, 40);
    assert.equal(cod.total, q.total + 40);
  });

  test("free shipping above the threshold; COD limits by order value and PIN code", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 20, selection: { sizeId: roomy.sizes[roomy.sizes.length - 1].id } }]);
    const big = await getQuote(asha, S.home, "COD");
    assert.ok(big.subtotal >= 5000);
    assert.equal(big.shippingFee, 0);
    if (big.total > 20000) {
      assert.equal(big.payment.cod.available, false);
      assert.match(big.payment.cod.reason, /up to ₹20,000/);
      assert.equal(big.codFee, 0);
    }
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const pin = await getQuote(asha, S.noCodPin, "COD");
    assert.equal(pin.payment.cod.available, false);
    assert.match(pin.payment.cod.reason, /PIN code/);
    assert.equal((await place(asha, S.noCodPin, "COD")).json.error.code, "COD_UNAVAILABLE");
    assert.equal((await ordersOf(ASHA.email)).length, 0);
  });

  test("an empty cart, a missing address or a made-up total can't place an order", async () => {
    await asha.del("/api/cart");
    assert.equal((await getQuote(asha, S.home, "COD")).ok, false);
    assert.equal((await place(asha, S.home, "COD")).json.error.code, "CART_NOT_READY");
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    assert.equal((await asha.post("/api/checkout/orders", { paymentMethod: "COD", expectedTotal: 1, idempotencyKey: newKey() })).status, 422);
    assert.equal((await asha.post("/api/checkout/orders", { addressId: S.binodHome, paymentMethod: "COD", expectedTotal: 1, idempotencyKey: newKey() })).status, 404);
    const cheap = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: 1, idempotencyKey: newKey(), total: 1, amount: 1, items: [] });
    assert.equal(cheap.status, 409);
    assert.equal(cheap.json.error.code, "TOTAL_CHANGED");
    assert.equal((await ordersOf(ASHA.email)).length, 0, "nothing was created");
  });
});

describe("6 + 17. Cash on Delivery", () => {
  test("COD places the order at once: order PLACED, payment PENDING, no gateway, exactly one order", async () => {
    clearDevOutbox();
    const cart = await fillCart(asha, [{ productId: roomy.id, quantity: 2, selection: { sizeId: roomy.sizes[0].id }, note: "Ring the bell" }, { productId: discounted.id, quantity: 1 }]);
    const q = await getQuote(asha, S.home, "COD");
    const key = newKey();
    const callsBefore = mock.calls.length;
    const body = { addressId: S.home, paymentMethod: "COD", expectedTotal: q.total, idempotencyKey: key };
    // The button pressed twice at the same moment, then once more after a refresh.
    const [a, b] = await Promise.all([asha.post("/api/checkout/orders", body), asha.post("/api/checkout/orders", body)]);
    const c = await asha.post("/api/checkout/orders", body);
    assert.deepEqual([a.status, b.status].sort(), [200, 201], a.text + b.text);
    assert.equal(c.status, 200);
    assert.equal(new Set([a, b, c].map((r) => r.json.order.orderNumber)).size, 1);
    assert.equal((await ordersOf(ASHA.email)).length, 1, "exactly one order");

    const order = a.json.order;
    S.cod = order.orderNumber;
    assert.match(order.orderNumber, /^FX-\d{6}$/);
    assert.equal(order.status, "PLACED");
    assert.equal(order.paymentMethod, "COD");
    assert.equal(order.paymentStatus, "PENDING");
    assert.equal(order.paymentGateway, null);
    assert.equal(a.json.payment, null, "no gateway checkout for COD");
    assert.equal(mock.calls.length, callsBefore, "the gateway was never called");
    assert.equal(order.codFee, 40);
    assert.equal(order.total, q.total);
    assert.equal(order.total, order.subtotal - order.discount + order.tax + order.shippingFee + order.codFee);
    assert.equal(order.items.length, 2);
    assert.equal(order.items[0].note, "Ring the bell");
    assert.equal(order.items[0].unitPrice, cart.items[0].unitPrice);
    assert.ok(order.items[0].shopName);
    assert.equal(order.shippingAddress.postalCode, "759001");
    assert.deepEqual((await attempts(S.cod)).map((p) => [p.provider, p.status, p.amount]), [["cod", "PENDING", q.total]]);

    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 0, "the bought lines left the cart");
    assert.equal(await reserved(roomy.id), 2, "stock was taken");
    const sent = await mails(ASHA.email, /placed: pay .* on delivery/);
    assert.equal(sent.length, 1, "one email, however often the button was pressed");
    assert.ok(sent[0].text.includes(order.orderNumber));
    assert.ok(sent[0].links[0].url.startsWith("http://localhost:5500/order.html?id=FX-"));
  });
});

describe("1 + 16 + 18. UPI payment, success", () => {
  test("the order waits for its payment; nothing is paid, placed or removed from the cart yet", async () => {
    clearDevOutbox();
    await fillCart(asha, [{ productId: roomy.id, quantity: 1, selection: { sizeId: roomy.sizes[1].id } }]);
    const q = await getQuote(asha, S.home, "ONLINE");
    S.upiKey = newKey();
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: S.upiKey });
    assert.equal(r.status, 201, r.text);
    const { order, payment } = r.json;
    S.upi = order.orderNumber;
    S.upiSession = payment;
    assert.equal(order.status, "PENDING_PAYMENT");
    assert.equal(order.paymentStatus, "PENDING");
    assert.equal(order.canPay, true);
    assert.equal(order.codFee, 0);
    // What the browser gets to open the gateway: the public key id, the gateway's order, the server's amount.
    assert.deepEqual(Object.keys(payment).sort(), ["amount", "currency", "description", "gatewayOrderId", "keyId", "method", "mode", "name", "orderNumber", "prefill", "provider"]);
    assert.equal(payment.keyId, mock.keyId);
    assert.equal(payment.amount, q.total * 100, "in paise");
    assert.equal(payment.method, "upi");
    assert.equal(r.text.includes(mock.keySecret), false, "the secret never leaves the server");
    assert.equal(mock.orders.get(payment.gatewayOrderId).amount, q.total * 100);
    assert.equal(mock.orders.get(payment.gatewayOrderId).receipt, order.orderNumber);

    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 1, "the cart is kept until the payment is verified");
    assert.equal((await mails(ASHA.email, /./)).length, 0, "no email before the money is there");
  });

  test("something added to the cart while paying stays; the verified payment places the order and removes only what was bought", async () => {
    assert.equal((await asha.post("/api/cart/items", { productId: discounted.id, quantity: 1 })).status, 201);
    const paid = mock.pay(S.upiSession.gatewayOrderId, { method: "upi" });
    S.upiPaid = paid;
    const r = await asha.post(`/api/orders/${S.upi}/payments/verify`, proofOf(paid));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.order.status, "PLACED");
    assert.equal(r.json.order.paymentStatus, "PAID");
    assert.equal(r.json.order.paymentInstrument, "upi");
    assert.equal(r.json.order.payments[0].reference, paid.payment.id);
    const db1 = await orderRow(S.upi);
    assert.equal(db1.gateway_payment_id, paid.payment.id);
    assert.ok(db1.paid_at && db1.placed_at);
    assert.equal(db1.expires_at, null);
    const cart = (await asha.get("/api/cart")).json.cart;
    assert.deepEqual(cart.items.map((i) => i.productId), [discounted.id], "only the bought line was removed");
  });

  test("16. one successful payment = exactly one order, one PAID payment, one email", async () => {
    assert.equal((await ordersOf(ASHA.email)).filter((o) => o.order_number === S.upi).length, 1);
    assert.deepEqual((await attempts(S.upi)).map((p) => [p.attempt, p.status, p.instrument, p.verified_via]), [[1, "PAID", "upi", "checkout"]]);
    const sent = await mails(ASHA.email, /Payment received/);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].subject.includes(S.upi));
  });
});

describe("9 + 10. the same news twice", () => {
  test("9. a repeated payment callback changes nothing", async () => {
    const before = JSON.stringify([await orderRow(S.upi), await attempts(S.upi)]);
    for (let i = 0; i < 3; i++) {
      const r = await asha.post(`/api/orders/${S.upi}/payments/verify`, proofOf(S.upiPaid));
      assert.equal(r.status, 200);
      assert.equal(r.json.order.paymentStatus, "PAID");
    }
    assert.equal(JSON.stringify([await orderRow(S.upi), await attempts(S.upi)]), before);
    assert.equal((await mails(ASHA.email, /Payment received/)).length, 1);
  });

  test("10. the gateway's webhook after the callback, and the same webhook again, change nothing", async () => {
    const before = JSON.stringify([await orderRow(S.upi), await attempts(S.upi)]);
    const wh = mock.webhook("payment.captured", { payment: S.upiPaid.payment });
    const first = await webhook(wh);
    assert.equal(first.status, 200);
    assert.equal(first.json.result, "ALREADY_APPLIED");
    const again = await webhook(wh);
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    // "order.paid" for the same payment, as its own event
    assert.equal((await webhook(mock.webhook("order.paid", { payment: S.upiPaid.payment }))).json.result, "ALREADY_APPLIED");
    assert.equal(JSON.stringify([await orderRow(S.upi), await attempts(S.upi)]), before);
    assert.equal((await mails(ASHA.email, /Payment received/)).length, 1, "no second email");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM payment_events WHERE event_id = $1", [wh.headers["X-Razorpay-Event-Id"]])).rows[0].n, 1, "the event is stored once");
  });

  test("webhooks are accepted only with the gateway's signature; no card or contact detail is stored", async () => {
    const forged = mock.webhook("payment.captured", { payment: S.upiPaid.payment, secret: "not-the-secret" });
    assert.equal((await webhook(forged)).status, 400);
    const real = mock.webhook("payment.captured", { payment: S.upiPaid.payment });
    assert.equal((await webhook({ headers: real.headers, body: real.body.replace('"captured"', '"CAPTURED"') })).status, 400, "a changed body no longer matches its signature");
    assert.equal((await fetch(base + "/api/payments/webhook/razorpay", { method: "POST", body: real.body })).status, 400, "no signature");
    assert.equal((await fetch(base + "/api/payments/webhook/otherpay", { method: "POST", headers: real.headers, body: real.body })).status, 404);
    const stored = JSON.stringify((await db.query("SELECT * FROM payment_events")).rows) + JSON.stringify(await attempts(S.upi));
    for (const secret of ["customer@okbank", "customer@example.com", "+919876500011", "1111"]) assert.equal(stored.includes(secret), false, secret);
  });
});

describe("3 + 5. card and net banking, success (the webhook arrives first)", () => {
  for (const [channel, label] of [["card", "3. card"], ["netbanking", "5. net banking"]]) {
    test(`${label}: paid through the webhook alone, then the callback finds it done`, async () => {
      clearDevOutbox();
      await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
      const r = await place(asha, S.home, "ONLINE", { channel });
      assert.equal(r.status, 201, r.text);
      const number = r.json.order.orderNumber;
      assert.equal(r.json.payment.method, channel);
      const paid = mock.pay(r.json.payment.gatewayOrderId, { method: channel });
      // The customer's browser closed: only the gateway's server tells us.
      const hook = await webhook(mock.webhook("payment.captured", { payment: paid.payment }));
      assert.equal(hook.json.result, "ORDER_PLACED");
      const order = (await asha.get(`/api/orders/${number}`)).json.order;
      assert.equal(order.status, "PLACED");
      assert.equal(order.paymentStatus, "PAID");
      assert.equal(order.paymentInstrument, channel);
      assert.equal((await attempts(number))[0].verified_via, "webhook");
      assert.equal((await asha.get("/api/cart")).json.cart.items.length, 0);
      // The browser comes back later with its callback.
      const late = await asha.post(`/api/orders/${number}/payments/verify`, proofOf(paid));
      assert.equal(late.status, 200);
      assert.equal((await mails(ASHA.email, /Payment received/)).length, 1);
      assert.equal((await ordersOf(ASHA.email)).filter((o) => o.order_number === number).length, 1);
    });
  }
});

describe("2 + 4 + 19 + 7. failed payments and retry", () => {
  test("2. UPI payment fails: the order is NOT paid or placed, the attempt is kept with its reason, the cart stays", async () => {
    clearDevOutbox();
    await fillCart(asha, [{ productId: roomy.id, quantity: 1, selection: { sizeId: roomy.sizes[0].id } }]);
    const r = await place(asha, S.home, "ONLINE", { channel: "upi" });
    S.retry = r.json.order.orderNumber;
    S.retrySession = r.json.payment;
    const failed = mock.pay(S.retrySession.gatewayOrderId, { method: "upi", outcome: "failed", reason: "Payment was declined by the UPI app" });
    const out = await asha.post(`/api/orders/${S.retry}/payments/outcome`, { reason: "failed", gatewayPaymentId: failed.payment.id });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.json.order.status, "PENDING_PAYMENT");
    assert.equal(out.json.order.paymentStatus, "FAILED");
    assert.equal(out.json.order.canPay, true);
    assert.deepEqual((await attempts(S.retry)).map((p) => [p.attempt, p.status, p.failure_reason, p.gateway_payment_id]), [[1, "FAILED", "Payment was declined by the UPI app", failed.payment.id]]);
    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 1, "the cart is untouched");
    const sent = await mails(ASHA.email, /Payment not completed/);
    assert.equal(sent.length, 1);
    assert.equal((await mails(ASHA.email, /Payment received|placed/)).length, 0);
    // The gateway's own webhook about the same failure, twice.
    const wh = mock.webhook("payment.failed", { payment: failed.payment });
    assert.equal((await webhook(wh)).json.result, "ALREADY_APPLIED");
    assert.equal((await webhook(wh)).json.duplicate, true);
    assert.equal((await mails(ASHA.email, /Payment not completed/)).length, 1, "still one email");
  });

  test("19. a failed payment can't be turned into a paid order", async () => {
    const order = await orderRow(S.retry);
    const failedId = (await attempts(S.retry))[0].gateway_payment_id;
    const sign = (o, p) => crypto.createHmac("sha256", mock.keySecret).update(`${o}|${p}`).digest("hex");
    // a) the browser claims success with a made-up signature
    assert.equal((await asha.post(`/api/orders/${S.retry}/payments/verify`, { gatewayOrderId: order.gateway_order_id, gatewayPaymentId: failedId, signature: "f".repeat(64) })).status, 400);
    // b) a genuine signature for the FAILED payment: the gateway says "failed", so it stays unpaid
    const b = await asha.post(`/api/orders/${S.retry}/payments/verify`, { gatewayOrderId: order.gateway_order_id, gatewayPaymentId: failedId, signature: sign(order.gateway_order_id, failedId) });
    assert.equal(b.status, 200);
    assert.equal(b.json.order.paymentStatus, "FAILED");
    // c) a real, captured payment of ANOTHER order, replayed against this one
    assert.equal((await asha.post(`/api/orders/${S.retry}/payments/verify`, proofOf(S.upiPaid))).status, 400);
    // d) a captured payment for the right gateway order but a smaller amount
    const small = mock.pay(order.gateway_order_id, { method: "upi", outcome: "captured", amount: 100 });
    const d = await asha.post(`/api/orders/${S.retry}/payments/verify`, proofOf(small));
    assert.equal(d.json.order.paymentStatus, "FAILED");
    assert.equal(d.json.order.status, "PENDING_PAYMENT");
    assert.equal((await webhook(mock.webhook("payment.captured", { payment: small.payment }))).json.result, "MISMATCH_REJECTED");
    // e) a payment id that doesn't exist
    assert.equal((await asha.post(`/api/orders/${S.retry}/payments/verify`, { gatewayOrderId: order.gateway_order_id, gatewayPaymentId: "pay_doesnotexist", signature: sign(order.gateway_order_id, "pay_doesnotexist") })).status, 502);

    const after = await orderRow(S.retry);
    assert.equal(after.payment_status, "FAILED");
    assert.equal(after.status, "PENDING_PAYMENT");
    assert.equal(after.paid_at, null);
    assert.equal((await attempts(S.retry)).some((p) => p.status === "PAID"), false);
    assert.equal((await mails(ASHA.email, /Payment received/)).length, 0);
    // put the stand-in back to "not paid" for the retry below
    mock.payments.delete(small.payment.id);
    Object.assign(mock.orders.get(order.gateway_order_id), { status: "attempted", amount_paid: 0, amount_due: order.total * 100 });
  });

  test("7. Retry Payment: a new attempt on the SAME order; the failed one stays on record", async () => {
    const ordersBefore = (await ordersOf(ASHA.email)).length;
    const r = await asha.post(`/api/orders/${S.retry}/payments`, { paymentChannel: "card" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.payment.gatewayOrderId, S.retrySession.gatewayOrderId, "the gateway's order is reused: it takes one successful payment only");
    assert.equal(r.json.payment.method, "card");
    assert.equal(r.json.order.paymentStatus, "PENDING");
    const paid = mock.pay(r.json.payment.gatewayOrderId, { method: "card" });
    const v = await asha.post(`/api/orders/${S.retry}/payments/verify`, proofOf(paid));
    assert.equal(v.json.order.status, "PLACED");
    assert.equal(v.json.order.paymentStatus, "PAID");
    assert.deepEqual((await attempts(S.retry)).map((p) => [p.attempt, p.status, p.instrument]), [[1, "FAILED", "upi"], [2, "PAID", "card"]]);
    assert.equal((await ordersOf(ASHA.email)).length, ordersBefore, "no new order");
    assert.equal((await asha.post(`/api/orders/${S.retry}/payments`, {})).json.payment, null, "a paid order can't be paid again");
    assert.throws(() => mock.pay(S.retrySession.gatewayOrderId), /already been paid/);
  });

  test("4. card payment fails (reported by the webhook only)", async () => {
    clearDevOutbox();
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const r = await place(asha, S.home, "ONLINE", { channel: "card" });
    const number = r.json.order.orderNumber;
    const failed = mock.pay(r.json.payment.gatewayOrderId, { method: "card", outcome: "failed", reason: "Your card was declined" });
    assert.equal((await webhook(mock.webhook("payment.failed", { payment: failed.payment }))).json.result, "ATTEMPT_FAILED");
    const order = (await asha.get(`/api/orders/${number}`)).json.order;
    assert.equal(order.status, "PENDING_PAYMENT");
    assert.equal(order.paymentStatus, "FAILED");
    assert.equal(order.payments[0].failureReason, "Your card was declined");
    assert.equal(order.payments[0].instrument, "card");
    assert.equal((await mails(ASHA.email, /Payment not completed/)).length, 1);
    S.cardFailed = number;
  });
});

describe("13. the customer cancels", () => {
  test("closing the payment window: the attempt is CANCELLED, nothing is paid, no email, retry is possible", async () => {
    clearDevOutbox();
    // The failed card order from before is still open: checking out again replaces it.
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const r = await place(asha, S.home, "ONLINE", { channel: "wallet" });
    assert.equal(r.status, 201, r.text);
    const replaced = await orderRow(S.cardFailed);
    assert.equal(replaced.status, "CANCELLED", "the earlier unpaid order made way");
    assert.equal(replaced.payment_status, "CANCELLED");
    assert.equal(replaced.stock_held, false);
    S.closed = r.json.order.orderNumber;
    S.closedKey = (await orderRow(S.closed)).idempotency_key;
    const out = await asha.post(`/api/orders/${S.closed}/payments/outcome`, { reason: "dismissed" });
    assert.equal(out.json.order.status, "PENDING_PAYMENT");
    assert.equal(out.json.order.paymentStatus, "CANCELLED");
    assert.equal(out.json.order.canPay, true);
    assert.deepEqual((await attempts(S.closed)).map((p) => p.status), ["CANCELLED"]);
    assert.equal((await mails(ASHA.email, /./)).length, 0);
    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 1);
  });

  test("but if the money did arrive after the window closed (UPI), the order is placed", async () => {
    const order = await orderRow(S.closed);
    mock.pay(order.gateway_order_id, { method: "upi" });
    const out = await asha.post(`/api/orders/${S.closed}/payments/outcome`, { reason: "dismissed" });
    assert.equal(out.json.order.status, "PLACED");
    assert.equal(out.json.order.paymentStatus, "PAID");
    assert.equal((await attempts(S.closed)).filter((p) => p.status === "PAID").length, 1);
    assert.equal((await attempts(S.closed)).find((p) => p.status === "PAID").verified_via, "reconcile");
  });

  test("cancelling an order: stock goes back, COD owes nothing, a paid online order is refunded in full", async () => {
    clearDevOutbox();
    const held = await reserved(roomy.id);
    const cod = await asha.post(`/api/orders/${S.cod}/cancel`, { reason: "Ordered by mistake" });
    assert.equal(cod.status, 200, cod.text);
    assert.equal(cod.json.order.status, "CANCELLED");
    assert.equal(cod.json.order.paymentStatus, "CANCELLED");
    assert.equal(cod.json.order.cancelReason, "Ordered by mistake");
    assert.equal(await reserved(roomy.id), held - 2);
    assert.equal((await asha.post(`/api/orders/${S.cod}/cancel`)).status, 409, "only once");

    const paid = await asha.post(`/api/orders/${S.upi}/cancel`);
    assert.equal(paid.json.order.status, "CANCELLED");
    assert.equal(paid.json.order.paymentStatus, "REFUNDED");
    assert.equal(paid.json.order.amountRefunded, paid.json.order.total);
    assert.equal(paid.json.order.refunds[0].status, "PROCESSED");
    assert.equal(mock.payments.get(S.upiPaid.payment.id).amount_refunded, paid.json.order.total * 100);
    assert.equal((await mails(ASHA.email, /was cancelled/)).length, 2);
    assert.equal((await mails(ASHA.email, /Refund started/)).length, 1);
    assert.equal((await mails(ASHA.email, /Refund completed/)).length, 1);
  });
});

describe("8. the browser is refreshed during payment", () => {
  test("paid, but the page reloaded before telling the server: pressing Pay again finds the same order, already paid", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const q = await getQuote(asha, S.home, "ONLINE");
    const body = { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: newKey() };
    const first = await asha.post("/api/checkout/orders", body);
    const number = first.json.order.orderNumber;
    mock.pay(first.json.payment.gatewayOrderId, { method: "upi" }); // paid in the UPI app; the callback never ran
    const count = (await ordersOf(ASHA.email)).length;
    const again = await asha.post("/api/checkout/orders", body);
    assert.equal(again.status, 200);
    assert.equal(again.json.order.orderNumber, number);
    assert.equal(again.json.order.paymentStatus, "PAID");
    assert.equal(again.json.payment, null, "nothing to pay again");
    assert.equal((await ordersOf(ASHA.email)).length, count);
    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 0);
  });

  test("not paid yet and the page reloaded: the same order comes back with a new attempt, not a new order", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const q = await getQuote(asha, S.home, "ONLINE");
    const body = { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: newKey() };
    const first = await asha.post("/api/checkout/orders", body);
    const count = (await ordersOf(ASHA.email)).length;
    const again = await asha.post("/api/checkout/orders", body);
    assert.equal(again.json.order.orderNumber, first.json.order.orderNumber);
    assert.equal(again.json.payment.gatewayOrderId, first.json.payment.gatewayOrderId);
    assert.equal((await ordersOf(ASHA.email)).length, count);
    assert.deepEqual((await attempts(first.json.order.orderNumber)).map((p) => p.status), ["CANCELLED", "PENDING"]);
    // the order page asks "did it arrive?": not yet
    const waiting = await asha.post(`/api/orders/${first.json.order.orderNumber}/payments/refresh`);
    assert.equal(waiting.json.order.status, "PENDING_PAYMENT");
    mock.pay(first.json.payment.gatewayOrderId, { method: "upi" });
    const arrived = await asha.post(`/api/orders/${first.json.order.orderNumber}/payments/refresh`);
    assert.equal(arrived.json.order.status, "PLACED");
    assert.equal(arrived.json.order.paymentStatus, "PAID");
    S.paid = first.json.order.orderNumber;
  });

  test("the gateway can't be reached: the order is saved without a payment, and Retry works once it is back", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    mock.state.down = true;
    const r = await place(asha, S.home, "ONLINE", { channel: "upi" });
    mock.state.down = false;
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.payment, null);
    assert.equal(r.json.paymentError.code, "PAYMENT_GATEWAY_ERROR");
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    const number = r.json.order.orderNumber;
    const retry = await asha.post(`/api/orders/${number}/payments`, { paymentChannel: "upi" });
    assert.equal(retry.status, 200, retry.text);
    const paid = mock.pay(retry.json.payment.gatewayOrderId, { method: "upi" });
    mock.state.down = true;
    const pending = await asha.post(`/api/orders/${number}/payments/verify`, proofOf(paid));
    mock.state.down = false;
    assert.equal(pending.status, 502, "the gateway can't confirm it right now: nothing is marked paid");
    assert.equal((await orderRow(number)).payment_status, "PENDING");
    assert.equal((await asha.post(`/api/orders/${number}/payments/verify`, proofOf(paid))).json.order.paymentStatus, "PAID");
  });
});

describe("11. stock runs out before payment", () => {
  test("the last pieces are held by the first order; the next customer can't buy them", async () => {
    const stock = model.orderLimits(scarce).maxQty;
    await fillCart(binod, [{ productId: scarce.id, quantity: stock }]);
    await fillCart(asha, [{ productId: scarce.id, quantity: stock }]);
    const first = await place(asha, S.home, "ONLINE", { channel: "upi" });
    assert.equal(first.status, 201, first.text);
    S.scarceOrder = first.json.order.orderNumber;
    assert.equal(await reserved(scarce.id), stock);

    const q = await getQuote(binod, S.binodHome, "COD");
    assert.equal(q.ok, false);
    assert.equal(q.issues[0].code, "OUT_OF_STOCK");
    const second = await binod.post("/api/checkout/orders", { addressId: S.binodHome, paymentMethod: "COD", expectedTotal: q.total, idempotencyKey: newKey() });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, "CART_NOT_READY");
    assert.equal((await ordersOf(BINOD.email)).length, 0);
    assert.equal((await binod.post("/api/cart/items", { productId: scarce.id })).status, 409, "and it can't be added to a cart either");
  });

  test("an unpaid order runs out of time: it is cancelled, the stock comes back, and the next customer can buy", async () => {
    await db.query("UPDATE orders SET expires_at = now() - interval '1 minute' WHERE order_number = $1", [S.scarceOrder]);
    assert.equal((await asha.post(`/api/orders/${S.scarceOrder}/payments`, {})).json.error.code, "ORDER_EXPIRED");
    assert.equal(await expireUnpaidOrders(), 1);
    const expired = await orderRow(S.scarceOrder);
    assert.equal(expired.status, "CANCELLED");
    assert.equal(expired.payment_status, "CANCELLED");
    assert.equal(await reserved(scarce.id), 0);
    S.scarceGateway = expired.gateway_order_id;

    const ok = await place(binod, S.binodHome, "COD");
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.order.status, "PLACED");
    S.binodOrder = ok.json.order.orderNumber;
  });

  test("money that arrives for an order that timed out, when the items are gone: recorded and refunded automatically", async () => {
    clearDevOutbox();
    const late = mock.pay(S.scarceGateway, { method: "upi" });
    const hook = await webhook(mock.webhook("payment.captured", { payment: late.payment }));
    assert.equal(hook.json.result, "LATE_PAYMENT_REFUNDED");
    const order = (await asha.get(`/api/orders/${S.scarceOrder}`)).json.order;
    assert.equal(order.status, "CANCELLED");
    assert.equal(order.paymentStatus, "REFUNDED");
    assert.equal(order.amountRefunded, order.total);
    assert.equal(mock.payments.get(late.payment.id).status, "refunded");
    assert.equal((await mails(ASHA.email, /Refund started/)).length, 1);
    assert.equal((await mails(ASHA.email, /Payment received/)).length, 0);
  });

  test("two customers, one last piece, at the same moment: one order", async () => {
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '1'), stock_reserved = 0 WHERE id = $1", [discounted.id]);
    await fillCart(asha, [{ productId: discounted.id, quantity: 1 }]);
    await fillCart(binod, [{ productId: discounted.id, quantity: 1 }]);
    const [qa, qb] = [await getQuote(asha, S.home, "COD"), await getQuote(binod, S.binodHome, "COD")];
    const [a, b] = await Promise.all([
      asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: qa.total, idempotencyKey: newKey() }),
      binod.post("/api/checkout/orders", { addressId: S.binodHome, paymentMethod: "COD", expectedTotal: qb.total, idempotencyKey: newKey() })
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409], a.text + b.text);
    assert.equal(await reserved(discounted.id), 1);
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '20'), stock_reserved = 0 WHERE id = $1", [discounted.id]);
    await asha.del("/api/cart");
    await binod.del("/api/cart");
  });
});

describe("12 + 20. prices change", () => {
  test("12. the price changes after the customer saw the total: nothing is charged until they have seen the new one", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 1, selection: { sizeId: roomy.sizes[0].id } }]);
    const seen = await getQuote(asha, S.home, "COD");
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{price}', to_jsonb((data->>'price')::int + 200)) WHERE id = $1", [roomy.id]);
    const count = (await ordersOf(ASHA.email)).length;
    const key = newKey();
    const stale = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: seen.total, idempotencyKey: key });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, "TOTAL_CHANGED");
    assert.equal((await ordersOf(ASHA.email)).length, count, "no order at the old price");
    const now = await getQuote(asha, S.home, "COD");
    assert.equal(now.subtotal, seen.subtotal + 200);
    assert.equal(now.priceChanges.length, 1);
    assert.deepEqual([now.priceChanges[0].from, now.priceChanges[0].to], [seen.items[0].unitPrice, seen.items[0].unitPrice + 200]);
    const ok = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: now.total, idempotencyKey: key });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.order.items[0].unitPrice, seen.items[0].unitPrice + 200);
    S.priced = ok.json.order.orderNumber;
    S.pricedUnit = ok.json.order.items[0].unitPrice;
    S.pricedTotal = ok.json.order.total;
  });

  test("20. a later price change, a new product name or a deleted address never changes an order that was placed", async () => {
    const before = (await asha.get(`/api/orders/${S.priced}`)).json.order;
    await db.query("UPDATE catalog_products SET name = 'Renamed', data = jsonb_set(jsonb_set(data, '{price}', '99999'), '{name}', '\"Renamed\"') WHERE id = $1", [roomy.id]);
    const spare = (await asha.post("/api/addresses", { ...HOME, line1: "77 Temple Lane" })).json.address.id;
    await fillCart(asha, [{ productId: roomy.id, quantity: 1, selection: { sizeId: roomy.sizes[0].id } }]);
    assert.ok((await getQuote(asha, spare, "COD")).items[0].unitPrice > 90000, "new carts see the new price");
    await asha.del("/api/cart");
    assert.equal((await asha.patch(`/api/addresses/${S.home}`, { ...HOME, line1: "1 Changed Street", city: "Cuttack" })).status, 200);

    const after = (await asha.get(`/api/orders/${S.priced}`)).json.order;
    assert.equal(after.items[0].unitPrice, S.pricedUnit);
    assert.equal(after.items[0].name, before.items[0].name);
    assert.equal(after.total, S.pricedTotal);
    assert.deepEqual(after.shippingAddress, before.shippingAddress);
    assert.equal(after.shippingAddress.line1, "12 Station Road");
    assert.equal((await asha.del(`/api/addresses/${S.home}`)).status, 200);
    assert.deepEqual((await asha.get(`/api/orders/${S.priced}`)).json.order.shippingAddress, before.shippingAddress);
    S.home = spare;
    // Put the product back as the catalogue files have it (the import only rewrites rows whose source changed).
    await db.query("UPDATE catalog_products SET source_hash = 'edited-by-test' WHERE id = $1", [roomy.id]);
    await syncCatalog();
    assert.equal((await row("SELECT name FROM catalog_products WHERE id = $1", [roomy.id])).name, roomy.name);
  });
});

describe("14 + 15. sessions and other people's orders", () => {
  test("15. an order can only be read, paid, cancelled or retried by its owner", async () => {
    const other = S.paid;
    for (const r of [
      await binod.get(`/api/orders/${other}`),
      await binod.post(`/api/orders/${other}/cancel`),
      await binod.post(`/api/orders/${other}/payments`, {}),
      await binod.post(`/api/orders/${other}/payments/refresh`),
      await binod.post(`/api/orders/${other}/payments/outcome`, { reason: "failed" }),
      await binod.post(`/api/orders/${other}/payments/verify`, proofOf(S.upiPaid))
    ])
      assert.equal(r.status, 404, r.text);
    assert.equal((await binod.get("/api/orders/FX-999999")).status, 404);
    assert.equal((await binod.get("/api/orders/1%20OR%201=1")).status, 404);
    assert.deepEqual((await binod.get("/api/orders")).json.items.map((o) => o.orderNumber), [S.binodOrder]);
    assert.ok((await asha.get("/api/orders")).json.total >= 8);
    assert.equal((await asha.get("/api/orders")).json.items.some((o) => o.orderNumber === S.binodOrder), false);
    // customers can't use the admin order tools
    assert.equal((await asha.get("/api/admin/orders")).status, 403);
    assert.equal((await asha.post(`/api/admin/orders/${S.paid}/refund`, {})).status, 403);
  });

  test("14. logging out ends access at once; a payment made meanwhile still reaches the order through the webhook", async () => {
    await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
    const r = await place(asha, S.home, "ONLINE", { channel: "upi" });
    const number = r.json.order.orderNumber;
    assert.equal((await asha.post("/api/auth/logout")).status, 200);
    assert.equal((await asha.get(`/api/orders/${number}`)).status, 401);
    assert.equal((await asha.get("/api/checkout/quote")).status, 401);
    const paid = mock.pay(r.json.payment.gatewayOrderId, { method: "upi" });
    assert.equal((await asha.post(`/api/orders/${number}/payments/verify`, proofOf(paid))).status, 401, "no session, no callback");
    assert.equal((await orderRow(number)).payment_status, "PENDING");
    assert.equal((await webhook(mock.webhook("order.paid", { payment: paid.payment }))).json.result, "ORDER_PLACED");
    assert.equal((await asha.post("/api/auth/login", { identifier: ASHA.email, password: PASSWORD })).status, 200);
    const order = (await asha.get(`/api/orders/${number}`)).json.order;
    assert.equal(order.status, "PLACED");
    assert.equal(order.paymentStatus, "PAID");
    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 0);
    S.forAdmin = number;
  });
});

describe("after the order: FrameX staff", () => {
  test("an admin moves an order forward; shipped and delivered emails go out once", async () => {
    clearDevOutbox();
    const list = await admin.get("/api/admin/orders?status=PLACED");
    assert.ok(list.json.items.some((o) => o.orderNumber === S.forAdmin));
    const detail = (await admin.get(`/api/admin/orders/${S.forAdmin}`)).json.order;
    assert.deepEqual(detail.nextStatuses, ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]);
    assert.ok(detail.gatewayOrderId);
    for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const r = await admin.post(`/api/admin/orders/${S.forAdmin}/status`, { status });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.order.status, status);
    }
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/status`, { status: "SHIPPED" })).status, 409, "no going back");
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/status`, { status: "CANCELLED" })).status, 409, "a delivered order can't be cancelled");
    assert.equal((await mails(ASHA.email, /has been shipped/)).length, 1);
    assert.equal((await mails(ASHA.email, /was delivered/)).length, 1);
    const timeline = (await asha.get(`/api/orders/${S.forAdmin}`)).json.order.events.filter((e) => e.kind === "ORDER").map((e) => e.status);
    assert.deepEqual(timeline, ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);
    assert.ok((await admin.get("/api/admin/audit")).json.items.some((l) => l.action === "ORDER_STATUS_CHANGED" && l.targetId === S.forAdmin));
  });

  test("Cash on Delivery becomes PAID when the order is delivered, not before", async () => {
    assert.equal((await admin.post(`/api/admin/orders/${S.binodOrder}/status`, { status: "SHIPPED" })).json.order.paymentStatus, "PENDING");
    const delivered = (await admin.post(`/api/admin/orders/${S.binodOrder}/status`, { status: "DELIVERED" })).json.order;
    assert.equal(delivered.status, "DELIVERED");
    assert.equal(delivered.paymentStatus, "PAID");
    assert.deepEqual((await attempts(S.binodOrder)).map((p) => [p.provider, p.status, p.verified_via]), [["cod", "PAID", "delivery"]]);
  });

  test("part refund, then the rest; more than was paid is refused; the gateway's refund webhook is applied once", async () => {
    clearDevOutbox();
    const total = (await orderRow(S.forAdmin)).total;
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, { amount: total + 1 })).status, 422);
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, { amount: 1.5 })).status, 422);
    mock.state.refundStatus = "pending"; // the gateway takes its time
    const part = await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, { amount: 100, reason: "Damaged corner" });
    assert.equal(part.status, 200, part.text);
    assert.equal(part.json.order.paymentStatus, "PAID", "not refunded until the gateway says so");
    assert.equal(part.json.order.refunds[0].status, "PENDING");
    const refund = [...mock.refunds.values()].find((f) => f.amount === 10000 && f.status === "pending");
    const news = mock.webhook("refund.processed", { refund: { ...refund, status: "processed" }, payment: mock.payments.get(refund.payment_id) });
    assert.equal((await webhook(news)).json.result, "REFUND_PROCESSED");
    assert.equal((await webhook(news)).json.duplicate, true);
    assert.equal((await webhook(mock.webhook("refund.processed", { refund: { ...refund, status: "processed" }, payment: mock.payments.get(refund.payment_id) }))).json.result, "ALREADY_APPLIED");
    let order = (await admin.get(`/api/admin/orders/${S.forAdmin}`)).json.order;
    assert.equal(order.paymentStatus, "PARTIALLY_REFUNDED");
    assert.equal(order.amountRefunded, 100);
    assert.equal(order.refundable, total - 100);

    mock.state.refundStatus = "processed";
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, { amount: total })).status, 422, "only what is left");
    order = (await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, {})).json.order;
    assert.equal(order.paymentStatus, "REFUNDED");
    assert.equal(order.amountRefunded, total);
    assert.equal((await admin.post(`/api/admin/orders/${S.forAdmin}/refund`, {})).status, 409);
    assert.equal((await mails(ASHA.email, /Refund started/)).length, 2);
    assert.equal((await mails(ASHA.email, /Refund completed/)).length, 2);
  });

  test("an admin cancels a placed online order: stock back, full refund, one email", async () => {
    clearDevOutbox();
    const held = await reserved(roomy.id);
    const r = await admin.post(`/api/admin/orders/${S.paid}/status`, { status: "CANCELLED", note: "The shop can't make this size." });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.order.status, "CANCELLED");
    assert.equal(r.json.order.paymentStatus, "REFUNDED");
    assert.equal(await reserved(roomy.id), held - 1);
    const sent = await mails(ASHA.email, /was cancelled/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /can't make this size/);
    assert.match(sent[0].text, /refund of ₹/);
  });

  test("when no gateway is configured, online payment is not offered and can't be chosen", async () => {
    const { config } = await import("../src/config.js");
    const keep = config.payments.provider;
    config.payments.provider = "none";
    try {
      await fillCart(asha, [{ productId: roomy.id, quantity: 1 }]);
      const q = await getQuote(asha, S.home, "ONLINE");
      assert.equal(q.payment.online.available, false);
      assert.deepEqual(q.payment.online.methods, []);
      assert.equal(q.payment.cod.available, true);
      const count = (await ordersOf(ASHA.email)).length;
      const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: newKey() });
      assert.equal(r.status, 503);
      assert.equal(r.json.error.code, "PAYMENT_NOT_CONFIGURED");
      assert.equal((await ordersOf(ASHA.email)).length, count);
      assert.deepEqual((await new Client().get("/api/config")).json.features.payments, { online: false, provider: null, mode: null, cod: true });
    } finally {
      config.payments.provider = keep;
    }
  });

  test("no order is ever PAID without a payment the gateway confirmed (or cash on delivery)", async () => {
    const { rows } = await db.query(
      `SELECT o.order_number FROM orders o
        WHERE o.payment_status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
                             AND ((p.provider = 'cod' AND p.verified_via = 'delivery') OR (p.gateway_payment_id IS NOT NULL AND p.verified_via IN ('checkout', 'webhook', 'reconcile'))))`
    );
    assert.deepEqual(rows, []);
    // and every gateway payment that paid an order really is captured (or refunded) at the gateway, for the order's amount
    const paid = (await db.query("SELECT p.gateway_payment_id, o.total FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.provider = 'razorpay' AND p.gateway_payment_id IS NOT NULL AND p.status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')")).rows;
    assert.ok(paid.length >= 6);
    for (const p of paid) {
      const at = mock.payments.get(p.gateway_payment_id);
      assert.ok(at && ["captured", "refunded"].includes(at.status), p.gateway_payment_id);
      assert.equal(at.amount, p.total * 100);
    }
  });
});

describe("FrameX Studio designs in an order", () => {
  test("a personalised design is ordered with its complete design and its uploaded photos", async () => {
    const { studio, templates: templateEngine } = siteEngine();
    const template = seed.templates.find((t) => t.available !== false);
    const ctx = studio.context({ template });
    const cfg = JSON.parse(JSON.stringify(studio.defaults(ctx)));
    const slots = templateEngine.slotsOf(template);
    slots.forEach((slot, i) => {
      cfg.photos[slot] = `photo-${i + 1}`;
      cfg.photoMeta[slot] = { w: 1600, h: 1200 };
    });
    await asha.del("/api/cart");
    assert.equal((await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-order0001", config: cfg, thumbnail: "data:image/jpeg;base64,AAAA" } })).status, 201);
    clearDevOutbox();
    const r = await place(asha, S.home, "COD");
    assert.equal(r.status, 201, r.text);
    const order = r.json.order;
    assert.equal(order.needsPhotos, false, "the photos are part of the order: nothing has to be sent separately");
    assert.equal(order.photoCount, slots.length);
    assert.deepEqual(order.items[0].photos.map((p) => p.slot), [...slots]);
    assert.equal(order.items[0].kind, "studio");
    assert.equal(order.items[0].name, template.title);
    assert.equal(order.items[0].unitPrice, studio.price(cfg, ctx).total, "priced by the server from the design's options");
    assert.equal(order.items[0].design.photoCount, slots.length);
    assert.equal(order.items[0].shopName, "FrameX custom designs");
    const stored = await row("SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [order.orderNumber]);
    assert.equal(stored.template_id, template.id);
    assert.equal(stored.customization.templateId, template.id, "the whole design is kept with the order");
    assert.equal(stored.design_ref, "d-order0001");
    assert.equal((await asha.get("/api/cart")).json.cart.items.length, 0);
    const mail = await mails(ASHA.email, /placed/);
    assert.equal(mail.length, 1);
    assert.doesNotMatch(mail[0].text, /send your photos/);
    assert.match(mail[0].text, /printed in the same original quality you uploaded/);
  });
});

describe("Buy Now: one item ordered directly, without the cart", () => {
  const buy = (client, addressId, method, buyNow, extra = {}) => client.post("/api/checkout/quote", { addressId, paymentMethod: method, buyNow }).then((q) => client.post("/api/checkout/orders", { addressId, paymentMethod: method, expectedTotal: q.json.quote.total, idempotencyKey: newKey(), buyNow, ...extra }));

  test("the item is checked and priced by the server exactly like a cart line; the cart is left alone", async () => {
    clearDevOutbox();
    const inCart = await fillCart(asha, [{ productId: discounted.id, quantity: 1 }]);
    const sel = { sizeId: roomy.sizes[1].id };
    const item = { productId: roomy.id, quantity: 2, selection: sel, note: "Leave at the gate", unitPrice: 1, price: 1, name: "Free" };
    const q = (await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "COD", buyNow: item })).json.quote;
    assert.equal(q.mode, "buy-now");
    assert.equal(q.ok, true);
    assert.equal(q.items.length, 1, "only this item, not the cart");
    assert.equal(q.items[0].name, roomy.name);
    assert.equal(q.items[0].unitPrice, unit(roomy, sel), "the server's price, not the one the browser sent");
    assert.equal(q.subtotal, unit(roomy, sel) * 2);
    assert.equal(q.total, q.subtotal - q.discount + q.tax + q.shippingFee + q.codFee);

    const held = await reserved(roomy.id);
    const key = newKey();
    const body = { addressId: S.home, paymentMethod: "COD", expectedTotal: q.total, idempotencyKey: key, buyNow: item };
    const [a, b] = await Promise.all([asha.post("/api/checkout/orders", body), asha.post("/api/checkout/orders", body)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201], a.text + b.text);
    assert.equal(a.json.order.orderNumber, b.json.order.orderNumber, "pressed twice: one order");
    const order = a.json.order;
    assert.equal(order.status, "PLACED");
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].productId, roomy.id);
    assert.equal(order.items[0].quantity, 2);
    assert.equal(order.items[0].note, "Leave at the gate");
    assert.equal(order.items[0].unitPrice, unit(roomy, sel));
    assert.equal(order.total, q.total);
    assert.equal(await reserved(roomy.id), held + 2, "stock was taken");
    const cart = (await asha.get("/api/cart")).json.cart;
    assert.deepEqual(cart.items.map((i) => [i.id, i.quantity]), inCart.items.map((i) => [i.id, i.quantity]), "what was in the cart is still there");
    assert.equal((await mails(ASHA.email, /placed: pay/)).length, 1);
  });

  test("things that can't be bought are refused, with nothing created", async () => {
    const count = (await ordersOf(ASHA.email)).length;
    const tryBuy = async (buyNow) => {
      const q = await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "COD", buyNow });
      if (q.status !== 200) return { quote: q.status, order: null };
      const o = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: q.json.quote.total, idempotencyKey: newKey(), buyNow });
      return { quote: q.json.quote, order: o };
    };
    const unknown = await tryBuy({ productId: "p-does-not-exist", quantity: 1 });
    assert.equal(unknown.quote.ok, false);
    assert.equal(unknown.quote.issues[0].code, "PRODUCT_UNAVAILABLE");
    assert.equal(unknown.order.status, 409);
    const badOption = await tryBuy({ productId: roomy.id, quantity: 1, selection: { sizeId: "giant" } });
    assert.equal(badOption.quote.issues[0].code, "OPTION_UNAVAILABLE");
    assert.equal(badOption.order.status, 409);
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '2'), stock_reserved = 0 WHERE id = $1", [scarce.id]); // two left
    const tooMany = await tryBuy({ productId: scarce.id, quantity: 3 });
    assert.equal(tooMany.quote.issues[0].code, "QUANTITY_LIMIT");
    assert.equal(tooMany.order.status, 409);
    assert.equal((await tryBuy({ productId: roomy.id, quantity: 0 })).quote, 422);
    assert.equal((await tryBuy({ productId: roomy.id, quantity: 21 })).quote, 422);
    assert.equal((await tryBuy({ quantity: 1 })).quote, 422);
    assert.equal((await ordersOf(ASHA.email)).length, count);
    assert.equal((await new Client().post("/api/checkout/quote", { buyNow: { productId: roomy.id } })).status, 401, "Buy Now needs a login too");
  });

  test("Buy Now with online payment: paid only after the server verified it; the cart is still untouched", async () => {
    const before = (await asha.get("/api/cart")).json.cart;
    const item = { productId: roomy.id, quantity: 1 };
    const q = (await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "ONLINE", buyNow: item })).json.quote;
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: newKey(), buyNow: item });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    assert.equal(r.json.payment.amount, q.total * 100);
    const paid = mock.pay(r.json.payment.gatewayOrderId, { method: "upi" });
    const v = await asha.post(`/api/orders/${r.json.order.orderNumber}/payments/verify`, proofOf(paid));
    assert.equal(v.json.order.status, "PLACED");
    assert.equal(v.json.order.paymentStatus, "PAID");
    assert.equal(v.json.order.items.length, 1);
    const after = (await asha.get("/api/cart")).json.cart;
    assert.deepEqual(after.items.map((i) => [i.id, i.quantity]), before.items.map((i) => [i.id, i.quantity]));
  });

  test("a personalised design can be bought directly too", async () => {
    const { studio, templates: templateEngine } = siteEngine();
    const template = seed.templates.find((t) => t.available !== false);
    const ctx = studio.context({ template });
    const cfg = JSON.parse(JSON.stringify(studio.defaults(ctx)));
    templateEngine.slotsOf(template).forEach((slot, i) => (cfg.photos[slot] = `photo-${i + 1}`));
    const item = { kind: "studio", design: { id: "d-buynow001", config: cfg, thumbnail: "data:image/jpeg;base64,AAAA" } };
    const r = await buy(asha, S.home, "COD", item);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.items[0].kind, "studio");
    assert.equal(r.json.order.items[0].unitPrice, studio.price(cfg, ctx).total);
    assert.equal(r.json.order.needsPhotos, false);
    const stored = await row("SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [r.json.order.orderNumber]);
    assert.equal(stored.template_id, template.id);
    assert.equal(stored.cart_item_id, null);
    const unfinished = await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "COD", buyNow: { kind: "studio", design: { id: "d-buynow002", config: cfg }, photos: {} } });
    assert.equal(unfinished.json.quote.ok, false);
    assert.equal(unfinished.json.quote.issues[0].code, "PHOTOS_REQUIRED");
    assert.equal((await asha.post("/api/checkout/quote", { addressId: S.home, buyNow: { kind: "studio", design: { id: "../etc", config: cfg } } })).status, 422);
  });
});

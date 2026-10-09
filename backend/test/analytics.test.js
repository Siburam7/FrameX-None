/* ==========================================================================
   Analytics and the admin reports: run with "npm test" in backend/.

   A real server on a random port and an in-memory PostgreSQL. Two kinds of
   data are used:
     - orders, payments, refunds and painting requests written straight into
       the tables with known dates and amounts, so every figure of a report
       can be checked against a number worked out by hand below;
     - real requests (sign-up, log in, add to cart, Cash on Delivery, an
       online payment through the stand-in gateway, visitor statistics from
       "the website"), to check what the server records by itself.

   The fixture, days counted back from today (India time), amounts in rupees:
     O1  COD      today   placed, not paid yet                 1000
     O2  online   3 days  paid, delivered (Razorpay, UPI)      2500
     O3  online   10 days paid (Cashfree, card); 1500 refunded 2 days ago;  4000
     O4  COD      20 days delivered and paid 5 days ago         800
     O5  online   6 days  cancelled, never paid                1200
     O6  online   today   waiting for payment                   900
     O7  online   2 days  paid, TEST order                     9999
     O8  online   45 days paid                                 3000
     O9  online   4 days  paid at the second attempt (Cashfree) 1700   an artist's artwork
     R1  painting 6 days  accepted 5 days ago, advance 2000 paid 5 days ago
     R2  painting 2 days  declined 1 day ago
     R3  painting 15 days advance 1200 paid 13 days ago, balance 1800 paid 1 day ago
     R4  painting 3 days  TEST, advance 4000 paid 1 day ago
     R5  painting 8 days  advance 1000 paid 7 days ago, cancelled 3 days ago, refund recorded 1 day ago
   ========================================================================== */
import { createMockRazorpay } from "./support/mock-razorpay.js";

const mock = await createMockRazorpay().listen();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
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
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.COD_FEE = "40";
process.env.GA4_MEASUREMENT_ID = "G-TEST1234AB";
process.env.ANALYTICS_UTC_OFFSET_MINUTES = "330";
process.env.ANALYTICS_ABANDONED_CART_HOURS = "24";

const { default: assert } = await import("node:assert/strict");
const { default: crypto } = await import("node:crypto");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const analytics = await import("../src/services/analytics-service.js");
const { resolveRange } = await import("../src/services/admin-analytics-service.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");

let server;
let base;
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

class Client {
  cookie = "";
  async request(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", "User-Agent": CHROME, ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
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
  post = (path, body = {}, headers) => this.request("POST", path, body, headers);
  del = (path) => this.request("DELETE", path);
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const PASSWORD = "Sunrise-Frame-42";
const ASHA = { name: "Asha Rout", email: "asha@example.com", phone: "9876500011", password: PASSWORD, confirmPassword: PASSWORD };
const BINOD = { name: "Binod Das", email: "binod@example.com", phone: "9876500022", password: PASSWORD, confirmPassword: PASSWORD };
const HOME = { fullName: "Asha Rout", phone: "98765 00011", line1: "12 Station Road", line2: "Near Bus Stand", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client();
const binod = new Client();
const admin = new Client();
const visitor = new Client();
const U = {}; // user ids
const O = {}; // order numbers of the fixture
const S = {};

/* ---- time: a day is a day in India (UTC+5:30) ---- */
const OFFSET = 330;
const DAY = 86_400_000;
const localDay = (d) => new Date(d.getTime() + OFFSET * 60_000).toISOString().slice(0, 10);
const TODAY = localDay(new Date());
const startOf = (ymd) => new Date(Date.parse(ymd + "T00:00:00Z") - OFFSET * 60_000);
/** Noon, `days` days ago. */
const ago = (days, hour = 12) => new Date(startOf(TODAY).getTime() - days * DAY + hour * 3_600_000);
const dateAgo = (days) => localDay(ago(days));

const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;
const report = async (name, query = "range=7d", client = admin) => {
  const r = await client.get(`/api/admin/analytics/${name}?${query}`);
  assert.equal(r.status, 200, r.text);
  return r.json;
};
const sum = (list, field) => list.reduce((total, x) => total + x[field], 0);

/* ---- the fixture ---- */
let seq = 500_000;
async function order(userId, { method, status, payment, created, paid = null, cancelled = null, delivered = null, test = false, items, tax = 0, shipping = 0, codFee = 0, refunded = 0, gateway = null, instrument = null, attempts }) {
  const id = newId();
  const number = `FX-${++seq}`;
  const subtotal = items.reduce((total, i) => total + i.price * i.qty, 0);
  const total = subtotal + tax + shipping + codFee;
  await db.query(
    `INSERT INTO orders (id, order_number, user_id, idempotency_key, status, payment_method, payment_status, payment_gateway, payment_instrument, subtotal, discount, tax, shipping_fee, cod_fee, total,
                         amount_refunded, item_count, shipping_address, customer_name, customer_email, placed_at, paid_at, cancelled_at, delivered_at, created_at, updated_at, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14, $15, $16, '{}', 'Fixture Customer', 'fixture@example.com', $17, $18, $19, $20, $17, $17, $21)`,
    [id, number, userId, crypto.randomUUID(), status, method, payment, method === "COD" ? null : gateway, instrument, subtotal, tax, shipping, codFee, total, refunded, items.length, created, paid, cancelled, delivered, test]
  );
  let position = 0;
  for (const i of items)
    await db.query(
      `INSERT INTO order_items (id, order_id, position, kind, product_id, template_id, shop_ref, shop_name, name, quantity, unit_list_price, unit_discount, unit_price, line_total, seller_type, artist_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $11, $12, $13, $14)`,
      [newId(), id, position++, i.kind || "PRODUCT", i.product || null, i.template || null, i.shop, i.shopName, i.name, i.qty, i.price, i.price * i.qty, i.seller, i.artist || null]
    );
  const payIds = [];
  let attempt = 0;
  for (const a of attempts) {
    const payId = newId();
    payIds.push(payId);
    await db.query(
      `INSERT INTO payments (id, order_id, attempt, provider, status, amount, amount_refunded, gateway_payment_id, verified_via, paid_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
      [payId, id, ++attempt, a.provider, a.status, total, a.refunded || 0, a.paidAt ? `pay_${number}_${attempt}` : null, a.paidAt ? a.via || "checkout" : null, a.paidAt || null, a.created || created]
    );
  }
  return { id, number, total, payIds };
}

async function painting(userId, artistId, { price, percent = 40, status, payment = "UNPAID", refund = "NONE", paidSoFar = 0, created, responded = null, cancelled = null, test = false, payments = [] }) {
  const id = newId();
  const number = `CP-${++seq}`;
  const advance = Math.round((price * percent) / 100);
  await db.query(
    `INSERT INTO painting_requests (id, request_number, user_id, artist_id, service, price, advance_percent, advance_amount, balance_amount, status, payment_status, refund_status, amount_paid,
                                    shipping_address, customer_name, customer_email, idempotency_key, responded_at, cancelled_at, created_at, updated_at, is_test)
     VALUES ($1, $2, $3, $4, '{}', $5, $6, $7, $8, $9, $10, $11, $12, '{}', 'Fixture Customer', 'fixture@example.com', $13, $14, $15, $16, $16, $17)`,
    [id, number, userId, artistId, price, percent, advance, price - advance, status, payment, refund, paidSoFar, crypto.randomUUID(), responded, cancelled, created, test]
  );
  for (const p of payments)
    await db.query(
      `INSERT INTO painting_payments (id, request_id, stage, attempt, provider, status, amount, gateway_payment_id, verified_via, paid_at, created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'cashfree', $4, $5, $6, 'checkout', $7, $7, $7)`,
      [newId(), id, p.stage, p.status || "PAID", p.amount, `cfpay_${number}_${p.stage}`, p.at]
    );
  return { id, number };
}

const STUDIO_LINE = { shop: "shop-001", shopName: "FrameX Studio", seller: "FRAME_X_STUDIO" };

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
  U.asha = (await row("SELECT id FROM users WHERE email = 'asha@example.com'")).id;
  U.binod = (await row("SELECT id FROM users WHERE email = 'binod@example.com'")).id;
  // A customer who joined 40 days ago.
  U.chitra = newId();
  await db.query("INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at) VALUES ($1, 'Chitra Sahu', 'chitra@example.com', '+919876500033', $2, 'CUSTOMER', 'ACTIVE', $3)", [U.chitra, await hashPassword(PASSWORD), ago(40)]);

  // An artist with one approved artwork in the catalogue.
  S.artist = newId();
  await db.query("INSERT INTO artists (id, artist_code, username, name, city, state) VALUES ($1, 'FRX-ART-9001', 'ranjit', 'Ranjit Behera', 'Cuttack', 'Odisha')", [S.artist]);
  await db.query(
    "INSERT INTO catalog_products (id, slug, name, shop_ref, shop_name, status, data, source_hash, source, owner_artist_id) VALUES ('aw-fixture001', 'monsoon-ghat', 'Monsoon Ghat', 'FRX-ART-9001', 'Ranjit Behera', 'ACTIVE', '{}', 'fixture', 'artist', $1)",
    [S.artist]
  );
  S.template = (await row("SELECT id, title FROM catalog_templates ORDER BY id LIMIT 1"));
  const frame = (qty, price) => ({ product: "p-001", name: "Ace of Us", qty, price, ...STUDIO_LINE });
  const shopLine = (price) => ({ product: "p-002", name: "Second Frame", qty: 1, price, shop: "shop-002", shopName: "Kalinga Frames", seller: "SHOP" });

  O.o1 = await order(U.asha, { method: "COD", status: "PLACED", payment: "PENDING", created: ago(0), items: [{ kind: "STUDIO", template: S.template.id, name: "Birthday design", qty: 1, price: 900, ...STUDIO_LINE }], shipping: 60, codFee: 40, attempts: [{ provider: "cod", status: "PENDING" }] });
  O.o2 = await order(U.asha, { method: "ONLINE", status: "DELIVERED", payment: "PAID", gateway: "razorpay", instrument: "upi", created: ago(3), paid: ago(3), delivered: ago(2), items: [frame(2, 1000)], tax: 360, shipping: 140, attempts: [{ provider: "razorpay", status: "PAID", paidAt: ago(3) }] });
  O.o3 = await order(U.binod, { method: "ONLINE", status: "DELIVERED", payment: "PARTIALLY_REFUNDED", gateway: "cashfree", instrument: "card", created: ago(10), paid: ago(10), delivered: ago(8), refunded: 1500, items: [shopLine(3500)], tax: 500, attempts: [{ provider: "cashfree", status: "PARTIALLY_REFUNDED", paidAt: ago(10), refunded: 1500 }] });
  O.o4 = await order(U.asha, { method: "COD", status: "DELIVERED", payment: "PAID", created: ago(20), paid: ago(5), delivered: ago(5), items: [frame(1, 700)], shipping: 60, codFee: 40, attempts: [{ provider: "cod", status: "PAID", paidAt: ago(5), via: "delivery", created: ago(20) }] });
  O.o5 = await order(U.binod, { method: "ONLINE", status: "CANCELLED", payment: "CANCELLED", gateway: "razorpay", created: ago(6), cancelled: ago(6), items: [shopLine(1000)], shipping: 200, attempts: [{ provider: "razorpay", status: "CANCELLED" }] });
  O.o6 = await order(U.binod, { method: "ONLINE", status: "PENDING_PAYMENT", payment: "PENDING", gateway: "razorpay", created: ago(0), items: [frame(1, 900)], attempts: [{ provider: "razorpay", status: "PENDING" }] });
  O.o7 = await order(U.asha, { method: "ONLINE", status: "PLACED", payment: "PAID", gateway: "razorpay", instrument: "upi", created: ago(2), paid: ago(2), test: true, items: [frame(1, 9999)], attempts: [{ provider: "razorpay", status: "PAID", paidAt: ago(2) }] });
  O.o8 = await order(U.chitra, { method: "ONLINE", status: "DELIVERED", payment: "PAID", gateway: "razorpay", instrument: "netbanking", created: ago(45), paid: ago(45), delivered: ago(40), items: [frame(3, 1000)], attempts: [{ provider: "razorpay", status: "PAID", paidAt: ago(45) }] });
  O.o9 = await order(U.binod, {
    method: "ONLINE", status: "CONFIRMED", payment: "PAID", gateway: "cashfree", instrument: "upi", created: ago(4), paid: ago(4),
    items: [{ product: "aw-fixture001", name: "Monsoon Ghat", qty: 1, price: 1500, shop: "FRX-ART-9001", shopName: "Ranjit Behera", seller: "ARTIST", artist: S.artist }],
    shipping: 200,
    attempts: [{ provider: "cashfree", status: "FAILED" }, { provider: "cashfree", status: "PAID", paidAt: ago(4) }]
  });
  // Refunds: 1500 of O3 went through 2 days ago; 300 of O2 was asked for yesterday and is still on its way.
  await db.query("INSERT INTO refunds (id, order_id, payment_id, provider, gateway_refund_id, amount, status, created_at, updated_at) VALUES ($1, $2, $3, 'cashfree', 'rf_1', 1500, 'PROCESSED', $4, $5)", [newId(), O.o3.id, O.o3.payIds[0], ago(3), ago(2)]);
  await db.query("INSERT INTO refunds (id, order_id, payment_id, provider, amount, status, created_at, updated_at) VALUES ($1, $2, $3, 'razorpay', 300, 'PENDING', $4, $4)", [newId(), O.o2.id, O.o2.payIds[0], ago(1)]);
  // What the gateway told the server this week: one payment, and one notification about an order that was already paid.
  for (const [eventId, result] of [["evt_1", "ORDER_PLACED"], ["evt_2", "ALREADY_APPLIED"]])
    await db.query("INSERT INTO payment_events (id, provider, event_id, event_type, result, processed_at, received_at) VALUES ($1, 'razorpay', $2, 'payment.captured', $3, $4, $4)", [newId(), eventId, result, ago(3)]);

  S.r1 = await painting(U.asha, S.artist, { price: 5000, status: "PAINTING_IN_PROGRESS", payment: "ADVANCE_PAID", paidSoFar: 2000, created: ago(6), responded: ago(5), payments: [{ stage: "ADVANCE", amount: 2000, at: ago(5) }] });
  S.r2 = await painting(U.binod, S.artist, { price: 2000, status: "DECLINED", created: ago(2), responded: ago(1) });
  S.r3 = await painting(U.binod, S.artist, { price: 3000, status: "READY_FOR_DISPATCH", payment: "FULLY_PAID", paidSoFar: 3000, created: ago(15), responded: ago(14), payments: [{ stage: "ADVANCE", amount: 1200, at: ago(13) }, { stage: "BALANCE", amount: 1800, at: ago(1) }] });
  S.r4 = await painting(U.asha, S.artist, { price: 10000, status: "ADVANCE_PAID", payment: "ADVANCE_PAID", paidSoFar: 4000, created: ago(3), responded: ago(2), test: true, payments: [{ stage: "ADVANCE", amount: 4000, at: ago(1) }] });
  S.r5 = await painting(U.chitra, S.artist, { price: 2500, status: "CANCELLED", payment: "ADVANCE_PAID", refund: "REFUNDED", paidSoFar: 1000, created: ago(8), responded: ago(8), cancelled: ago(3), payments: [{ stage: "ADVANCE", amount: 1000, at: ago(7), status: "REFUNDED" }] });
  await db.query("INSERT INTO audit_logs (id, action, target_type, target_id, created_at) VALUES ($1, 'PAINTING_REFUND_RECORDED', 'painting_request', $2, $3)", [newId(), S.r5.number, ago(1)]);

  // Carts: Binod's was left three days ago with two frames in it; Chitra is filling hers right now.
  for (const [user, at] of [[U.binod, ago(3)], [U.chitra, new Date()]]) {
    const cart = newId();
    await db.query("INSERT INTO carts (id, user_id, created_at, updated_at) VALUES ($1, $2, $3, $3)", [cart, user, at]);
    await db.query("INSERT INTO cart_items (id, cart_id, kind, product_id, line_key, quantity, title, unit_price, created_at, updated_at) VALUES ($1, $2, 'PRODUCT', 'p-001', 'fixture', 2, 'Ace of Us', 500, $3, $3)", [newId(), cart, at]);
  }
  // "Added to cart", as the cart records it: twice this week, once 40 days ago.
  for (const [type, id, at] of [["product", "p-001", ago(2)], ["product", "p-001", ago(5)], ["template", S.template.id, ago(40)]])
    await db.query("INSERT INTO analytics_events (id, name, source, item_type, item_id, item_name, value, logged_in, occurred_at) VALUES ($1, 'add_to_cart', 'server', $2, $3, 'Fixture', 500, true, $4)", [newId(), type, id, at]);
  // Logins ten days ago: one that worked, one that did not.
  await db.query("INSERT INTO auth_events (id, kind, user_id, role, account_type, created_at) VALUES ($1, 'LOGIN', $2, 'CUSTOMER', 'customer', $3)", [newId(), U.asha, ago(10)]);
  await db.query("INSERT INTO auth_events (id, kind, user_id, role, account_type, reason, ip, created_at) VALUES ($1, 'LOGIN_FAILED', $2, 'CUSTOMER', 'customer', 'INVALID_CREDENTIALS', '203.0.113.9', $3)", [newId(), U.asha, ago(10)]);
});

after(async () => {
  await emailsSettled();
  server.close();
  mock.close();
  await db.close();
});

/* ========================================================================== */

describe("the reports' calendar", () => {
  test("a day is a day in India, and each range ends today", () => {
    // 19:00 UTC on 9 October is 00:30 on 10 October in India.
    const now = new Date("2026-10-09T19:00:00Z");
    const today = resolveRange({ range: "today" }, now);
    assert.deepEqual([today.fromDate, today.toDate, today.from.toISOString(), today.to.toISOString(), today.days, today.bucket], ["2026-10-10", "2026-10-10", "2026-10-09T18:30:00.000Z", "2026-10-10T18:30:00.000Z", 1, "hour"]);
    const week = resolveRange({ range: "7d" }, now);
    assert.deepEqual([week.fromDate, week.toDate, week.days, week.bucket], ["2026-10-04", "2026-10-10", 7, "day"]);
    assert.deepEqual([week.previous.from.toISOString(), week.previous.to.toISOString()], ["2026-09-26T18:30:00.000Z", "2026-10-03T18:30:00.000Z"], "the period before it has the same length");
    assert.deepEqual([resolveRange({ range: "30d" }, now).fromDate, resolveRange({ range: "90d" }, now).fromDate], ["2026-09-11", "2026-07-13"]);
    const custom = resolveRange({ range: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
    assert.deepEqual([custom.fromDate, custom.toDate, custom.days], ["2026-09-01", "2026-09-30", 30]);
    assert.equal(resolveRange({ range: "custom", from: "2026-10-01", to: "2026-12-31" }, now).toDate, "2026-10-10", "a period can't run past today");
    assert.equal(resolveRange({ range: "nonsense" }, now).key, "30d");
  });

  test("a custom period needs two real dates, in order, at most a year apart", async () => {
    for (const [query, field] of [
      ["range=custom", "from"],
      ["range=custom&from=2026-02-31&to=2026-03-05", "from"],
      ["range=custom&from=2026-03-01&to=03/05/2026", "to"],
      ["range=custom&from=2026-03-10&to=2026-03-01", "to"],
      ["range=custom&from=2999-01-01&to=2999-01-02", "from"],
      ["range=custom&from=2020-01-01&to=2026-01-01", "to"]
    ]) {
      const r = await admin.get(`/api/admin/analytics/sales?${query}`);
      assert.equal(r.status, 422, query);
      assert.ok(r.json.error.fields[field], `${query}: ${JSON.stringify(r.json.error.fields)}`);
    }
    assert.equal((await admin.get("/api/admin/analytics/sales?range=lastyear")).status, 422);
  });
});

describe("only FrameX admins can read reports and customer records", () => {
  const PATHS = ["analytics/overview", "analytics/traffic", "analytics/sales", "analytics/catalog", "analytics/sellers", "analytics/paintings", "analytics/accounts", "analytics/live"];
  test("a visitor is asked to log in; a customer is refused", async () => {
    for (const path of PATHS) {
      assert.equal((await visitor.get(`/api/admin/${path}`)).status, 401, path);
      assert.equal((await asha.get(`/api/admin/${path}`)).status, 403, path);
      assert.equal((await admin.get(`/api/admin/${path}`)).status, 200, path);
    }
    for (const client of [visitor, asha]) {
      const expected = client === visitor ? 401 : 403;
      assert.equal((await client.get(`/api/admin/users/${U.binod}`)).status, expected);
      assert.equal((await client.post(`/api/admin/orders/${O.o1.number}/test`, { test: true })).status, expected);
    }
    // A customer can't make themselves an admin by saying so.
    assert.equal((await asha.request("GET", "/api/admin/analytics/sales", undefined, { "X-Role": "ADMIN", Authorization: "Bearer admin" })).status, 403);
    assert.equal((await row("SELECT is_test FROM orders WHERE order_number = $1", [O.o1.number])).is_test, false, "the refused requests changed nothing");
  });
});

describe("orders and money come from the database's verified records", () => {
  test("last 7 days: created, paid, cancelled, gross, refunds and net are separate figures", async () => {
    const o = await report("overview");
    assert.deepEqual([o.range.key, o.range.from, o.range.to, o.range.days, o.range.bucket, o.range.utcOffsetMinutes], ["7d", dateAgo(6), TODAY, 7, "day", 330]);
    // created: O1 O2 O5 O6 O9.  paid: O2 (2500) + O4 (800, delivered 5 days ago) + O9 (1700).  cancelled: O5.
    assert.deepEqual([o.orders.created, o.orders.paid, o.orders.cancelled, o.orders.gross], [5, 3, 1, 5000]);
    // paintings paid this week: R1 advance 2000 + R3 balance 1800.  refunds: 1500 (O3) + 1000 (R5, recorded by an admin).
    assert.deepEqual([o.money.orders, o.money.paintings, o.money.gross, o.money.refunds, o.money.net], [5000, 3800, 8800, 2500, 6300]);
    // the week before: O3 4000 + R3 advance 1200 + R5 advance 1000
    assert.deepEqual([o.money.before.gross, o.orders.before.created, o.orders.before.paid], [6200, 1, 1]);
    assert.deepEqual(o.test, { orders: 1, paid: 9999 }, "the test order is reported on its own");
    assert.equal(sum(o.series, "gross"), o.money.gross, "the chart adds up to the card");
    assert.equal(sum(o.series, "orders"), o.orders.created);
    assert.equal(o.series.length, 7);
    const byDay = Object.fromEntries(o.series.map((p) => [p.key, p]));
    assert.deepEqual([byDay[TODAY].orders, byDay[dateAgo(3)].gross, byDay[dateAgo(5)].gross, byDay[dateAgo(1)].gross, byDay[dateAgo(6)].orders], [2, 2500, 2800, 1800, 1]);
  });

  test("the same orders in other periods: today, 30 days, 90 days, a custom period", async () => {
    const today = await report("overview", "range=today");
    assert.deepEqual([today.orders.created, today.orders.paid, today.money.gross, today.range.bucket, today.series.length, sum(today.series, "orders")], [2, 0, 0, "hour", 24, 2]);
    const month = await report("overview", "range=30d");
    // created: all but O8 (45 days) and the test order.  paid: O2 O3 O4 O9 = 9000.  paintings: 2000 + 1200 + 1800 + 1000.
    assert.deepEqual([month.orders.created, month.orders.paid, month.money.orders, month.money.paintings, month.money.gross, month.money.refunds, month.money.net], [7, 4, 9000, 6000, 15000, 2500, 12500]);
    const quarter = await report("overview", "range=90d");
    assert.deepEqual([quarter.orders.created, quarter.orders.paid, quarter.money.gross, quarter.money.net], [8, 5, 18000, 15500]);
    // From 10 days ago to 4 days ago: created O3 O5 O9; paid O3 O4 O9 = 6500; paintings R1 2000 + R5 1000; nothing refunded in those days.
    const custom = await report("overview", `range=custom&from=${dateAgo(10)}&to=${dateAgo(4)}`);
    assert.deepEqual([custom.range.days, custom.orders.created, custom.orders.paid, custom.money.orders, custom.money.paintings, custom.money.refunds, custom.money.net], [7, 3, 3, 6500, 3000, 0, 9500]);
    const oneDay = await report("sales", `range=custom&from=${dateAgo(3)}&to=${dateAgo(3)}`);
    assert.deepEqual([oneDay.range.bucket, oneDay.orders.created, oneDay.orders.paid, oneDay.money.gross], ["hour", 1, 1, 2500]);
  });

  test("the sales report: what the money was for, Cash on Delivery, each gateway's successes and failures", async () => {
    const s = await report("sales");
    assert.deepEqual([s.orders.created, s.orders.paid, s.orders.cancelled, s.orders.gross, s.orders.averagePaidOrder], [5, 3, 1, 5000, 1667]);
    assert.deepEqual(s.money.parts, { items: 4200, tax: 360, shipping: 400, codFee: 40, giftWrap: 0 });
    assert.equal(Object.values(s.money.parts).reduce((a, b) => a + b, 0), s.orders.gross, "the parts add up to the paid orders");
    assert.deepEqual([s.money.gross, s.money.refunds, s.money.net, s.money.refundsOrders, s.money.refundsPaintings], [8800, 2500, 6300, { count: 1, amount: 1500 }, { count: 1, amount: 1000 }]);
    assert.deepEqual(s.money.refundsInProgress, { count: 1, amount: 300 }, "a refund that has not gone through yet is not counted as refunded");
    const status = Object.fromEntries(s.orders.byStatus.map((x) => [x.status, x.orders]));
    assert.deepEqual(status, { PLACED: 1, DELIVERED: 1, CANCELLED: 1, PENDING_PAYMENT: 1, CONFIRMED: 1 });
    assert.deepEqual(Object.fromEntries(s.orders.byPaymentStatus.map((x) => [x.status, x.orders])), { PENDING: 2, PAID: 2, CANCELLED: 1 });
    // COD: O1 placed today; O4 delivered and paid this week (it was created 20 days ago).
    assert.deepEqual(s.cod, { created: 1, createdValue: 1000, paid: 1, paidValue: 800, delivered: 1, awaitingCollection: { orders: 1, value: 1000 } });
    assert.deepEqual(s.online, { created: 4, createdValue: 6300, paid: 2, paidValue: 4200, delivered: 1 });
    const gw = Object.fromEntries(s.gateways.map((g) => [g.provider, g]));
    assert.deepEqual(Object.keys(gw), ["cashfree", "razorpay"], "Cash on Delivery is not a gateway");
    // Cashfree: O9 failed once then paid (1700), R1 advance (2000), R3 balance (1800).
    assert.deepEqual([gw.cashfree.success, gw.cashfree.failed, gw.cashfree.pending, gw.cashfree.cancelled, gw.cashfree.attempts], [{ count: 3, amount: 5500 }, { count: 1, amount: 1700 }, { count: 0, amount: 0 }, { count: 0, amount: 0 }, 4]);
    // Razorpay: O2 paid, O5 cancelled, O6 waiting. The test order's payment is not here.
    assert.deepEqual([gw.razorpay.success, gw.razorpay.failed.count, gw.razorpay.pending, gw.razorpay.cancelled, gw.razorpay.attempts], [{ count: 1, amount: 2500 }, 0, { count: 1, amount: 900 }, { count: 1, amount: 1200 }, 3]);
    assert.deepEqual(s.instruments, [{ instrument: "upi", orders: 2, value: 4200 }]);
    assert.deepEqual(s.gatewayNotices, [{ provider: "razorpay", result: "ALREADY_APPLIED", events: 1 }, { provider: "razorpay", result: "ORDER_PLACED", events: 1 }].sort((a, b) => b.events - a.events || a.result.localeCompare(b.result)));
    assert.deepEqual(s.test, { orders: 1, paid: 1, paidValue: 9999, paintingPayments: 1, paintingValue: 4000, gatewayMode: "test" });
    assert.deepEqual([sum(s.series, "created"), sum(s.series, "paid"), sum(s.series, "gross"), sum(s.series, "refunds")], [5, 3, 8800, 1500]);

    const month = await report("sales", "range=30d");
    assert.deepEqual(Object.fromEntries(month.orders.byStatus.map((x) => [x.status, x.orders])), { PLACED: 1, DELIVERED: 3, CANCELLED: 1, PENDING_PAYMENT: 1, CONFIRMED: 1 });
    assert.deepEqual([month.cod.created, month.cod.createdValue, month.cod.paid], [2, 1800, 1]);
    const cf = month.gateways.find((g) => g.provider === "cashfree");
    // + O3 (4000, later partly refunded: still a payment that succeeded), R3 advance 1200, R5 advance 1000 (later refunded).
    assert.deepEqual([cf.success, cf.failed.count], [{ count: 6, amount: 11700 }, 1]);
  });

  test("a payment reported again changes nothing: one order, counted once", async () => {
    // Asha buys with Cash on Delivery, and pays another order online through the stand-in gateway (TEST mode).
    const address = (await asha.post("/api/addresses", HOME)).json.address.id;
    const { seed, model } = siteEngine();
    const product = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).maxQty === model.MAX_CART_QTY && !p.decor);
    const before = { overview: await report("overview", "range=today"), sales: await report("sales", "range=today") };
    const buy = async (method, channel) => {
      assert.equal((await asha.del("/api/cart")).status, 200);
      assert.equal((await asha.post("/api/cart/items", { productId: product.id, quantity: 1 })).status, 201);
      const quote = (await asha.get(`/api/checkout/quote?addressId=${address}&paymentMethod=${method}`)).json.quote;
      const r = await asha.post("/api/checkout/orders", { addressId: address, paymentMethod: method, paymentChannel: channel, expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
      assert.equal(r.status, 201, r.text);
      return r.json;
    };
    const cod = await buy("COD", null);
    assert.deepEqual([cod.order.isTest, (await row("SELECT is_test FROM orders WHERE order_number = $1", [cod.order.orderNumber])).is_test], [false, false], "Cash on Delivery has no gateway: it is a real order");
    const online = await buy("ONLINE", "upi");
    S.online = online.order.orderNumber;
    assert.equal((await row("SELECT is_test FROM orders WHERE order_number = $1", [S.online])).is_test, true, "paid through a gateway in TEST mode: labelled when it is created");
    const paid = mock.pay(online.payment.gatewayOrderId, { method: "upi" });
    // The browser comes back from the payment page: by itself that proves nothing.
    let now = await report("sales", "range=today");
    assert.deepEqual([now.test.paid, now.orders.paid], [before.sales.test.paid, before.sales.orders.paid], "nothing is paid until the server has verified the payment");
    assert.equal((await asha.post(`/api/orders/${S.online}/payments/verify`, { ...paid.proof, signature: "0".repeat(64) })).status, 400, "a forged proof is refused");
    now = await report("sales", "range=today");
    assert.equal(now.test.paid, before.sales.test.paid);
    assert.equal((await asha.post(`/api/orders/${S.online}/payments/verify`, paid.proof)).status, 200);
    // The same payment is reported again by the browser and twice by the gateway.
    assert.equal((await asha.post(`/api/orders/${S.online}/payments/verify`, paid.proof)).status, 200);
    for (let i = 0; i < 2; i++) {
      const wh = mock.webhook("payment.captured", { payment: paid.payment });
      assert.equal((await fetch(base + "/api/payments/webhook/razorpay", { method: "POST", headers: wh.headers, body: wh.body })).status, 200);
    }
    now = await report("sales", "range=today");
    const total = online.order.total;
    assert.deepEqual([now.test.orders - before.sales.test.orders, now.test.paid - before.sales.test.paid, now.test.paidValue - before.sales.test.paidValue], [1, 1, total], "one test order, paid once");
    assert.deepEqual([now.orders.paid, now.money.gross], [before.sales.orders.paid, before.sales.money.gross], "a TEST payment is not a sale");
    assert.equal(now.orders.created - before.sales.orders.created, 1, "only the Cash on Delivery order is a new real order");
    assert.equal(now.cod.created - before.sales.cod.created, 1);

    // An admin says it was a real order after all: now it counts, and still only once.
    const marked = await admin.post(`/api/admin/orders/${S.online}/test`, { test: false });
    assert.deepEqual([marked.status, marked.json.order.isTest], [200, false]);
    now = await report("sales", "range=today");
    assert.deepEqual([now.orders.paid - before.sales.orders.paid, now.money.gross - before.sales.money.gross, now.test.paid], [1, total, before.sales.test.paid]);
    const rz = now.gateways.find((g) => g.provider === "razorpay");
    const rzBefore = before.sales.gateways.find((g) => g.provider === "razorpay");
    assert.deepEqual([rz.success.count - rzBefore.success.count, rz.success.amount - rzBefore.success.amount], [1, total], "one successful attempt, however often it was reported");
    assert.equal((await all("SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.order_number = $1 AND p.status = 'PAID'", [S.online])).length, 1);
    assert.ok(now.gatewayNotices.some((x) => x.result === "ALREADY_APPLIED"), "the repeated notification is on record as already applied");
    S.cod = cod.order.orderNumber;
  });

  test("an admin can mark an order as a test: it leaves the sales figures and is shown on its own", async () => {
    const before = await report("sales", "range=today");
    const r = await admin.post(`/api/admin/orders/${S.cod}/test`, { test: true, note: "Placed while trying the checkout" });
    assert.deepEqual([r.status, r.json.order.isTest, r.json.order.testNote], [200, true, "Placed while trying the checkout"]);
    assert.match(r.json.order.events.at(-1).detail, /Marked as a test order: Placed while trying the checkout/);
    const now = await report("sales", "range=today");
    assert.deepEqual([now.orders.created - before.orders.created, now.test.orders - before.test.orders, now.cod.created - before.cod.created], [-1, 1, -1]);
    const log = await row("SELECT actor_role, metadata FROM audit_logs WHERE action = 'ORDER_TEST_LABEL_CHANGED' AND target_id = $1 ORDER BY created_at DESC LIMIT 1", [S.cod]);
    assert.deepEqual([log.actor_role, log.metadata.test], ["ADMIN", true]);
    // The order itself is untouched: same status, same total, still in the customer's list.
    const mine = (await asha.get(`/api/orders/${S.cod}`)).json.order;
    assert.deepEqual([mine.status, mine.paymentStatus], ["PLACED", "PENDING"]);
    assert.equal((await admin.post(`/api/admin/orders/${S.cod}/test`, { test: false })).json.order.isTest, false);
    assert.equal((await report("sales", "range=today")).orders.created, before.orders.created);
    assert.equal((await admin.post("/api/admin/orders/FX-000000/test", { test: true })).status, 404);
  });
});

describe("custom paintings", () => {
  test("requests, accepted and declined, advance and remaining payments, what is still due", async () => {
    const p = await report("paintings");
    // made this week: R1 (6 days), R2 (2 days). The test request R4 is left out.
    assert.deepEqual(p.requests, { requested: 2, requestedValue: 7000, accepted: 1, declined: 1, cancelled: 1, delivered: 0 });
    assert.deepEqual(p.payments, { advance: { payments: 1, amount: 2000 }, balance: { payments: 1, amount: 1800 }, collected: 3800 });
    assert.deepEqual(p.refunds, { recorded: 1, amount: 1000 });
    assert.deepEqual(p.test, { payments: 1, amount: 4000 });
    assert.deepEqual(Object.fromEntries(p.byStatus.map((x) => [x.status, x.requests])), { PAINTING_IN_PROGRESS: 1, DECLINED: 1 });
    assert.deepEqual([p.open.inProgress, p.open.waitingForArtist, p.open.advanceDue.requests, p.open.balanceDue.requests, p.open.refundDue.requests], [1, 0, 0, 0, 0]);
    assert.deepEqual([sum(p.series, "requests"), sum(p.series, "collected")], [2, 3800]);
    assert.equal(p.advancePercent, config.paintings.advancePercent);
    const month = await report("paintings", "range=30d");
    assert.deepEqual([month.requests.requested, month.requests.accepted, month.requests.declined, month.payments.advance, month.payments.balance.amount], [4, 3, 1, { payments: 3, amount: 4200 }, 1800]);

    // A request whose advance is awaited, and one whose painting is finished and waits for the rest.
    await painting(U.asha, S.artist, { price: 6000, status: "ADVANCE_PAYMENT_PENDING", created: ago(0), responded: ago(0) });
    await painting(U.asha, S.artist, { price: 4000, status: "REMAINING_PAYMENT_PENDING", payment: "ADVANCE_PAID", paidSoFar: 1600, created: ago(40), responded: ago(39), payments: [{ stage: "ADVANCE", amount: 1600, at: ago(38) }] });
    const due = (await report("paintings")).open;
    assert.deepEqual([due.advanceDue, due.balanceDue], [{ requests: 1, amount: 2400 }, { requests: 1, amount: 2400 }]);
  });

  test("a painting paid through a gateway in TEST mode is labelled when the payment starts", async () => {
    assert.equal(analytics.gatewayInTestMode(), true);
    const id = newId();
    await db.query("INSERT INTO orders (id, order_number, user_id, idempotency_key, status, payment_method, payment_status, subtotal, discount, tax, shipping_fee, cod_fee, total, item_count, shipping_address, customer_name, customer_email) VALUES ($1, 'FX-900001', $2, 'legacy', 'PENDING_PAYMENT', 'ONLINE', 'PENDING', 500, 0, 0, 0, 0, 500, 1, '{}', 'Old', 'old@example.com')", [id, U.chitra]);
    await db.query("UPDATE orders SET is_test = NULL WHERE id = $1", [id]);
    const legacyCod = (await row("UPDATE orders SET is_test = NULL WHERE order_number = $1 RETURNING id", [O.o4.number])).id;
    await db.query("UPDATE painting_requests SET is_test = NULL WHERE id IN ($1, $2)", [S.r2.id, S.r3.id]);
    const notes = [];
    await analytics.labelOlderOrders({ log: (m) => notes.push(m) });
    // Orders from before the label existed: paid online with the gateway in TEST mode -> test; Cash on Delivery -> real.
    assert.equal((await row("SELECT is_test FROM orders WHERE id = $1", [id])).is_test, true);
    assert.equal((await row("SELECT is_test FROM orders WHERE id = $1", [legacyCod])).is_test, false);
    // A painting with a payment attempt -> test; one that was never paid for -> not.
    assert.deepEqual([(await row("SELECT is_test FROM painting_requests WHERE id = $1", [S.r3.id])).is_test, (await row("SELECT is_test FROM painting_requests WHERE id = $1", [S.r2.id])).is_test], [true, false]);
    assert.match(notes[0], /Labelled 2 earlier order\(s\) and 2 painting request\(s\)/);
    await analytics.labelOlderOrders({ log: (m) => notes.push(m) });
    assert.equal(notes.length, 1, "nothing is labelled twice");
    await db.query("UPDATE painting_requests SET is_test = false WHERE id = $1", [S.r3.id]);
    await db.query("DELETE FROM orders WHERE id = $1", [id]);
  });
});

describe("shops, artists, products, templates and artworks", () => {
  test("each seller's orders, units and sales; cancelled and unpaid orders are not sales", async () => {
    const s = await report("sellers", "range=30d");
    const shops = Object.fromEntries(s.shops.items.map((x) => [x.ref, x]));
    // FrameX Studio: O1 (900, placed), O2 (2 x 1000), O4 (700). O6 waits for payment and O7 is a test: neither is a sale.
    // The two orders Asha placed in the tests above are FrameX Studio's too: one Cash on Delivery (not paid yet), one paid online.
    const lineOf = async (number) => (await row("SELECT sum(i.line_total)::int AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [number])).n;
    const [codLine, onlineLine] = [await lineOf(S.cod), await lineOf(S.online)];
    assert.deepEqual(shops["shop-001"], { sellerType: "FRAME_X_STUDIO", ref: "shop-001", name: "FrameX Studio", orders: 5, units: 6, ordered: 3600 + codLine + onlineLine, paid: 2700 + onlineLine, cancelled: 0, delivered: 2 });
    assert.deepEqual(shops["shop-002"], { sellerType: "SHOP", ref: "shop-002", name: "Kalinga Frames", orders: 1, units: 1, ordered: 3500, paid: 3500, cancelled: 1, delivered: 1 });
    assert.ok(!("FRX-ART-9001" in shops), "an artist is not a shop");
    assert.deepEqual([s.shops.total, s.shops.page, s.shops.limit], [2, 1, 20]);
    assert.deepEqual(s.artists, [{ id: S.artist, code: "FRX-ART-9001", name: "Ranjit Behera", status: "ACTIVE", artworks: { orders: 1, units: 1, sales: 1500 }, paintings: { requests: 5, accepted: 4, declined: 1, delivered: 0, collected: 6000 } }]);
    const week = await report("sellers");
    // This week Kalinga Frames only had an order that was cancelled: it is listed, with nothing sold.
    assert.deepEqual(week.shops.items.find((x) => x.ref === "shop-002"), { sellerType: "SHOP", ref: "shop-002", name: "Kalinga Frames", orders: 0, units: 0, ordered: 0, paid: 0, cancelled: 1, delivered: 0 });
  });

  test("popular products, templates and artworks by what was ordered", async () => {
    const c = await report("catalog", "range=30d");
    const frame = c.products.ordered.find((x) => x.id === "p-001");
    assert.ok(frame.units >= 3 && frame.orders >= 2 && frame.sales >= 2700, JSON.stringify(frame));
    assert.deepEqual(c.products.ordered.find((x) => x.id === "p-002"), { id: "p-002", name: "Second Frame", seller: "Kalinga Frames", units: 1, orders: 1, sales: 3500 });
    assert.ok(!c.products.ordered.some((x) => x.id === "aw-fixture001"), "an artwork is not listed as a product");
    assert.deepEqual(c.artworks.ordered, [{ id: "aw-fixture001", name: "Monsoon Ghat", seller: "Ranjit Behera", units: 1, orders: 1, sales: 1500 }]);
    assert.deepEqual(c.templates.ordered, [{ id: S.template.id, name: S.template.title, units: 1, orders: 1, sales: 900 }]);
    assert.ok(c.products.addedToCart.find((x) => x.id === "p-001").additions >= 2);
  });
});

describe("visitor statistics: only with the visitor's consent, and nothing personal", () => {
  const V1 = "v1_aaaaaaaaaaaaaaaaaaaa";
  const V2 = "v2_bbbbbbbbbbbbbbbbbbbb";
  const V3 = "v3_cccccccccccccccccccc";
  const send = (body, { client = visitor, ua = CHROME, headers = {} } = {}) => client.post("/api/analytics/events", body, { "User-Agent": ua, ...headers });
  const stored = async () => (await row("SELECT count(*)::int AS n FROM analytics_events WHERE source = 'web'")).n;
  const pageView = (extra = {}) => ({ name: "page_view", page: "home", path: "/index.html", ...extra });

  test("the website is told whether it may send statistics, and the public GA4 id; no secret is in that answer", async () => {
    const c = (await visitor.get("/api/config")).json;
    assert.deepEqual(c.analytics, { enabled: true, ga4MeasurementId: "G-TEST1234AB" });
    const text = JSON.stringify(c);
    for (const secret of [mock.keySecret, mock.webhookSecret, config.authSecret]) assert.ok(!text.includes(secret));
  });

  test("without consent nothing is stored", async () => {
    analytics.resetLive();
    for (const body of [{ visitorId: V1, sessionId: V1, events: [pageView()] }, { consent: false, visitorId: V1, sessionId: V1, events: [pageView()] }, { consent: "true", visitorId: V1, sessionId: V1, events: [pageView()] }, {}]) {
      const r = await send(body);
      assert.deepEqual([r.status, r.json], [202, { stored: 0, reason: "no-consent" }]);
    }
    assert.equal(await stored(), 0);
    assert.equal((await admin.get("/api/admin/analytics/live")).json.visitors, 0, "and they are not counted as being on the site");
  });

  test("programs, FrameX staff and malformed batches are not visitors", async () => {
    const batch = { consent: true, visitorId: V1, sessionId: V1, events: [pageView()] };
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36", "facebookexternalhit/1.1", "curl/8.4.0"])
      assert.deepEqual((await send(batch, { ua })).json, { stored: 0, reason: "bot" }, ua);
    assert.deepEqual((await send(batch, { client: admin })).json, { stored: 0, reason: "staff" });
    for (const bad of [{ ...batch, visitorId: "short" }, { ...batch, sessionId: "has spaces in it!!" }, { ...batch, visitorId: 12345678901234567890 }]) assert.deepEqual((await send(bad)).json, { stored: 0, reason: "bad-id" });
    assert.equal(await stored(), 0);
    // The same protection as every other request that changes something.
    const noHeader = await fetch(base + "/api/analytics/events", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": CHROME }, body: JSON.stringify(batch) });
    assert.equal(noHeader.status, 403);
    assert.equal((await send(batch, { headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal(await stored(), 0);
  });

  test("a batch is cleaned before it is kept: known events only, no query strings, no contact details", async () => {
    const r = await send({
      consent: true,
      visitorId: V1,
      sessionId: "s1_aaaaaaaaaaaaaaaaaaaa",
      email: "asha@example.com",
      events: [
        pageView({ landing: true, referrer: "https://www.google.com/search?q=photo+frames+near+me", utm: {} }),
        { name: "view_item", page: "product", path: "/product.html?id=p-001&token=secret", itemType: "product", itemId: "p-001", itemName: "Ace of Us", category: "photo-frames", value: 719, email: "asha@example.com", phone: "9876500011" },
        { name: "search", page: "search", path: "/search.html", query: "  Walnut   FRAME for asha@example.com +91 98765 00011  " },
        { name: "begin_checkout", page: "checkout", path: "/checkout.html", value: 1500 },
        { name: "add_to_cart", itemType: "product", itemId: "p-001" },
        { name: "purchase", value: 999999 },
        { name: "password_typed", value: 1 },
        { name: "view_item", itemType: "weapon", itemId: "<script>alert(1)</script>", itemName: "x" },
        "not an object"
      ]
    });
    assert.deepEqual(r.json, { stored: 5, reason: "" }, "page_view, view_item, search, begin_checkout and the item-less view_item; add_to_cart and purchase are counted from the cart and the orders, not from a browser");
    const events = await all("SELECT * FROM analytics_events WHERE visitor_id = $1 ORDER BY name, item_id NULLS LAST", [V1]);
    const by = (name) => events.filter((e) => e.name === name);
    const landing = by("page_view")[0];
    assert.deepEqual([landing.landing, landing.referrer, landing.channel, landing.path, landing.page, landing.device, landing.logged_in, landing.source], [true, "google.com", "search", "/index.html", "home", "desktop", false, "web"]);
    const view = by("view_item")[0];
    assert.deepEqual([view.item_type, view.item_id, view.item_name, view.category, view.value, view.path], ["product", "p-001", "Ace of Us", "photo-frames", 719, null], "a path with a query string is not kept at all");
    assert.deepEqual([by("view_item")[1].item_type, by("view_item")[1].item_id, by("view_item")[1].item_name], [null, null, null]);
    assert.equal(by("search")[0].query, "walnut frame for", "the email address and the phone number typed into the search box are removed");
    assert.equal(by("begin_checkout")[0].value, 1500);
    assert.deepEqual([by("add_to_cart").length, by("purchase").length, by("password_typed").length], [0, 0, 0]);
    // Nothing that says who the visitor is: the table has no column for it, and no value holds it.
    const columns = (await all("SELECT column_name FROM information_schema.columns WHERE table_name = 'analytics_events'")).map((c) => c.column_name);
    for (const forbidden of ["ip", "user_id", "email", "phone", "user_agent", "name_of_user"]) assert.ok(!columns.includes(forbidden), forbidden);
    assert.ok(!/asha@example\.com|9876500011|98765 00011|secret|127\.0\.0\.1/.test(JSON.stringify(events)));
  });

  test("where visits come from: search, a tagged campaign link, a direct visit; this site is never its own referrer", async () => {
    await send({ consent: true, visitorId: V2, sessionId: "s2_bbbbbbbbbbbbbbbbbbbb", events: [
      { name: "page_view", page: "product", path: "/product.html", landing: true, referrer: "https://l.instagram.com/?u=x", utm: { source: "instagram", medium: "social", campaign: "diwali-2026" } },
      { name: "view_item", page: "product", path: "/product.html", itemType: "product", itemId: "p-001", itemName: "Ace of Us" },
      { name: "view_template", page: "template", path: "/template.html", itemType: "template", itemId: S.template.id, itemName: S.template.title },
      { name: "view_item_list", page: "shop", path: "/shop.html", itemType: "category", itemId: "wooden", itemName: "Wooden frames" },
      { name: "view_artwork", page: "artwork", path: "/artwork.html", itemType: "artwork", itemId: "aw-fixture001", itemName: "Monsoon Ghat" }
    ] }, { client: asha });
    await send({ consent: true, visitorId: V3, sessionId: "s3_cccccccccccccccccccc", events: [
      { name: "page_view", page: "templates", path: "/templates.html", landing: true, referrer: "http://localhost:5500/index.html" },
      { name: "page_view", page: "home", path: "/index.html", referrer: "https://www.bing.com/" },
      { name: "search", page: "search", path: "/search.html", query: "walnut frame for" }
    ] }, { ua: PHONE });
    const t = await report("traffic", "range=today");
    assert.deepEqual(t.visitors, { unique: 3, visits: 3, pageViews: 4, productViews: 3, checkouts: 1 });
    assert.deepEqual(Object.fromEntries(t.channels.map((c) => [c.channel, c.visits])), { search: 1, social: 1, direct: 1 });
    assert.deepEqual(t.referrers, [{ host: "google.com", visits: 1 }, { host: "l.instagram.com", visits: 1 }].sort((a, b) => a.host.localeCompare(b.host)), "the site's own address and a later page's referrer are not sources");
    assert.deepEqual(t.campaigns, [{ source: "instagram", medium: "social", campaign: "diwali-2026", visits: 1 }]);
    assert.deepEqual(Object.fromEntries(t.landingPages.map((p) => [p.path, p.visits])), { "/index.html": 1, "/product.html": 1, "/templates.html": 1 });
    assert.deepEqual(t.pages.find((p) => p.path === "/index.html"), { path: "/index.html", page: "home", views: 2, visitors: 2 });
    assert.deepEqual(Object.fromEntries(t.devices.map((d) => [d.device, d.visitors])), { desktop: 2, mobile: 1 });
    assert.deepEqual(t.searches, [{ query: "walnut frame for", searches: 2 }]);
    assert.equal((await row("SELECT logged_in FROM analytics_events WHERE visitor_id = $1 LIMIT 1", [V2])).logged_in, true, "only THAT someone was logged in is kept, never who");
    const funnel = Object.fromEntries(t.funnel.map((f) => [f.step, f]));
    assert.deepEqual([funnel.visitors.count, funnel.product_viewers.count, funnel.checkout_starters.count], [3, 2, 1]);
    assert.deepEqual([funnel.visitors.source, funnel.cart_additions.source, funnel.orders_paid.source], ["analytics", "database", "database"]);
    const sales = await report("sales", "range=today");
    assert.deepEqual([funnel.orders_created.count, funnel.orders_paid.count], [sales.orders.created, sales.orders.paid], "the last steps are the database's orders");
    assert.match(t.note, /visitors who allowed analytics/);

    const c = await report("catalog", "range=today");
    assert.deepEqual(c.products.viewed, [{ id: "p-001", name: "Ace of Us", views: 2, visitors: 2 }]);
    assert.deepEqual(c.templates.viewed, [{ id: S.template.id, name: S.template.title, views: 1, visitors: 1 }]);
    assert.deepEqual(c.artworks.viewed, [{ id: "aw-fixture001", name: "Monsoon Ghat", views: 1, visitors: 1 }]);
    assert.deepEqual(c.categories, [{ id: "wooden", name: "Wooden frames", views: 1, visitors: 1 }]);
  });

  test("visitors by day, compared with the days before", async () => {
    // A visit ten days ago, from another website.
    await db.query(
      `INSERT INTO analytics_events (id, name, source, visitor_id, session_id, page, path, landing, referrer, channel, device, occurred_at)
       VALUES ($1, 'page_view', 'web', 'v9_zzzzzzzzzzzzzzzzzzzz', 's9_zzzzzzzzzzzzzzzzzzzz', 'home', '/index.html', true, 'blog.example', 'referral', 'desktop', $2)`,
      [newId(), ago(10)]
    );
    const week = await report("overview");
    assert.deepEqual([week.visitors.unique, week.visitors.visits, week.visitors.pageViews, week.visitors.before.unique], [3, 3, 4, 1]);
    assert.deepEqual([sum(week.series, "pageViews"), week.series.at(-1).visitors, week.series.at(-1).key], [4, 3, TODAY]);
    const month = await report("traffic", "range=30d");
    assert.deepEqual([month.visitors.unique, month.channels.find((c) => c.channel === "referral").visits, month.referrers.some((r) => r.host === "blog.example")], [4, 1, true]);
    assert.equal((await report("traffic", `range=custom&from=${dateAgo(10)}&to=${dateAgo(10)}`)).visitors.unique, 1);
  });

  test("who is on the site now: heard from in the last five minutes", async () => {
    analytics.resetLive();
    await send({ consent: true, visitorId: V1, sessionId: "s1_aaaaaaaaaaaaaaaaaaaa", events: [] });
    await send({ consent: true, visitorId: V2, sessionId: "s2_bbbbbbbbbbbbbbbbbbbb", events: [] });
    await send({ consent: true, visitorId: V2, sessionId: "s2_bbbbbbbbbbbbbbbbbbbb", events: [] });
    const live = (await admin.get("/api/admin/analytics/live")).json;
    assert.deepEqual([live.visitors, live.windowMinutes], [2, 5]);
    assert.equal((await report("overview", "range=today")).live.visitors, 2);
    assert.equal(analytics.liveVisitors(Date.now() + 6 * 60_000), 0, "a visitor who went quiet is no longer counted");
    assert.equal(await stored(), (await row("SELECT count(*)::int AS n FROM analytics_events WHERE source = 'web'")).n, "a 'still here' signal stores nothing");
  });

  test("at most 20 events a batch; switched off, nothing is collected and the website is told so", async () => {
    const before = await stored();
    const many = await send({ consent: true, visitorId: V1, sessionId: "s1_aaaaaaaaaaaaaaaaaaaa", events: Array.from({ length: 50 }, () => pageView()) });
    assert.deepEqual([many.json.stored, (await stored()) - before], [20, 20]);
    await db.query("DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE visitor_id = $1 AND name = 'page_view' AND NOT landing ORDER BY occurred_at DESC LIMIT 20)", [V1]);
    config.analytics.enabled = false;
    try {
      assert.deepEqual((await send({ consent: true, visitorId: V1, sessionId: "s1_aaaaaaaaaaaaaaaaaaaa", events: [pageView()] })).json, { stored: 0, reason: "off" });
      assert.equal((await visitor.get("/api/config")).json.analytics.enabled, false);
      const o = await report("overview", "range=today");
      assert.deepEqual([o.live.visitors, o.visitors.collecting], [null, false]);
      assert.ok(o.orders.created > 0, "orders and sales are still reported: they never depended on visitor statistics");
    } finally {
      config.analytics.enabled = true;
    }
  });

  test("old visitor and login records are deleted; orders and payments never are", async () => {
    const old = new Date(Date.now() - (config.analytics.retentionDays + 2) * DAY);
    await db.query("INSERT INTO analytics_events (id, name, source, visitor_id, session_id, occurred_at) VALUES ($1, 'page_view', 'web', 'v8_oooooooooooooooooooo', 's8_oooooooooooooooooooo', $2)", [newId(), old]);
    await db.query("INSERT INTO auth_events (id, kind, created_at) VALUES ($1, 'LOGIN_FAILED', $2)", [newId(), old]);
    const counts = async () => [(await row("SELECT count(*)::int AS n FROM analytics_events")).n, (await row("SELECT count(*)::int AS n FROM auth_events")).n, (await row("SELECT count(*)::int AS n FROM orders")).n, (await row("SELECT count(*)::int AS n FROM payments")).n];
    const before = await counts();
    await analytics.sweepAnalytics();
    const now = await counts();
    assert.deepEqual([before[0] - now[0], before[1] - now[1], before[2] - now[2], before[3] - now[3]], [1, 1, 0, 0]);
  });
});

describe("the cart and logins, as the server records them", () => {
  test("adding to the cart is counted by the cart itself, without the account", async () => {
    const before = (await report("overview", "range=today")).cart.additions;
    const { seed, model } = siteEngine();
    const product = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).maxQty === model.MAX_CART_QTY && !p.decor);
    assert.equal((await binod.post("/api/cart/items", { productId: product.id, quantity: 2 })).status, 201);
    assert.equal((await visitor.post("/api/cart/items", { productId: product.id, quantity: 1 })).status, 401);
    assert.equal((await report("overview", "range=today")).cart.additions - before, 1, "the customer's addition is counted; the refused one is not");
    const e = await row("SELECT * FROM analytics_events WHERE source = 'server' ORDER BY occurred_at DESC LIMIT 1");
    assert.deepEqual([e.name, e.item_type, e.item_id, e.item_name, e.visitor_id, e.session_id, e.value], ["add_to_cart", "product", product.id, product.name, null, null, model.cartLine(product, {}).unitPrice * 2]);
  });

  test("abandoned carts: still holding items, and untouched for a day", async () => {
    await db.query("UPDATE carts SET updated_at = $2 WHERE user_id = $1", [U.binod, ago(3)]);
    const o = await report("overview");
    // Binod's cart from three days ago (2 x 500 from the fixture, plus what he just added); Chitra's and Asha's were touched today.
    assert.equal(o.cart.abandoned.carts, 1);
    assert.ok(o.cart.abandoned.value >= 1000);
    assert.equal(o.cart.abandoned.afterHours, 24);
    assert.equal((await report("overview", "range=today")).cart.abandoned.carts, 0, "a cart is not abandoned on the day it was last used");
  });

  test("logins and failed logins: the account and the reason, never what was typed", async () => {
    const before = await report("accounts", "range=today");
    const wrong = "Not-The-Password-77";
    assert.equal((await visitor.post("/api/auth/login", { identifier: "asha@example.com", password: wrong })).status, 401);
    assert.equal((await visitor.post("/api/auth/login", { identifier: "asha@example.com", password: wrong })).status, 401);
    assert.equal((await visitor.post("/api/auth/login", { identifier: "nobody-here@example.com", password: wrong })).status, 401);
    await db.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [U.chitra]);
    assert.equal((await visitor.post("/api/auth/login", { identifier: "chitra@example.com", password: PASSWORD })).status, 403);
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [U.chitra]);
    const fresh = new Client();
    assert.equal((await fresh.post("/api/auth/login", { identifier: "binod@example.com", password: PASSWORD })).status, 200);
    const a = await report("accounts", "range=today");
    assert.deepEqual([a.logins.logins - before.logins.logins, a.logins.failed - before.logins.failed, a.logins.failedUnknownAccount - before.logins.failedUnknownAccount], [1, 4, 1]);
    const reasons = Object.fromEntries(a.failedByReason.map((r) => [r.reason, r.attempts]));
    assert.deepEqual([reasons.INVALID_CREDENTIALS, reasons.ACCOUNT_DISABLED], [3, 1]);
    assert.deepEqual(a.failedByAccount.find((x) => x.email === "asha@example.com").attempts, 2);
    assert.deepEqual([a.failed.items[0].reason, a.failed.items[0].account.email, a.failed.items[0].form], ["ACCOUNT_DISABLED", "chitra@example.com", "customer"]);
    assert.equal(a.failed.items.find((x) => !x.account).reason, "INVALID_CREDENTIALS", "an attempt on an address that has no account");
    assert.equal(a.failed.total, a.logins.failed);
    const everything = JSON.stringify(await all("SELECT * FROM auth_events"));
    assert.ok(!everything.includes(wrong) && !everything.includes("nobody-here@example.com"), "neither the password nor the address that was typed is kept");
    assert.deepEqual([sum(a.series, "failed"), sum(a.series, "logins")], [a.logins.failed, a.logins.logins]);
    // The fixture's login and failed login from ten days ago are in the month, not in today.
    const month = await report("accounts", "range=30d");
    assert.deepEqual([month.logins.logins - a.logins.logins, month.logins.failed - a.logins.failed], [1, 1]);
    const roles = Object.fromEntries(month.roles.map((r) => [r.role, r]));
    assert.deepEqual([roles.CUSTOMER.accounts, roles.CUSTOMER.created, roles.ADMIN.accounts, sum(month.series, "registrations")], [3, 2, 1, 2]);
    assert.equal((await report("accounts", "range=90d")).roles.find((r) => r.role === "CUSTOMER").created, 3);
    const o = await report("overview", "range=30d");
    assert.deepEqual([o.accounts.customers, o.accounts.newCustomers, o.accounts.failedLogins], [3, 2, month.logins.failed]);
  });
});

describe("a customer's record for FrameX staff", () => {
  test("contact details, saved addresses and the order history, ten orders a page", async () => {
    for (let i = 0; i < 12; i++) await order(U.chitra, { method: "COD", status: "PLACED", payment: "PENDING", created: ago(1, i), items: [{ product: "p-001", name: "Ace of Us", qty: 1, price: 100 + i, ...STUDIO_LINE }], attempts: [{ provider: "cod", status: "PENDING" }] });
    const r = await admin.get(`/api/admin/users/${U.chitra}`);
    assert.equal(r.status, 200, r.text);
    const c = r.json;
    assert.deepEqual([c.user.name, c.user.email, c.user.phone, c.user.role, c.user.status], ["Chitra Sahu", "chitra@example.com", "+919876500033", "CUSTOMER", "ACTIVE"]);
    // 12 new orders + O8 (3000, paid 45 days ago). Paid: O8 only.
    assert.deepEqual([c.stats.orders, c.stats.paidOrders, c.stats.paid, c.stats.testOrders, c.stats.cancelled], [13, 1, 3000, 0, 0]);
    assert.deepEqual([c.orders.total, c.orders.page, c.orders.limit, c.orders.items.length], [13, 1, 10, 10]);
    const first = c.orders.items[0];
    assert.deepEqual([/^FX-\d+$/.test(first.orderNumber), first.status, first.paymentStatus, first.paymentMethod, first.firstItem.name, first.total, first.isTest], [true, "PLACED", "PENDING", "COD", "Ace of Us", 111, false]);
    const second = (await admin.get(`/api/admin/users/${U.chitra}?page=2`)).json.orders;
    assert.deepEqual([second.page, second.items.length, second.items.at(-1).orderNumber], [2, 3, O.o8.number]);
    assert.deepEqual([c.paintings.length, c.paintings[0].number, c.paintings[0].status, c.paintings[0].refundStatus, c.paintings[0].artist], [1, S.r5.number, "CANCELLED", "REFUNDED", "Ranjit Behera"]);
    assert.deepEqual([c.cart.lines, c.cart.value], [1, 1000]);
    assert.equal(c.stats.failedLogins30Days, 1);
    // Never the password in any form, never a session, never a payment credential.
    assert.ok(!/password|hash|token|session|secret|cvv|card_number/i.test(r.text), r.text.match(/.{0,30}(password|hash|token|session|secret)/i));
    const hash = (await row("SELECT password_hash FROM users WHERE id = $1", [U.chitra])).password_hash;
    assert.ok(!r.text.includes(hash));

    const a = (await admin.get(`/api/admin/users/${U.asha}`)).json;
    assert.deepEqual([a.addresses.length, a.addresses[0].city, a.addresses[0].postalCode], [1, "Dhenkanal", "759001"]);
    assert.ok(a.stats.testOrders >= 1 && a.stats.paid >= 2500 + 800, "a test order is not part of what the customer spent");
    // Looking at a record is itself recorded.
    const log = await all("SELECT actor_role, target_id FROM audit_logs WHERE action = 'CUSTOMER_RECORD_VIEWED' ORDER BY created_at");
    assert.ok(log.length >= 3 && log.every((l) => l.actor_role === "ADMIN") && log.some((l) => l.target_id === U.chitra));
    assert.equal((await admin.get("/api/admin/users/not-an-id")).status, 404);
    assert.equal((await admin.get(`/api/admin/users/${crypto.randomUUID()}`)).status, 404);
  });

  test("the accounts list is searched and paged by the server", async () => {
    const list = (await admin.get("/api/admin/users?role=CUSTOMER")).json;
    assert.deepEqual([list.total, list.page, list.items.length, list.counts.CUSTOMER], [3, 1, 3, 3]);
    assert.ok(list.items.every((u) => !("passwordHash" in u) && !("password_hash" in u)));
    assert.deepEqual((await admin.get("/api/admin/users?q=chitra")).json.items.map((u) => [u.email, u.orders]), [["chitra@example.com", 13]]);
    assert.deepEqual((await admin.get("/api/admin/users?q=9876500022")).json.items.map((u) => u.email), ["binod@example.com"]);
  });
});

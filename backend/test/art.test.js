/* ==========================================================================
   Cashfree payments, Art & Artists, artwork approval, custom paintings paid
   in two parts, platform settings, reviews, notifications and search.
   Run with "npm test" in backend/.

   A real server on a random port, an in-memory PostgreSQL (PGlite), the real
   catalogue files, and the backend's real Cashfree code talking to a stand-in
   for Cashfree's servers (test/support/mock-cashfree.js) that uses the same
   API, the same headers and the same webhook signature.

   What these tests can't show is a payment going through Cashfree itself:
   that needs Cashfree sandbox credentials (see backend/README.md -> Payments).
   ========================================================================== */
import crypto from "node:crypto";
import { createMockCashfree } from "./support/mock-cashfree.js";

const mock = await createMockCashfree().listen();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "cashfree";
process.env.PAYMENT_MODE = "test";
process.env.CASHFREE_CLIENT_ID = mock.clientId;
process.env.CASHFREE_CLIENT_SECRET = mock.clientSecret;
process.env.CASHFREE_API_BASE = mock.url;
process.env.PAYMENT_PENDING_MINUTES = "30";
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.COD_FEE = "40";
process.env.GIFT_WRAP_FEE = "49";
process.env.CUSTOM_PAINTING_ADVANCE_PERCENT = "40";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { notificationsSettled } = await import("../src/services/notification-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { expireUnpaidAdvances } = await import("../src/services/painting-payment-service.js");
const { NEXT, splitPrice } = await import("../src/services/painting-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");
const { jpeg, uploadPhoto } = await import("./support/photos.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body, headers = {}) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + url, { method, headers: { ...(raw ? {} : { "Content-Type": "application/json" }), "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
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
  get = (url) => this.request("GET", url);
  post = (url, body = {}, headers) => this.request("POST", url, body, headers);
  put = (url, body = {}) => this.request("PUT", url, body);
  patch = (url, body = {}) => this.request("PATCH", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const person = (name, n) => ({ name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: `98765000${n}`, password: PASSWORD, confirmPassword: PASSWORD });
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00051", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client(); // customer
const binod = new Client(); // another customer
const visitor = new Client(); // not logged in
const admin = new Client();
const meera = new Client(); // artist (through an application)
const ravi = new Client(); // another artist (created by the admin)
const shop = new Client();
const S = {};

const { seed, model } = siteEngine();
const WALL_ART = model.normalize(seed.products.find((p) => p.id === "hd-never-give-up")); // ready-made, no photo

const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const settle = async () => {
  await emailsSettled();
  await notificationsSettled();
};
const key = () => crypto.randomUUID();
const webhook = (w) => fetch(base + "/api/payments/webhook/cashfree", { method: "POST", headers: w.headers, body: w.body }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const upload = async (client, options = {}) => {
  const r = await uploadPhoto(base, client, options);
  assert.equal(r.status, 201, r.text);
  return r.json.upload;
};
/** Send a picture the way the artist dashboard does. */
async function uploadMedia(client, body = jpeg({ width: 1600, height: 1200, fill: 0x41 })) {
  const response = await fetch(base + "/api/artist/media", { method: "POST", headers: { "Content-Type": "image/jpeg", "X-FrameX-Client": "test", Cookie: client.cookie }, body });
  const json = await response.json();
  assert.equal(response.status, 201, JSON.stringify(json));
  return json.media;
}
async function download(link) {
  const response = await fetch(`${base}/api${link.path}`);
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
}
const quoteFor = async (client, addressId, { method = "ONLINE", giftWrap = false } = {}) => (await client.get(`/api/checkout/quote?addressId=${addressId}&paymentMethod=${method}${giftWrap ? "&giftWrap=true" : ""}`)).json.quote;
async function placeCart(client, addressId, { method = "ONLINE", giftWrap = false } = {}) {
  const quote = await quoteFor(client, addressId, { method, giftWrap });
  return client.post("/api/checkout/orders", { addressId, paymentMethod: method, expectedTotal: quote.total, idempotencyKey: key(), giftWrap });
}
const outcome = (client, number, reason = "returned") => client.post(`/api/orders/${number}/payments/outcome`, { reason });
const artworkBody = (images, extra = {}) => ({ title: "Evening at the Ghat", price: 7000, artType: "painting", medium: "Oil on canvas", size: "18 x 24 in", kind: "ORIGINAL", handmade: true, frameIncluded: false, year: 2024, description: "A quiet riverside evening.", tags: ["river", "evening"], images, ...extra });
const newArtworkId = () => "aw-" + crypto.randomBytes(6).toString("hex");

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", person("Asha Verma", 51))).status, 201);
  assert.equal((await binod.post("/api/auth/signup", person("Binod Das", 52))).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  S.homeBinod = (await binod.post("/api/addresses", { ...ADDRESS, fullName: "Binod Das", phone: "98765 00052" })).json.address.id;
  // A shop login, to show that a shop can't use the artist routes.
  const shopId = newId();
  await db.query("INSERT INTO shops (id, shop_code, name, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at) VALUES ($1, 'FRX-SHOP-9001', 'Corner Frames', 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())", [shopId]);
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id) VALUES ($1, 'Shop Owner', 'shop@shops.example', $2, 'SHOP', 'ACTIVE', $3)", [newId(), await hashPassword(PASSWORD), shopId]);
  assert.equal((await shop.post("/api/auth/login", { identifier: "shop@shops.example", password: PASSWORD, accountType: "shop" })).status, 200);
  clearDevOutbox();
});

after(async () => {
  await settle();
  await new Promise((r) => server.close(r));
  await mock.close();
  await db.close();
});

/* ====================================================================== Cashfree: orders */

describe("Cashfree: paying for an order", () => {
  test("the public configuration names the gateway and no secret", async () => {
    const r = await visitor.get("/api/config");
    assert.deepEqual(r.json.features.payments, { online: true, provider: "cashfree", mode: "test", cod: true });
    assert.ok(!r.text.includes(mock.clientSecret) && !r.text.includes(mock.clientId));
  });

  test("placing an online order creates a Cashfree order for the server's total and hands the browser a session, never a key", async () => {
    await asha.del("/api/cart");
    assert.equal((await asha.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 })).status, 201);
    const quote = await quoteFor(asha, S.home);
    const r = await placeCart(asha, S.home);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    const pay = r.json.payment;
    assert.equal(pay.provider, "cashfree");
    assert.equal(pay.mode, "test");
    assert.match(pay.paymentSessionId, /^session_/);
    assert.equal(pay.amount, quote.total * 100);
    assert.ok(!JSON.stringify(r.json).includes(mock.clientSecret) && !("keyId" in pay));
    const cf = mock.order(pay.gatewayOrderId);
    assert.equal(cf.order_amount, quote.total);
    assert.match(cf.customer_details.customer_phone, /^\d{10}$/);
    assert.match(cf.order_meta.return_url, /order\.html\?id=FX-/);
    S.o1 = { number: r.json.order.orderNumber, cf: pay.gatewayOrderId, total: quote.total };
  });

  test("the browser saying 'it worked' does not pay the order", async () => {
    const r = await outcome(asha, S.o1.number, "returned");
    assert.equal(r.status, 200);
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    assert.notEqual(r.json.order.paymentStatus, "PAID");
  });

  test("a failed payment is recorded with the bank's reason and the order waits; retry uses the same Cashfree order", async () => {
    mock.pay(S.o1.cf, { status: "FAILED", error: "Insufficient funds" });
    const failed = await outcome(asha, S.o1.number, "failed");
    assert.equal(failed.json.order.status, "PENDING_PAYMENT");
    assert.equal(failed.json.order.paymentStatus, "FAILED");
    const made = mock.calls.filter((c) => c === "POST /orders").length;
    const retry = await asha.post(`/api/orders/${S.o1.number}/payments`, {});
    assert.equal(retry.status, 200, retry.text);
    assert.equal(retry.json.payment.gatewayOrderId, S.o1.cf);
    assert.equal(mock.calls.filter((c) => c === "POST /orders").length, made, "no second Cashfree order for the same FrameX order");
  });

  test("closing the window is a cancelled attempt, not a failure", async () => {
    mock.pay(S.o1.cf, { status: "USER_DROPPED" });
    const r = await outcome(asha, S.o1.number, "dismissed");
    assert.equal(r.json.order.paymentStatus, "CANCELLED");
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
  });

  test("a payment Cashfree reports as successful places the order, once", async () => {
    await asha.post(`/api/orders/${S.o1.number}/payments`, {});
    mock.pay(S.o1.cf, { status: "SUCCESS", group: "upi" });
    const r = await outcome(asha, S.o1.number, "returned");
    assert.equal(r.json.order.status, "PLACED");
    assert.equal(r.json.order.paymentStatus, "PAID");
    const again = await outcome(asha, S.o1.number, "returned");
    assert.equal(again.json.order.status, "PLACED");
    assert.equal((await row("SELECT count(*)::int AS n FROM payments WHERE order_id = (SELECT id FROM orders WHERE order_number = $1) AND status = 'PAID'", [S.o1.number])).n, 1);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "asha@example.com" && /payment/i.test(m.subject)));
  });

  test("webhooks: a good signature places the order, a repeat changes nothing, a bad signature is refused", async () => {
    await binod.del("/api/cart");
    await binod.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    const placed = await placeCart(binod, S.homeBinod);
    const number = placed.json.order.orderNumber;
    const paid = mock.pay(placed.json.payment.gatewayOrderId, { status: "SUCCESS" });
    const bad = await webhook(mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: paid, secret: "not-the-secret" }));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, "WEBHOOK_SIGNATURE_INVALID");
    assert.equal((await binod.get(`/api/orders/${number}`)).json.order.status, "PENDING_PAYMENT");
    const w = mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: paid });
    const first = await webhook(w);
    assert.equal(first.status, 200);
    assert.equal(first.json.result, "ORDER_PLACED");
    const second = await webhook(w);
    assert.equal(second.json.duplicate, true);
    assert.equal((await binod.get(`/api/orders/${number}`)).json.order.status, "PLACED");
    await settle();
    assert.equal(devOutbox().filter((m) => m.to === "binod@example.com" && m.subject.includes(number) && /payment|placed/i.test(m.subject)).length, 1, "one confirmation email, not two");
  });

  test("a payment with the wrong amount, or for an order FrameX doesn't know, is not accepted", async () => {
    await binod.del("/api/cart");
    await binod.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    const placed = await placeCart(binod, S.homeBinod);
    const number = placed.json.order.orderNumber;
    const cheap = mock.pay(placed.json.payment.gatewayOrderId, { status: "SUCCESS", amount: 1 });
    const r = await webhook(mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: cheap }));
    assert.equal(r.json.result, "MISMATCH_REJECTED");
    assert.equal((await binod.get(`/api/orders/${number}`)).json.order.status, "PENDING_PAYMENT");
    // An order that exists at Cashfree but not at FrameX.
    mock.orders.set("FX-999999-deadbeef", { cf_order_id: "1", order_id: "FX-999999-deadbeef", order_amount: 500, order_currency: "INR", order_status: "ACTIVE", order_tags: {}, customer_details: {} });
    const stray = mock.pay("FX-999999-deadbeef", { status: "SUCCESS" });
    assert.equal((await webhook(mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: stray }))).json.result, "NO_MATCHING_ORDER");
    S.unpaid = { number, cf: placed.json.payment.gatewayOrderId };
  });

  test("an order Cashfree closed unpaid gets a new Cashfree order on retry; the old one can't pay it", async () => {
    // The wrong-amount payment above is ignored; Cashfree then closes the order.
    mock.payments.forEach((p, id) => p.order_id === S.unpaid.cf && mock.payments.delete(id));
    mock.expire(S.unpaid.cf);
    const retry = await binod.post(`/api/orders/${S.unpaid.number}/payments`, {});
    assert.equal(retry.status, 200, retry.text);
    assert.notEqual(retry.json.payment.gatewayOrderId, S.unpaid.cf);
    mock.pay(retry.json.payment.gatewayOrderId, { status: "SUCCESS" });
    assert.equal((await outcome(binod, S.unpaid.number)).json.order.status, "PLACED");
  });

  test("gift wrapping is part of the amount sent to Cashfree", async () => {
    await asha.del("/api/cart");
    await asha.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    const plain = await quoteFor(asha, S.home);
    const wrapped = await quoteFor(asha, S.home, { giftWrap: true });
    assert.equal(wrapped.total, plain.total + 49);
    const r = await placeCart(asha, S.home, { giftWrap: true });
    assert.equal(mock.order(r.json.payment.gatewayOrderId).order_amount, wrapped.total);
    assert.equal(r.json.order.giftWrapFee, 49);
    S.wrapped = { number: r.json.order.orderNumber, cf: r.json.payment.gatewayOrderId, total: wrapped.total };
  });

  test("an admin cancelling a paid order refunds it through Cashfree", async () => {
    mock.pay(S.wrapped.cf, { status: "SUCCESS" });
    assert.equal((await outcome(asha, S.wrapped.number)).json.order.paymentStatus, "PAID");
    const r = await admin.post(`/api/admin/orders/${S.wrapped.number}/status`, { status: "CANCELLED", note: "Customer asked" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.order.status, "CANCELLED");
    assert.equal(r.json.order.paymentStatus, "REFUNDED");
    const refund = [...mock.refunds.values()].find((f) => f.order_id === S.wrapped.cf);
    assert.equal(refund.refund_amount, S.wrapped.total);
  });

  test("Cash on Delivery never touches Cashfree", async () => {
    await asha.del("/api/cart");
    await asha.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    const before = mock.calls.length;
    const quote = await quoteFor(asha, S.home, { method: "COD" });
    assert.equal(quote.codFee, 40);
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: key() });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.status, "PLACED");
    assert.equal(r.json.payment, null);
    assert.equal(mock.calls.length, before);
    assert.equal((await row("SELECT order_type FROM orders WHERE order_number = $1", [r.json.order.orderNumber])).order_type, "STANDARD_PRODUCT_ORDER");
  });

  test("when Cashfree can't be reached the order is kept and nothing is marked paid", async () => {
    await binod.del("/api/cart");
    await binod.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    mock.state.down = true;
    const r = await placeCart(binod, S.homeBinod);
    mock.state.down = false;
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.payment, null);
    assert.equal(r.json.paymentError.code, "PAYMENT_GATEWAY_ERROR");
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    const retry = await binod.post(`/api/orders/${r.json.order.orderNumber}/payments`, {});
    assert.match(retry.json.payment.paymentSessionId, /^session_/);
  });
});

/* ====================================================================== Artists */

describe("artists: applying, approval and the public directory", () => {
  test("anyone can apply; applying creates no login", async () => {
    const r = await visitor.post("/api/artists/applications", { name: "Meera Nair", email: "meera@art.example", phone: "9876500061", city: "Bhubaneswar", state: "Odisha", artStyles: "Portraits, Realism", mediums: "Oil, Pencil", experience: "8 years", message: "I paint portraits." });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.status, "PENDING");
    assert.equal(await row("SELECT 1 AS x FROM users WHERE email = 'meera@art.example'"), undefined);
    assert.equal((await visitor.post("/api/artists/applications", { name: "Meera Nair", email: "meera@art.example", phone: "9876500061", city: "Bhubaneswar", state: "Odisha" })).status, 409);
    assert.equal((await meera.post("/api/auth/login", { identifier: "meera@art.example", password: PASSWORD })).status, 401);
  });

  test("only an admin sees applications and approves; approval creates the artist and a one-time setup link", async () => {
    assert.equal((await asha.get("/api/admin/artist-applications")).status, 403);
    assert.equal((await visitor.get("/api/admin/artist-applications")).status, 401);
    const list = await admin.get("/api/admin/artist-applications?status=PENDING");
    assert.equal(list.json.items.length, 1);
    const r = await admin.post(`/api/admin/artist-applications/${list.json.items[0].id}/approve`, {
      artist: { name: "Meera Nair", username: "meera.paints", city: "Bhubaneswar", area: "Saheed Nagar", state: "Odisha", bio: "Portrait painter.", experience: "8 years", styles: ["Portraits", "Realism"], mediums: ["Oil", "Pencil"], specialties: ["Family portraits"] },
      accountEmail: "meera@art.example"
    });
    assert.equal(r.status, 201, r.text);
    assert.match(r.json.artist.artistCode, /^FRX-ART-\d+$/);
    assert.equal(r.json.artist.status, "ACTIVE");
    assert.match(r.json.credentials.setupUrl, /reset-password\.html#token=/);
    S.meera = r.json.artist;
    // The login doesn't work until the artist sets a password with the link.
    assert.equal((await meera.post("/api/auth/login", { identifier: "meera@art.example", password: PASSWORD })).status, 401);
    const token = r.json.credentials.setupUrl.split("#token=")[1];
    assert.equal((await visitor.post("/api/auth/reset-password", { token, password: PASSWORD, confirmPassword: PASSWORD })).status, 200);
    const login = await meera.post("/api/auth/login", { identifier: "meera@art.example", password: PASSWORD });
    assert.equal(login.status, 200, login.text);
    assert.equal(login.json.user.role, "ARTIST");
    assert.equal(login.json.user.artist.artistCode, S.meera.artistCode);
    // A second artist, added by the admin directly.
    const second = await admin.post("/api/admin/artists", { artist: { name: "Ravi Sahu", city: "Cuttack", state: "Odisha", styles: ["Landscape"], mediums: ["Watercolour"] }, accountEmail: "ravi@art.example" });
    assert.equal(second.status, 201, second.text);
    S.ravi = second.json.artist;
    assert.equal(S.ravi.username, "ravi.sahu");
    const t2 = second.json.credentials.setupUrl.split("#token=")[1];
    await visitor.post("/api/auth/reset-password", { token: t2, password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal((await ravi.post("/api/auth/login", { identifier: "ravi@art.example", password: PASSWORD })).status, 200);
  });

  test("the artist routes are for artists only, and an artist can't reach admin or shop routes", async () => {
    assert.equal((await visitor.get("/api/artist/profile")).status, 401);
    assert.equal((await asha.get("/api/artist/profile")).status, 403);
    assert.equal((await shop.get("/api/artist/profile")).status, 403);
    assert.equal((await meera.get("/api/admin/overview")).status, 403);
    assert.equal((await meera.get("/api/shops/FRX-SHOP-9001/orders")).status, 403);
    assert.equal((await meera.get("/api/artist/profile")).json.profile.artistCode, S.meera.artistCode);
  });

  test("the public directory shows the city and area, never a phone number, email or street address", async () => {
    const list = await visitor.get("/api/artists");
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 2);
    const text = list.text + (await visitor.get(`/api/artists/${S.meera.username}`)).text;
    assert.ok(!/9876500061|meera@art\.example|\+91/.test(text), "no contact details in public answers");
    const m = list.json.items.find((a) => a.username === "meera.paints");
    assert.deepEqual(m.location, { city: "Bhubaneswar", area: "Saheed Nagar", state: "Odisha" });
    // The artist can hide the area.
    assert.equal((await meera.patch("/api/artist/profile", { showArea: false })).status, 200);
    assert.equal((await visitor.get("/api/artists/meera.paints")).json.artist.location.area, "");
    await meera.patch("/api/artist/profile", { showArea: true });
  });

  test("search by name, username, style and city", async () => {
    const names = async (qs) => (await visitor.get(`/api/artists?${qs}`)).json.items.map((a) => a.username).sort();
    assert.deepEqual(await names("q=meera"), ["meera.paints"]);
    assert.deepEqual(await names("q=ravi.sahu"), ["ravi.sahu"]);
    assert.deepEqual(await names("style=portraits"), ["meera.paints"]);
    assert.deepEqual(await names("city=cuttack"), ["ravi.sahu"]);
    assert.deepEqual(await names("q=watercolour"), ["ravi.sahu"]);
    assert.deepEqual(await names("q=zzzz"), []);
    const facets = (await visitor.get("/api/artists/facets")).json;
    assert.ok(facets.styles.some((s) => s.name === "Portraits") && facets.cities.some((c) => c.name === "Cuttack"));
  });

  test("an artist changes only their own profile; the fields FrameX keeps can't be set", async () => {
    const r = await meera.patch("/api/artist/profile", { bio: "Portraits in oil and pencil.", status: "INACTIVE", email: "x@y.z", artistCode: "FRX-ART-1", isDemo: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.profile.bio, "Portraits in oil and pencil.");
    assert.equal(r.json.profile.status, "ACTIVE");
    assert.equal(r.json.profile.email, "meera@art.example");
    assert.equal((await meera.patch("/api/artist/profile", { username: "ravi.sahu" })).status, 422);
    // A picture of another artist can't be used as a profile photo.
    const pic = await uploadMedia(ravi);
    assert.equal((await meera.patch("/api/artist/profile", { photo: pic.ref })).status, 422);
    const own = await uploadMedia(meera);
    assert.equal((await meera.patch("/api/artist/profile", { photo: own.ref })).json.profile.photo, `/media/${own.id}`);
    assert.equal((await fetch(base + `/media/${own.id}`)).status, 200);
  });

  test("an unlisted artist disappears from the directory and comes back when listed again", async () => {
    assert.equal((await admin.post(`/api/admin/artists/${S.ravi.uuid}/status`, { status: "INACTIVE" })).status, 200);
    assert.equal((await visitor.get("/api/artists")).json.total, 1);
    assert.equal((await visitor.get("/api/artists/ravi.sahu")).status, 404);
    await admin.post(`/api/admin/artists/${S.ravi.uuid}/status`, { status: "ACTIVE" });
    assert.equal((await visitor.get("/api/artists/ravi.sahu")).status, 200);
  });
});

/* ====================================================================== Artworks */

describe("artworks: review before anything is public, then sold through the normal checkout", () => {
  test("a new artwork waits for review and is not public or buyable", async () => {
    const pic = await uploadMedia(meera);
    S.art = newArtworkId();
    const r = await meera.put(`/api/artist/artworks/${S.art}`, artworkBody([pic.ref]));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.artwork.status, "PENDING_REVIEW");
    assert.equal(r.json.artwork.onSale, false);
    assert.equal((await visitor.get(`/api/artworks/${S.art}`)).status, 404);
    assert.equal((await visitor.get("/api/artworks")).json.total, 0);
    assert.equal(await row("SELECT 1 AS x FROM catalog_products WHERE id = $1", [S.art]), undefined, "nothing unreviewed is in the catalogue");
    const add = await asha.post("/api/cart/items", { productId: S.art, quantity: 1 });
    assert.ok(add.status >= 400, "an artwork that isn't approved can't be put in a cart");
    assert.equal((await meera.get("/api/artist/artworks")).json.counts.PENDING_REVIEW, 1);
    await settle();
  });

  test("what an artist sends is checked: price, pictures of their own, and the fields that matter", async () => {
    const theirs = await uploadMedia(ravi);
    const bad = await meera.put(`/api/artist/artworks/${newArtworkId()}`, artworkBody([theirs.ref], { price: -5, title: "" }));
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["images", "price", "title"]);
    // Another artist can't read or change this artwork, and can't reuse its id.
    assert.equal((await ravi.get(`/api/artist/artworks/${S.art}`)).status, 404);
    const mine = await uploadMedia(ravi);
    assert.equal((await ravi.put(`/api/artist/artworks/${S.art}`, artworkBody([mine.ref]))).status, 404);
    assert.equal((await asha.put(`/api/artist/artworks/${S.art}`, artworkBody([]))).status, 403);
  });

  test("rejecting needs a reason; the artist sees it and the artwork stays hidden", async () => {
    assert.equal((await meera.post(`/api/admin/artworks/${S.art}/review`, { decision: "APPROVED" })).status, 403);
    assert.equal((await admin.post(`/api/admin/artworks/${S.art}/review`, { decision: "REJECTED" })).status, 422);
    const r = await admin.post(`/api/admin/artworks/${S.art}/review`, { decision: "REJECTED", reason: "The photo is too dark. Please add a clearer picture." });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.artwork.status, "REJECTED");
    const own = (await meera.get(`/api/artist/artworks/${S.art}`)).json.artwork;
    assert.equal(own.status, "REJECTED");
    assert.equal(own.rejectionReason, "The photo is too dark. Please add a clearer picture.");
    assert.equal((await visitor.get(`/api/artworks/${S.art}`)).status, 404);
    assert.equal((await admin.post(`/api/admin/artworks/${S.art}/review`, { decision: "APPROVED" })).status, 409, "only an artwork waiting for review can be decided");
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "meera@art.example" && /not approved/i.test(m.subject) && m.text.includes("too dark")));
    assert.ok((await meera.get("/api/notifications")).json.items.some((n) => n.kind === "ARTWORK_REJECTED"));
  });

  test("changing it sends it back to review; approval makes it public", async () => {
    const pic = await uploadMedia(meera, jpeg({ width: 2000, height: 1500, fill: 0x52 }));
    const again = await meera.put(`/api/artist/artworks/${S.art}`, artworkBody([pic.ref]));
    assert.equal(again.json.artwork.status, "PENDING_REVIEW");
    assert.equal(again.json.artwork.rejectionReason, "");
    const r = await admin.post(`/api/admin/artworks/${S.art}/review`, { decision: "APPROVED" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.artwork.status, "APPROVED");
    const pub = await visitor.get(`/api/artworks/${S.art}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.json.artwork.title, "Evening at the Ghat");
    assert.equal(pub.json.artwork.price, 7000);
    assert.equal(pub.json.artwork.artist.username, "meera.paints");
    assert.equal(pub.json.artwork.available, true);
    assert.equal((await visitor.get("/api/artworks?q=ghat")).json.total, 1);
    assert.equal((await visitor.get("/api/artists/meera.paints")).json.artworks.length, 1);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "meera@art.example" && /approved/i.test(m.subject)));
  });

  test("an approved artwork is bought like any ready-made product: no photo, paid online, no gift wrap", async () => {
    await asha.del("/api/cart");
    const add = await asha.post("/api/cart/items", { productId: S.art, quantity: 1 });
    assert.equal(add.status, 201, add.text);
    const line = add.json.cart.items[0];
    assert.equal(line.unitPrice, 7000);
    assert.equal(line.photosRequired, 0);
    assert.equal(line.shopId, S.meera.artistCode);
    const quote = await quoteFor(asha, S.home);
    assert.equal(quote.payment.cod.available, false);
    assert.equal(quote.giftWrap.available, false);
    assert.equal(quote.total, 7000 + 60);
    // The price can't be set from the browser.
    const cheat = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", expectedTotal: 100, idempotencyKey: key() });
    assert.equal(cheat.status, 409);
    assert.equal(cheat.json.error.code, "TOTAL_CHANGED");
    const r = await placeCart(asha, S.home);
    assert.equal(r.status, 201, r.text);
    mock.pay(r.json.payment.gatewayOrderId, { status: "SUCCESS", group: "credit_card" });
    const done = await outcome(asha, r.json.order.orderNumber);
    assert.equal(done.json.order.status, "PLACED");
    S.artOrder = r.json.order.orderNumber;
    const o = await row("SELECT o.order_type, i.seller_type, i.artist_id FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.order_number = $1", [S.artOrder]);
    assert.equal(o.order_type, "ARTWORK_ORDER");
    assert.equal(o.seller_type, "ARTIST");
    assert.equal(o.artist_id, S.meera.uuid);
  });

  test("an original exists once: the next buyer is told it is sold", async () => {
    assert.equal((await visitor.get(`/api/artworks/${S.art}`)).json.artwork.available, false);
    await binod.del("/api/cart");
    const add = await binod.post("/api/cart/items", { productId: S.art, quantity: 1 });
    assert.ok(add.status >= 400 || add.json.cart.items[0].available === false, "a sold original can't be ordered again");
  });

  test("the artist sees the order of their artwork; another artist does not", async () => {
    const mine = await meera.get("/api/artist/orders");
    assert.equal(mine.status, 200);
    assert.equal(mine.json.items.length, 1);
    assert.equal(mine.json.items[0].orderNumber, S.artOrder);
    const one = await meera.get(`/api/artist/orders/${S.artOrder}`);
    assert.equal(one.status, 200, one.text);
    assert.equal(one.json.order.items.length, 1);
    assert.equal((await ravi.get("/api/artist/orders")).json.items.length, 0);
    assert.equal((await ravi.get(`/api/artist/orders/${S.artOrder}`)).status, 404);
    const step = await meera.patch(`/api/artist/orders/${S.artOrder}/items/${one.json.order.items[0].id}`, { status: "ACCEPTED" });
    assert.equal(step.status, 200, step.text);
  });

  test("pausing takes an artwork off sale without a new review; withdrawing removes it", async () => {
    const pic = await uploadMedia(ravi);
    const id = newArtworkId();
    await ravi.put(`/api/artist/artworks/${id}`, artworkBody([pic.ref], { title: "Monsoon Fields", price: 3200, kind: "PRINT", stock: 5 }));
    await admin.post(`/api/admin/artworks/${id}/review`, { decision: "APPROVED" });
    assert.equal((await visitor.get(`/api/artworks/${id}`)).json.artwork.stock, 5);
    assert.equal((await ravi.post(`/api/artist/artworks/${id}/status`, { status: "INACTIVE" })).json.artwork.status, "INACTIVE");
    assert.equal((await visitor.get(`/api/artworks/${id}`)).status, 404);
    assert.equal((await ravi.post(`/api/artist/artworks/${id}/status`, { status: "APPROVED" })).json.artwork.status, "APPROVED");
    assert.equal((await visitor.get(`/api/artworks/${id}`)).status, 200);
    // A rejected or pending artwork can't be made public by its artist.
    const other = newArtworkId();
    await ravi.put(`/api/artist/artworks/${other}`, artworkBody([pic.ref], { title: "Draft piece" }));
    assert.equal((await ravi.post(`/api/artist/artworks/${other}/status`, { status: "APPROVED" })).status, 409);
    assert.equal((await ravi.post(`/api/artist/artworks/${other}/status`, { status: "CANCELLED" })).json.artwork.status, "CANCELLED");
    S.raviArt = id;
  });

  test("a withdrawn artwork can come back, but only through a new review", async () => {
    const pic = await uploadMedia(ravi);
    const id = newArtworkId();
    await ravi.put(`/api/artist/artworks/${id}`, artworkBody([pic.ref], { title: "Kite Festival", price: 2100 }));
    await admin.post(`/api/admin/artworks/${id}/review`, { decision: "APPROVED" });
    assert.equal((await ravi.post(`/api/artist/artworks/${id}/status`, { status: "PENDING_REVIEW" })).status, 409, "only a withdrawn artwork can be sent again");
    await ravi.post(`/api/artist/artworks/${id}/status`, { status: "CANCELLED" });
    assert.equal((await visitor.get(`/api/artworks/${id}`)).status, 404);
    // Withdrawn: it can't be edited or shown again directly, and nobody else can bring it back.
    assert.equal((await ravi.put(`/api/artist/artworks/${id}`, artworkBody([pic.ref], { title: "Kite Festival" }))).status, 409);
    assert.equal((await ravi.post(`/api/artist/artworks/${id}/status`, { status: "APPROVED" })).status, 409);
    assert.equal((await meera.post(`/api/artist/artworks/${id}/status`, { status: "PENDING_REVIEW" })).status, 404);
    assert.equal((await visitor.post(`/api/artist/artworks/${id}/status`, { status: "PENDING_REVIEW" })).status, 401);
    const back = await ravi.post(`/api/artist/artworks/${id}/status`, { status: "PENDING_REVIEW" });
    assert.equal(back.status, 200, back.text);
    assert.equal(back.json.artwork.status, "PENDING_REVIEW");
    assert.equal((await visitor.get(`/api/artworks/${id}`)).status, 404, "still not public: it waits for FrameX");
    assert.ok((await admin.get("/api/admin/artworks?status=PENDING_REVIEW")).json.items.some((w) => w.id === id), "it is in the admin's review list again");
    assert.equal((await admin.post(`/api/admin/artworks/${id}/review`, { decision: "APPROVED" })).status, 200);
    const shown = await visitor.get(`/api/artworks/${id}`);
    assert.equal(shown.status, 200);
    assert.equal(shown.json.artwork.title, "Kite Festival");
    // Withdrawn again, so the tests after this one see what they saw before.
    assert.equal((await ravi.post(`/api/artist/artworks/${id}/status`, { status: "CANCELLED" })).json.artwork.status, "CANCELLED");
  });

  test("a shop can't list an artwork as one of its products", async () => {
    const r = await shop.put("/api/shops/FRX-SHOP-9001/products/lp-artworktest1", { name: "Fake artwork", productType: "artwork", status: "published", pricing: { basePrice: 500 } });
    assert.ok(r.status === 422 || (r.status === 200 && r.json.product.productType === ""), "the artwork type is not available to shops");
  });
});

/* ====================================================================== Custom paintings */

describe("custom paintings: request, accept or decline, 40% advance, 60% on completion", () => {
  test("the split is exact, in whole rupees, and always adds up", () => {
    assert.deepEqual(splitPrice(7000, 40), { advance: 2800, balance: 4200 });
    assert.deepEqual(splitPrice(1500, 40), { advance: 600, balance: 900 });
    assert.deepEqual(splitPrice(999, 40), { advance: 400, balance: 599 });
    for (const price of [100, 101, 333, 2501, 199999]) for (const pct of [1, 33, 40, 50, 99]) {
      const { advance, balance } = splitPrice(price, pct);
      assert.ok(Number.isInteger(advance) && Number.isInteger(balance) && advance >= 1 && balance >= 1 && advance + balance === price);
    }
  });

  test("the state machine has no shortcut to painting, dispatch or 'paid'", () => {
    assert.ok(!NEXT.PENDING_ARTIST_RESPONSE.includes("PAINTING_IN_PROGRESS"));
    assert.ok(!NEXT.ADVANCE_PAYMENT_PENDING.includes("PAINTING_IN_PROGRESS"));
    assert.ok(!NEXT.PAINTING_IN_PROGRESS.includes("READY_FOR_DISPATCH"));
    assert.ok(!NEXT.REMAINING_PAYMENT_PENDING.includes("SHIPPED"));
    assert.deepEqual(NEXT.DECLINED, []);
  });

  test("an artist sets a price list; customers see the active services", async () => {
    const a = await meera.post("/api/artist/services", { title: "Canvas portrait", artType: "Canvas painting", medium: "Oil", size: "18 x 24 in", price: 7000, estDays: 21, description: "From your photo." });
    assert.equal(a.status, 201, a.text);
    const b = await meera.post("/api/artist/services", { title: "Pencil portrait", artType: "Pencil drawing", medium: "Graphite", size: "8 x 10 in", price: 1500, estDays: 7 });
    const hidden = await meera.post("/api/artist/services", { title: "Mural", artType: "Wall painting", size: "Custom", price: 50000, active: false });
    assert.equal((await meera.post("/api/artist/services", { title: "x", size: "", price: 5 })).status, 422);
    S.canvas = a.json.service.id;
    S.pencil = b.json.service.id;
    const pub = (await visitor.get("/api/artists/meera.paints")).json;
    assert.deepEqual(pub.services.map((s) => s.price), [1500, 7000]);
    assert.equal(pub.artist.startingPrice, 1500);
    assert.ok(!pub.services.some((s) => s.id === hidden.json.service.id));
    // Another artist can't change or remove it.
    assert.equal((await ravi.put(`/api/artist/services/${S.canvas}`, { title: "Hijack", artType: "x", size: "1", price: 100 })).status, 404);
    assert.equal((await ravi.del(`/api/artist/services/${S.canvas}`)).status, 404);
  });

  test("a request needs a login, a reference photo of the customer's own, and a service of that artist", async () => {
    const photo = await upload(asha, { name: "grandparents.jpg", body: jpeg({ width: 4000, height: 3000, fill: 0x61 }) });
    S.ref = photo;
    const body = { artist: "meera.paints", serviceId: S.canvas, uploadIds: [photo.id], instructions: "Please keep the background plain.", addressId: S.home, idempotencyKey: key() };
    assert.equal((await visitor.post("/api/paintings", body)).status, 401);
    const noPhoto = await asha.post("/api/paintings", { ...body, uploadIds: [], idempotencyKey: key() });
    assert.equal(noPhoto.status, 422);
    assert.match(noPhoto.json.error.fields.photos, /upload your reference photo/i);
    // Another customer's photo is not usable, even with its id.
    assert.equal((await binod.post("/api/paintings", { ...body, addressId: S.homeBinod, idempotencyKey: key() })).status, 422);
    // A service of another artist, or one that doesn't exist.
    assert.equal((await asha.post("/api/paintings", { ...body, artist: "ravi.sahu", idempotencyKey: key() })).status, 422);
    assert.equal((await asha.post("/api/paintings", { ...body, serviceId: newId(), idempotencyKey: key() })).status, 422);
    assert.equal(mock.calls.filter((c) => c.includes("CP-")).length, 0);
  });

  test("sending a request stores the server's price and split, and takes no payment", async () => {
    const calls = mock.calls.length;
    const k = key();
    const body = { artist: "meera.paints", serviceId: S.canvas, uploadIds: [S.ref.id], instructions: "Please keep the background plain.", addressId: S.home, idempotencyKey: k, price: 1, advanceAmount: 1, advancePercent: 1, status: "ADVANCE_PAID" };
    const r = await asha.post("/api/paintings", body);
    assert.equal(r.status, 201, r.text);
    const q = r.json.request;
    assert.match(q.requestNumber, /^CP-\d+$/);
    assert.equal(q.status, "PENDING_ARTIST_RESPONSE");
    assert.equal(q.price, 7000);
    assert.equal(q.advancePercent, 40);
    assert.equal(q.advanceAmount, 2800);
    assert.equal(q.balanceAmount, 4200);
    assert.equal(q.amountPaid, 0);
    assert.equal(q.payable, null);
    assert.equal(q.nextStep, "Your custom painting request has been sent to the artist.");
    assert.equal(mock.calls.length, calls, "no payment gateway call when a request is sent");
    // The same request sent again is the same request.
    assert.equal((await asha.post("/api/paintings", body)).json.request.requestNumber, q.requestNumber);
    assert.equal((await row("SELECT count(*)::int AS n FROM painting_requests")).n, 1);
    assert.equal((await row("SELECT role, status FROM uploads WHERE id = $1", [S.ref.id])).role, "CUSTOMER_REFERENCE_IMAGE");
    S.cp = q.requestNumber;
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "meera@art.example" && /new custom painting request/i.test(m.subject)));
  });

  test("nothing is payable, and the artist can't start, before the artist answers", async () => {
    const pay = await asha.post(`/api/paintings/${S.cp}/payments`, {});
    assert.equal(pay.status, 409);
    assert.equal(pay.json.error.code, "PAINTING_NOT_PAYABLE");
    const start = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "start" });
    assert.equal(start.status, 409);
    assert.match(start.json.error.message, /advance payment has not been received/i);
  });

  test("only the customer and the artist concerned can see a request", async () => {
    assert.equal((await binod.get(`/api/paintings/${S.cp}`)).status, 404);
    assert.equal((await visitor.get(`/api/paintings/${S.cp}`)).status, 401);
    assert.equal((await ravi.get(`/api/artist/requests/${S.cp}`)).status, 404);
    assert.equal((await ravi.post(`/api/artist/requests/${S.cp}/respond`, { decision: "ACCEPT" })).status, 404);
    assert.equal((await asha.get(`/api/artist/requests/${S.cp}`)).status, 403);
    const seen = (await meera.get(`/api/artist/requests/${S.cp}`)).json.request;
    assert.equal(seen.customer.name, "Asha Verma");
    assert.equal(seen.customer.city, "Dhenkanal");
    assert.equal(seen.deliverTo, null, "the full address is not shown before the painting is paid for");
    assert.ok(!JSON.stringify(seen).includes("Lake View Road") && !("phone" in seen.customer));
    assert.equal(seen.actions.respond, true);
  });

  test("the artist gets the customer's original reference photo through a short-lived link; nobody else does", async () => {
    const link = await meera.post(`/api/artist/requests/${S.cp}/photos/${S.ref.id}/link`, {});
    assert.equal(link.status, 200, link.text);
    const file = await download(link.json.link);
    assert.equal(file.status, 200);
    assert.equal(crypto.createHash("sha256").update(file.body).digest("hex"), (await row("SELECT sha256 FROM uploads WHERE id = $1", [S.ref.id])).sha256, "the artist receives the file exactly as uploaded");
    assert.equal((await ravi.post(`/api/artist/requests/${S.cp}/photos/${S.ref.id}/link`, {})).status, 404);
    assert.equal((await binod.post(`/api/paintings/${S.cp}/photos/${S.ref.id}/link`, {})).status, 404);
    assert.equal((await asha.post(`/api/paintings/${S.cp}/photos/${S.ref.id}/link`, {})).status, 200);
    assert.ok(await row("SELECT 1 AS x FROM audit_logs WHERE action = 'PAINTING_REFERENCE_ACCESSED' AND target_id = $1", [S.cp]));
  });

  test("DECLINE closes the request: nothing is payable and no payment is ever created", async () => {
    const photo = await upload(binod, { name: "dog.jpg" });
    const made = await binod.post("/api/paintings", { artist: "meera.paints", serviceId: S.pencil, uploadIds: [photo.id], instructions: "", addressId: S.homeBinod, idempotencyKey: key() });
    assert.equal(made.status, 201, made.text);
    const number = made.json.request.requestNumber;
    const calls = mock.calls.length;
    const r = await meera.post(`/api/artist/requests/${number}/respond`, { decision: "DECLINE", reason: "Fully booked this month." });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.request.status, "DECLINED");
    const mine = (await binod.get(`/api/paintings/${number}`)).json.request;
    assert.equal(mine.status, "DECLINED");
    assert.equal(mine.nextStep, "The artist has declined this custom painting request.");
    assert.equal(mine.declineReason, "Fully booked this month.");
    assert.equal(mine.payable, null);
    const pay = await binod.post(`/api/paintings/${number}/payments`, {});
    assert.equal(pay.status, 409);
    assert.equal(mock.calls.length, calls);
    assert.equal((await row("SELECT count(*)::int AS n FROM painting_payments WHERE request_id = (SELECT id FROM painting_requests WHERE request_number = $1)", [number])).n, 0);
    // A declined request can't be answered again, and its photo is no longer available to the artist.
    assert.equal((await meera.post(`/api/artist/requests/${number}/respond`, { decision: "ACCEPT" })).status, 409);
    assert.equal((await meera.post(`/api/artist/requests/${number}/photos/${photo.id}/link`, {})).status, 409);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "binod@example.com" && /declined/i.test(m.subject)));
  });

  test("ACCEPT asks the customer for the 40% advance", async () => {
    const r = await meera.post(`/api/artist/requests/${S.cp}/respond`, { decision: "ACCEPT" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.request.status, "ADVANCE_PAYMENT_PENDING");
    assert.equal(r.json.request.nextStep, "Advance payment pending. Don't start until it is paid.");
    const mine = (await asha.get(`/api/paintings/${S.cp}`)).json.request;
    assert.equal(mine.nextStep, "Your request has been accepted. Please pay the 40% advance to start the painting.");
    assert.equal(mine.payable, "ADVANCE");
    assert.equal(mine.amountDue, 2800);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "asha@example.com" && /accepted/i.test(m.subject) && m.text.includes("2,800")));
  });

  test("the artist cannot start before the advance is verified, whatever the browser says", async () => {
    const start = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "start" });
    assert.equal(start.status, 409);
    assert.equal(start.json.error.code, "PAINTING_INVALID_STEP");
    const pay = await asha.post(`/api/paintings/${S.cp}/payments`, {});
    assert.equal(pay.status, 200, pay.text);
    const s = pay.json.payment;
    assert.equal(s.provider, "cashfree");
    assert.equal(s.stage, "ADVANCE");
    assert.equal(s.amount, 2800 * 100);
    assert.match(s.paymentSessionId, /^session_/);
    assert.equal(mock.order(s.gatewayOrderId).order_amount, 2800);
    S.adv = s.gatewayOrderId;
    // "I paid" from the browser, with nothing at the gateway.
    const claim = await asha.post(`/api/paintings/${S.cp}/payments/outcome`, { reason: "returned" });
    assert.equal(claim.json.request.status, "ADVANCE_PAYMENT_PENDING");
    assert.equal(claim.json.request.amountPaid, 0);
    assert.equal((await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "start" })).status, 409);
    // A failed attempt changes nothing either, and can be retried on the same gateway order.
    mock.pay(S.adv, { status: "FAILED" });
    assert.equal((await asha.post(`/api/paintings/${S.cp}/payments/outcome`, { reason: "failed" })).json.request.status, "ADVANCE_PAYMENT_PENDING");
    const retry = await asha.post(`/api/paintings/${S.cp}/payments`, {});
    assert.equal(retry.json.payment.gatewayOrderId, S.adv);
  });

  test("a payment of the wrong amount is not accepted as the advance", async () => {
    const wrong = mock.pay(S.adv, { status: "SUCCESS", amount: 28 });
    const r = await webhook(mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: wrong }));
    assert.equal(r.json.result, "MISMATCH_REJECTED");
    assert.equal((await asha.get(`/api/paintings/${S.cp}`)).json.request.status, "ADVANCE_PAYMENT_PENDING");
    mock.payments.delete(wrong.cf_payment_id);
    mock.order(S.adv).order_status = "ACTIVE";
  });

  test("a verified advance moves the request to ADVANCE_PAID and tells both sides", async () => {
    mock.pay(S.adv, { status: "SUCCESS" });
    const r = await asha.post(`/api/paintings/${S.cp}/payments/outcome`, { reason: "returned" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.request.status, "ADVANCE_PAID");
    assert.equal(r.json.request.paymentStatus, "ADVANCE_PAID");
    assert.equal(r.json.request.amountPaid, 2800);
    assert.equal(r.json.request.nextStep, "Advance payment received. The artist can now start your painting.");
    assert.equal(r.json.request.payable, null);
    const artistSide = (await meera.get(`/api/artist/requests/${S.cp}`)).json.request;
    assert.equal(artistSide.nextStep, "Advance Paid — Painting Can Start");
    assert.equal(artistSide.actions.start, true);
    // Paying the advance again is not possible.
    assert.equal((await asha.post(`/api/paintings/${S.cp}/payments`, {})).status, 409);
    assert.equal((await row("SELECT count(*)::int AS n FROM painting_payments WHERE stage = 'ADVANCE' AND status = 'PAID' AND request_id = (SELECT id FROM painting_requests WHERE request_number = $1)", [S.cp])).n, 1);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "meera@art.example" && /advance paid/i.test(m.subject)));
    assert.ok(await row("SELECT 1 AS x FROM audit_logs WHERE action = 'PAINTING_PAYMENT_VERIFIED' AND target_id = $1", [S.cp]));
  });

  test("the artist starts, cannot dispatch early, and marks the painting completed", async () => {
    assert.equal((await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "dispatch" })).status, 409);
    assert.equal((await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "complete" })).status, 409);
    const started = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "start" });
    assert.equal(started.status, 200, started.text);
    assert.equal(started.json.request.status, "PAINTING_IN_PROGRESS");
    assert.equal((await asha.post(`/api/paintings/${S.cp}/payments`, {})).status, 409, "the balance is not payable while the painting is in progress");
    const done = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "complete" });
    assert.equal(done.json.request.status, "REMAINING_PAYMENT_PENDING");
    const mine = (await asha.get(`/api/paintings/${S.cp}`)).json.request;
    assert.equal(mine.nextStep, "Your painting is completed. Please pay the remaining 60% to continue with dispatch.");
    assert.equal(mine.payable, "BALANCE");
    assert.equal(mine.amountDue, 4200);
    const early = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "dispatch" });
    assert.equal(early.status, 409);
    assert.match(early.json.error.message, /remaining payment has not been received/i);
    await settle();
    assert.ok(devOutbox().some((m) => m.to === "asha@example.com" && /completed/i.test(m.subject) && m.text.includes("4,200")));
  });

  test("the remaining 60% is verified by a signed webhook; a repeat changes nothing", async () => {
    const pay = await asha.post(`/api/paintings/${S.cp}/payments`, {});
    assert.equal(pay.status, 200, pay.text);
    assert.equal(pay.json.payment.stage, "BALANCE");
    assert.equal(pay.json.payment.amount, 4200 * 100);
    assert.notEqual(pay.json.payment.gatewayOrderId, S.adv);
    const paid = mock.pay(pay.json.payment.gatewayOrderId, { status: "SUCCESS", group: "net_banking" });
    assert.equal((await webhook(mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: paid, secret: "wrong" }))).status, 400);
    assert.equal((await asha.get(`/api/paintings/${S.cp}`)).json.request.status, "REMAINING_PAYMENT_PENDING");
    const w = mock.webhook("PAYMENT_SUCCESS_WEBHOOK", { payment: paid });
    assert.equal((await webhook(w)).json.result, "PAINTING_STAGE_PAID");
    assert.equal((await webhook(w)).json.duplicate, true);
    const mine = (await asha.get(`/api/paintings/${S.cp}`)).json.request;
    assert.equal(mine.status, "READY_FOR_DISPATCH");
    assert.equal(mine.paymentStatus, "FULLY_PAID");
    assert.equal(mine.amountPaid, 7000);
    assert.deepEqual(mine.payments.filter((p) => p.status === "PAID").map((p) => [p.stage, p.amount]), [["ADVANCE", 2800], ["BALANCE", 4200]]);
    await settle();
    assert.equal(devOutbox().filter((m) => m.to === "asha@example.com" && /remaining payment received/i.test(m.subject)).length, 1);
  });

  test("once fully paid the artist sees where to send it, dispatches, and the customer confirms delivery", async () => {
    const seen = (await meera.get(`/api/artist/requests/${S.cp}`)).json.request;
    assert.equal(seen.deliverTo.line1, "12 Lake View Road");
    assert.ok(seen.customer.phone);
    assert.equal((await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "deliver" })).status, 409);
    const sent = await meera.post(`/api/artist/requests/${S.cp}/step`, { step: "dispatch", note: "India Post EO123456789IN" });
    assert.equal(sent.json.request.status, "SHIPPED");
    assert.equal((await binod.post(`/api/paintings/${S.cp}/delivered`, {})).status, 404);
    const got = await asha.post(`/api/paintings/${S.cp}/delivered`, {});
    assert.equal(got.json.request.status, "DELIVERED");
    assert.equal(got.json.request.dispatchNote, "India Post EO123456789IN");
    const e = (await meera.get("/api/artist/earnings")).json.earnings;
    assert.equal(e.paintings.received, 7000);
    assert.equal(e.artworks.paid, 7000);
  });

  test("a customer can cancel before paying; after paying only FrameX can, and the refund is tracked, not automatic", async () => {
    const photo = await upload(binod, { name: "cat.jpg" });
    const make = async () => (await binod.post("/api/paintings", { artist: "meera.paints", serviceId: S.pencil, uploadIds: [photo.id], instructions: "", addressId: S.homeBinod, idempotencyKey: key() })).json.request.requestNumber;
    const a = await make();
    assert.equal((await binod.post(`/api/paintings/${a}/cancel`, { reason: "Changed my mind" })).json.request.status, "CANCELLED");
    assert.equal((await meera.post(`/api/artist/requests/${a}/respond`, { decision: "ACCEPT" })).status, 409);
    const b = await make();
    await meera.post(`/api/artist/requests/${b}/respond`, { decision: "ACCEPT" });
    const pay = await binod.post(`/api/paintings/${b}/payments`, {});
    assert.equal(pay.json.payment.amount, 600 * 100);
    mock.pay(pay.json.payment.gatewayOrderId, { status: "SUCCESS" });
    assert.equal((await binod.post(`/api/paintings/${b}/payments/refresh`, {})).json.request.status, "ADVANCE_PAID");
    const self = await binod.post(`/api/paintings/${b}/cancel`, {});
    assert.equal(self.status, 409);
    assert.equal(self.json.error.code, "PAINTING_NOT_CANCELLABLE");
    assert.equal((await meera.post(`/api/admin/paintings/${b}/cancel`, { reason: "x y z" })).status, 403);
    const refunds = mock.refunds.size;
    const cancelled = await admin.post(`/api/admin/paintings/${b}/cancel`, { reason: "The artist is unwell." });
    assert.equal(cancelled.status, 200, cancelled.text);
    assert.equal(cancelled.json.request.status, "CANCELLED");
    assert.equal(cancelled.json.request.refundStatus, "REFUND_PENDING");
    assert.equal(mock.refunds.size, refunds, "no money is sent back automatically");
    const recorded = await admin.post(`/api/admin/paintings/${b}/refund-recorded`, { note: "Rs 600 refunded in the Cashfree dashboard." });
    assert.equal(recorded.json.request.refundStatus, "REFUNDED");
    assert.equal((await admin.post(`/api/admin/paintings/${b}/refund-recorded`, { note: "again please" })).status, 409);
  });

  test("an accepted request whose advance never comes is closed after the waiting time", async () => {
    const photo = await upload(binod, { name: "house.jpg" });
    const number = (await binod.post("/api/paintings", { artist: "meera.paints", serviceId: S.pencil, uploadIds: [photo.id], instructions: "", addressId: S.homeBinod, idempotencyKey: key() })).json.request.requestNumber;
    await meera.post(`/api/artist/requests/${number}/respond`, { decision: "ACCEPT" });
    assert.equal(await expireUnpaidAdvances(), 0, "not before the waiting time is over");
    await db.query("UPDATE painting_requests SET responded_at = now() - interval '30 days' WHERE request_number = $1", [number]);
    assert.equal(await expireUnpaidAdvances(), 1);
    const r = (await binod.get(`/api/paintings/${number}`)).json.request;
    assert.equal(r.status, "CANCELLED");
    assert.equal(r.cancelReason, "The advance was not paid in time.");
  });
});

/* ====================================================================== Settings */

describe("platform settings an admin can change", () => {
  test("only an admin reads or changes them, and only known settings with sane values", async () => {
    assert.equal((await asha.get("/api/admin/settings")).status, 403);
    assert.equal((await meera.patch("/api/admin/settings", { customPaintingAdvancePercent: 10 })).status, 403);
    const list = (await admin.get("/api/admin/settings")).json.items;
    assert.equal(list.find((s) => s.key === "customPaintingAdvancePercent").value, 40);
    const bad = await admin.patch("/api/admin/settings", { customPaintingAdvancePercent: 100, giftWrapFee: -1, somethingElse: 5 });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["customPaintingAdvancePercent", "giftWrapFee", "somethingElse"]);
    assert.equal(config.paintings.advancePercent, 40);
  });

  test("a new advance percentage applies to requests made from now on; agreed requests keep theirs", async () => {
    const r = await admin.patch("/api/admin/settings", { customPaintingAdvancePercent: 50 });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.items.find((s) => s.key === "customPaintingAdvancePercent").changed, true);
    assert.equal((await visitor.get("/api/config")).json.paintings.advancePercent, 50);
    const photo = await upload(asha, { name: "wedding.jpg" });
    const made = (await asha.post("/api/paintings", { artist: "meera.paints", serviceId: S.canvas, uploadIds: [photo.id], instructions: "", addressId: S.home, idempotencyKey: key() })).json.request;
    assert.equal(made.advancePercent, 50);
    assert.equal(made.advanceAmount, 3500);
    assert.equal(made.balanceAmount, 3500);
    const old = (await asha.get(`/api/paintings/${S.cp}`)).json.request;
    assert.equal(old.advancePercent, 40);
    assert.equal(old.advanceAmount, 2800);
    // It survives a restart (it is read from the database), and can be put back to the server's default.
    config.paintings.advancePercent = 40;
    await loadSettings();
    assert.equal(config.paintings.advancePercent, 50);
    await admin.patch("/api/admin/settings", { customPaintingAdvancePercent: null });
    assert.equal(config.paintings.advancePercent, 40);
    await asha.post(`/api/paintings/${made.requestNumber}/cancel`, {});
  });

  test("the gift-wrap fee and the COD fee an admin sets are the ones checkout charges", async () => {
    await admin.patch("/api/admin/settings", { giftWrapFee: 75, codFee: 25 });
    await asha.del("/api/cart");
    await asha.post("/api/cart/items", { productId: WALL_ART.id, quantity: 1 });
    const q = await quoteFor(asha, S.home, { method: "COD", giftWrap: true });
    assert.equal(q.giftWrapFee, 75);
    assert.equal(q.codFee, 25);
    await admin.patch("/api/admin/settings", { giftWrapEnabled: false });
    assert.equal((await quoteFor(asha, S.home, { giftWrap: true })).giftWrap.available, false);
    await admin.patch("/api/admin/settings", { giftWrapEnabled: null, giftWrapFee: null, codFee: null });
    assert.equal((await quoteFor(asha, S.home, { method: "COD", giftWrap: true })).giftWrapFee, 49);
    assert.ok(await row("SELECT 1 AS x FROM audit_logs WHERE action = 'SETTINGS_CHANGED'"));
  });
});

/* ====================================================================== Reviews, notifications, search, accounts */

describe("reviews, notifications, search and accounts", () => {
  test("only someone who received it can review; one review per purchase", async () => {
    const body = { targetType: "ARTIST", targetId: S.meera.artistCode, sourceType: "PAINTING", sourceId: S.cp, rating: 5, body: "Exactly like the photo. Thank you!" };
    assert.equal((await visitor.post("/api/reviews", body)).status, 401);
    assert.equal((await binod.post("/api/reviews", body)).status, 403, "someone else's painting is not a reason to review");
    assert.equal((await asha.post("/api/reviews", { ...body, targetId: S.ravi.artistCode })).status, 403, "another artist didn't paint it");
    assert.equal((await asha.post("/api/reviews", { ...body, rating: 9 })).status, 422);
    const r = await asha.post("/api/reviews", body);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.review.author, "Asha V.");
    assert.equal((await asha.post("/api/reviews", { ...body, rating: 4 })).status, 201);
    const pub = (await visitor.get("/api/artists/meera.paints")).json;
    assert.deepEqual(pub.artist.rating, { average: 4, count: 1 });
    assert.equal(pub.reviews.length, 1);
    // The artwork order is not delivered yet, so it can't be reviewed.
    assert.equal((await asha.post("/api/reviews", { targetType: "ARTWORK", targetId: S.art, sourceType: "ORDER", sourceId: S.artOrder, rating: 5, body: "Lovely" })).status, 403);
    assert.deepEqual((await asha.get(`/api/reviews/mine?sourceType=PAINTING&sourceId=${S.cp}`)).json.items.map((i) => [i.targetType, i.review.rating]), [["ARTIST", 4]]);
    // FrameX can hide a review; it then no longer counts.
    const id = (await admin.get("/api/admin/reviews")).json.items[0].id;
    assert.equal((await admin.post(`/api/admin/reviews/${id}/status`, { status: "HIDDEN" })).status, 200);
    assert.deepEqual((await visitor.get("/api/artists/meera.paints")).json.artist.rating, { average: null, count: 0 });
    await admin.post(`/api/admin/reviews/${id}/status`, { status: "PUBLISHED" });
  });

  test("a review can carry one photo: only its writer can add it, only a real picture is kept, and it is public only while the review is", async () => {
    const send = (client, id, body, type = "image/jpeg") => fetch(`${base}/api/reviews/${id}/photo`, { method: "POST", headers: { "Content-Type": type, "X-FrameX-Client": "test", ...(client.cookie ? { Cookie: client.cookie } : {}) }, body }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
    const mine = (await asha.get(`/api/reviews/mine?sourceType=PAINTING&sourceId=${S.cp}`)).json.items[0].review;
    assert.deepEqual([typeof mine.id, mine.photo, mine.hidden], ["string", null, false]);
    const picture = jpeg({ width: 1200, height: 1600, bytes: 20_000, fill: 0x33 });
    // Not logged in, someone else, a review that doesn't exist, a file that is not a picture.
    assert.equal((await send(visitor, mine.id, picture)).status, 401);
    assert.equal((await send(binod, mine.id, picture)).status, 404, "another customer can't touch this review");
    assert.equal((await send(asha, crypto.randomUUID(), picture)).status, 404);
    assert.equal((await send(asha, mine.id, Buffer.from("<svg onload=alert(1)>"))).status, 415);
    assert.equal((await send(asha, mine.id, Buffer.from("GIF89a not allowed"), "image/gif")).status, 415);
    const saved = await send(asha, mine.id, picture);
    assert.equal(saved.status, 201, JSON.stringify(saved.json));
    assert.match(saved.json.review.photo, new RegExp(`^/media/review/${mine.id}\\?v=\\d+$`));
    // Anyone can see it, with the type read from the file itself.
    const shown = await fetch(base + saved.json.review.photo);
    assert.deepEqual([shown.status, shown.headers.get("content-type"), shown.headers.get("x-content-type-options"), (await shown.arrayBuffer()).byteLength], [200, "image/jpeg", "nosniff", picture.length]);
    // It is in the public lists: the gallery (with what was reviewed), the artist's page, the latest reviews.
    const gallery = (await visitor.get("/api/reviews/gallery")).json;
    const entry = gallery.items.find((r) => r.id === mine.id);
    assert.deepEqual([gallery.total >= 1, entry.photo, entry.author, entry.targetName, entry.verified], [true, saved.json.review.photo, "Asha V.", "Meera Nair", true]);
    assert.equal((await visitor.get("/api/artists/meera.paints")).json.reviews[0].photo, saved.json.review.photo);
    assert.ok((await visitor.get("/api/reviews/latest")).json.items.some((r) => r.photo === saved.json.review.photo));
    // Replacing it removes the old file from the disk.
    const before = (await db.query("SELECT photo_key FROM reviews WHERE id = $1", [mine.id])).rows[0].photo_key;
    const again = await send(asha, mine.id, jpeg({ width: 800, height: 800, bytes: 9000, fill: 0x44 }));
    const after = (await db.query("SELECT photo_key FROM reviews WHERE id = $1", [mine.id])).rows[0].photo_key;
    const storage = await import("../src/lib/storage.js");
    assert.deepEqual([again.status, before !== after, await storage.exists(before), await storage.exists(after)], [201, true, false, true]);
    // Changing the stars or the words keeps the photo.
    await asha.post("/api/reviews", { targetType: "ARTIST", targetId: S.meera.artistCode, sourceType: "PAINTING", sourceId: S.cp, rating: 4, body: "Exactly like the photo." });
    assert.equal((await db.query("SELECT photo_key FROM reviews WHERE id = $1", [mine.id])).rows[0].photo_key, after);
    // Hidden by FrameX: the picture is no longer served and the review leaves the gallery.
    await admin.post(`/api/admin/reviews/${mine.id}/status`, { status: "HIDDEN" });
    assert.equal((await fetch(`${base}/media/review/${mine.id}`)).status, 404);
    assert.ok(!(await visitor.get("/api/reviews/gallery")).json.items.some((r) => r.id === mine.id));
    assert.equal((await asha.get(`/api/reviews/mine?sourceType=PAINTING&sourceId=${S.cp}`)).json.items[0].review.hidden, true);
    await admin.post(`/api/admin/reviews/${mine.id}/status`, { status: "PUBLISHED" });
    assert.equal((await fetch(`${base}/media/review/${mine.id}`)).status, 200);
    // The writer can take the photo away; someone else can't.
    assert.equal((await binod.del(`/api/reviews/${mine.id}/photo`)).status, 404);
    const removed = await asha.del(`/api/reviews/${mine.id}/photo`);
    assert.deepEqual([removed.status, removed.json.review.photo, await storage.exists(after), (await fetch(`${base}/media/review/${mine.id}`)).status], [200, null, false, 404]);
    assert.equal((await fetch(base + "/media/review/not-an-id")).status, 404);
  });

  test("notifications belong to their user and can be marked read", async () => {
    const mine = await asha.get("/api/notifications");
    assert.equal(mine.status, 200);
    const kinds = mine.json.items.map((n) => n.kind);
    for (const kind of ["PAINTING_REQUEST_SENT", "PAINTING_ACCEPTED", "PAINTING_ADVANCE_PAID", "PAINTING_COMPLETED", "PAINTING_FULLY_PAID", "PAINTING_SHIPPED", "ORDER_PLACED_PAID"]) assert.ok(kinds.includes(kind), `${kind} is in the customer's notifications`);
    assert.ok(mine.json.unread > 0);
    const artistKinds = (await meera.get("/api/notifications")).json.items.map((n) => n.kind);
    for (const kind of ["PAINTING_REQUEST_RECEIVED", "PAINTING_ADVANCE_PAID", "PAINTING_FULLY_PAID", "ARTWORK_APPROVED"]) assert.ok(artistKinds.includes(kind), `${kind} is in the artist's notifications`);
    const first = mine.json.items[0];
    assert.equal((await binod.post(`/api/notifications/${first.id}/read`, {})).status, 200);
    assert.equal((await asha.get("/api/notifications")).json.items.find((n) => n.id === first.id).read, false, "another user can't mark it read");
    assert.equal((await asha.post("/api/notifications/read", {})).json.unread, 0);
    assert.equal((await visitor.get("/api/notifications")).status, 401);
  });

  test("one search finds products, artists and artworks, and only what is public", async () => {
    const r = await visitor.get("/api/search?q=never");
    assert.equal(r.status, 200);
    assert.ok(r.json.results.products.items.some((p) => p.id === WALL_ART.id));
    const a = (await visitor.get("/api/search?q=meera")).json.results;
    assert.equal(a.artists.items[0].username, "meera.paints");
    assert.ok(a.artworks.items.some((w) => w.id === S.art), "an artwork is found by its artist's name");
    assert.equal((await visitor.get("/api/search?q=monsoon&kinds=artworks")).json.results.artworks.total, 1);
    assert.deepEqual(Object.keys((await visitor.get("/api/search?q=monsoon&kinds=artworks")).json.results), ["artworks"]);
    assert.equal((await visitor.get("/api/search?q=draft")).json.results.artworks.total, 0, "a withdrawn artwork is not found");
    assert.deepEqual((await visitor.get("/api/search?q=a")).json.results, {});
  });

  test("an admin can switch a customer or artist login off and on; never an admin's", async () => {
    const list = await admin.get("/api/admin/users?role=ARTIST");
    assert.equal(list.json.items.length, 2);
    const raviUser = list.json.items.find((u) => u.email === "ravi@art.example");
    assert.equal((await asha.post(`/api/admin/users/${raviUser.id}/status`, { enabled: false })).status, 403);
    assert.equal((await admin.post(`/api/admin/users/${raviUser.id}/status`, { enabled: false })).json.user.status, "DISABLED");
    assert.equal((await ravi.get("/api/artist/profile")).status, 401, "a disabled account is logged out at once");
    assert.equal((await ravi.post("/api/auth/login", { identifier: "ravi@art.example", password: PASSWORD })).status, 403);
    assert.equal((await admin.post(`/api/admin/users/${raviUser.id}/status`, { enabled: true })).json.user.status, "ACTIVE");
    assert.equal((await ravi.post("/api/auth/login", { identifier: "ravi@art.example", password: PASSWORD })).status, 200);
    const me = (await admin.get("/api/admin/users?role=ADMIN")).json.items[0];
    assert.equal((await admin.post(`/api/admin/users/${me.id}/status`, { enabled: false })).status, 403);
  });

  test("the admin overview counts artists, artworks and paintings", async () => {
    const o = (await admin.get("/api/admin/overview")).json;
    assert.equal(o.artists.total, 2);
    assert.ok(o.artworks.APPROVED >= 2);
    assert.ok(o.paintings.DELIVERED >= 1);
  });
});

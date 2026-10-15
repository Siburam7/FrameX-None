/* ==========================================================================
   The admin's "send order updates" list: run with "npm test" in backend/.
   A real server on a random port and an in-memory PostgreSQL.

   The server sends nothing here: it only tells the admin page which orders
   are still under way and whom to tell (the page then opens the admin's own
   WhatsApp, one chat at a time).
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.FIRST_ORDER_FREE_DELIVERY = "false"; // the first-order offer is tested on its own (checkout.test.js)
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.COD_FEE = "40";

const { default: assert } = await import("node:assert/strict");
const { default: crypto } = await import("node:crypto");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of response.headers.getSetCookie()) this.cookie = /fx_session=;|Expires=Thu, 01 Jan 1970/i.test(c) ? "" : c.split(";")[0];
    return { status: response.status, json: await response.json().catch(() => null) };
  }
  get = (url) => this.request("GET", url);
  post = (url, body = {}) => this.request("POST", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const asha = new Client();
const binod = new Client();
const visitor = new Client();
const admin = new Client();
const S = {};

/** One ready-made product in the cart, ordered with Cash on Delivery. -> the order number */
async function order(client, addressId) {
  assert.equal((await client.post("/api/cart/items", { productId: "hd-never-give-up", quantity: 1 })).status, 201);
  const quote = (await client.get(`/api/checkout/quote?addressId=${addressId}&paymentMethod=COD`)).json.quote;
  const placed = await client.post("/api/checkout/orders", { addressId, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(placed.status, 201, JSON.stringify(placed.json));
  return placed.json.order.orderNumber;
}
/** Move an order forward, as the admin, until it has this status. */
async function moveTo(number, wanted) {
  for (let i = 0; i < 8; i++) {
    const o = (await admin.get(`/api/admin/orders/${number}`)).json.order;
    if (o.status === wanted) return;
    const next = wanted === "CANCELLED" ? "CANCELLED" : o.nextStatuses.find((s) => s !== "CANCELLED" && s !== "RETURNED");
    assert.ok(next, `no way from ${o.status} to ${wanted}`);
    assert.equal((await admin.post(`/api/admin/orders/${number}/status`, { status: next, note: "test" })).status, 200);
  }
  assert.fail(`never reached ${wanted}`);
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha@example.com", phone: "9876500081", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await binod.post("/api/auth/signup", { name: "Binod Das", email: "binod@example.com", phone: "9876500082", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  const address = { fullName: "Asha Verma", phone: "98765 00081", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
  S.ashaHome = (await asha.post("/api/addresses", address)).json.address.id;
  S.binodHome = (await binod.post("/api/addresses", { ...address, fullName: "Binod Das", phone: "98765 00082" })).json.address.id;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("orders under way, for the admin's order updates", () => {
  test("no orders: an empty list", async () => {
    const r = await admin.get("/api/admin/order-updates");
    assert.deepEqual([r.status, r.json.items, r.json.total], [200, [], 0]);
  });

  test("only orders that are placed and not yet finished are listed, with whom to tell", async () => {
    S.placed = await order(asha, S.ashaHome);
    S.shipped = await order(binod, S.binodHome);
    S.delivered = await order(asha, S.ashaHome);
    S.cancelled = await order(binod, S.binodHome);
    S.outForDelivery = await order(asha, S.ashaHome);
    await moveTo(S.shipped, "SHIPPED");
    await moveTo(S.delivered, "DELIVERED");
    await moveTo(S.cancelled, "CANCELLED");
    await moveTo(S.outForDelivery, "OUT_FOR_DELIVERY");

    const r = (await admin.get("/api/admin/order-updates")).json;
    assert.equal(r.total, 3);
    assert.deepEqual(r.items.map((o) => [o.orderNumber, o.status]), [[S.outForDelivery, "OUT_FOR_DELIVERY"], [S.shipped, "SHIPPED"], [S.placed, "PLACED"]], "newest first; delivered and cancelled orders are not there");
    const one = r.items.find((o) => o.orderNumber === S.shipped);
    assert.deepEqual([one.customer.name, one.customer.email, one.customer.phone.replace(/\D/g, "").slice(-10), one.firstItem.name, one.itemCount, one.paymentMethod, one.total > 0], ["Binod Das", "binod@example.com", "9876500082", "Never Give Up", 1, "COD", true]);

    // Delivering the last step takes it off the list.
    await moveTo(S.outForDelivery, "DELIVERED");
    assert.deepEqual((await admin.get("/api/admin/order-updates")).json.items.map((o) => o.orderNumber), [S.shipped, S.placed]);
  });

  test("the ordinary admin list also says each customer's phone", async () => {
    const list = (await admin.get("/api/admin/orders")).json;
    assert.equal(list.items.length, 5);
    assert.ok(list.items.every((o) => /\d{10}/.test(o.customer.phone.replace(/\D/g, ""))));
  });

  test("only an admin can read it; a customer still sees only their own orders", async () => {
    assert.equal((await visitor.get("/api/admin/order-updates")).status, 401);
    assert.equal((await asha.get("/api/admin/order-updates")).status, 403);
    const mine = (await asha.get("/api/orders?limit=50")).json.items;
    assert.deepEqual(mine.map((o) => o.orderNumber).sort(), [S.placed, S.delivered, S.outForDelivery].sort());
    assert.ok(mine.every((o) => o.customer.name === "Asha Verma"));
  });
});

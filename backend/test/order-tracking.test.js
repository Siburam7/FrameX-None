/* ==========================================================================
   Courier and tracking number of an order (owner, 2026-11-02): FrameX staff
   type them on the admin order page after booking the parcel; the customer
   sees them on the order page and in the "shipped" email and WhatsApp.
   Run with "npm test". Emails and WhatsApp go to the development mailbox.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.WHATSAPP_PROVIDER = "dev";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";

const { default: assert } = await import("node:assert/strict");
const { default: crypto } = await import("node:crypto");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { whatsappSettled } = await import("../src/services/whatsapp-service.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const PASSWORD = "Sunrise-Frame-42";
const { seed, model } = siteEngine();
const product = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty >= 3);
const S = {};

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  S.admin = new Client();
  await db.query("INSERT INTO users (id, name, email, role, status, password_hash, password_changed_at) VALUES ($1, 'Test Admin', 'admin.track@example.com', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword(PASSWORD)]);
  assert.equal((await S.admin.post("/api/auth/login", { identifier: "admin.track@example.com", password: PASSWORD })).status, 200);
  S.buyer = new Client();
  assert.equal((await S.buyer.post("/api/auth/signup", { name: "Rina Das", email: "rina.track@example.com", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  const address = await S.buyer.post("/api/addresses", { fullName: "Rina Das", phone: "9876500031", line1: "4 Temple Street", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" });
  S.addressId = address.json.address.id;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

async function order() {
  assert.equal((await S.buyer.post("/api/cart/items", { productId: product.id, quantity: 1 })).status, 201);
  const quote = (await S.buyer.get(`/api/checkout/quote?addressId=${S.addressId}&paymentMethod=COD`)).json.quote;
  const r = await S.buyer.post("/api/checkout/orders", { addressId: S.addressId, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), whatsapp: true });
  assert.equal(r.status, 201, r.text);
  return r.json.order.orderNumber;
}
const track = (number, body) => S.admin.post(`/api/admin/orders/${number}/tracking`, body);
const mine = async (number) => (await S.buyer.get(`/api/orders/${number}`)).json.order;

describe("Courier and tracking number", () => {
  test("a new order has none; the customer's view says so (null)", async () => {
    S.order = await order();
    assert.equal((await mine(S.order)).tracking, null);
  });

  test("both boxes are needed, the number is letters / numbers / dashes, the link starts with http(s)", async () => {
    let r = await track(S.order, { courier: "Shadowfax", number: "" });
    assert.equal(r.status, 422);
    assert.ok(r.json.error.fields.number);
    r = await track(S.order, { courier: "", number: "SF123" });
    assert.ok(r.json.error.fields.courier);
    r = await track(S.order, { courier: "Shadowfax", number: "SF 12/3" });
    assert.equal(r.status, 422);
    r = await track(S.order, { courier: "Shadowfax", number: "SF123", url: "javascript:alert(1)" });
    assert.equal(r.status, 422, "only a web link");
  });

  test("a customer can't set it; an admin can, and the order history and audit log keep it", async () => {
    assert.equal((await S.buyer.post(`/api/admin/orders/${S.order}/tracking`, { courier: "X", number: "1" })).status, 403);
    const r = await track(S.order, { courier: "Shadowfax", number: "SF1234567890", url: "https://tracker.example.com/SF1234567890" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual({ ...r.json.order.tracking, addedAt: undefined }, { courier: "Shadowfax", number: "SF1234567890", url: "https://tracker.example.com/SF1234567890", addedAt: undefined });
    assert.ok(r.json.order.events.some((e) => e.kind === "NOTE" && /Shadowfax.*SF1234567890/.test(e.detail)));
    const log = (await db.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'ORDER_TRACKING_SET'", [S.order])).rows;
    assert.equal(log.length, 1);
  });

  test("the customer sees it on their order", async () => {
    const o = await mine(S.order);
    assert.equal(o.tracking.courier, "Shadowfax");
    assert.equal(o.tracking.number, "SF1234567890");
    assert.equal(o.tracking.url, "https://tracker.example.com/SF1234567890");
  });

  test("'shipped' then carries it: the email and the WhatsApp message", async () => {
    for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED"]) assert.equal((await S.admin.post(`/api/admin/orders/${S.order}/status`, { status })).status, 200, status);
    // the messages go out in the background: wait (up to 3 s) for the shipped email
    let sent = [];
    for (let i = 0; i < 30; i++) {
      await whatsappSettled();
      sent = devOutbox().filter((m) => (m.subject || "").includes(S.order) || (m.kind === "whatsapp" && (m.text || "").includes(S.order))); // (newest first)
      if (sent.some((m) => /has been shipped/.test(m.subject || "")) && sent.some((m) => m.kind === "whatsapp" && /Shipped/.test(m.text))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const mail = sent.find((m) => m.kind !== "whatsapp" && /has been shipped/.test(m.subject || ""));
    assert.ok(mail, "shipped email");
    assert.match(mail.text, /Courier: Shadowfax\. Tracking number: SF1234567890\. Track it here: https:\/\/tracker\.example\.com\/SF1234567890/);
    const wa = sent.find((m) => m.kind === "whatsapp" && /Shipped with Shadowfax\. Tracking number SF1234567890/.test(m.text));
    assert.ok(wa, "WhatsApp status: " + sent.filter((m) => m.kind === "whatsapp").map((m) => m.text).join(" || "));
  });

  test("it can be changed and removed (both boxes empty)", async () => {
    let r = await track(S.order, { courier: "Delhivery", number: "DL999" });
    assert.equal(r.json.order.tracking.courier, "Delhivery");
    assert.equal(r.json.order.tracking.url, null, "no link given");
    r = await track(S.order, { courier: "", number: "" });
    assert.equal(r.status, 200);
    assert.equal(r.json.order.tracking, null);
    assert.equal((await mine(S.order)).tracking, null);
  });

  test("not on a cancelled order", async () => {
    const other = await order();
    assert.equal((await S.admin.post(`/api/admin/orders/${other}/status`, { status: "CANCELLED", note: "test" })).status, 200);
    const r = await track(other, { courier: "Shadowfax", number: "SF1" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "ORDER_TRACKING_NOT_ALLOWED");
  });
});

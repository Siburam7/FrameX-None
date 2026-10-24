/* ==========================================================================
   Changing an order when the customer asks (owner, 2026-10-24): FrameX Care
   (and admins) work on orders from the admin panel. Run with "npm test".

   - a care login can open and change orders, but nothing else in the admin
     API (no test-order mark, no overview, no payouts);
   - another size: priced like the cart; Cash on Delivery takes the new total;
     paid online and cheaper -> the difference is refunded; dearer -> refused
     (the customer would have to pay); not once the shop is making it;
   - another delivery address before shipping;
   - a care person can cancel (and so refund) a paid order; it is audited.
   ========================================================================== */
import crypto from "node:crypto";
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
process.env.RAZORPAY_KEY_ID = mock.keyId;
process.env.RAZORPAY_KEY_SECRET = mock.keySecret;
process.env.RAZORPAY_WEBHOOK_SECRET = mock.webhookSecret;
process.env.RAZORPAY_API_BASE = mock.url;

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { editsSettled } = await import("../src/services/order-edit-service.js");
const { uploadPhoto } = await import("./support/photos.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, url, body) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  post = (url, body = {}) => this.request("POST", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const admin = new Client();
const care = new Client();
const asha = new Client();
const S = {};
const idOf = async (number) => (await db.query("SELECT id FROM orders WHERE order_number = $1", [number])).rows[0].id;
const settled = async () => {
  await editsSettled();
  await emailsSettled();
};
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00071", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };

/** An order of Classic Square (p-002) in size M, with the customer's photo. method: COD | ONLINE (then paid). */
async function order(method) {
  const up = await uploadPhoto(base, asha, { name: "family.jpg" });
  assert.equal(up.status, 201, up.text);
  assert.equal((await asha.post("/api/cart/items", { productId: "p-002", selection: { sizeId: "m" }, photos: { photo1: up.json.upload.id } })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=${method}`)).json.quote;
  const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: method, expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), ...(method === "ONLINE" ? { paymentChannel: "upi" } : {}) });
  assert.equal(r.status, 201, r.text);
  if (method === "ONLINE") {
    const paid = mock.pay(r.json.payment.gatewayOrderId, { method: "upi" });
    const v = await asha.post(`/api/orders/${r.json.order.orderNumber}/payments/verify`, paid.proof);
    assert.equal(v.status, 200, v.text);
  }
  const o = (await admin.get(`/api/admin/orders/${r.json.order.orderNumber}`)).json.order;
  return o;
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  assert.equal((await admin.post("/api/admin/care-team", { name: "Priya", email: "priya.edit@example.com", password: PASSWORD })).status, 201);
  assert.equal((await care.post("/api/auth/login", { identifier: "priya.edit@example.com", password: PASSWORD })).status, 200);
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.edit@example.com", phone: "9876500071", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  S.cod = await order("COD");
  S.online = await order("ONLINE");
  await settled();
  clearDevOutbox();
});

after(async () => {
  await settled();
  await new Promise((r) => server.close(r));
  await db.close();
  await mock.close();
});

describe("FrameX Care in the admin panel", () => {
  test("a care login opens and lists orders, and nothing else of the admin API", async () => {
    assert.equal((await care.get("/api/admin/orders")).status, 200);
    assert.equal((await care.get(`/api/admin/orders/${S.cod.orderNumber}`)).json.order.orderNumber, S.cod.orderNumber);
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/test`, { test: true })).status, 403, "no test-order mark");
    assert.equal((await care.get("/api/admin/overview")).status, 403);
    assert.equal((await care.get("/api/admin/payouts")).status, 403);
    assert.equal((await care.get("/api/admin/care-team")).status, 403);
    assert.equal((await care.get("/api/admin/order-updates")).status, 403);
    assert.equal((await asha.get("/api/admin/orders")).status, 403, "customers still can't");
    assert.ok((await care.get("/api/admin/orders/_/states")).json.states.includes("Odisha"));
  });
});

describe("another size", () => {
  test("the sizes are offered with the new total; on Cash on Delivery a dearer size is fine", async () => {
    const line = S.cod.items[0];
    const r = await care.get(`/api/admin/orders/${S.cod.orderNumber}/items/${line.id}/sizes`);
    assert.equal(r.status, 200, r.text);
    const by = Object.fromEntries(r.json.sizes.map((s) => [s.sizeId, s]));
    assert.equal(by.m.current, true);
    assert.ok(by.l.difference > 0 && by.l.allowed, "dearer is allowed on COD");
    assert.ok(by.s.difference < 0 && by.s.allowed);
  });

  test("COD: changed to Large — the line, the total and the cash to collect follow; history, audit and an email", async () => {
    const line = S.cod.items[0];
    const before = S.cod.total;
    const r = await care.post(`/api/admin/orders/${S.cod.orderNumber}/items/${line.id}/size`, { sizeId: "l" });
    assert.equal(r.status, 200, r.text);
    const o = r.json.order;
    assert.match(o.items[0].size, /Large/);
    assert.equal(o.items[0].unitPrice, 749);
    assert.ok(o.total > before, `${before} -> ${o.total}`);
    assert.equal(r.json.change.refunded, 0);
    const pay = (await db.query("SELECT amount FROM payments WHERE order_id = $1 AND provider = 'cod'", [await idOf(o.orderNumber)])).rows[0];
    assert.equal(pay.amount, o.total, "the cash to collect is the new total");
    assert.ok(o.events.some((e) => /Size changed by Priya \(FrameX Care\)/.test(e.detail || "")), JSON.stringify(o.events.map((e) => e.detail)));
    const { rows } = await db.query("SELECT actor_role FROM audit_logs WHERE action = 'ORDER_EDITED' AND target_id = $1", [o.orderNumber]);
    assert.equal(rows[0].actor_role, "CARE");
    await settled();
    assert.ok(devOutbox().some((m) => m.to === "asha.edit@example.com" && /was updated/.test(m.subject) && /Large/.test(m.text)));
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/items/${line.id}/size`, { sizeId: "l" })).status, 409, "already that size");
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/items/${line.id}/size`, { sizeId: "zz" })).status, 422);
  });

  test("paid online: a dearer size is refused (the customer would have to pay); a cheaper one refunds the difference", async () => {
    const line = S.online.items[0];
    const sizes = (await care.get(`/api/admin/orders/${S.online.orderNumber}/items/${line.id}/sizes`)).json.sizes;
    const large = sizes.find((s) => s.sizeId === "l");
    assert.equal(large.allowed, false);
    assert.match(large.why, /pay the difference/);
    const dear = await care.post(`/api/admin/orders/${S.online.orderNumber}/items/${line.id}/size`, { sizeId: "l" });
    assert.equal(dear.status, 409);
    assert.equal(dear.json.error.code, "NEEDS_PAYMENT");
    const before = S.online.total;
    const r = await care.post(`/api/admin/orders/${S.online.orderNumber}/items/${line.id}/size`, { sizeId: "s" });
    assert.equal(r.status, 200, r.text);
    const o = r.json.order;
    assert.ok(o.total < before);
    assert.equal(r.json.change.refunded, before - o.total, "the difference goes back");
    const refund = (await db.query("SELECT amount, reason FROM refunds WHERE order_id = $1", [await idOf(o.orderNumber)])).rows[0];
    assert.equal(refund.amount, before - o.total);
    assert.match(refund.reason, /Size changed/);
  });

  test("not once the shop is making it, and not for a line of another order", async () => {
    assert.equal((await admin.post(`/api/admin/orders/${S.cod.orderNumber}/status`, { status: "CONFIRMED" })).status, 200);
    assert.equal((await admin.post(`/api/admin/orders/${S.cod.orderNumber}/status`, { status: "PROCESSING" })).status, 200);
    const line = S.cod.items[0];
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/items/${line.id}/size`, { sizeId: "m" })).status, 409);
    assert.equal((await care.post(`/api/admin/orders/${S.online.orderNumber}/items/${line.id}/size`, { sizeId: "m" })).status, 404);
  });
});

describe("another delivery address", () => {
  test("changed before shipping; a wrong PIN is refused; not after it ships", async () => {
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/address`, { ...ADDRESS, postalCode: "12" })).status, 422);
    const r = await care.post(`/api/admin/orders/${S.cod.orderNumber}/address`, { ...ADDRESS, line1: "7 Temple Street", city: "Cuttack", postalCode: "753001" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.order.shippingAddress.line1, r.json.order.shippingAddress.city, r.json.order.shippingAddress.postalCode], ["7 Temple Street", "Cuttack", "753001"]);
    await settled();
    assert.ok(devOutbox().some((m) => m.to === "asha.edit@example.com" && /delivery address/.test(m.subject) && /Temple Street/.test(m.text)));
    assert.equal((await admin.post(`/api/admin/orders/${S.cod.orderNumber}/status`, { status: "SHIPPED" })).status, 200);
    assert.equal((await care.post(`/api/admin/orders/${S.cod.orderNumber}/address`, ADDRESS)).status, 409);
  });
});

describe("cancelling", () => {
  test("a care person cancels a paid order: it is refunded in full and audited as CARE", async () => {
    const r = await care.post(`/api/admin/orders/${S.online.orderNumber}/status`, { status: "CANCELLED", note: "Customer changed their mind (chat)" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.order.status, "CANCELLED");
    const refunded = (await db.query("SELECT coalesce(sum(amount), 0)::int AS n FROM refunds WHERE order_id = $1", [await idOf(S.online.orderNumber)])).rows[0].n;
    assert.equal(refunded, S.online.total, "the first (size) refund + the rest = what was paid");
    const { rows } = await db.query("SELECT actor_role FROM audit_logs WHERE action = 'ORDER_CANCELLED' AND target_id = $1", [S.online.orderNumber]);
    assert.equal(rows[0].actor_role, "CARE");
  });
});

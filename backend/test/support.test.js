/* ==========================================================================
   FrameX's own help chat (owner, 2026-10-23). Run with "npm test" in backend/.

   - only logged-in customers can use it (visitors 401, shop accounts 403);
   - a customer writes (optionally about one of their own orders); FrameX is
     emailed at most once per 15 minutes per conversation;
   - FrameX staff see the conversations with unread counts, answer, close and
     reopen; the customer is emailed at their own account address and sees the
     answer, with an unread count until they read it;
   - writing after a close starts a new conversation;
   - the data download includes the chat; deleting the account removes it.
   ========================================================================== */
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.ADMIN_NOTIFY_EMAIL = "support@framex.example";

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
const { supportSettled } = await import("../src/services/support-service.js");

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
const asha = new Client();
const ravi = new Client();
const admin = new Client();
const S = {};
const settled = async () => {
  await supportSettled();
  await emailsSettled();
};
const mails = (to, subject) => devOutbox().filter((m) => m.to === to && (!subject || subject.test(m.subject)));

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [c, name, email, phone] of [[asha, "Asha Verma", "asha.chat@example.com", "9876500091"], [ravi, "Ravi Das", "ravi.chat@example.com", "9876500092"]])
    assert.equal((await c.post("/api/auth/signup", { name, email, phone, password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  // Asha has an order (Cash on Delivery, a product without a customer photo)
  const home = (await asha.post("/api/addresses", { fullName: "Asha Verma", phone: "98765 00091", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" })).json.address.id;
  assert.equal((await asha.post("/api/cart/items", { productId: "p-017", quantity: 1 })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${home}&paymentMethod=COD`)).json.quote;
  const r = await asha.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201, r.text);
  S.order = r.json.order.orderNumber;
  await settled();
  clearDevOutbox();
});

after(async () => {
  await settled();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("the help chat", () => {
  test("only logged-in customers: a visitor is asked to log in, a shop account is refused", async () => {
    assert.equal((await new Client().get("/api/support")).status, 401);
    assert.equal((await new Client().post("/api/support/messages", { body: "hi" })).status, 401);
    const shopId = newId();
    await db.query("INSERT INTO shops (id, shop_code, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at) VALUES ($1, 'FRX-SHOP-9001', 'Chat Shop', '+919876511111', 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())", [shopId]);
    await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id) VALUES ($1, 'Shop Owner', 'shop.chat@example.com', $2, 'SHOP', 'ACTIVE', $3)", [newId(), await hashPassword(PASSWORD), shopId]);
    const shop = new Client();
    assert.equal((await shop.post("/api/auth/login", { identifier: "shop.chat@example.com", password: PASSWORD, accountType: "shop" })).status, 200);
    assert.equal((await shop.get("/api/support")).status, 403);
  });

  test("before writing there is no conversation; an empty message is refused", async () => {
    assert.deepEqual((await asha.get("/api/support")).json, { thread: null });
    assert.equal((await asha.get("/api/support/unread")).json.unread, 0);
    assert.equal((await asha.post("/api/support/messages", { body: "   " })).status, 422);
  });

  test("a customer writes about one of their orders: an open conversation, and FrameX is emailed once", async () => {
    const r = await asha.post("/api/support/messages", { body: "Can I change the size of my order to Large?", orderNumber: S.order, topic: "order" });
    assert.equal(r.status, 201, r.text);
    const t = r.json.thread;
    assert.deepEqual([t.status, t.topic, t.orderNumber, t.messages.length, t.messages[0].from, t.messages[0].orderNumber], ["OPEN", "order", S.order, 1, "you", S.order]);
    S.thread = t.id;
    assert.equal((await asha.post("/api/support/messages", { body: "It is for my mother's birthday." })).status, 201);
    await settled();
    const alerts = mails("support@framex.example", /New chat message on FrameX from Asha Verma/);
    assert.equal(alerts.length, 1, "one email for two messages within 15 minutes");
    assert.match(alerts[0].text, /Can I change the size/);
    assert.match(alerts[0].text, new RegExp(`admin\\.html#/chats/${S.thread}`));
    // Fifteen minutes later, the next message emails FrameX again
    await db.query("UPDATE support_threads SET staff_alerted_at = now() - interval '16 minutes' WHERE id = $1", [S.thread]);
    assert.equal((await asha.post("/api/support/messages", { body: "Any news?" })).status, 201);
    await settled();
    assert.equal(mails("support@framex.example", /New chat message/).length, 2);
  });

  test("a customer can't attach someone else's order", async () => {
    const r = await ravi.post("/api/support/messages", { body: "Where is this order?", orderNumber: S.order });
    assert.equal(r.status, 422);
    assert.match(JSON.stringify(r.json), /isn't one of your orders/);
    assert.equal((await ravi.post("/api/support/messages", { body: "x", orderNumber: "not-an-order" })).status, 422);
  });

  test("FrameX staff see it with its unread count; opening it marks it read", async () => {
    assert.equal((await asha.get("/api/admin/support")).status, 403, "customers can't read the admin list");
    const list = (await admin.get("/api/admin/support")).json;
    const row = list.items.find((x) => x.id === S.thread);
    assert.deepEqual([row.customer.name, row.unread, row.orderNumber, row.topicName, row.lastFrom], ["Asha Verma", 3, S.order, "Track my order", "customer"]);
    assert.equal((await admin.get("/api/admin/overview")).json.chats.unread, 3);
    const one = (await admin.get(`/api/admin/support/${S.thread}`)).json.thread;
    assert.equal(one.messages.length, 3);
    assert.equal(one.customer.email, "asha.chat@example.com");
    assert.equal(one.recentOrders[0].orderNumber, S.order);
    assert.equal((await admin.get("/api/admin/support")).json.items.find((x) => x.id === S.thread).unread, 0);
  });

  test("FrameX answers: the customer sees it, unread until read, and is emailed at their account address", async () => {
    const r = await admin.post(`/api/admin/support/${S.thread}/reply`, { body: "Yes, we can change it. Large costs ₹225 more." });
    assert.equal(r.status, 200, r.text);
    await settled();
    const mine = (await asha.get("/api/support")).json.thread;
    assert.equal(mine.messages.at(-1).from, "framex");
    assert.equal(mine.unread, 1);
    assert.equal((await asha.get("/api/support/unread")).json.unread, 1);
    const sent = mails("asha.chat@example.com", /FrameX Support replied/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Large costs ₹225 more/);
    await asha.post("/api/support/read");
    assert.equal((await asha.get("/api/support/unread")).json.unread, 0);
    const { rows } = await db.query("SELECT action FROM audit_logs WHERE target_id = $1", [S.thread]);
    assert.ok(rows.some((x) => x.action === "SUPPORT_REPLIED"));
  });

  test("closed: the customer's next message starts a new conversation; the old one can't be reopened over it", async () => {
    assert.equal((await admin.post(`/api/admin/support/${S.thread}/status`, { status: "CLOSED" })).json.thread.status, "CLOSED");
    assert.equal((await asha.get("/api/support")).json.thread.status, "CLOSED", "the latest one is shown while nothing is open");
    const r = await asha.post("/api/support/messages", { body: "One more question about frames." });
    assert.notEqual(r.json.thread.id, S.thread);
    assert.equal(r.json.thread.messages.length, 1);
    assert.equal((await admin.post(`/api/admin/support/${S.thread}/status`, { status: "OPEN" })).status, 409);
    // An answer on the closed one is kept but doesn't open it (the new one is open)
    assert.equal((await admin.post(`/api/admin/support/${S.thread}/reply`, { body: "Following up." })).json.thread.status, "CLOSED");
    assert.equal((await admin.get("/api/admin/support?status=OPEN")).json.items.filter((x) => x.customer.email === "asha.chat@example.com").length, 1);
  });

  test("the data download includes the chat; deleting the account removes it", async () => {
    const data = (await asha.get("/api/users/me/data")).json;
    assert.ok(Array.isArray(data.helpChat) && data.helpChat.some((m) => m.from === "FrameX" && /₹225/.test(m.message)));
    // Ravi has no order under way: his account can go
    assert.equal((await ravi.post("/api/support/messages", { body: "Do you deliver to Cuttack?" })).status, 201);
    const raviId = (await db.query("SELECT id FROM users WHERE email = 'ravi.chat@example.com'")).rows[0].id;
    assert.equal((await ravi.post("/api/users/me/delete", { password: PASSWORD, confirm: "DELETE" })).status, 200);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM support_threads WHERE user_id = $1", [raviId])).rows[0].n, 0);
  });
});

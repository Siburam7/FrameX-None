/* ==========================================================================
   Messages from the Contact page: run with "npm test" in backend/.
   A real server on a random port with an in-memory PostgreSQL. Email uses the
   development mailbox, so what "would be sent" can be read back here; nothing
   leaves the machine.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.ADMIN_NOTIFY_EMAIL = "";
process.env.CONTACT_ALERTS_PER_HOUR = "4";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { clearDevOutbox, devOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { hit, resetRateLimits } = await import("../src/lib/rate-limit.js");
const { newId } = await import("../src/lib/tokens.js");
const { contactSettled } = await import("../src/services/contact-service.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body, headers = {}) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of response.headers.getSetCookie()) this.cookie = /fx_session=;|Expires=Thu, 01 Jan 1970/i.test(c) ? "" : c.split(";")[0];
    return { status: response.status, json: await response.json().catch(() => null) };
  }
  get = (url) => this.request("GET", url);
  post = (url, body = {}, headers) => this.request("POST", url, body, headers);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const visitor = new Client();
const asha = new Client(); // a customer
const admin = new Client();
const MESSAGE = { name: "Ravi Kumar", email: "Ravi.Kumar@Example.com", phone: "98765 00061", subject: "Frame size for a wedding photo", message: "Hello,\nwhich size suits a 12 x 18 inch print?\n<b>Thanks</b>" };
const rows = async () => (await db.query("SELECT * FROM contact_messages ORDER BY created_at, id")).rows;

before(async () => {
  await initDb();
  await migrate();
  const hash = await hashPassword(PASSWORD);
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), hash]);
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Old Admin', 'old-admin@framex.example', $2, 'ADMIN', 'DISABLED')", [newId(), hash]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha@example.com", phone: "9876500062", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  clearDevOutbox();
});

after(async () => {
  await contactSettled();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("contact page messages", () => {
  test("a message is kept, and the alert goes to the admin account with the sender as Reply-To", async () => {
    const sent = await visitor.post("/api/contact", MESSAGE);
    assert.deepEqual([sent.status, sent.json], [201, { received: true }]);
    await contactSettled();
    const [row] = await rows();
    assert.deepEqual([row.name, row.email, row.phone, row.subject, row.message, row.status, row.user_id], ["Ravi Kumar", "ravi.kumar@example.com", "98765 00061", MESSAGE.subject, MESSAGE.message, "NEW", null]);
    // Development mailbox: the row says so (nothing was really sent), it does not claim "SENT".
    assert.equal(row.alert, "DEV");
    const mail = devOutbox();
    assert.equal(mail.length, 1, "one alert: the active admin, not the disabled one and never the visitor");
    assert.deepEqual([mail[0].to, mail[0].replyTo, mail[0].subject], ["admin@framex.example", "ravi.kumar@example.com", "New message on FrameX: Frame size for a wedding photo"]);
    assert.match(mail[0].text, /Name: Ravi Kumar\nEmail: ravi\.kumar@example\.com\nPhone: 98765 00061/);
    assert.match(mail[0].text, /which size suits a 12 x 18 inch print\?/);
    assert.equal(mail[0].links[0].url, "http://localhost:5500/admin.html#/messages");
  });

  test("the same message sent again straight away is kept once and alerts once", async () => {
    assert.equal((await visitor.post("/api/contact", MESSAGE)).status, 201);
    await contactSettled();
    assert.deepEqual([(await rows()).length, devOutbox().length], [1, 1]);
  });

  test("what is missing or wrong is refused, and nothing is stored", async () => {
    const bad = await visitor.post("/api/contact", { name: "R", email: "not-an-email", phone: "abc", subject: "Hi", message: "short" });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["email", "message", "name", "phone", "subject"]);
    assert.equal((await visitor.post("/api/contact", { ...MESSAGE, message: "x".repeat(4001) })).status, 422);
    // The website's own header is required, like every other change.
    const foreign = await fetch(base + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://elsewhere.example" }, body: JSON.stringify(MESSAGE) });
    assert.ok(foreign.status >= 400);
    assert.equal((await rows()).length, 1);
  });

  test("a program that fills the hidden box is answered politely and ignored", async () => {
    const r = await visitor.post("/api/contact", { ...MESSAGE, subject: "Cheap followers", fxhp: "http://spam.example" });
    assert.deepEqual([r.status, r.json], [201, { received: true }]);
    await contactSettled();
    assert.deepEqual([(await rows()).length, devOutbox().length], [1, 1]);
  });

  test("a logged-in customer's message is linked to their account; a set address receives the alerts instead", async () => {
    config.email.adminNotify = "support@framex.example, owner@framex.example";
    clearDevOutbox();
    const r = await asha.post("/api/contact", { name: "Asha Verma", email: "asha@example.com", phone: "", subject: "Where is my order", message: "It has been a week since I ordered." });
    assert.equal(r.status, 201);
    await contactSettled();
    const row = (await rows()).at(-1);
    assert.ok(row.user_id, "linked to the account");
    assert.deepEqual(devOutbox().map((m) => m.to).sort(), ["owner@framex.example", "support@framex.example"]);
    config.email.adminNotify = "";
  });

  test("only an admin can read, mark or delete messages", async () => {
    for (const client of [visitor, asha]) {
      const expected = client === visitor ? 401 : 403;
      assert.equal((await client.get("/api/admin/messages")).status, expected);
      const id = (await rows())[0].id;
      assert.equal((await client.post(`/api/admin/messages/${id}/status`, { status: "READ" })).status, expected);
      assert.equal((await client.del(`/api/admin/messages/${id}`)).status, expected);
    }
    assert.equal((await visitor.get("/api/contact")).status, 404, "there is no public way to read messages");

    const list = (await admin.get("/api/admin/messages")).json;
    assert.deepEqual([list.total, list.unread, list.items.length], [2, 2, 2]);
    assert.deepEqual([list.items[0].subject, list.items[0].hasAccount, list.items[1].name, list.items[1].email, list.items[1].alert, list.items[1].hasAccount], ["Where is my order", true, "Ravi Kumar", "ravi.kumar@example.com", "DEV", false]);
    assert.equal((await admin.get("/api/admin/overview")).json.messages.unread, 2);

    const first = list.items[1];
    const read = await admin.post(`/api/admin/messages/${first.id}/status`, { status: "READ" });
    assert.deepEqual([read.status, read.json.message.status, Boolean(read.json.message.readAt)], [200, "READ", true]);
    assert.deepEqual([(await admin.get("/api/admin/messages?status=NEW")).json.total, (await admin.get("/api/admin/messages?status=READ")).json.total, (await admin.get("/api/admin/overview")).json.messages.unread], [1, 1, 1]);
    assert.equal((await admin.post(`/api/admin/messages/${first.id}/status`, { status: "NEW" })).json.message.readAt, null);
    assert.equal((await admin.post(`/api/admin/messages/${first.id}/status`, { status: "GONE" })).status, 422);
    assert.equal((await admin.post(`/api/admin/messages/${newId()}/status`, { status: "READ" })).status, 404);

    const removed = await admin.del(`/api/admin/messages/${first.id}`);
    assert.deepEqual([removed.status, removed.json, (await rows()).length], [200, { deleted: true }, 1]);
    assert.equal((await admin.del(`/api/admin/messages/${first.id}`)).status, 404);
    const log = (await admin.get("/api/admin/audit")).json.items.find((a) => a.action === "CONTACT_MESSAGE_DELETED");
    assert.ok(log && !JSON.stringify(log).includes("wedding"), "the log says it happened, not what the message said");
  });

  test("a flood of messages is kept but stops emailing: the email allowance is for password codes too", async () => {
    clearDevOutbox();
    for (let i = 0; i < 6; i++) assert.equal((await visitor.post("/api/contact", { ...MESSAGE, email: `flood${i}@example.com`, subject: `Flood number ${i}` })).status, 201);
    await contactSettled();
    const all = await rows();
    const limited = all.filter((r) => r.alert === "LIMIT").length;
    // CONTACT_ALERTS_PER_HOUR=4, and one alert of this hour is already counted (the customer's message above).
    assert.deepEqual([all.length, limited, devOutbox().length], [7, 3, 3]);
    assert.equal((await admin.get("/api/admin/messages")).json.total, 7, "every message is still in the panel");
  });

  test("one address can only send a few messages an hour", () => {
    // The limiter is off for the other tests; this is the rule the route uses.
    config.rateLimit.enabled = true;
    resetRateLimits();
    const rule = { windowMs: 60 * 60_000, max: 6 };
    for (let i = 0; i < 6; i++) hit("contact", "203.0.113.9", rule);
    assert.throws(() => hit("contact", "203.0.113.9", rule), (e) => e.status === 429);
    hit("contact", "203.0.113.10", rule);
    config.rateLimit.enabled = false;
    resetRateLimits();
  });
});

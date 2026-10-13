/* ==========================================================================
   An approved shop is welcomed once: run with "npm test" in backend/.
   A real server on a random port and an in-memory PostgreSQL.

   Approval leaves one "your shop is approved" notification in the shop's own
   account (the shop dashboard shows it as a welcome, once), and hands the
   admin the details a WhatsApp message needs. Nothing is sent by WhatsApp
   from here: the admin page opens the admin's own WhatsApp.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { clearDevOutbox, devOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");

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
const admin = new Client();
const visitor = new Client();
const SHOP = { name: "Kalinga Frames", ownerName: "Asha Rout", phone: "9876500001", addressLine1: "12 Station Road", area: "Station Road", city: "Dhenkanal", state: "Odisha", postalCode: "759001", country: "IN", latitude: 20.6586, longitude: 85.5981 };
const APPLICATION = { shopName: "Kalinga Frames", ownerName: "Asha Rout", phone: "98765 00001", email: "asha@kalinga-frames.example", address: "12 Station Road", city: "Dhenkanal", state: "Odisha", postalCode: "759001", businessDetails: "Framing shop since 2012", message: "We'd like to join FrameX." };
const S = {};

/** Choose the password with a setup link, then log in as that shop. */
async function shopLogin(credentials, email) {
  const client = new Client();
  const token = credentials.setupUrl.split("#token=")[1];
  assert.equal((await client.post("/api/auth/reset-password", { token, password: PASSWORD, confirmPassword: PASSWORD })).status, 200);
  assert.equal((await client.post("/api/auth/login", { identifier: email, password: PASSWORD, accountType: "shop" })).status, 200);
  return client;
}
const welcomes = async (client) => (await client.get("/api/notifications?limit=50")).json.items.filter((n) => n.kind === "SHOP_APPROVED");

before(async () => {
  await initDb();
  await migrate();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("an approved shop is welcomed once", () => {
  test("approving an application: the admin gets what a WhatsApp message needs, and the approval email goes out", async () => {
    const applied = await visitor.post("/api/shops/applications", APPLICATION);
    assert.equal(applied.status, 201);
    clearDevOutbox();
    const r = await admin.post(`/api/admin/applications/${applied.json.application.id}/approve`, { shop: SHOP, accountEmail: APPLICATION.email });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const c = r.json.credentials;
    assert.deepEqual([c.shopName, c.ownerName, c.phone.replace(/\D/g, "").slice(-10), c.accountEmail, c.firstSetup, /^FRX-SHOP-\d+$/.test(c.shopCode), c.setupUrl.includes("#token=")], ["Kalinga Frames", "Asha Rout", "9876500001", APPLICATION.email, true, true, true]);
    const mail = devOutbox().find((m) => m.to === APPLICATION.email);
    assert.match(mail.text, /Kalinga Frames has been approved on FrameX/);
    S.kalinga = { credentials: c, uuid: r.json.shop.uuid };
  });

  test("the shop finds one unread welcome in its account; reading it once is enough", async () => {
    S.kalingaUser = await shopLogin(S.kalinga.credentials, APPLICATION.email);
    const list = await welcomes(S.kalingaUser);
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].title, list[0].read, list[0].link], ["Kalinga Frames is approved on FrameX", false, "shop-dashboard.html"]);
    assert.match(list[0].body, /has been approved/);
    assert.equal((await S.kalingaUser.post(`/api/notifications/${list[0].id}/read`)).status, 200);
    assert.deepEqual((await welcomes(S.kalingaUser)).map((n) => n.read), [true]);
  });

  test("taking the approval back and giving it again, or a new password link, does not welcome twice", async () => {
    assert.equal((await admin.post(`/api/admin/shops/${S.kalinga.uuid}/approval`, { status: "PENDING" })).status, 200);
    assert.equal((await admin.post(`/api/admin/shops/${S.kalinga.uuid}/approval`, { status: "APPROVED" })).status, 200);
    const again = await admin.post(`/api/admin/shops/${S.kalinga.uuid}/credentials`, {});
    assert.equal(again.status, 201, JSON.stringify(again.json));
    assert.deepEqual([again.json.credentials.firstSetup, again.json.credentials.shopName], [false, "Kalinga Frames"], "a link for a login that already has a password is a reset, not a first setup");
    // The approval was taken back: the shop's session ended. It logs in again and still has just the one, read.
    assert.equal((await S.kalingaUser.post("/api/auth/login", { identifier: APPLICATION.email, password: PASSWORD, accountType: "shop" })).status, 200);
    assert.deepEqual((await welcomes(S.kalingaUser)).map((n) => n.read), [true]);
  });

  test("a shop added by the admin and approved at once is welcomed too", async () => {
    const r = await admin.post("/api/admin/shops", { shop: { ...SHOP, name: "River Frames", ownerName: "Binod Das", phone: "9876500002" }, accountEmail: "binod@river-frames.example" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual([r.json.credentials.shopName, r.json.credentials.firstSetup], ["River Frames", true]);
    const user = await shopLogin(r.json.credentials, "binod@river-frames.example");
    assert.deepEqual((await welcomes(user)).map((n) => [n.title, n.read]), [["River Frames is approved on FrameX", false]]);
  });

  test("a shop that is added as pending is welcomed when it is approved, not before", async () => {
    const r = await admin.post("/api/admin/shops", { shop: { ...SHOP, name: "Hill Frames", ownerName: "Chitra Nayak", phone: "9876500003" }, accountEmail: "chitra@hill-frames.example", approve: false });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const userId = (await db.query("SELECT id FROM users WHERE email = 'chitra@hill-frames.example'")).rows[0].id;
    const count = async () => (await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'SHOP_APPROVED'", [userId])).rows[0].n;
    assert.equal(await count(), 0, "not approved yet: no welcome");
    assert.equal((await admin.post(`/api/admin/shops/${r.json.shop.uuid}/approval`, { status: "APPROVED" })).status, 200);
    assert.equal(await count(), 1);
    assert.equal((await admin.post(`/api/admin/shops/${r.json.shop.uuid}/approval`, { status: "APPROVED" })).status, 200);
    assert.equal(await count(), 1, "approving again adds nothing");
  });

  test("a customer never sees a shop's welcome", async () => {
    const customer = new Client();
    assert.equal((await customer.post("/api/auth/signup", { name: "Riya Sen", email: "riya@example.com", phone: "9876500009", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
    assert.deepEqual(await welcomes(customer), []);
    assert.equal((await visitor.get("/api/notifications")).status, 401);
  });
});

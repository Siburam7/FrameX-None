/* ==========================================================================
   Cart reminder emails, the admin Overview's figures and the new analytics
   (owner, 2026-10-31). Run with "npm test". Emails go to the development
   mailbox; the reminder timer is called directly with a chosen time of day.
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

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { runDue } = await import("../src/services/cart-reminder-service.js");

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
  put = (path, body = {}) => this.request("PUT", path, body);
  patch = (path, body = {}) => this.request("PATCH", path, body);
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const PASSWORD = "Sunrise-Frame-42";
const { seed, model } = siteEngine();
const product = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty >= 5);

/** Today at this hour in India time (the reminders send from 9 am to 9 pm). */
function indiaTime(hour) {
  const ist = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, 0) - 330 * 60_000);
}
const ageCart = (email, hours = 25) => db.query("UPDATE carts SET updated_at = now() - make_interval(hours => $2) WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email, hours]);
const reminderMails = (email) => devOutbox().filter((m) => m.to === email && /waiting in your FrameX cart/.test(m.subject));

const S = {};
before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  S.admin = new Client();
  await db.query("INSERT INTO users (id, name, email, role, status, password_hash, password_changed_at) VALUES ($1, 'Test Admin', 'admin.rem@example.com', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword(PASSWORD)]);
  assert.equal((await S.admin.post("/api/auth/login", { identifier: "admin.rem@example.com", password: PASSWORD })).status, 200);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

async function customerWithCart(name, email) {
  const c = new Client();
  assert.equal((await c.post("/api/auth/signup", { name, email, password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  const added = await c.post("/api/cart/items", { productId: product.id, quantity: 2 });
  assert.equal(added.status, 201, added.text);
  return c;
}

describe("cart reminder emails", () => {
  test("a cart left for a day gets ONE email, with the cart, the coupon and a way to stop them", async () => {
    S.ravi = await customerWithCart("Ravi Kumar", "ravi.rem@example.com");
    assert.equal((await runDue(indiaTime(12))).sent, 0, "not before the wait");
    await ageCart("ravi.rem@example.com");
    const r = await runDue(indiaTime(12));
    assert.equal(r.sent, 1, JSON.stringify(r));
    const mail = reminderMails("ravi.rem@example.com")[0];
    assert.ok(mail, "the email went to the customer");
    assert.match(mail.text, /^Hi Ravi,/);
    assert.ok(mail.text.includes(product.name) && /× 2/.test(mail.text), "the cart's items are in it");
    assert.match(mail.text, /XUSE10/, "the coupon chosen in the settings");
    assert.match(mail.text, /\/checkout\.html/, "the button opens the checkout");
    S.unsubscribe = (mail.text.match(/reminders=off&t=([^\s]+)/) || [])[1];
    assert.ok(S.unsubscribe, "a link to stop these emails");
    assert.equal((await runDue(indiaTime(13))).sent, 0, "never a second email for the same cart");
  });

  test("a cart that changed later can be reminded again", async () => {
    const before = reminderMails("ravi.rem@example.com").length;
    const item = (await S.ravi.get("/api/cart")).json.cart.items[0];
    assert.equal((await S.ravi.patch(`/api/cart/items/${item.id}`, { quantity: 3 })).status, 200);
    assert.equal((await runDue(indiaTime(14))).sent, 0, "just changed: wait again");
    // a day passes: the first reminder and the change both move back in time
    await db.query("UPDATE carts SET reminded_at = reminded_at - interval '2 days' WHERE user_id = (SELECT id FROM users WHERE email = 'ravi.rem@example.com')");
    await ageCart("ravi.rem@example.com");
    assert.equal((await runDue(indiaTime(14))).sent, 1);
    assert.equal(reminderMails("ravi.rem@example.com").length, before + 1);
  });

  test("only from 9 am to 9 pm, India time", async () => {
    await customerWithCart("Night Owl", "night.rem@example.com");
    await ageCart("night.rem@example.com");
    for (const hour of [6, 8, 21, 23]) assert.equal((await runDue(indiaTime(hour))).why, "outside sending hours", "hour " + hour);
    assert.equal((await runDue(indiaTime(9))).sent, 1);
  });

  test("the daily limit and the on / off switch are kept", async () => {
    await customerWithCart("Limit Case", "limit.rem@example.com");
    await ageCart("limit.rem@example.com");
    const saved = { ...config.cartReminders };
    config.cartReminders.dailyLimit = 0;
    assert.equal((await runDue(indiaTime(12))).why, "daily limit reached");
    config.cartReminders.dailyLimit = saved.dailyLimit;
    config.cartReminders.enabled = false;
    assert.equal((await runDue(indiaTime(12))).why, "off");
    config.cartReminders.enabled = true;
    assert.equal((await runDue(indiaTime(12))).sent, 1);
  });

  test("'Don't send me cart reminders' (no login) and the account's own switch", async () => {
    assert.equal((await new Client().post("/api/reminders/unsubscribe", { token: "bm90LWEtcmVhbC1pZA.not-the-signature" })).status, 400);
    assert.equal((await new Client().post("/api/reminders/unsubscribe", { token: decodeURIComponent(S.unsubscribe) })).status, 200);
    assert.equal((await S.ravi.get("/api/users/me")).json.user.cartReminders, false);
    const item = (await S.ravi.get("/api/cart")).json.cart.items[0];
    await S.ravi.patch(`/api/cart/items/${item.id}`, { quantity: 1 });
    await ageCart("ravi.rem@example.com");
    const before = reminderMails("ravi.rem@example.com").length;
    await runDue(indiaTime(15));
    assert.equal(reminderMails("ravi.rem@example.com").length, before, "turned off: no email");
    const on = await S.ravi.put("/api/users/me/cart-reminders", { on: true });
    assert.equal(on.json.user.cartReminders, true, "the account page turns them on again");
  });

  test("a coupon the customer can't use any more is left out", async () => {
    await db.query("UPDATE coupons SET active = false WHERE code = 'XUSE10'");
    await customerWithCart("No Coupon", "nocoupon.rem@example.com");
    await ageCart("nocoupon.rem@example.com");
    await runDue(indiaTime(12));
    const mail = reminderMails("nocoupon.rem@example.com")[0];
    assert.ok(mail && !/XUSE10/.test(mail.text), "no ended coupon in the email");
    await db.query("UPDATE coupons SET active = true WHERE code = 'XUSE10'");
  });
});

describe("the admin's pages", () => {
  test("Carts left: the list, and 'Send reminder' once per cart", async () => {
    await customerWithCart("Admin Sends", "adminsend.rem@example.com");
    await ageCart("adminsend.rem@example.com", 30);
    const list = await S.admin.get("/api/admin/carts");
    assert.equal(list.status, 200);
    const row = list.json.items.find((c) => c.customer === "Admin Sends");
    assert.ok(row && row.items === 2 && row.value > 0 && !row.reminderSentAt, JSON.stringify(row));
    assert.equal((await S.admin.post(`/api/admin/carts/${row.cartId}/remind`)).status, 200);
    assert.equal(reminderMails("adminsend.rem@example.com").length, 1);
    const again = await S.admin.post(`/api/admin/carts/${row.cartId}/remind`);
    assert.equal(again.status, 409, "one reminder until the cart changes");
    assert.equal((await new Client().get("/api/admin/carts")).status, 401, "admins only");
    assert.equal((await S.ravi.post(`/api/admin/carts/${row.cartId}/remind`)).status, 403);
  });

  test("the Overview's figures: today, 7 days, latest orders, carts left, low stock", async () => {
    const r = await S.admin.get("/api/admin/dashboard");
    assert.equal(r.status, 200, r.text);
    const d = r.json;
    assert.ok("orders" in d.today && "value" in d.today && "visitors" in d.today);
    assert.equal(d.last7.length, 7);
    assert.ok(Array.isArray(d.latestOrders) && Array.isArray(d.lowStock));
    assert.ok(d.carts.carts >= 1 && d.carts.items.length >= 1);
  });

  test("Analytics: the funnel, customers (with the day x hour grid) and the reminders", async () => {
    const r = await S.admin.get("/api/admin/analytics/overview?range=30d");
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.funnel.steps.map((s) => s.key), ["visits", "viewed", "checkout", "ordered"]);
    assert.equal(r.json.customers.byDayAndHour.length, 7);
    assert.equal(r.json.customers.byDayAndHour[0].length, 12);
    assert.ok(r.json.reminders.sent >= 5, "the reminders sent in these tests");
    assert.ok(Array.isArray(r.json.reminders.left.items));
  });

  test("Settings: the reminder settings exist and are checked", async () => {
    const list = (await S.admin.get("/api/admin/settings")).json.items.map((s) => s.key);
    for (const key of ["cartRemindersOn", "cartReminderHours", "cartReminderCoupon", "cartReminderDailyLimit"]) assert.ok(list.includes(key), key);
    assert.equal((await S.admin.patch("/api/admin/settings", { cartReminderCoupon: "bad code!" })).status, 422);
    assert.equal((await S.admin.patch("/api/admin/settings", { cartReminderDailyLimit: 500 })).status, 422);
    assert.equal((await S.admin.patch("/api/admin/settings", { cartReminderHours: 48 })).status, 200);
    assert.equal(config.cartReminders.hours, 48);
    await S.admin.patch("/api/admin/settings", { cartReminderHours: null });
  });
});

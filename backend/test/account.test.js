/* ==========================================================================
   A customer's own data: download it, and delete the account (owner's rules, 2026-10-20).
   Run with "npm test" in backend/.

   A real server on a random port and an in-memory PostgreSQL (PGlite). A real
   Cash on Delivery order with the customer's photo, a second photo waiting in
   the cart, a review and a message to FrameX; then:
     - the download holds all of it;
     - deleting is refused while the order is under way, without the password,
       or without DELETE typed; shops / artists / admins can't do it here;
     - after delivery it works: the login and every personal detail are gone,
       the photo files are removed, the order stays for tax without the name or
       the address, the review without the name, and the email can sign up again;
     - an admin can't switch the deleted account back on.
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
process.env.TAX_PERCENT = "18";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.FIRST_ORDER_FREE_DELIVERY = "false";
process.env.COD_FEE = "40";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const storage = await import("../src/lib/storage.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");
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
    return { status: response.status, json, text, headers: response.headers };
  }
  get = (url) => this.request("GET", url);
  post = (url, body = {}) => this.request("POST", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const EMAIL = "asha.delete@example.com";
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00061", line1: "12 Lake View Road", line2: "Near City Park", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client();
const admin = new Client();
const S = {};
const { seed, model } = siteEngine();
const FRAME = model.normalize(seed.products.find((p) => p.id === "p-005")); // shop-002, one photo
const row = async (sql, params) => (await db.query(sql, params)).rows[0];

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  const shopId = newId();
  await db.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, 'FRX-SHOP-1001', 'shop-002', 'Royal Frames', '+919876511111', 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [shopId]
  );
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const signup = await asha.post("/api/auth/signup", { name: "Asha Verma", email: EMAIL, phone: "9876500061", password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(signup.status, 201, signup.text);
  S.userId = signup.json.user.id;
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  // A real COD order with her photo
  const up = await uploadPhoto(base, asha, { name: "family.jpg" });
  assert.equal(up.status, 201, up.text);
  S.orderPhotoKey = (await row("SELECT storage_key FROM uploads WHERE id = $1", [up.json.upload.id])).storage_key;
  assert.equal((await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: up.json.upload.id }, note: "Please write 'Asha & Ravi' on the back" })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=COD`)).json.quote;
  const order = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(order.status, 201, order.text);
  S.order = order.json.order;
  // A second photo, waiting in the cart
  const waiting = await uploadPhoto(base, asha, { name: "beach.jpg" });
  S.cartPhotoKey = (await row("SELECT storage_key FROM uploads WHERE id = $1", [waiting.json.upload.id])).storage_key;
  await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: waiting.json.upload.id } });
  // A review and a message to FrameX
  await db.query("INSERT INTO reviews (id, user_id, target_type, target_id, source_type, source_id, rating, body, author_name) VALUES ($1, $2, 'PRODUCT', $3, 'ORDER', $4, 5, 'Lovely frame', 'Asha Verma')", [newId(), S.userId, FRAME.id, S.order.orderNumber]);
  await db.query("INSERT INTO contact_messages (id, user_id, name, email, phone, subject, message) VALUES ($1, $2, 'Asha Verma', $3, '9876500061', 'Delivery', 'When will it come?')", [newId(), S.userId, EMAIL]);
  await emailsSettled();
  clearDevOutbox();
});

after(async () => {
  await emailsSettled();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("my data: download", () => {
  test("one JSON file to save, with the account, addresses, orders (with their lines), reviews and messages", async () => {
    const r = await asha.get("/api/users/me/data");
    assert.equal(r.status, 200, r.text);
    assert.match(r.headers.get("content-disposition"), /^attachment; filename="framex-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const d = r.json;
    assert.deepEqual([d.account.name, d.account.email, d.account.type], ["Asha Verma", EMAIL, "CUSTOMER"]);
    assert.equal(d.addresses.length, 1);
    assert.equal(d.addresses[0].line1, ADDRESS.line1);
    assert.equal(d.orders.length, 1);
    assert.equal(d.orders[0].order_number, S.order.orderNumber);
    assert.equal(d.orders[0].items.length, 1);
    assert.equal(d.orders[0].items[0].name, FRAME.name);
    assert.equal(d.reviews[0].body, "Lovely frame");
    assert.equal(d.messagesToFrameX[0].subject, "Delivery");
    assert.equal(d.photos.length, 2);
    assert.ok(!r.text.includes("password_hash") && !r.text.includes("storage_key"), "no password hash or storage keys");
  });

  test("only for the account itself", async () => {
    assert.equal((await new Client().get("/api/users/me/data")).status, 401);
  });
});

describe("delete my account", () => {
  test("not while an order is under way: it says which one", async () => {
    const check = await asha.get("/api/users/me/deletion");
    assert.deepEqual([check.json.canDelete, check.json.customer, check.json.waiting.map((w) => w.number)], [false, true, [S.order.orderNumber]]);
    const r = await asha.post("/api/users/me/delete", { password: PASSWORD, confirm: "DELETE" });
    assert.equal(r.status, 409, r.text);
    assert.equal(r.json.error.code, "ACTIVE_ORDERS");
    assert.ok(r.json.error.message.includes(S.order.orderNumber));
    assert.deepEqual(r.json.error.details.waiting.map((w) => w.number), [S.order.orderNumber]);
    assert.equal((await asha.get("/api/users/me")).status, 200, "still logged in, nothing changed");
  });

  test("the password and the word DELETE are both needed", async () => {
    const wrong = await asha.post("/api/users/me/delete", { password: "not-my-password-1", confirm: "DELETE" });
    assert.equal(wrong.status, 422, wrong.text);
    assert.ok(wrong.json.error.fields.password);
    const lower = await asha.post("/api/users/me/delete", { password: PASSWORD, confirm: "delete" });
    assert.equal(lower.status, 422, lower.text);
    assert.ok(lower.json.error.fields.confirm);
    assert.equal((await asha.post("/api/users/me/delete", { password: PASSWORD })).status, 422);
  });

  test("shops, artists and admins can't delete themselves here", async () => {
    const r = await admin.post("/api/users/me/delete", { password: PASSWORD, confirm: "DELETE" });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.error.code, "CONTACT_FRAMEX");
    assert.equal((await new Client().post("/api/users/me/delete", { password: PASSWORD, confirm: "DELETE" })).status, 401);
  });

  test("once the order is delivered: deleted, logged out, every personal detail and photo gone, the bill kept", async () => {
    for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) assert.equal((await admin.post(`/api/admin/orders/${S.order.orderNumber}/status`, { status })).status, 200);
    assert.equal((await asha.get("/api/users/me/deletion")).json.canDelete, true);
    const before = await row("SELECT total, subtotal, tax, shipping_fee, cod_fee FROM orders WHERE order_number = $1", [S.order.orderNumber]);
    assert.ok(await storage.exists(S.orderPhotoKey));
    assert.ok(await storage.exists(S.cartPhotoKey));

    const r = await asha.post("/api/users/me/delete", { password: PASSWORD, confirm: " DELETE " });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json, { deleted: true, photosRemoved: 2, ordersKept: 1, paintingsKept: 0 });
    assert.equal(asha.cookie, "", "the browser's session cookie is cleared");

    // The account row: emptied and off
    const u = await row("SELECT * FROM users WHERE id = $1", [S.userId]);
    assert.deepEqual([u.name, u.email, u.phone, u.password_hash, u.status], ["Deleted customer", `deleted-${S.userId}@deleted.invalid`, null, null, "DISABLED"]);
    assert.ok(u.deleted_at);
    // What only the login needed: gone
    for (const t of ["addresses", "sessions", "carts", "notifications", "otp_codes", "auth_tokens"]) assert.equal((await row(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [S.userId])).n, 0, t);
    // Photos: the files are gone, the records say DELETED
    assert.equal(await storage.exists(S.orderPhotoKey), false);
    assert.equal(await storage.exists(S.cartPhotoKey), false);
    assert.equal((await row("SELECT count(*)::int AS n FROM uploads WHERE user_id = $1 AND status <> 'DELETED'", [S.userId])).n, 0);
    // The order: kept for tax, without the person
    const o = await row("SELECT * FROM orders WHERE order_number = $1", [S.order.orderNumber]);
    assert.deepEqual([o.customer_name, o.customer_email, o.customer_phone], ["Deleted customer", "", null]);
    assert.deepEqual(o.shipping_address, { state: "Odisha", removed: true });
    assert.deepEqual([o.total, o.subtotal, o.tax, o.shipping_fee, o.cod_fee], [before.total, before.subtotal, before.tax, before.shipping_fee, before.cod_fee], "the amounts don't change");
    const line = await row("SELECT name, quantity, line_total, note, customization FROM order_items WHERE order_id = $1", [o.id]);
    assert.deepEqual([line.name, line.note, line.customization], [FRAME.name, "", null]);
    assert.equal((await row("SELECT count(*)::int AS n FROM order_notifications WHERE order_id = $1 AND recipient <> ''", [o.id])).n, 0);
    // Review without the name; message without the contact details
    assert.equal((await row("SELECT author_name FROM reviews WHERE user_id = $1", [S.userId])).author_name, "A FrameX customer");
    const m = await row("SELECT name, email, phone, user_id, message FROM contact_messages WHERE subject = 'Delivery'");
    assert.deepEqual([m.name, m.email, m.phone, m.user_id, m.message], ["Deleted customer", "", "", null, "When will it come?"]);
    // Nothing in the database still names her
    for (const [t, col] of [["users", "email"], ["orders", "customer_email"], ["contact_messages", "email"], ["addresses", "full_name"]]) assert.equal((await row(`SELECT count(*)::int AS n FROM ${t} WHERE ${col} ILIKE '%asha%'`)).n, 0, `${t}.${col}`);
    // Logged, and a last email to the old address
    assert.equal((await row("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCOUNT_DELETED' AND target_id = $1", [S.userId])).n, 1);
    await emailsSettled();
    assert.ok(devOutbox().some((x) => x.to === EMAIL && x.subject === "Your FrameX account was deleted"));
  });

  test("afterwards: the old login is refused, the email can sign up again, an admin can't switch the account back on", async () => {
    assert.equal((await new Client().post("/api/auth/login", { identifier: EMAIL, password: PASSWORD })).status, 401);
    assert.equal((await asha.get("/api/users/me")).status, 401);
    const again = await new Client().post("/api/auth/signup", { name: "Asha V", email: EMAIL, phone: "9876500062", password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(again.status, 201, again.text);
    assert.notEqual(again.json.user.id, S.userId, "a new, separate account");
    const on = await admin.post(`/api/admin/users/${S.userId}/status`, { enabled: true });
    assert.equal(on.status, 409, on.text);
    assert.equal(on.json.error.code, "ACCOUNT_DELETED");
  });
});

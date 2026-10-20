/* ==========================================================================
   Order photos are removed 15 days after the order is finished (F-11), and
   shop products need FrameX's approval (F-14). Owner's decisions, 2026-10-20.
   Run with "npm test" in backend/.

   Real COD orders with the customer's photos, moved along by FrameX staff; the
   tidy-up (sweepFinishedOrderPhotos) is run directly:
     - delivered 16 days ago: the file goes, the order shows the photo as removed;
     - delivered 10 days ago, or not finished: kept;
     - a photo another unfinished order still uses, or a saved design: kept;
     - cancelled 16 days ago: removed.
   And the approval switch: on after migration 016, an admin setting.
   And the start-up check of stored files: what a missing file belonged to.
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
process.env.PRODUCT_MODERATION = "false"; // the host's old value: the admin setting (migration 016) wins over it

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const storage = await import("../src/lib/storage.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");
const { sweepFinishedOrderPhotos } = await import("../src/services/upload-service.js");
const { checkKnownFiles, describeLost } = await import("../src/services/storage-check.js");
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
  patch = (url, body = {}) => this.request("PATCH", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const asha = new Client();
const admin = new Client();
const S = {};
const { seed, model } = siteEngine();
const FRAME = model.normalize(seed.products.find((p) => p.id === "p-005"));
const keyOf = async (uploadId) => (await db.query("SELECT storage_key FROM uploads WHERE id = $1", [uploadId])).rows[0].storage_key;
const statusOf = async (uploadId) => (await db.query("SELECT status FROM uploads WHERE id = $1", [uploadId])).rows[0].status;

/** A COD order of one frame with the given photo (uploaded now if none). -> { number, uploadId } */
async function order(uploadId = null) {
  const id = uploadId || (await uploadPhoto(base, asha, { name: "family.jpg" })).json.upload.id;
  assert.equal((await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: id } })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=COD`)).json.quote;
  const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201, r.text);
  return { number: r.json.order.orderNumber, uploadId: id };
}
async function deliver(number, daysAgo) {
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) assert.equal((await admin.post(`/api/admin/orders/${number}/status`, { status })).status, 200);
  await db.query("UPDATE orders SET delivered_at = now() - ($2 || ' days')::interval WHERE order_number = $1", [number, String(daysAgo)]);
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  await db.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, 'FRX-SHOP-1001', 'shop-002', 'Royal Frames', '+919876511111', 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [newId()]
  );
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.keep@example.com", phone: "9876500081", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  S.home = (await asha.post("/api/addresses", { fullName: "Asha Verma", phone: "98765 00081", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" })).json.address.id;
});

after(async () => {
  await emailsSettled();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("order photos after the order is finished (15 days)", () => {
  test("the setting is 15 days", () => assert.equal(config.uploads.finishedOrderDays, 15));

  test("delivered 16 days ago: the file goes, the order keeps the record and shows the photo as removed", async () => {
    const o = await order();
    await deliver(o.number, 16);
    const key = await keyOf(o.uploadId);
    assert.ok(await storage.exists(key));
    assert.ok((await sweepFinishedOrderPhotos()) >= 1);
    assert.equal(await statusOf(o.uploadId), "DELETED");
    assert.equal(await storage.exists(key), false);
    const view = (await asha.get(`/api/orders/${o.number}`)).json.order;
    const photo = view.items[0].photos[0];
    assert.deepEqual([photo.removed, photo.name], [true, "family.jpg"]);
    // Nobody can open it any more
    assert.equal((await asha.post(`/api/orders/${o.number}/photos/${o.uploadId}/link`, {})).status, 404);
  });

  test("delivered 10 days ago, or still under way: kept", async () => {
    const recent = await order();
    await deliver(recent.number, 10);
    const open = await order();
    await sweepFinishedOrderPhotos();
    assert.equal(await statusOf(recent.uploadId), "ATTACHED");
    assert.equal(await statusOf(open.uploadId), "ATTACHED");
    assert.ok(await storage.exists(await keyOf(open.uploadId)));
  });

  test("a photo another unfinished order still uses is kept until that one is finished too", async () => {
    const first = await order();
    const second = await order(first.uploadId); // the same photo in a second order
    await deliver(first.number, 30);
    await sweepFinishedOrderPhotos();
    assert.equal(await statusOf(first.uploadId), "ATTACHED", "the second order still needs it");
    await deliver(second.number, 16);
    await sweepFinishedOrderPhotos();
    assert.equal(await statusOf(first.uploadId), "DELETED");
  });

  test("a photo a saved design uses is kept (the customer chose to keep that design)", async () => {
    const o = await order();
    await deliver(o.number, 40);
    const saved = await asha.request("POST", "/api/designs", { title: "Keep this", mode: "product", productId: FRAME.id, config: { mode: "product", photos: { photo1: "ph-x" } }, photos: { photo1: o.uploadId } });
    assert.equal(saved.status, 201, saved.text);
    await sweepFinishedOrderPhotos();
    assert.equal(await statusOf(o.uploadId), "ATTACHED");
  });

  test("cancelled 16 days ago: removed", async () => {
    const o = await order();
    assert.equal((await admin.post(`/api/admin/orders/${o.number}/status`, { status: "CANCELLED" })).status, 200);
    await db.query("UPDATE orders SET cancelled_at = now() - interval '16 days' WHERE order_number = $1", [o.number]);
    await sweepFinishedOrderPhotos();
    assert.equal(await statusOf(o.uploadId), "DELETED");
  });
});

describe("shop products need FrameX approval (admin setting)", () => {
  test("on after migration 016, although the host still says PRODUCT_MODERATION=false", () => {
    assert.equal(config.catalog.productModeration, true);
  });

  test("it is an admin setting: listed, and it can be switched off and on again", async () => {
    const list = (await admin.get("/api/admin/settings")).json.items;
    const s = list.find((x) => x.key === "productModeration");
    assert.deepEqual([s.label, s.unit, s.value, s.group], ["Shop products need FrameX approval", "boolean", true, "Shop products"]);
    assert.equal((await admin.patch("/api/admin/settings", { productModeration: false })).status, 200);
    assert.equal(config.catalog.productModeration, false);
    assert.equal((await admin.patch("/api/admin/settings", { productModeration: true })).status, 200);
    assert.equal(config.catalog.productModeration, true);
    assert.equal((await new Client().get("/api/config")).json.features.productModeration, true, "the website is told");
  });
});

describe("a missing stored file: what it belonged to (start-up log)", () => {
  test("a lost photo of an order still under way is listed first, with the order number and status, never the key", async () => {
    const o = await order();
    const key = await keyOf(o.uploadId);
    assert.equal((await checkKnownFiles()).missing, 0);
    await storage.remove(key); // as a wiped server disk would
    const r = await checkKnownFiles();
    assert.equal(r.missing, 1);
    assert.deepEqual([r.lost[0].what, r.lost[0].underWay], ["customer photo", true]);
    assert.equal(r.lost[0].where, `order ${o.number} (PLACED)`);
    const line = describeLost(r.lost[0]);
    assert.match(line, /^STILL UNDER WAY - customer photo: order FX-\d+ \(PLACED\); uploaded \d{4}-\d{2}-\d{2}$/);
    assert.ok(!JSON.stringify(r).includes(key) && !JSON.stringify(r).includes("family.jpg") && !JSON.stringify(r).includes("Asha"), "no key, file name or person");
  });
});

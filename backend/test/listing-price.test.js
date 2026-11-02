/* ==========================================================================
   FrameX's pricing plan (owner, 2026-11-02). Run with "npm test" in backend/.

   A shop names its own price; customers see FrameX's listing price (the shop's
   price + a markup + a delivery share for the box size, ending in 9, free
   delivery). When FrameX approves the product the shop is emailed both prices
   and whom to contact. Every order line keeps what the shop receives, so its
   payout is its own price, Cash on Delivery or online, with no commission.
   Paying online takes a few % off. The numbers here are this test's own (the
   real ones are FrameX's settings, never in the code).
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
process.env.PAYMENT_MODE = "test";
process.env.RAZORPAY_KEY_ID = mock.keyId;
process.env.RAZORPAY_KEY_SECRET = mock.keySecret;
process.env.RAZORPAY_WEBHOOK_SECRET = mock.webhookSecret;
process.env.RAZORPAY_API_BASE = mock.url;
process.env.PRODUCT_MODERATION = "true";
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "0";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.FIRST_ORDER_FREE_DELIVERY = "false";
process.env.COD_FEE = "49";
process.env.PLATFORM_COMMISSION_PERCENT = "10"; // the old commission: lines under the rule pay none
process.env.PAYOUT_FEE_PERCENT = "0";
process.env.PAYOUT_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64"); // made for this run only
process.env.LISTING_MARKUP_PERCENT = "20";
process.env.LISTING_SHARE_SMALL = "100";
process.env.LISTING_SHARE_MEDIUM = "150";
process.env.LISTING_SHARE_LARGE = "250";
process.env.ONLINE_DISCOUNT_PERCENT = "4";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { default: sharp } = await import("sharp");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { notificationsSettled } = await import("../src/services/notification-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { listedMailSettled } = await import("../src/services/shop-product-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");
const { uploadPhoto } = await import("./support/photos.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, url, body, type) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": raw ? type || "image/jpeg" : "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
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
  put = (url, body = {}) => this.request("PUT", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00061", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const admin = new Client();
const shop = new Client();
const other = new Client();
const asha = new Client();
const S = {};
const ID = "lp-pricetest01";
const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const settle = async () => {
  await emailsSettled();
  await notificationsSettled();
  await listedMailSettled();
};

async function makeShop(client, name) {
  const id = newId();
  const code = "FRX-SHOP-" + (await row("SELECT nextval('shop_code_seq')::int AS n")).n;
  await db.query(
    `INSERT INTO shops (id, shop_code, name, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, $2, $3, 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [id, code, name]
  );
  const email = `${code.toLowerCase()}@shops.example`;
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id, password_changed_at) VALUES ($1, $2, $3, $4, 'SHOP', 'ACTIVE', $5, now())", [newId(), name + " owner", email, await hashPassword(PASSWORD), id]);
  assert.equal((await client.post("/api/auth/login", { identifier: email, password: PASSWORD, accountType: "shop" })).status, 200);
  return { id, code, email };
}

/** A frame as the dashboard sends it: the shop's own prices (one size per box). */
const frame = (over = {}) => ({
  name: "Teak Wall Frame",
  productType: "photo-frame",
  category: "photo-frames",
  personalization: { photos: 1 },
  frame: { type: "modern", material: "Wood", color: "natural-wood" },
  protection: { options: [{ id: "glass", priceModifier: 0, description: "" }], default: "glass" },
  sizes: [
    { id: "sz-s", label: "8 × 10 in", width: 8, height: 10, unit: "in", price: 500 },
    { id: "sz-m", label: "12 × 18 in", width: 12, height: 18, unit: "in", price: 800 },
    { id: "sz-l", label: "16 × 24 in", width: 16, height: 24, unit: "in", price: 1200 }
  ],
  pricing: { basePrice: 500, discountPercent: 0 },
  componentOrder: "own",
  components: [{ id: "c1", type: "frame", name: "Frame", material: "Teak" }],
  ...over
});

/** One frame (8 × 10) in Asha's cart, with her photo. */
async function fillCart() {
  assert.equal((await asha.del("/api/cart")).status, 200);
  const up = await uploadPhoto(base, asha, { name: "family.jpg" });
  assert.equal(up.status, 201, up.text);
  const r = await asha.post("/api/cart/items", { productId: ID, selection: { sizeId: "sz-s" }, photos: { photo1: up.json.upload.id } });
  assert.equal(r.status, 201, r.text);
}
const quote = async (method) => (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=${method}`)).json.quote;
async function deliver(number) {
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
    const r = await admin.post(`/api/admin/orders/${number}/status`, { status });
    assert.equal(r.status, 200, `${status}: ${r.text}`);
  }
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Price Admin', 'price.admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "price.admin@framex.example", password: PASSWORD })).status, 200);
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.price@example.com", phone: "9876500061", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  S.shop = await makeShop(shop, "Teak House Frames");
  S.other = await makeShop(other, "Other Frames");
});

after(async () => {
  await new Promise((r) => server.close(r));
  await mock.close();
  await db.close();
});

describe("The shop's price and FrameX's listing price", () => {
  test("customers see the listing price (box share, ending in 9); the shop still edits its own price", async () => {
    const pic = await shop.request("POST", `/api/shops/${S.shop.code}/media`, await sharp({ create: { width: 1200, height: 1500, channels: 3, background: { r: 120, g: 160, b: 200 } } }).jpeg().toBuffer());
    assert.equal(pic.status, 201, pic.text);
    // what the shop can't decide: anything like "what the shop receives" it sends itself is dropped
    const sneaky = frame({ views: [{ id: "v1", url: pic.json.media.ref, type: "PHOTO", alt: "Teak frame", isMain: true }], status: "published" });
    sneaky.sizes[0].shopPrice = 5000;
    sneaky.pricing.listingRule = true;
    sneaky.pricing.shopBasePrice = 5000;
    const r = await shop.put(`/api/shops/${S.shop.code}/products/${ID}`, sneaky);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.product.status, "pending_review");
    const own = r.json.product;
    assert.deepEqual(own.sizes.map((s) => s.price), [500, 800, 1200], "the shop sees its own prices");
    assert.deepEqual(own.listing.sizes.map((s) => [s.price, s.box]), [[709, "small"], [1119, "medium"], [1699, "large"]]);
    const stored = (await row("SELECT data FROM catalog_products WHERE id = $1", [ID])).data;
    assert.deepEqual(stored.sizes.map((s) => [s.price, s.shopPrice]), [[709, 500], [1119, 800], [1699, 1200]]);
    assert.equal(stored.pricing.shopBasePrice, 500);
    const list = (await admin.get(`/api/admin/products?shop=${S.shop.id}`)).json.items.find((x) => x.id === ID);
    assert.deepEqual([list.priceFrom, list.priceTo], [709, 1699]);
  });

  test("a shop discount comes off the shop's price first", async () => {
    const r = await shop.post(`/api/shops/${S.shop.code}/listing-preview`, { sizes: [{ id: "a", width: 8, height: 10, price: 500 }], discountPercent: 10 });
    assert.equal(r.status, 200, r.text);
    // the shop gets 450: 450 × 1.2 + 100 = 640 -> 649, shown as 709 with 8% off (652)
    assert.equal(r.json.sizes[0].price, 709);
    assert.equal(r.json.discountPercent, 8);
  });

  test("the editor's preview gives the customer's prices only, never FrameX's numbers", async () => {
    const r = await shop.post(`/api/shops/${S.shop.code}/listing-preview`, { sizes: [{ id: "a", width: 8, height: 10, price: 500 }, { id: "b", width: 20, height: 30, price: 2000 }] });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json, { on: true, discountPercent: 0, sizes: [{ id: "a", price: 709, box: "small" }, { id: "b", price: 2659, box: "large" }] });
    assert.equal((await other.post(`/api/shops/${S.shop.code}/listing-preview`, { sizes: [] })).status, 403, "only the shop itself");
    assert.equal((await admin.post(`/api/admin/shops/${S.shop.id}/listing-preview`, { sizes: [{ id: "a", width: 8, height: 10, price: 500 }] })).json.sizes[0].price, 709);
  });

  test("approved: the shop is emailed each size's customer price, what it gets, and whom to contact", async () => {
    const r = await admin.post(`/api/admin/products/${ID}/listing`, { status: "published" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.product.status, "published");
    await settle();
    const mails = devOutbox().filter((m) => m.to === S.shop.email && /^Approved:/.test(m.subject));
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.match(m.text, /8 × 10 in: ₹709 \(you get ₹500\)/);
    assert.match(m.text, /16 × 24 in: ₹1,699 \(you get ₹1,200\)/);
    assert.match(m.text, /FrameX Care/);
    assert.match(m.text, /support@shopframex\.in/);
    assert.ok(!/20%|markup|share/i.test(m.text), "FrameX's numbers are not in it");
    // the shop changes its price later: no second "approved" email
    assert.equal((await shop.put(`/api/shops/${S.shop.code}/products/${ID}`, { ...(await shop.get(`/api/shops/${S.shop.code}/products/${ID}`)).json.product, status: "published" })).status, 200);
    await settle();
    assert.equal(devOutbox().filter((m) => m.to === S.shop.email && /^Approved:/.test(m.subject)).length, 1);
    const stored = (await row("SELECT data, listing_status FROM catalog_products WHERE id = $1", [ID]));
    assert.equal(stored.listing_status, "published");
    assert.deepEqual(stored.data.sizes.map((s) => [s.price, s.shopPrice]), [[709, 500], [1119, 800], [1699, 1200]], "saved again from its own prices: no double markup");
  });
});

describe("Orders and payouts", () => {
  test("Cash on Delivery: the customer pays the listing price; the line keeps what the shop gets", async () => {
    await fillCart();
    const q = await quote("COD");
    assert.equal(q.itemsTotal ?? q.subtotal, 709);
    assert.deepEqual(q.onlineDiscount, { percent: 4, amount: 0 });
    assert.equal(q.shippingFee, 0);
    assert.equal(q.total, 709 + 49);
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: q.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(r.status, 201, r.text);
    S.cod = r.json.order.orderNumber;
    const line = await row("SELECT i.line_total, i.seller_unit_amount, i.seller_type FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [S.cod]);
    assert.deepEqual([line.line_total, line.seller_unit_amount, line.seller_type], [709, 500, "SHOP"]);
    await settle();
    // the shop is told its own amount, and that FrameX's courier collects the cash
    const alert = devOutbox().find((m) => m.to === S.shop.email && m.subject.includes(S.cod));
    assert.ok(alert, "the shop is emailed the new order");
    assert.match(alert.text, /₹500/);
    assert.ok(!alert.text.includes("₹709"));
    assert.match(alert.text, /courier collects it/);
    const list = (await shop.get(`/api/shops/${S.shop.code}/orders`)).json;
    const o = (list.items || list.orders).find((x) => x.orderNumber === S.cod);
    assert.equal(o.itemsTotal, 500);
    assert.equal(o.cashToCollect, false);
    assert.match(o.payment, /courier collects it/);
    const detail = (await shop.get(`/api/shops/${S.shop.code}/orders/${S.cod}`)).json.order;
    assert.equal(detail.items[0].lineTotal, 500);
    const sellers = (await admin.get(`/api/admin/orders/${S.cod}`)).json.order.sellers;
    assert.deepEqual([sellers[0].itemsTotal, sellers[0].viaCourier], [500, true]);
  });

  test("paying online takes 4% off the items; the order, its email and the gateway amount carry it", async () => {
    await fillCart();
    const q = await quote("ONLINE");
    assert.deepEqual(q.onlineDiscount, { percent: 4, amount: 28 });
    assert.equal(q.codFee, 0);
    assert.equal(q.total, 709 - 28);
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: q.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(r.status, 201, r.text);
    const { order, payment } = r.json;
    S.online = order.orderNumber;
    assert.equal(order.onlineDiscount, 28);
    assert.equal(mock.orders.get(payment.gatewayOrderId).amount, 681 * 100);
    const paid = mock.pay(payment.gatewayOrderId, { method: "upi" });
    const v = await asha.post(`/api/orders/${S.online}/payments/verify`, paid.proof);
    assert.equal(v.status, 200, v.text);
    assert.equal(v.json.order.paymentStatus, "PAID");
    const o = await row("SELECT online_discount, total FROM orders WHERE order_number = $1", [S.online]);
    assert.deepEqual([o.online_discount, o.total], [28, 681]);
    assert.equal((await row("SELECT i.seller_unit_amount FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [S.online])).seller_unit_amount, 500, "the shop gets the same, whatever the customer paid");
    await settle();
    const mail = devOutbox().find((m) => m.to === "asha.price@example.com" && m.subject.includes(S.online));
    assert.ok(mail, "the customer is emailed");
    assert.match(mail.text, /Online payment discount: -₹28/);
  });

  test("the payout: the shop's own price for both orders, Cash on Delivery included, with no commission", async () => {
    await deliver(S.cod);
    await deliver(S.online);
    // paid with the gateway's test keys, so it is a test order (never paid out): made a real one here
    await db.query("UPDATE orders SET is_test = false WHERE order_number = $1", [S.online]);
    const d = (await shop.get(`/api/shops/${S.shop.code}/payouts`)).json.due;
    assert.equal(d.sales, 1000, JSON.stringify(d));
    assert.equal(d.onlineSales, 1000, "FrameX holds the money of both: its courier collected the cash");
    assert.equal(d.commission, 0);
    assert.equal(d.amount, 1000);
  });
});

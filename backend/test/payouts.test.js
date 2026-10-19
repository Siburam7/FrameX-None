/* ==========================================================================
   New-order alerts for sellers, payout accounts (bank or UPI, sealed) and
   payouts to shops and artists (commission + payout charge).
   Run with "npm test" in backend/.

   A real server on a random port and an in-memory PostgreSQL (PGlite). Orders
   are placed for real (Cash on Delivery); an order "paid online" is made by
   changing a Cash on Delivery order in the database, since the gateway is not
   what these tests are about (checkout.test.js and art.test.js test it).
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
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.FIRST_ORDER_FREE_DELIVERY = "false";
process.env.COD_FEE = "40";
process.env.GIFT_WRAP_FEE = "49";
process.env.PLATFORM_COMMISSION_PERCENT = "10";
process.env.ARTIST_COMMISSION_PERCENT = "15";
process.env.PAYOUT_FEE_PERCENT = "2";
process.env.PAYOUT_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64"); // made for this run only

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { open, resetSealingKey, seal, sealingReady } = await import("../src/lib/sealed.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { alertSellers, notificationsSettled } = await import("../src/services/notification-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { payoutReadiness, payoutsStatusLine, workOut } = await import("../src/services/payout-service.js");
const { loadSettings } = await import("../src/services/settings-service.js");
const { uploadPhoto } = await import("./support/photos.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body, headers = {}) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  patch = (url, body = {}) => this.request("PATCH", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00051", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client();
const admin = new Client();
const shopB = new Client(); // the catalogue's "shop-002"
const shopC = new Client(); // the catalogue's "shop-003"
const artist = new Client();
const S = {};

const { seed, model } = siteEngine();
const product = (id) => model.normalize(seed.products.find((p) => p.id === id));
const FRAME_B = product("p-005"); // shop-002, one photo
const FRAME_C = product("p-009"); // shop-003, one photo
const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const settle = async () => {
  await emailsSettled();
  await notificationsSettled();
};
const mailsTo = (email) => devOutbox().filter((m) => m.to === email);

async function makeShop(client, { name, catalogRef, phone }) {
  const id = newId();
  const code = "FRX-SHOP-" + (await row("SELECT nextval('shop_code_seq')::int AS n")).n;
  await db.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, $2, $3, $4, $5, 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [id, code, catalogRef, name, phone]
  );
  const email = `${code.toLowerCase()}@shops.example`;
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id, password_changed_at) VALUES ($1, $2, $3, $4, 'SHOP', 'ACTIVE', $5, now())", [newId(), name + " owner", email, await hashPassword(PASSWORD), id]);
  assert.equal((await client.post("/api/auth/login", { identifier: email, password: PASSWORD, accountType: "shop" })).status, 200);
  return { id, code, email };
}

/** A real Cash on Delivery order of one frame (with the customer's photo). */
async function codOrder(frame) {
  const up = await uploadPhoto(base, asha, { name: "family.jpg" });
  assert.equal(up.status, 201, up.text);
  assert.equal((await asha.post("/api/cart/items", { productId: frame.id, photos: { photo1: up.json.upload.id } })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=COD`)).json.quote;
  const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201, r.text);
  return r.json.order;
}
/** Move an order all the way to Delivered, as FrameX staff. */
async function deliver(number) {
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
    const r = await admin.post(`/api/admin/orders/${number}/status`, { status });
    assert.equal(r.status, 200, `${status}: ${r.text}`);
  }
}
/** Make a Cash on Delivery order an order paid online (what a verified gateway payment would leave). */
const makeOnline = (number) => db.query("UPDATE orders SET payment_method = 'ONLINE', payment_gateway = 'test', payment_status = 'PAID', paid_at = now(), total = total - cod_fee, cod_fee = 0 WHERE order_number = $1", [number]);

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await loadSettings();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha@example.com", phone: "9876500051", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  S.shopB = await makeShop(shopB, { name: "Royal Frames", catalogRef: "shop-002", phone: "+919876511111" });
  S.shopC = await makeShop(shopC, { name: "Nordic Frames", catalogRef: "shop-003", phone: "+919876522222" });
  // An artist with a login
  S.artistId = newId();
  await db.query("INSERT INTO artists (id, artist_code, username, name, city, state, phone, email) VALUES ($1, 'FRX-ART-1001', 'riya.paints', 'Riya Das', 'Cuttack', 'Odisha', '+919876533333', 'riya@example.com')", [S.artistId]);
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, artist_id, password_changed_at) VALUES ($1, 'Riya Das', 'riya.login@example.com', $2, 'ARTIST', 'ACTIVE', $3, now())", [newId(), await hashPassword(PASSWORD), S.artistId]);
  assert.equal((await artist.post("/api/auth/login", { identifier: "riya.login@example.com", password: PASSWORD })).status, 200);
  clearDevOutbox();
});

after(async () => {
  await settle();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("sealed payout details", () => {
  test("what is sealed opens again; a changed text or no key does not", () => {
    assert.equal(sealingReady(), true);
    const text = seal({ accountNumber: "123456789012", ifsc: "HDFC0001234" });
    assert.match(text, /^v1\./);
    assert.ok(!text.includes("123456789012"));
    assert.deepEqual(open(text), { accountNumber: "123456789012", ifsc: "HDFC0001234" });
    const parts = text.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => open(parts.join(".")));
    assert.notEqual(seal({ a: 1 }), seal({ a: 1 }), "a new random IV every time");
    const keep = process.env.PAYOUT_ENCRYPTION_KEY;
    process.env.PAYOUT_ENCRYPTION_KEY = "too-short";
    resetSealingKey();
    assert.equal(sealingReady(), false);
    assert.throws(() => seal({ a: 1 }));
    process.env.PAYOUT_ENCRYPTION_KEY = keep;
    resetSealingKey();
    assert.equal(sealingReady(), true);
  });
});

describe("a new order: each seller hears about their own items", () => {
  test("a Cash on Delivery order with two shops' frames: each shop is emailed its items and amount only", async () => {
    // One frame from each shop in the same order
    for (const frame of [FRAME_B, FRAME_C]) {
      const up = await uploadPhoto(base, asha, { name: "photo.jpg" });
      assert.equal((await asha.post("/api/cart/items", { productId: frame.id, photos: { photo1: up.json.upload.id } })).status, 201);
    }
    const quote = (await asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=COD`)).json.quote;
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(r.status, 201, r.text);
    S.mixed = r.json.order.orderNumber;
    await settle();
    const toB = mailsTo(S.shopB.email);
    const toC = mailsTo(S.shopC.email);
    assert.equal(toB.length, 1, "shop B: one email");
    assert.equal(toC.length, 1, "shop C: one email");
    assert.equal(toB[0].subject, `New order ${S.mixed}`);
    const lineB = r.json.order.items.find((i) => i.shopRef === "shop-002" || i.name === FRAME_B.name);
    const lineC = r.json.order.items.find((i) => i.shopRef === "shop-003" || i.name === FRAME_C.name);
    assert.ok(lineB && lineC, JSON.stringify(r.json.order.items));
    const rs = (n) => "₹" + Number(n).toLocaleString("en-IN");
    assert.ok(toB[0].text.includes(FRAME_B.name) && toB[0].text.includes(rs(lineB.lineTotal)), toB[0].text);
    assert.ok(!toB[0].text.includes(FRAME_C.name) && !toB[0].text.includes(rs(lineC.lineTotal)), "shop B never hears about shop C's frame or amount");
    assert.ok(toC[0].text.includes(FRAME_C.name) && !toC[0].text.includes(FRAME_B.name));
    assert.match(toB[0].text, /Cash on Delivery: collect the cash on handover/);
    assert.ok(toB[0].text.includes(`shop-dashboard.html#/orders/${S.mixed}`), "the email links to the order in the dashboard");
    // The customer still gets their own email
    assert.ok(mailsTo("asha@example.com").some((m) => m.subject.includes(S.mixed)));
    // In the shop's account too
    const note = await row("SELECT kind, title FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.kind = 'SHOP_NEW_ORDER'", [S.shopB.email]);
    assert.equal(note.title, `New order ${S.mixed}`);
  });

  test("hearing about the same order again (a repeated payment callback) sends nothing more", async () => {
    clearDevOutbox();
    const id = (await row("SELECT id FROM orders WHERE order_number = $1", [S.mixed])).id;
    await alertSellers(id);
    await alertSellers(id);
    await settle();
    assert.equal(mailsTo(S.shopB.email).length, 0);
    assert.equal(mailsTo(S.shopC.email).length, 0);
  });

  test("an order paid online says so", async () => {
    const order = await codOrder(FRAME_C);
    await makeOnline(order.orderNumber);
    await db.query("DELETE FROM notifications WHERE kind = 'SHOP_NEW_ORDER' AND ref = $1", [order.orderNumber]); // as if this were the first time
    clearDevOutbox();
    await alertSellers((await row("SELECT id FROM orders WHERE order_number = $1", [order.orderNumber])).id);
    await settle();
    const m = mailsTo(S.shopC.email);
    assert.equal(m.length, 1);
    assert.match(m[0].text, /Paid online\./);
  });

  test("the admin's order page lists each shop with its phone and its own items, for WhatsApp", async () => {
    const r = await admin.get(`/api/admin/orders/${S.mixed}`);
    assert.equal(r.status, 200);
    const sellers = r.json.order.sellers;
    assert.equal(sellers.length, 2);
    const b = sellers.find((s) => s.code === S.shopB.code);
    assert.equal(b.type, "SHOP");
    assert.equal(b.phone, "+919876511111");
    assert.equal(b.items, 1);
    assert.equal(b.firstItem, FRAME_B.name);
    // A customer's own view of the order has no sellers list
    assert.equal((await asha.get(`/api/orders/${S.mixed}`)).json.order.sellers, undefined);
  });
});

describe("payout account", () => {
  const BANK = { method: "BANK", holderName: "Royal Frames", accountNumber: "1234 5678 9012", confirmAccountNumber: "123456789012", ifsc: "hdfc0001234", bankName: "HDFC Bank", password: PASSWORD };

  test("nothing is set at first; the page says the rates", async () => {
    const r = await shopB.get(`/api/shops/${S.shopB.code}/payouts`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.account, null);
    assert.equal(r.json.ready, true);
    assert.equal(r.json.due.commissionPercent, 10);
    assert.equal(r.json.due.feePercent, 2);
  });

  test("the fields are checked: method, IFSC, both account numbers, the password", async () => {
    const bad = async (body, field) => {
      const r = await shopB.put(`/api/shops/${S.shopB.code}/payout-account`, body);
      assert.equal(r.status, 422, `${field}: ${r.text}`);
      assert.ok(r.json.error.fields[field], `${field}: ${JSON.stringify(r.json.error.fields)}`);
    };
    await bad({ ...BANK, method: "CHEQUE" }, "method");
    await bad({ ...BANK, ifsc: "HDFC1234" }, "ifsc");
    await bad({ ...BANK, accountNumber: "12AB" }, "accountNumber");
    await bad({ ...BANK, confirmAccountNumber: "123456789013" }, "confirmAccountNumber");
    await bad({ ...BANK, password: "Wrong-Password-1" }, "password");
    await bad({ method: "UPI", holderName: "Royal Frames", upiId: "not-an-upi", password: PASSWORD }, "upiId");
    assert.equal((await row("SELECT count(*)::int AS n FROM payout_accounts")).n, 0);
  });

  test("a bank account is saved sealed, shown masked, and the shop is emailed", async () => {
    clearDevOutbox();
    const r = await shopB.put(`/api/shops/${S.shopB.code}/payout-account`, BANK);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual({ method: r.json.account.method, holderName: r.json.account.holderName, hint: r.json.account.hint }, { method: "BANK", holderName: "Royal Frames", hint: "HDFC0001234 · ••••9012" });
    assert.ok(!r.text.includes("123456789012"), "the full number never comes back to the page");
    const stored = await row("SELECT details FROM payout_accounts WHERE shop_id = $1", [S.shopB.id]);
    assert.ok(!stored.details.includes("123456789012") && !stored.details.includes("HDFC Bank"), "the database holds sealed text only");
    assert.deepEqual(open(stored.details), { accountNumber: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
    await settle();
    const m = mailsTo(S.shopB.email);
    assert.equal(m.length, 1);
    assert.equal(m[0].subject, "Your payout account was added");
    assert.ok(m[0].text.includes("HDFC0001234 · ••••9012") && !m[0].text.includes("123456789012"));
    assert.ok(await row("SELECT 1 AS ok FROM audit_logs WHERE action = 'PAYOUT_ACCOUNT_CHANGED' AND target_id = $1", [S.shopB.code]));
  });

  test("changing it to UPI replaces it, and says it was changed", async () => {
    clearDevOutbox();
    const r = await shopC.put(`/api/shops/${S.shopC.code}/payout-account`, { method: "UPI", holderName: "Nordic Frames", upiId: "Nordic.Frames@OKAXIS", password: PASSWORD });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.account.hint, "no•••@okaxis");
    const again = await shopC.put(`/api/shops/${S.shopC.code}/payout-account`, { method: "UPI", holderName: "Nordic Frames", upiId: "9876522222@ybl", password: PASSWORD });
    assert.equal(again.json.account.hint, "98•••@ybl");
    assert.equal((await row("SELECT count(*)::int AS n FROM payout_accounts WHERE shop_id = $1", [S.shopC.id])).n, 1);
    await settle();
    assert.equal(mailsTo(S.shopC.email)[0].subject, "Your payout account was changed", "the newest email");
  });

  test("nobody else can read or change a shop's payout account", async () => {
    assert.equal((await shopC.get(`/api/shops/${S.shopB.code}/payouts`)).status, 403);
    assert.equal((await shopC.put(`/api/shops/${S.shopB.code}/payout-account`, { ...BANK, holderName: "Thief" })).status, 403);
    assert.equal((await asha.get(`/api/shops/${S.shopB.code}/payouts`)).status, 403);
    assert.equal((await new Client().get(`/api/shops/${S.shopB.code}/payouts`)).status, 401);
    assert.equal((await asha.get("/api/admin/payouts")).status, 403);
    assert.equal((await shopB.get("/api/artist/payouts")).status, 403);
    assert.equal((await row("SELECT holder_name FROM payout_accounts WHERE shop_id = $1", [S.shopB.id])).holder_name, "Royal Frames");
  });

  test("only an admin sees the full details, and the look is logged", async () => {
    const r = await admin.get(`/api/admin/payouts/shop/${S.shopB.id}`);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.account.details, { accountNumber: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
    assert.ok(await row("SELECT 1 AS ok FROM audit_logs WHERE action = 'PAYOUT_ACCOUNT_VIEWED' AND target_id = $1", [S.shopB.code]));
  });
});

describe("what is due, and paying it out", () => {
  test("the sums: online sales + extras − commission on all sales − the payout charge", () => {
    const w = workOut(
      [
        { sales: 1000, online: true, extras: 60 },
        { sales: 500, online: false, extras: 0 }
      ],
      { commissionPercent: 10, feePercent: 2 }
    );
    // commission 150 (on 1500); 1000 + 60 − 150 = 910; charge 2% of 910 = 18.2 → 18; payout 892
    assert.deepEqual({ ...w }, { sales: 1500, onlineSales: 1000, codSales: 500, extras: 60, commissionPercent: 10, commission: 150, feePercent: 2, fee: 18, amount: 892, payable: true });
    const owes = workOut([{ sales: 800, online: false, extras: 0 }], { commissionPercent: 10, feePercent: 2 });
    assert.equal(owes.amount, -80, "Cash on Delivery only: the shop owes FrameX its commission");
    assert.equal(owes.fee, 0);
    assert.equal(owes.payable, false);
  });

  test("undelivered orders are not due; a delivered Cash on Delivery order leaves the shop owing the commission", async () => {
    let d = (await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due;
    assert.equal(d.sales, 0, "nothing delivered yet");
    await deliver(S.mixed);
    d = (await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due;
    const mine = (await row("SELECT sum(line_total)::int AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1 AND i.shop_ref = 'shop-002'", [S.mixed])).n;
    assert.equal(d.sales, mine, "only shop B's own items count for shop B");
    assert.equal(d.codSales, mine);
    assert.equal(d.onlineSales, 0);
    assert.equal(d.commission, Math.round(mine * 0.1));
    assert.equal(d.amount, -Math.round(mine * 0.1));
    assert.equal(d.payable, false);
    assert.equal(d.orders.length, 1);
    assert.equal(d.orders[0].payment, "COD");
  });

  test("an order paid online makes a payout due, with the shop's share of the delivery fee", async () => {
    const order = await codOrder(FRAME_B);
    await makeOnline(order.orderNumber);
    await deliver(order.orderNumber);
    S.online = order.orderNumber;
    const o = await row("SELECT subtotal - discount AS items, shipping_fee, gift_wrap_fee, tax FROM orders WHERE order_number = $1", [order.orderNumber]);
    const codSales = (await row("SELECT sum(line_total)::int AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1 AND i.shop_ref = 'shop-002'", [S.mixed])).n;
    const d = (await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due;
    const sales = codSales + o.items;
    const commission = Math.round(sales * 0.1);
    const before = o.items + o.shipping_fee + o.gift_wrap_fee + o.tax - commission;
    const fee = Math.round(before * 0.02);
    assert.deepEqual({ sales: d.sales, onlineSales: d.onlineSales, extras: d.extras, commission: d.commission, fee: d.fee, amount: d.amount }, { sales, onlineSales: o.items, extras: o.shipping_fee + o.gift_wrap_fee + o.tax, commission, fee, amount: before - fee });
    assert.equal(d.payable, true);
    S.dueB = d.amount;
  });

  test("the admin sees who is owed what", async () => {
    const r = await admin.get("/api/admin/payouts");
    assert.equal(r.status, 200, r.text);
    const b = r.json.sellers.find((s) => s.id === S.shopB.id);
    assert.equal(b.amount, S.dueB);
    assert.equal(b.account.hint, "HDFC0001234 · ••••9012");
    assert.equal(r.json.sellers[0].id, S.shopB.id, "largest amount first");
    assert.ok(r.json.sellers.some((s) => s.type === "artist" && s.id === S.artistId));
  });

  test("recording a payout: the amount must be the one due now, and a reference is needed", async () => {
    const url = `/api/admin/payouts/shop/${S.shopB.id}`;
    let r = await admin.post(url, { expectedAmount: S.dueB + 1, reference: "UTR123456789" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "AMOUNT_CHANGED");
    r = await admin.post(url, { expectedAmount: S.dueB, reference: "" });
    assert.equal(r.status, 422);
    assert.equal((await admin.post(`/api/admin/payouts/shop/${S.shopC.id}`, { expectedAmount: 10, reference: "UTR123456789" })).json.error.code, "NOTHING_DUE");
    clearDevOutbox();
    r = await admin.post(url, { expectedAmount: S.dueB, reference: "UTR123456789", note: "Week 1" });
    assert.equal(r.status, 201, r.text);
    assert.match(r.json.payout.number, /^PO-\d{6}$/);
    assert.equal(r.json.payout.amount, S.dueB);
    assert.equal(r.json.payout.method, "BANK");
    S.payout = r.json.payout.number;
    // Nothing is due any more, and the same orders can't be paid out twice
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due.sales, 0);
    assert.equal((await admin.post(url, { expectedAmount: S.dueB, reference: "UTR123456789" })).json.error.code, "NOTHING_DUE");
    assert.equal((await row("SELECT count(*)::int AS n FROM payout_lines")).n, 2, "two order lines were paid out");
    await settle();
    const m = mailsTo(S.shopB.email);
    assert.equal(m.length, 1);
    assert.ok(m[0].subject.startsWith("FrameX sent you ₹"), m[0].subject);
    assert.ok(m[0].text.includes("UTR123456789") && m[0].text.includes("HDFC0001234 · ••••9012"));
  });

  test("the shop sees the payout with its breakdown; another shop does not", async () => {
    const p = (await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.payouts;
    assert.equal(p.length, 1);
    assert.equal(p[0].number, S.payout);
    assert.equal(p[0].reference, "UTR123456789");
    assert.equal(p[0].note, "Week 1");
    assert.deepEqual([...p[0].refs].sort(), [S.mixed, S.online].sort());
    assert.equal(p[0].amount, p[0].onlineSales + p[0].extras - p[0].commission - p[0].fee);
    assert.equal((await shopC.get(`/api/shops/${S.shopC.code}/payouts`)).json.payouts.length, 0);
  });

  test("a refunded or test order is never due", async () => {
    const order = await codOrder(FRAME_B);
    await makeOnline(order.orderNumber);
    await deliver(order.orderNumber);
    await db.query("UPDATE orders SET is_test = true WHERE order_number = $1", [order.orderNumber]);
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due.sales, 0, "test order");
    await db.query("UPDATE orders SET is_test = false, amount_refunded = 100, payment_status = 'PARTIALLY_REFUNDED' WHERE order_number = $1", [order.orderNumber]);
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due.sales, 0, "partly refunded order");
  });

  test("an artist: a delivered, fully paid custom painting is due at the artists' rate", async () => {
    assert.equal((await artist.put("/api/artist/payout-account", { method: "UPI", holderName: "Riya Das", upiId: "riya@okicici", password: PASSWORD })).status, 200);
    const customer = (await row("SELECT id FROM users WHERE email = 'asha@example.com'")).id;
    await db.query(
      `INSERT INTO painting_requests (id, request_number, user_id, artist_id, service, price, advance_percent, advance_amount, balance_amount, status, payment_status, amount_paid,
                                      shipping_address, customer_name, customer_email, idempotency_key, delivered_at)
       VALUES ($1, 'CP-100001', $2, $3, '{}'::jsonb, 3000, 40, 1200, 1800, 'DELIVERED', 'FULLY_PAID', 3000, '{}'::jsonb, 'Asha Verma', 'asha@example.com', 'k1', now())`,
      [newId(), customer, S.artistId]
    );
    const r = await artist.get("/api/artist/payouts");
    assert.equal(r.status, 200, r.text);
    const d = r.json.due;
    assert.equal(d.commissionPercent, 15);
    assert.equal(d.sales, 3000);
    assert.equal(d.commission, 450);
    assert.equal(d.fee, Math.round((3000 - 450) * 0.02));
    assert.equal(d.amount, 3000 - 450 - Math.round((3000 - 450) * 0.02));
    assert.equal(d.orders[0].ref, "CP-100001");
    assert.equal(r.json.account.hint, "ri•••@okicici");
    const paid = await admin.post(`/api/admin/payouts/artist/${S.artistId}`, { expectedAmount: d.amount, reference: "UPI-REF-778899" });
    assert.equal(paid.status, 201, paid.text);
    assert.equal(paid.json.payout.method, "UPI");
    assert.equal((await artist.get("/api/artist/payouts")).json.due.sales, 0);
  });

  test("the payout charge and the commissions are platform settings", async () => {
    const r = await admin.get("/api/admin/settings");
    const keys = r.json.items.map((s) => s.key);
    for (const k of ["commissionPercent", "artistCommissionPercent", "payoutFeePercent"]) assert.ok(keys.includes(k), k);
    assert.equal(r.json.items.find((s) => s.key === "payoutFeePercent").value, 2);
    assert.equal((await admin.patch("/api/admin/settings", { payoutFeePercent: 3 })).status, 200);
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/payouts`)).json.due.feePercent, 3);
    assert.equal((await admin.patch("/api/admin/settings", { payoutFeePercent: 25 })).status, 422, "at most 20%");
    assert.equal((await admin.patch("/api/admin/settings", { payoutFeePercent: null })).status, 200);
  });
});

describe("is the payout key working? (FrameX staff only, a plain yes or no)", () => {
  const GOOD = process.env.PAYOUT_ENCRYPTION_KEY;
  const withKey = async (value, fn) => {
    if (value === undefined) delete process.env.PAYOUT_ENCRYPTION_KEY;
    else process.env.PAYOUT_ENCRYPTION_KEY = value;
    resetSealingKey();
    try {
      await fn();
    } finally {
      process.env.PAYOUT_ENCRYPTION_KEY = GOOD;
      resetSealingKey();
    }
  };
  // Nothing about the key may leave the server: not the key, not its bytes in hex, not a hash of it
  const secretsIn = (text, key) => {
    const bytes = Buffer.from(key || "", /^[0-9a-f]{64}$/i.test(key || "") ? "hex" : "base64");
    const forms = [key, bytes.toString("hex"), bytes.toString("base64url"), crypto.createHash("sha256").update(key || "").digest("hex")].filter((f) => f && f.length >= 8);
    return forms.filter((f) => text.includes(f));
  };
  const overview = async () => {
    const r = await admin.get("/api/admin/payouts");
    assert.equal(r.status, 200, r.text);
    return r;
  };

  test("the right key: ready, and every saved account opens with it", async () => {
    const saved = (await db.query("SELECT count(*)::int AS n FROM payout_accounts")).rows[0].n;
    assert.ok(saved >= 2, "the earlier tests saved accounts");
    assert.deepEqual(await payoutReadiness(), { ready: true, reason: "ok", saved, unreadable: 0 });
    const r = await overview();
    assert.equal(r.json.ready, true);
    const line = await payoutsStatusLine();
    assert.ok(line.endsWith(`payout accounts READY (details sealed; all ${saved} saved payout account(s) open with this key)`), line);
    assert.deepEqual(secretsIn(r.text + line, GOOD), []);
    // What is sealed never shows in full in the overview, and nothing of the key is in the public settings
    assert.ok(!r.text.includes("123456789012"));
    const told = await (await fetch(base + "/api/config")).text();
    assert.deepEqual(secretsIn(told, GOOD), []);
    assert.ok(!/payoutsReady|sealing|ENCRYPTION/i.test(told), "the public settings say nothing about payouts being ready");
  });

  test("no key: not ready", () =>
    withKey(undefined, async () => {
      assert.equal((await payoutReadiness()).reason, "no-key");
      assert.equal((await overview()).json.ready, false);
      assert.match(await payoutsStatusLine(), /payout accounts NOT READY - set PAYOUT_ENCRYPTION_KEY/);
    }));

  test("a key that is not 32 bytes: not ready, and the wrong value is not repeated back", async () => {
    for (const bad of ["too-short-but-long-enough", crypto.randomBytes(31).toString("base64"), "z".repeat(64)])
      await withKey(bad, async () => {
        assert.equal((await payoutReadiness()).reason, "invalid-key", bad);
        const r = await overview();
        assert.equal(r.json.ready, false);
        const line = await payoutsStatusLine();
        assert.match(line, /NOT READY - PAYOUT_ENCRYPTION_KEY must be 32 bytes/);
        assert.ok(!r.text.includes(bad) && !line.includes(bad));
      });
  });

  test("a different valid key (the key was changed on the host): not ready, because the saved accounts no longer open", async () => {
    const other = crypto.randomBytes(32).toString("base64");
    await withKey(other, async () => {
      const r = await payoutReadiness();
      assert.equal(r.reason, "saved-accounts-unreadable");
      assert.equal(r.unreadable, r.saved);
      const o = await overview();
      assert.equal(o.json.ready, false);
      const line = await payoutsStatusLine();
      assert.ok(line.includes(`NOT READY - ${r.saved} of ${r.saved} saved payout account(s) do not open with this PAYOUT_ENCRYPTION_KEY`), line);
      assert.deepEqual(secretsIn(o.text + line, other), []);
      assert.deepEqual(secretsIn(o.text + line, GOOD), []);
    });
    assert.equal((await payoutReadiness()).ready, true, "the right key back: ready again");
  });

  test("only FrameX staff can ask", async () => {
    assert.equal((await new Client().get("/api/admin/payouts")).status, 401);
    assert.equal((await asha.get("/api/admin/payouts")).status, 403);
    assert.equal((await shopB.get("/api/admin/payouts")).status, 403);
  });
});

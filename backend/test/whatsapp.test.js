/* ==========================================================================
   WhatsApp messages FrameX sends by itself (owner, 2026-11-01): order updates
   to customers who said yes at checkout, new-order alerts to shops, "approved"
   to new shops and artists. Run with "npm test". Fast2SMS is a stand-in on a
   local port: the test reads every request it gets (template, number, values,
   where the key is) and can make it refuse.
   ========================================================================== */
import http from "node:http";

// Fast2SMS's Advanced API: POST /dev/whatsapp/<version>/<phone_number_id>/messages with Meta's message shape
const calls = [];
let refuse = false;
const stand = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      /* not JSON */
    }
    calls.push({ method: req.method, path: req.url, body, authorization: req.headers.authorization || "" });
    res.setHeader("Content-Type", "application/json");
    if (refuse) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { message: "Template not approved", code: 132001 } }));
    }
    res.end(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: "wamid.req-" + calls.length, message_status: "accepted" }] }));
  });
});
await new Promise((r) => stand.listen(0, "127.0.0.1", r));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.WHATSAPP_PROVIDER = "fast2sms";
process.env.WHATSAPP_API_KEY = "test-fast2sms-key";
process.env.WHATSAPP_PHONE_NUMBER_ID = "100594425479261";
process.env.WHATSAPP_API_BASE = `http://127.0.0.1:${stand.address().port}`;

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { notificationsSettled } = await import("../src/services/notification-service.js");
const wa = await import("../src/services/whatsapp-service.js");
const { indianMobile } = await import("../src/lib/whatsapp.js");

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
  patch = (path, body = {}) => this.request("PATCH", path, body);
  del = (path) => this.request("DELETE", path);
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const PASSWORD = "Sunrise-Frame-42";
const { seed, model } = siteEngine();
const settle = async () => {
  await emailsSettled();
  await notificationsSettled();
  await wa.whatsappSettled();
};
const sent = (template, number) => calls.filter((c) => c.body.template && c.body.template.name === template && (!number || c.body.to === "91" + number));
const part = (call, type) => (call.body.template.components || []).find((c) => c.type === type);
/** The body's {{1}}, {{2}}… and then the button's {{1}} (when the template has one). */
const values = (call) => [...((part(call, "body") || {}).parameters || []).map((p) => p.text), ...((part(call, "button") || {}).parameters || []).map((p) => p.text)];

const S = {};
before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  S.admin = new Client();
  await db.query("INSERT INTO users (id, name, email, role, status, password_hash, password_changed_at) VALUES ($1, 'Test Admin', 'admin.wa@example.com', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword(PASSWORD)]);
  assert.equal((await S.admin.post("/api/auth/login", { identifier: "admin.wa@example.com", password: PASSWORD })).status, 200);

  // A product sold by a shop that is on FrameX (its catalogue shop is linked to a real shop with a WhatsApp number)
  const products = seed.products.map((p) => model.normalize(p)).filter((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty >= 3);
  const linked = (await db.query(`SELECT id, shop_ref FROM catalog_products WHERE shop_ref IS NOT NULL AND source <> 'artist' AND id IN (${products.map((_, i) => `$${i + 1}`).join(", ")}) LIMIT 1`, products.map((p) => p.id))).rows[0];
  assert.ok(linked, "a catalogue product with a shop");
  S.product = products.find((p) => p.id === linked.id);
  const shop = await S.admin.post("/api/admin/shops", {
    shop: { name: "Kalinga Frames", ownerName: "Asha Rout", phone: "98765 00101", addressLine1: "12 Station Road", area: "Station Road", city: "Dhenkanal", state: "Odisha", postalCode: "759001", country: "IN", latitude: 20.6586, longitude: 85.5981, catalogRef: linked.shop_ref },
    accountEmail: "owner@kalinga.example"
  });
  assert.equal(shop.status, 201, shop.text);
  S.shopCode = shop.json.credentials ? shop.json.credentials.shopCode : shop.json.shop && shop.json.shop.shopCode;
  await settle();
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => stand.close(r));
  await db.close();
});

async function customer(name, email, phone) {
  const c = new Client();
  assert.equal((await c.post("/api/auth/signup", { name, email, password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  const address = await c.post("/api/addresses", { fullName: name, phone, line1: "4 Temple Street", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" });
  assert.equal(address.status, 201, address.text);
  c.addressId = address.json.address.id;
  return c;
}
async function order(c, { whatsapp }) {
  assert.equal((await c.post("/api/cart/items", { productId: S.product.id, quantity: 1 })).status, 201);
  const quote = (await c.get(`/api/checkout/quote?addressId=${c.addressId}&paymentMethod=COD`)).json.quote;
  const r = await c.post("/api/checkout/orders", { addressId: c.addressId, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), ...(whatsapp === undefined ? {} : { whatsapp }) });
  assert.equal(r.status, 201, r.text);
  await settle();
  return r.json.order;
}

describe("WhatsApp: the sending itself", () => {
  test("Indian mobile numbers in every common way of writing them; anything else is refused", () => {
    for (const n of ["9876500011", "+91 98765 00011", "098765 00011", "91-98765-00011"]) assert.equal(indianMobile(n), "9876500011", n);
    for (const n of ["12345", "+44 7911 123456", "5876500011", "", null]) assert.equal(indianMobile(n), null, String(n));
  });

  test("the shop's approval went by email only in this test (dev mailbox): no 'approved' WhatsApp without a real email", () => {
    assert.equal(sent(config.whatsapp.templates.accountApproved).length, 0);
  });
});

describe("WhatsApp: order updates to the customer", () => {
  test("a customer who said yes hears 'placed' on WhatsApp, with the order number on the button; the key is in a header", async () => {
    S.asha = await customer("Asha Rout", "asha.wa@example.com", "98765 00011");
    S.order = await order(S.asha, { whatsapp: true });
    const placed = sent(config.whatsapp.templates.orderUpdate, "9876500011");
    assert.equal(placed.length, 1, JSON.stringify(calls));
    const [name, number, status, button] = values(placed[0]);
    assert.equal(name, "Asha");
    assert.equal(number, S.order.orderNumber);
    assert.match(status, /^Placed\. Please pay ₹[\d,]+ in cash on delivery$/);
    assert.equal(button, S.order.orderNumber, "the View order button's {{1}}");
    const call = placed[0];
    assert.equal(call.method, "POST");
    assert.equal(call.path, "/dev/whatsapp/v26.0/100594425479261/messages", "Fast2SMS's Advanced API, with the number's phone_number_id");
    assert.deepEqual([call.body.messaging_product, call.body.type, call.body.template.language.code], ["whatsapp", "template", "en"]);
    assert.deepEqual(part(call, "button"), { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: S.order.orderNumber }] }, "the button value is its own component, not in the body values");
    assert.equal(part(call, "body").parameters.length, 3);
    assert.equal(call.authorization, "test-fast2sms-key");
    assert.ok(!call.path.includes("test-fast2sms-key") && !JSON.stringify(call.body).includes("test-fast2sms-key"), "the key is only in the header");
    const row = (await db.query("SELECT status, request_id FROM whatsapp_messages WHERE kind = 'ORDER_UPDATE' AND ref LIKE $1", [`${S.order.orderNumber}:ORDER_PLACED_COD:%`])).rows[0];
    assert.equal(row.status, "SENT");
    assert.match(row.request_id, /^wamid\.req-\d+$/, "the WhatsApp message id is kept");
  });

  test("the shop of the order hears about it on its own number, with its items and how it is paid", () => {
    const alert = sent(config.whatsapp.templates.sellerNewOrder, "9876500101");
    assert.equal(alert.length, 1, JSON.stringify(calls.map((c) => c.query)));
    const [name, number, items, payment, button] = values(alert[0]);
    assert.equal(name, "Kalinga Frames");
    assert.equal(number, S.order.orderNumber);
    assert.equal(items, `1 item (${S.product.name})`);
    assert.equal(payment, "Cash on delivery, collect the cash on handover");
    assert.equal(button, "shop-dashboard.html");
  });

  test("shipped, out for delivery and delivered go on WhatsApp; confirmed and processing don't (no email for them either)", async () => {
    const before = sent(config.whatsapp.templates.orderUpdate, "9876500011").length;
    for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const r = await S.admin.post(`/api/admin/orders/${S.order.orderNumber}/status`, { status });
      assert.equal(r.status, 200, r.text);
      await settle();
    }
    const news = sent(config.whatsapp.templates.orderUpdate, "9876500011").slice(before).map((c) => values(c)[2]);
    assert.equal(news.length, 3, JSON.stringify(news));
    assert.equal(news[0], "Shipped and on its way");
    assert.match(news[1], /^Out for delivery today\. Please keep ₹[\d,]+ ready \(cash on delivery\)$/);
    assert.equal(news[2], "Delivered. We hope you love it");
  });

  test("the same news never goes twice", async () => {
    const before = calls.length;
    const order = (await db.query("SELECT id FROM orders WHERE order_number = $1", [S.order.orderNumber])).rows[0];
    assert.equal(await wa.orderUpdate(order.id, "ORDER_SHIPPED"), "repeat");
    assert.equal(calls.length, before);
  });

  test("a customer who didn't tick it gets nothing on WhatsApp (the shop still hears about the order)", async () => {
    S.binod = await customer("Binod Das", "binod.wa@example.com", "98765 00022");
    const o = await order(S.binod, { whatsapp: false });
    const o2 = await order(S.binod, {});
    assert.equal(sent(config.whatsapp.templates.orderUpdate, "9876500022").length, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM orders WHERE order_number IN ($1, $2) AND whatsapp_updates", [o.orderNumber, o2.orderNumber])).rows[0].n, 0);
    assert.equal(sent(config.whatsapp.templates.sellerNewOrder, "9876500101").length, 3);
  });

  test("Admin → Settings: order updates switched off = nothing goes", async () => {
    assert.equal((await S.admin.patch("/api/admin/settings", { whatsappOrderUpdates: false })).status, 200);
    const before = sent(config.whatsapp.templates.orderUpdate).length;
    await order(S.asha, { whatsapp: true });
    assert.equal(sent(config.whatsapp.templates.orderUpdate).length, before);
    assert.equal((await S.admin.patch("/api/admin/settings", { whatsappOrderUpdates: null })).status, 200, "back to the default (on)");
    assert.equal(config.whatsapp.orderUpdates, true);
  });

  test("a message Fast2SMS refuses is kept as FAILED with its reason; the order is not affected", async () => {
    refuse = true;
    const o = await order(S.asha, { whatsapp: true });
    refuse = false;
    assert.equal(o.status, "PLACED");
    const row = (await db.query("SELECT status, detail FROM whatsapp_messages WHERE kind = 'ORDER_UPDATE' AND ref LIKE $1", [`${o.orderNumber}:%`])).rows[0];
    assert.equal(row.status, "FAILED");
    assert.match(row.detail, /Template not approved/);
  });

  test("not set up = nothing sent and nothing stored", async () => {
    config.whatsapp.provider = "none";
    const before = calls.length;
    const rows = (await db.query("SELECT count(*)::int AS n FROM whatsapp_messages")).rows[0].n;
    await order(S.asha, { whatsapp: true });
    assert.equal(calls.length, before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM whatsapp_messages")).rows[0].n, rows);
    config.whatsapp.provider = "fast2sms";
  });
});

describe("WhatsApp: 'approved' to a new shop or artist", () => {
  test("name, business and FrameX ID; no link or token at all; once only", async () => {
    assert.equal(await wa.accountApproved({ code: "FRX-SHOP-9001", name: "Ravi Kumar", business: "Royal | Frames\nOdisha", phone: "9876500033" }), "sent");
    assert.equal(await wa.accountApproved({ code: "FRX-SHOP-9001", name: "Ravi Kumar", business: "Royal Frames", phone: "9876500033" }), "repeat");
    const call = sent(config.whatsapp.templates.accountApproved, "9876500033");
    assert.equal(call.length, 1);
    assert.deepEqual(values(call[0]), ["Ravi", "Royal Frames Odisha", "FRX-SHOP-9001"], "no '|' or new line inside a value");
    assert.ok(!/token|http/i.test(JSON.stringify(call[0].body)) && !part(call[0], "button"), "no link, no token, no button value");
  });

  test("a number WhatsApp can't use is not even tried", async () => {
    const before = calls.length;
    assert.equal(await wa.accountApproved({ code: "FRX-SHOP-9002", name: "Nobody", business: "No Phone", phone: "12345" }), "bad_number");
    assert.equal(calls.length, before);
  });
});

describe("WhatsApp: the admin's view", () => {
  test("the service, the last 30 days and the latest messages (numbers shown in full only to admins)", async () => {
    const r = await S.admin.get("/api/admin/whatsapp");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.service.mode, "real");
    assert.ok(r.json.last30Days.sent >= 6 && r.json.last30Days.failed >= 1, JSON.stringify(r.json.last30Days));
    assert.ok(r.json.messages.some((m) => m.status === "FAILED" && /Template not approved/.test(m.detail)));
    assert.equal((await new Client().get("/api/admin/whatsapp")).status, 401);
    assert.equal((await S.asha.get("/api/admin/whatsapp")).status, 403);
  });

  test("Admin → Settings lists the WhatsApp switches (login codes since 2026-11-07, off by default)", async () => {
    const items = (await S.admin.get("/api/admin/settings")).json.items.filter((s) => s.group === "WhatsApp messages");
    assert.deepEqual(items.map((s) => s.key), ["whatsappOrderUpdates", "whatsappSellerAlerts", "whatsappAccountApproved", "whatsappLoginCodes"]);
    assert.equal(items.find((s) => s.key === "whatsappLoginCodes").value, false);
  });
});

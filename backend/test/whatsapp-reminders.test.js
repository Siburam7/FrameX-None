/* ==========================================================================
   WhatsApp cart reminders and the "payment not finished" reminder (owner,
   2026-11-09: "WhatsApp par cart reminder, aur 'payment baaki hai' reminder";
   chose: only to customers who said yes, WhatsApp after 3 hours / email after
   24, payment reminder 15 minutes in while the order is held 30). Run with
   "npm test". Fast2SMS's WhatsApp API is a stand-in on a local port; emails
   go to the development mailbox; the timers are called directly.
   ========================================================================== */
import http from "node:http";
import crypto from "node:crypto";

const calls = [];
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
    calls.push({ path: req.url, body });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: "wamid.rem-" + calls.length }] }));
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
process.env.WHATSAPP_CART_REMINDERS = "true";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { newId } = await import("../src/lib/tokens.js");
const { runDue, runDueWhatsApp } = await import("../src/services/cart-reminder-service.js");
const { remindUnpaidOrders } = await import("../src/services/payment-service.js");
const { whatsappSettled } = await import("../src/services/whatsapp-service.js");
const { settled } = await import("../src/services/order-service.js").then((m) => ({ settled: m.ordersSettled || m.emailsSettled || (async () => {}) }));

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
const FRAME = model.normalize(seed.products.find((p) => p.id === "p-005")); // shop-002
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00071", line1: "12 Lake View Road", line2: "Near City Park", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };

/** Today at this hour in India time (reminders go from 9 am to 9 pm). */
function indiaTime(hour) {
  const ist = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, 0) - 330 * 60_000);
}
// The cart was last changed `hours` ago; an earlier reminder moves back with it (it still came before that change)
const ageCart = (userId, hours) =>
  db.query("UPDATE carts SET wa_reminded_at = wa_reminded_at - (now() - (now() - make_interval(hours => $2))) - interval '1 minute', updated_at = now() - make_interval(hours => $2) WHERE user_id = $1", [userId, hours]);
const waTo = (ten, template) => calls.filter((c) => c.body.to === "91" + ten && (!template || c.body.template.name === template));
const bodyValues = (call) => call.body.template.components.find((p) => p.type === "body").parameters.map((x) => x.text);
const buttonValue = (call) => (call.body.template.components.find((p) => p.type === "button") || { parameters: [{}] }).parameters[0].text;

async function customer(name, email, phone) {
  const c = new Client();
  const r = await c.post("/api/auth/signup", { name, email, ...(phone ? { phone } : {}), password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(r.status, 201, r.text);
  c.id = r.json.user.id;
  return c;
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, 'FRX-SHOP-1001', 'shop-002', 'Royal Frames', '+919876511111', 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [newId()]
  );
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => stand.close(r));
  await db.close();
});

describe("WhatsApp cart reminders: only after a yes", () => {
  const S = {};

  test("the account switch: a yes needs a mobile number; it shows on the account", async () => {
    S.none = await customer("Kiran Das", "kiran.wa@example.com");
    const refused = await S.none.put("/api/users/me/whatsapp-offers", { on: true });
    assert.equal(refused.status, 422, refused.text);
    assert.match(JSON.stringify(refused.json), /mobile number/);
    S.ravi = await customer("Ravi Kumar", "ravi.wa@example.com", "9876500072");
    const yes = await S.ravi.put("/api/users/me/whatsapp-offers", { on: true });
    assert.equal(yes.status, 200, yes.text);
    assert.equal(yes.json.user.whatsappOffers, true);
    assert.equal(yes.json.user.whatsappOffersPhone, "+919876500072");
  });

  test("a cart left 3 hours: ONE WhatsApp (the Marketing template, first name, what's in it, the cart button); no email yet", async () => {
    assert.equal((await S.ravi.post("/api/cart/items", { productId: FRAME.id, quantity: 1 })).status, 201);
    S.quiet = await customer("Meena Rao", "meena.wa@example.com", "9876500073"); // no yes: nothing on WhatsApp
    assert.equal((await S.quiet.post("/api/cart/items", { productId: FRAME.id, quantity: 1 })).status, 201);
    await ageCart(S.ravi.id, 4);
    await ageCart(S.quiet.id, 4);
    const r = await runDueWhatsApp(indiaTime(12));
    await whatsappSettled();
    assert.equal(r.sent, 1, JSON.stringify(r));
    const [call] = waTo("9876500072", "framex_cart_reminder");
    assert.ok(call, "the cart reminder went to Ravi");
    const [name, items] = bodyValues(call);
    assert.equal(name, "Ravi");
    assert.ok(items.includes(FRAME.name.slice(0, 20)), items);
    assert.equal(buttonValue(call), "index.html?cart=1");
    assert.equal(waTo("9876500073").length, 0, "no yes, no WhatsApp");
    const row = (await db.query("SELECT channel, how FROM cart_reminders WHERE user_id = $1", [S.ravi.id])).rows;
    assert.deepEqual(row, [{ channel: "WHATSAPP", how: "AUTO" }]);
    const mails = await runDue(indiaTime(12));
    assert.equal(mails.sent, 0, "the email waits for its 24 hours");
  });

  test("once per cart state; again after the cart changes; never outside 9 am - 9 pm or with the switch off", async () => {
    assert.equal((await runDueWhatsApp(indiaTime(13))).sent, 0, "not twice");
    const item = (await S.ravi.get("/api/cart")).json.cart.items[0];
    assert.equal((await S.ravi.patch(`/api/cart/items/${item.id}`, { quantity: 2 })).status, 200);
    await ageCart(S.ravi.id, 4);
    assert.equal((await runDueWhatsApp(indiaTime(22))).sent, 0, "not at 10 pm");
    config.whatsapp.cartReminders = false;
    assert.equal((await runDueWhatsApp(indiaTime(14))).why, "off");
    config.whatsapp.cartReminders = true;
    assert.equal((await runDueWhatsApp(indiaTime(14))).sent, 1, "the changed cart, once more");
    await whatsappSettled();
    assert.equal(waTo("9876500072", "framex_cart_reminder").length, 2);
  });

  test("the daily limit counts WhatsApp apart from email; a no on the account stops them", async () => {
    const was = config.cartReminders.whatsappDailyLimit;
    config.cartReminders.whatsappDailyLimit = 2; // 2 already went today
    const item = (await S.ravi.get("/api/cart")).json.cart.items[0];
    await S.ravi.patch(`/api/cart/items/${item.id}`, { quantity: 1 });
    await ageCart(S.ravi.id, 4);
    assert.equal((await runDueWhatsApp(indiaTime(15))).why, "daily limit reached");
    config.cartReminders.whatsappDailyLimit = was;
    const off = await S.ravi.put("/api/users/me/whatsapp-offers", { on: false });
    assert.equal(off.json.user.whatsappOffers, false);
    assert.equal((await runDueWhatsApp(indiaTime(15))).sent, 0, "said no");
  });
});

describe("the checkout tick says yes too, and 'payment not finished'", () => {
  const S = {};

  test("ordering with 'Send order updates and reminders to my WhatsApp' ticked: yes to offers, for the address's number", async () => {
    S.asha = await customer("Asha Verma", "asha.wa@example.com");
    S.home = (await S.asha.post("/api/addresses", ADDRESS)).json.address.id;
    assert.equal((await S.asha.post("/api/cart/items", { productId: FRAME.id, quantity: 1 })).status, 201);
    const quote = (await S.asha.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=COD`)).json.quote;
    const order = await S.asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), whatsapp: true });
    assert.equal(order.status, 201, order.text);
    S.order = order.json.order.orderNumber;
    const me = (await S.asha.get("/api/auth/me")).json.user;
    assert.equal(me.whatsappOffers, true);
    assert.equal(me.whatsappOffersPhone, "+919876500071");
  });

  test("an online order still unpaid 15 minutes in: ONE reminder — WhatsApp (the approved order-update template), email and the account", async () => {
    // Make it an online order whose payment started 15 minutes ago (held for 30)
    await db.query(
      "UPDATE orders SET status = 'PENDING_PAYMENT', payment_method = 'ONLINE', cod_fee = 0, total = total - cod_fee, placed_at = NULL, expires_at = now() + interval '14 minutes', whatsapp_updates = true WHERE order_number = $1",
      [S.order]
    );
    const before = calls.length;
    assert.equal(await remindUnpaidOrders(), 1);
    await new Promise((r) => setTimeout(r, 300));
    await whatsappSettled();
    await settled();
    const sent = calls.slice(before).filter((c) => c.body.template.name === "framex_order_update");
    assert.equal(sent.length, 1, "one WhatsApp");
    const [name, number, status] = bodyValues(sent[0]);
    assert.deepEqual([name, number], ["Asha", S.order]);
    assert.match(status, /Payment not finished yet/);
    assert.match(status, /Retry payment/);
    assert.equal(buttonValue(sent[0]), S.order, "the button opens the order (Retry payment there)");
    const mail = devOutbox().find((m) => m.to === "asha.wa@example.com" && /Finish your payment: order/.test(m.subject));
    assert.ok(mail, "the email");
    assert.match(mail.text, /Retry payment/);
    const notes = (await S.asha.get("/api/notifications")).json;
    assert.match(JSON.stringify(notes), /Finish your payment for order/);
    assert.equal(await remindUnpaidOrders(), 0, "once only");
  });

  test("not too early, not after it ran out, not after a 'payment failed' message", async () => {
    const early = await db.query("UPDATE orders SET payment_reminded_at = NULL, expires_at = now() + interval '25 minutes' WHERE order_number = $1 RETURNING id", [S.order]);
    assert.equal(await remindUnpaidOrders(), 0, "only 5 minutes in");
    await db.query("UPDATE orders SET expires_at = now() + interval '1 minute' WHERE order_number = $1", [S.order]);
    assert.equal(await remindUnpaidOrders(), 0, "about to run out");
    await db.query("INSERT INTO order_notifications (id, order_id, kind, ref, recipient) VALUES ($1, $2, 'PAYMENT_FAILED', 'x', 'asha.wa@example.com')", [newId(), early.rows[0].id]);
    await db.query("UPDATE orders SET expires_at = now() + interval '14 minutes' WHERE order_number = $1", [S.order]);
    assert.equal(await remindUnpaidOrders(), 0, "they already heard how to retry");
  });
});

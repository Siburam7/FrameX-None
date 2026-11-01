/* ==========================================================================
   Log in / sign up with a mobile number and a code by SMS (owner, 2026-11-01:
   "SMS par OTP"; a new number's email is optional). Run with "npm test".
   SMS go to the development mailbox (SMS_PROVIDER=dev) and the codes are read
   from it; APITxT (the owner's SMS company) is a stand-in on a local port.
   ========================================================================== */
import http from "node:http";

const apitxtCalls = [];
let apitxtRefuses = false;
const apitxt = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    apitxtCalls.push({ method: req.method, path: req.url, type: req.headers["content-type"] || "", form: Object.fromEntries(new URLSearchParams(raw)) });
    res.setHeader("Content-Type", "application/json");
    if (apitxtRefuses) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ status: "error", message: "Invalid or expired API key" }));
    }
    res.end(JSON.stringify({ status: "success", message: "Sms OTP Sent Successfully", data: { request_id: "SMS-OTP-TEST" + apitxtCalls.length, mobile: "91", cost: 0.3 } }));
  });
});
await new Promise((r) => apitxt.listen(0, "127.0.0.1", r));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "dev";
process.env.SMS_API_BASE = `http://127.0.0.1:${apitxt.address().port}`;
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { newId } = await import("../src/lib/tokens.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { emailsSettled } = await import("../src/services/order-service.js");

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
  del = (path, body) => this.request("DELETE", path, body);
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

/** The latest SMS code sent to this number (development mailbox). */
const smsCode = (ten) => {
  const sms = devOutbox().find((m) => m.kind === "sms" && m.to === "+91" + ten);
  return (String(sms && sms.text).match(/^(\d{6}) is your FrameX verification code/) || [])[1];
};
const smsCount = (ten) => devOutbox().filter((m) => m.kind === "sms" && m.to === "+91" + ten).length;

/** A new number all the way in: code by SMS, the code, a name (and an email only if given). */
async function joinByPhone(ten, { name = "Mobile Customer", email } = {}) {
  const c = new Client();
  const sent = await c.post("/api/auth/code/send", { phone: ten });
  assert.equal(sent.status, 200, sent.text);
  const checked = await c.post("/api/auth/code/verify", { phone: ten, code: smsCode(ten) });
  assert.equal(checked.status, 200, checked.text);
  assert.equal(checked.json.newAccount, true);
  const made = await c.post("/api/auth/code/signup", { signupToken: checked.json.signupToken, name, ...(email === undefined ? {} : { email }) });
  return { c, made };
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => apitxt.close(r));
  await db.close();
});

describe("log in or sign up with a mobile number (code by SMS)", () => {
  test("a new number: the code goes by SMS, then a name, and no email is needed", async () => {
    const c = new Client();
    const sent = await c.post("/api/auth/code/send", { phone: "+91 98765 00011" });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(sent.json.masked, "******0011");
    assert.equal(sent.json.devMode, true);
    const code = smsCode("9876500011");
    assert.match(code, /^\d{6}$/, "a 6-digit code in the SMS");
    const wrong = await c.post("/api/auth/code/verify", { phone: "9876500011", code: code === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 400);
    assert.match(wrong.json.error.message, /isn't right\. 4 tries left/);
    const ok = await c.post("/api/auth/code/verify", { phone: "9876500011", code });
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual([ok.json.newAccount, ok.json.by, ok.json.masked], [true, "phone", "******0011"]);
    const made = await c.post("/api/auth/code/signup", { signupToken: ok.json.signupToken, name: "Ravi Kumar" });
    assert.equal(made.status, 201, made.text);
    const me = (await c.get("/api/users/me")).json.user;
    assert.deepEqual([me.name, me.phone, me.email, me.role], ["Ravi Kumar", "+919876500011", null, "CUSTOMER"]);
  });

  test("the same number next time logs straight in; a code works once", async () => {
    await db.query("UPDATE login_codes SET created_at = created_at - interval '1 minute' WHERE email = '+919876500011'"); // past the resend wait
    const c = new Client();
    assert.equal((await c.post("/api/auth/code/send", { phone: "9876500011" })).status, 200);
    const code = smsCode("9876500011");
    const r = await c.post("/api/auth/code/verify", { phone: "9876500011", code });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.user.phone, "+919876500011");
    assert.equal((await c.get("/api/users/me")).json.user.name, "Ravi Kumar");
    assert.equal((await new Client().post("/api/auth/code/verify", { phone: "9876500011", code })).status, 400, "used up");
  });

  test("an email can be given when joining (optional); one that already has an account is refused", async () => {
    const { c, made } = await joinByPhone("9876500022", { name: "Asha Rout", email: "Asha.Mobile@Example.com" });
    assert.equal(made.status, 201, made.text);
    assert.equal((await c.get("/api/users/me")).json.user.email, "asha.mobile@example.com");
    const again = await joinByPhone("9876500033", { email: "asha.mobile@example.com" });
    assert.equal(again.made.status, 409);
    assert.equal(again.made.json.error.code, "EMAIL_TAKEN");
    assert.match(again.made.json.error.message, /add this mobile number on your account page/);
  });

  test("ask again too soon = wait; not an Indian mobile number = refused; no SMS sent for either", async () => {
    const before = smsCount("9876500044");
    const c = new Client();
    assert.equal((await c.post("/api/auth/code/send", { phone: "9876500044" })).status, 200);
    const soon = await c.post("/api/auth/code/send", { phone: "9876500044" });
    assert.equal(soon.status, 429);
    assert.equal(soon.json.error.code, "OTP_COOLDOWN");
    assert.equal(smsCount("9876500044"), before + 1);
    for (const phone of ["12345", "+44 7911 123456", "5876500011"]) {
      const r = await c.post("/api/auth/code/send", { phone });
      assert.equal(r.status, 422, phone + " " + r.text);
    }
  });

  test("a shop / staff number gets no SMS (each costs money) and can't log in with a code", async () => {
    await db.query("INSERT INTO users (id, name, email, phone, role, status, password_hash, password_changed_at) VALUES ($1, 'Staff', 'staff.sms@example.com', '+919876500055', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword("Sunrise-Frame-42")]);
    const c = new Client();
    const r = await c.post("/api/auth/code/send", { phone: "9876500055" });
    assert.equal(r.status, 200, "the same answer as for anyone");
    assert.equal(smsCount("9876500055"), 0);
    for (const code of ["000000", "123456"]) assert.equal((await c.post("/api/auth/code/verify", { phone: "9876500055", code })).status, 400);
  });

  test("SMS not set up: says so, nothing is stored", async () => {
    config.sms.provider = "none";
    const r = await new Client().post("/api/auth/code/send", { phone: "9876500066" });
    config.sms.provider = "dev";
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, "SMS_NOT_CONFIGURED");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM login_codes WHERE email = '+919876500066'")).rows[0].n, 0);
  });

  test("email login codes still work as before", async () => {
    const c = new Client();
    assert.equal((await c.post("/api/auth/code/send", { email: "still.email@example.com" })).status, 200);
    const mail = devOutbox().find((m) => m.kind === "email" && m.to === "still.email@example.com");
    const code = (String(mail && mail.text).match(/login code: (\d{6})/) || [])[1];
    const r = await c.post("/api/auth/code/verify", { email: "still.email@example.com", code });
    assert.deepEqual([r.status, r.json.newAccount, r.json.by], [200, true, "email"]);
  });
});

describe("an account without an email", () => {
  test("can order (Cash on Delivery): the order has no email and no order email is tried", async () => {
    const { c } = await joinByPhone("9876500077", { name: "No Email" });
    const { seed, model } = siteEngine();
    const product = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).orderable);
    assert.equal((await c.post("/api/cart/items", { productId: product.id, quantity: 1 })).status, 201);
    const address = await c.post("/api/addresses", { fullName: "No Email", phone: "9876500077", line1: "4 Temple Street", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" });
    const quote = (await c.get(`/api/checkout/quote?addressId=${address.json.address.id}&paymentMethod=COD`)).json.quote;
    const placed = await c.post("/api/checkout/orders", { addressId: address.json.address.id, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(placed.status, 201, placed.text);
    await emailsSettled();
    const row = (await db.query("SELECT customer_email, customer_phone FROM orders WHERE order_number = $1", [placed.json.order.orderNumber])).rows[0];
    assert.deepEqual(row, { customer_email: "", customer_phone: "+919876500077" });
    assert.equal(devOutbox().filter((m) => m.kind === "email" && m.to === "").length, 0, "no email to an empty address");
  });

  test("password recovery: none without a password (the SMS code is the way in); with one, SMS only; deleting the account removes its SMS codes", async () => {
    assert.equal((await new Client().post("/api/auth/recovery/start", { identifier: "9876500011" })).status, 404);
    await db.query("UPDATE users SET password_hash = $1 WHERE phone = '+919876500011'", [await hashPassword("Sunrise-Frame-42")]);
    const start = await new Client().post("/api/auth/recovery/start", { identifier: "9876500011" });
    assert.equal(start.status, 200, start.text);
    assert.deepEqual(start.json.channels.map((o) => o.type), ["sms"]);
    const { c } = await joinByPhone("9876500088", { name: "Short Stay" });
    const del = await c.post("/api/users/me/delete", { confirm: "DELETE" });
    assert.equal(del.status, 200, del.text);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM login_codes WHERE email = '+919876500088'")).rows[0].n, 0);
  });
});

describe("APITxT (the SMS company)", () => {
  test("the code goes as a form to /api/sendOTP: key, 91 + number, the code; FrameX checks it itself", async () => {
    Object.assign(config.sms, { provider: "apitxt", key: "test-apitxt-key" });
    const c = new Client();
    const sent = await c.post("/api/auth/code/send", { phone: "9876500099" });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(sent.json.devMode, false);
    const call = apitxtCalls.at(-1);
    assert.equal(call.method, "POST");
    assert.equal(call.path, "/api/sendOTP");
    assert.match(call.type, /application\/x-www-form-urlencoded/);
    assert.deepEqual([call.form.authkey, call.form.mobile], ["test-apitxt-key", "919876500099"]);
    assert.match(call.form.otp, /^\d{6}$/);
    const r = await c.post("/api/auth/code/verify", { phone: "9876500099", code: call.form.otp });
    assert.equal(r.json.newAccount, true, "the code APITxT delivered is the one FrameX checks");
  });

  test("APITxT refuses (wrong key): the customer is told, the code doesn't count", async () => {
    apitxtRefuses = true;
    const r = await new Client().post("/api/auth/code/send", { phone: "9876500100" });
    apitxtRefuses = false;
    Object.assign(config.sms, { provider: "dev", key: "" });
    assert.equal(r.status, 502);
    assert.equal(r.json.error.code, "SMS_SEND_FAILED");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM login_codes WHERE email = '+919876500100'")).rows[0].n, 0);
  });
});

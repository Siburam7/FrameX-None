/* ==========================================================================
   Phone login codes on WhatsApp first, SMS as the backup (owner, 2026-11-07:
   "WhatsApp pehle, SMS backup"). Run with "npm test". Fast2SMS's WhatsApp API is
   a stand-in on a local port (the test reads every request and can make it
   refuse); SMS go to the development mailbox.
   ========================================================================== */
import http from "node:http";

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
    calls.push({ path: req.url, body, authorization: req.headers.authorization || "" });
    res.setHeader("Content-Type", "application/json");
    if (refuse) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { message: "Template not approved", code: 132001 } }));
    }
    res.end(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: "wamid.login-" + calls.length }] }));
  });
});
await new Promise((r) => stand.listen(0, "127.0.0.1", r));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "dev";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.OTP_RESEND_SECONDS = "0";
process.env.WHATSAPP_PROVIDER = "fast2sms";
process.env.WHATSAPP_API_KEY = "test-fast2sms-key";
process.env.WHATSAPP_PHONE_NUMBER_ID = "100594425479261";
process.env.WHATSAPP_API_BASE = `http://127.0.0.1:${stand.address().port}`;
process.env.WHATSAPP_LOGIN_CODES = "true";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { newId } = await import("../src/lib/tokens.js");
const { hashPassword } = await import("../src/lib/passwords.js");

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
}

/** The WhatsApp requests to this number, newest last. */
const waTo = (ten) => calls.filter((c) => c.body.to === "91" + ten);
/** The code a WhatsApp request carried: the body's {{1}}. */
const waCode = (call) => call.body.template.components.find((p) => p.type === "body").parameters[0].text;
const smsTo = (ten) => devOutbox().filter((m) => m.kind === "sms" && m.to === "+91" + ten);
const smsCode = (ten) => (String((smsTo(ten)[0] || {}).text).match(/^(\d{6}) is your FrameX verification code/) || [])[1];

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => stand.close(r));
  await db.close();
});

describe("phone login codes on WhatsApp, SMS as the backup", () => {
  test("the website is told codes go on WhatsApp", async () => {
    const r = await new Client().get("/api/config");
    assert.equal(r.json.features.whatsappLoginCodes, true);
  });

  test("a new number: the code goes on WhatsApp (Authentication template, Copy code button), not by SMS, and works", async () => {
    const c = new Client();
    const sent = await c.post("/api/auth/code/send", { phone: "+91 98765 10001" });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(sent.json.channel, "whatsapp");
    assert.equal(sent.json.smsAvailable, true);
    assert.equal(sent.json.masked, "******0001");
    const [call] = waTo("9876510001");
    assert.ok(call, "one WhatsApp request");
    assert.equal(call.path, "/dev/whatsapp/v26.0/100594425479261/messages");
    assert.equal(call.authorization, "test-fast2sms-key");
    assert.equal(call.body.template.name, "framex_login_code");
    assert.equal(call.body.template.language.code, "en");
    const code = waCode(call);
    assert.match(code, /^\d{6}$/);
    const button = call.body.template.components.find((p) => p.type === "button");
    assert.deepEqual([button.sub_type, button.index, button.parameters[0].text], ["url", "0", code], "the Copy code button carries the same code");
    assert.equal(smsTo("9876510001").length, 0, "no SMS when WhatsApp took it");
    const ok = await c.post("/api/auth/code/verify", { phone: "9876510001", code });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.newAccount, true);
  });

  test('"Send it by SMS instead": the next code goes by SMS only, and the WhatsApp one no longer works', async () => {
    const c = new Client();
    await c.post("/api/auth/code/send", { phone: "9876510002" });
    const first = waCode(waTo("9876510002")[0]);
    const sms = await c.post("/api/auth/code/send", { phone: "9876510002", via: "sms" });
    assert.equal(sms.status, 200, sms.text);
    assert.equal(sms.json.channel, "sms");
    assert.equal(waTo("9876510002").length, 1, "no second WhatsApp");
    const code = smsCode("9876510002");
    assert.match(code, /^\d{6}$/);
    if (first !== code) assert.equal((await c.post("/api/auth/code/verify", { phone: "9876510002", code: first })).status, 400, "the earlier code is replaced");
    const ok = await c.post("/api/auth/code/verify", { phone: "9876510002", code });
    assert.equal(ok.status, 200, ok.text);
  });

  test("WhatsApp refuses: the SMS goes at once and its code works", async () => {
    refuse = true;
    try {
      const c = new Client();
      const sent = await c.post("/api/auth/code/send", { phone: "9876510003" });
      assert.equal(sent.status, 200, sent.text);
      assert.equal(sent.json.channel, "sms");
      assert.equal(waTo("9876510003").length, 1, "WhatsApp was tried first");
      const ok = await c.post("/api/auth/code/verify", { phone: "9876510003", code: smsCode("9876510003") });
      assert.equal(ok.status, 200, ok.text);
    } finally {
      refuse = false;
    }
  });

  test("WhatsApp refuses and no SMS service: a clear error, and the code doesn't count", async () => {
    refuse = true;
    config.sms.provider = "none";
    try {
      const c = new Client();
      const sent = await c.post("/api/auth/code/send", { phone: "9876510004" });
      assert.equal(sent.status, 502, sent.text);
      assert.equal(sent.json.error.code, "WHATSAPP_SEND_FAILED");
      assert.match(sent.json.error.message, /couldn't send the code on WhatsApp/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM login_codes WHERE email = '+919876510004'")).rows[0].n, 0);
      const sms = await c.post("/api/auth/code/send", { phone: "9876510004", via: "sms" });
      assert.equal(sms.status, 503, "SMS asked for, but there is no SMS service");
    } finally {
      refuse = false;
      config.sms.provider = "dev";
    }
  });

  test("a staff number gets nothing on WhatsApp (nor by SMS), with the same answer", async () => {
    await db.query("INSERT INTO users (id, name, email, phone, role, status, password_hash, password_changed_at) VALUES ($1, 'Staff', 'staff.wa@example.com', '+919876510005', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword("Sunrise-Frame-42")]);
    const sent = await new Client().post("/api/auth/code/send", { phone: "9876510005" });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(sent.json.channel, "whatsapp");
    assert.equal(waTo("9876510005").length, 0);
    assert.equal(smsTo("9876510005").length, 0);
  });

  test("the admin's switch off: codes go by SMS again and the website is told", async () => {
    await db.query("INSERT INTO users (id, name, email, role, status, password_hash, password_changed_at) VALUES ($1, 'Admin', 'admin.wa@example.com', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword("Sunrise-Frame-42")]);
    const admin = new Client();
    assert.equal((await admin.post("/api/auth/login", { identifier: "admin.wa@example.com", password: "Sunrise-Frame-42" })).status, 200);
    const shown = (await admin.get("/api/admin/settings")).json.items.find((s) => s.key === "whatsappLoginCodes");
    assert.equal(shown.group, "WhatsApp messages");
    const off = await admin.patch("/api/admin/settings", { whatsappLoginCodes: false });
    assert.equal(off.status, 200, off.text);
    try {
      assert.equal((await new Client().get("/api/config")).json.features.whatsappLoginCodes, false);
      const sent = await new Client().post("/api/auth/code/send", { phone: "9876510006" });
      assert.equal(sent.json.channel, "sms");
      assert.equal(waTo("9876510006").length, 0);
      assert.equal(smsTo("9876510006").length, 1);
    } finally {
      await admin.patch("/api/admin/settings", { whatsappLoginCodes: true });
    }
  });
});

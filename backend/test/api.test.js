/* ==========================================================================
   API tests: run with "npm test" in backend/.
   A real server starts on a random port with an in-memory PostgreSQL (PGlite),
   and every check goes through HTTP exactly like the website does.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev"; // development mailbox, chosen explicitly for the tests
process.env.SMS_PROVIDER = "dev";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { haversineKm } = await import("../src/lib/geo.js");
const { resetRateLimits } = await import("../src/lib/rate-limit.js");
const { newId } = await import("../src/lib/tokens.js");

let server;
let base;

/** A browser-like client: keeps the session cookie between requests. */
class Client {
  cookie = "";
  async request(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = response.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(";");
      this.lastSetCookie = c;
      this.cookie = /fx_session=;|Expires=Thu, 01 Jan 1970/i.test(c) ? "" : pair;
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, text, headers: response.headers };
  }
  get = (path, headers) => this.request("GET", path, undefined, headers);
  post = (path, body = {}, headers) => this.request("POST", path, body, headers);
  patch = (path, body = {}, headers) => this.request("PATCH", path, body, headers);
}

const PASSWORD = "Sunrise-Frame-42";
const tokenFromMail = (mail) => mail.links[0].url.split("#token=")[1];
const codeFromMail = (mail) => /reset code: (\d{6})/.exec(mail.text)[1];
const lastSmsTo = (phone) => devOutbox().find((m) => m.kind === "sms" && m.to === phone);
const codeFromSms = (sms) => /\b(\d{6})\b/.exec(sms.text)[1];
/** Pretend earlier codes were requested long ago (clears the resend wait and the hourly cap). */
const forgetEarlierCodes = () => db.query("UPDATE otp_codes SET created_at = now() - interval '2 hours', used_at = coalesce(used_at, now())");
const RIYA = "(SELECT id FROM users WHERE email = 'riya@example.com')";
const liveCodes = async () => (await db.query(`SELECT count(*)::int AS n FROM otp_codes WHERE used_at IS NULL AND user_id = ${RIYA}`)).rows[0].n;
const liveLinks = async () => (await db.query(`SELECT count(*)::int AS n FROM auth_tokens WHERE used_at IS NULL AND user_id = ${RIYA}`)).rows[0].n;
/** Start recovery and send a code; returns the ticket and the send response. */
async function recover(client, identifier, channel) {
  const start = await client.post("/api/auth/recovery/start", { identifier });
  assert.equal(start.status, 200, "recovery start: " + start.text);
  const sent = await client.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel });
  return { ticket: start.json.recoveryToken, start, sent };
}
const latestMailTo = (email) => devOutbox().find((m) => m.to === email);

const SHOP = {
  name: "Kalinga Frames",
  ownerName: "Asha Rout",
  phone: "9876500001",
  addressLine1: "12 Station Road",
  area: "Station Road",
  city: "Dhenkanal",
  state: "Odisha",
  postalCode: "759001",
  country: "IN",
  latitude: 20.6586,
  longitude: 85.5981
};
const APPLICATION = {
  shopName: "Kalinga Frames",
  ownerName: "Asha Rout",
  phone: "98765 00001",
  email: "asha@kalinga-frames.example",
  address: "12 Station Road",
  city: "Dhenkanal",
  state: "Odisha",
  postalCode: "759001",
  businessDetails: "Framing shop since 2012",
  message: "We'd like to join FrameX."
};

const admin = new Client();
const customer = new Client();
const shopUser = new Client();
const state = {};

before(async () => {
  await initDb();
  await migrate();
  // Admins are created outside the website (scripts/create-admin.js); the test does the same directly.
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.close();
});

describe("basics", () => {
  test("health and public config", async () => {
    const c = new Client();
    assert.equal((await c.get("/api/health")).json.ok, true);
    const cfg = (await c.get("/api/config")).json;
    assert.deepEqual(cfg.nearby.radiusOptionsKm, [5, 10, 25, 50]);
    assert.equal((await c.get("/api/nope")).status, 404);
  });

  test("state-changing requests need the client header and an allowed origin (CSRF)", async () => {
    const noHeader = await fetch(base + "/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noHeader.status, 403);
    const c = new Client();
    assert.equal((await c.post("/api/auth/logout", {}, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await c.post("/api/auth/logout", {}, { Origin: "http://localhost:5500" })).status, 200);
  });

  test("CORS only answers allowed origins", async () => {
    const ok = await fetch(base + "/api/config", { headers: { Origin: "http://localhost:5500" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5500");
    assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
    const bad = await fetch(base + "/api/config", { headers: { Origin: "https://evil.example" } });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  });
});

describe("customer accounts", () => {
  test("sign-up validates input", async () => {
    const c = new Client();
    const r = await c.post("/api/auth/signup", { name: "A", email: "not-an-email", phone: "12", password: "short", confirmPassword: "x" });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.error.fields).sort(), ["email", "name", "password", "phone"]);
    const weak = await c.post("/api/auth/signup", { name: "Riya Das", email: "riya@example.com", password: "password123", confirmPassword: "password123" });
    assert.equal(weak.status, 422);
    const mismatch = await c.post("/api/auth/signup", { name: "Riya Das", email: "riya@example.com", password: PASSWORD, confirmPassword: PASSWORD + "x" });
    assert.equal(mismatch.json.error.fields.confirmPassword, "The passwords don't match.");
  });

  test("sign-up always creates a CUSTOMER, whatever the client sends", async () => {
    const r = await customer.post("/api/auth/signup", { name: "Riya Das", email: "Riya@Example.com", phone: "98765 43210", password: PASSWORD, confirmPassword: PASSWORD, role: "ADMIN", status: "ACTIVE", shopId: "x" });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.role, "CUSTOMER");
    assert.equal(r.json.user.email, "riya@example.com");
    assert.equal(r.json.user.phone, "+919876543210");
    assert.equal(r.json.token, undefined, "the session token stays out of JavaScript by default");
    assert.match(customer.lastSetCookie, /HttpOnly/i);
    assert.match(customer.lastSetCookie, /SameSite=Lax/i);
    assert.ok(!r.text.includes("scrypt$"), "no password hash in responses");
    const stored = (await db.query("SELECT password_hash, role FROM users WHERE email = 'riya@example.com'")).rows[0];
    assert.match(stored.password_hash, /^scrypt\$/);
    assert.ok(!stored.password_hash.includes(PASSWORD));
    assert.equal(stored.role, "CUSTOMER");
  });

  test("duplicate email or phone is refused", async () => {
    const c = new Client();
    const email = await c.post("/api/auth/signup", { name: "Other", email: "riya@example.com", password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(email.status, 409);
    assert.ok(email.json.error.fields.email);
    const phone = await c.post("/api/auth/signup", { name: "Other", email: "other@example.com", phone: "+91 98765 43210", password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(phone.status, 409);
    assert.ok(phone.json.error.fields.phone);
  });

  test("me, profile update, logout, and the session really ends", async () => {
    assert.equal((await customer.get("/api/auth/me")).json.user.name, "Riya Das");
    const patched = await customer.patch("/api/users/me", { name: "Riya D.", role: "ADMIN", email: "hacker@example.com" });
    assert.equal(patched.json.user.name, "Riya D.");
    assert.equal(patched.json.user.role, "CUSTOMER");
    assert.equal(patched.json.user.email, "riya@example.com");
    const oldCookie = customer.cookie;
    assert.equal((await customer.post("/api/auth/logout")).status, 200);
    assert.equal((await customer.get("/api/auth/me")).json.authenticated, false);
    const replay = new Client();
    replay.cookie = oldCookie;
    assert.equal((await replay.get("/api/users/me")).status, 401, "a logged-out session token is dead");
  });

  test("login by email or phone; wrong details give one generic error", async () => {
    const wrong = await customer.post("/api/auth/login", { identifier: "riya@example.com", password: "Wrong-Password-1" });
    const unknown = await customer.post("/api/auth/login", { identifier: "nobody@example.com", password: "Wrong-Password-1" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error.message, unknown.json.error.message);
    assert.equal((await customer.post("/api/auth/login", { identifier: "9876543210", password: PASSWORD })).status, 200);
    assert.equal((await customer.post("/api/auth/logout")).status, 200);
    const byEmail = await customer.post("/api/auth/login", { identifier: "RIYA@example.com", password: PASSWORD });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.json.user.role, "CUSTOMER");
  });

  test("forgot password by email: masked options, code or link, single use", async () => {
    clearDevOutbox();
    const c = new Client();
    const missing = await c.post("/api/auth/recovery/start", { identifier: "nobody@example.com" });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, "ACCOUNT_NOT_FOUND");

    const { ticket, start, sent } = await recover(c, "RIYA@example.com", "email");
    assert.deepEqual(start.json.channels.map((ch) => [ch.type, ch.masked, ch.available]), [["email", "r***@example.com", true], ["sms", "******3210", true]]);
    assert.ok(!start.text.includes("riya@example.com") && !start.text.includes("9876543210"), "the full email / number is never sent to the browser");
    assert.equal(sent.status, 200);
    assert.equal(sent.json.devMode, true, "the response says plainly that this was the development mailbox, not real delivery");
    assert.equal(sent.json.expiresInMinutes, 10);
    assert.equal(sent.json.resendAfterSeconds, 30);

    const mail = latestMailTo("riya@example.com");
    const code = codeFromMail(mail);
    const linkToken = tokenFromMail(mail);
    assert.ok(!sent.text.includes(code), "the code is never in an API response");
    assert.match(mail.subject, /Reset your FrameX password/);
    const stored = (await db.query(`SELECT code_hash FROM otp_codes WHERE used_at IS NULL AND user_id = ${RIYA}`)).rows[0];
    assert.ok(!stored.code_hash.includes(code), "only a hash of the code is stored");
    const storedLink = (await db.query(`SELECT token_hash FROM auth_tokens WHERE used_at IS NULL AND user_id = ${RIYA}`)).rows[0];
    assert.notEqual(storedLink.token_hash, linkToken, "only a hash of the link token is stored");

    // Resend is refused during the wait.
    const again = await c.post("/api/auth/recovery/send", { recoveryToken: ticket, channel: "email" });
    assert.equal(again.status, 429);
    assert.equal(again.json.error.code, "OTP_COOLDOWN");
    assert.ok(again.json.error.retryAfterSeconds > 0 && again.json.error.retryAfterSeconds <= 30);

    const wrong = await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "email", code: code === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 400);
    assert.match(wrong.json.error.message, /4 tries left/);
    assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "email", code: "12ab" })).status, 422);

    const ok = await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "email", code });
    assert.equal(ok.status, 200);
    assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "email", code })).status, 400, "a code works once");
    assert.equal((await c.post("/api/auth/token-info", { token: linkToken })).json.valid, false, "using the code also kills the emailed link");

    const NEW = "Evening-Frame-77";
    assert.equal((await c.post("/api/auth/reset-password", { token: ok.json.resetToken, password: "weak", confirmPassword: "weak" })).status, 422);
    assert.equal((await c.post("/api/auth/reset-password", { token: ok.json.resetToken, password: NEW, confirmPassword: NEW })).status, 200);
    assert.equal((await c.post("/api/auth/reset-password", { token: ok.json.resetToken, password: NEW, confirmPassword: NEW })).status, 400, "the reset token works once");
    assert.equal((await customer.get("/api/users/me")).status, 401, "a reset signs out existing sessions");
    assert.equal((await customer.post("/api/auth/login", { identifier: "riya@example.com", password: PASSWORD })).status, 401);
    assert.equal((await customer.post("/api/auth/login", { identifier: "riya@example.com", password: NEW })).status, 200);
    state.customerPassword = NEW;
  });

  test("forgot password by email: the link in the email works too, and expires", async () => {
    clearDevOutbox();
    await forgetEarlierCodes();
    const c = new Client();
    const first = await recover(c, "riya@example.com", "email");
    const mail = latestMailTo("riya@example.com");
    const token = tokenFromMail(mail);
    assert.equal((await c.post("/api/auth/token-info", { token })).json.purpose, "PASSWORD_RESET");
    const NEW = "Harvest-Frame-58";
    assert.equal((await c.post("/api/auth/reset-password", { token, password: NEW, confirmPassword: NEW })).status, 200);
    assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: first.ticket, channel: "email", code: codeFromMail(mail) })).status, 400, "using the link also kills the code");
    assert.equal((await customer.post("/api/auth/login", { identifier: "riya@example.com", password: NEW })).status, 200);
    state.customerPassword = NEW;

    // An expired link and an expired code are both refused.
    clearDevOutbox();
    await forgetEarlierCodes();
    const second = await recover(c, "riya@example.com", "email");
    const later = latestMailTo("riya@example.com");
    await db.query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
    await db.query("UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
    assert.equal((await c.post("/api/auth/reset-password", { token: tokenFromMail(later), password: PASSWORD, confirmPassword: PASSWORD })).status, 400);
    assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: second.ticket, channel: "email", code: codeFromMail(later) })).status, 400);
    assert.equal((await c.post("/api/auth/reset-password", { token: "x".repeat(43), password: PASSWORD, confirmPassword: PASSWORD })).status, 400);
    assert.equal((await c.post("/api/auth/recovery/send", { recoveryToken: "x".repeat(40) + "." + "y".repeat(43), channel: "email" })).status, 400, "a forged recovery ticket is refused");
  });

  test("change password needs the current one", async () => {
    const bad = await customer.post("/api/auth/change-password", { currentPassword: "nope-nope-1", newPassword: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(bad.status, 422);
    const ok = await customer.post("/api/auth/change-password", { currentPassword: state.customerPassword, newPassword: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(ok.status, 200);
    assert.equal((await customer.get("/api/auth/me")).json.authenticated, true, "this session stays signed in");
  });
});

describe("role protection", () => {
  test("anonymous users get 401, customers get 403 on admin and shop APIs", async () => {
    const anon = new Client();
    for (const path of ["/api/admin/overview", "/api/admin/applications", "/api/admin/shops", "/api/admin/audit", "/api/users/me"]) {
      assert.equal((await anon.get(path)).status, 401, path);
    }
    assert.equal((await anon.get("/api/shops/FRX-SHOP-1001/dashboard")).status, 401);
    for (const path of ["/api/admin/overview", "/api/admin/applications", "/api/admin/shops", "/api/admin/audit"]) {
      assert.equal((await customer.get(path)).status, 403, path);
    }
    assert.equal((await customer.post("/api/admin/shops", { shop: SHOP })).status, 403);
    assert.equal((await customer.get("/api/shops/FRX-SHOP-1001/dashboard")).status, 403);
    assert.equal((await customer.patch("/api/shops/FRX-SHOP-1001/profile", { description: "x" })).status, 403);
  });

  test("there is no admin or shop sign-up endpoint", async () => {
    const c = new Client();
    for (const path of ["/api/admin/signup", "/api/auth/admin/signup", "/api/shops/signup", "/api/auth/shop-signup"]) {
      const r = await c.post(path, { email: "x@example.com", password: PASSWORD });
      assert.ok([401, 404].includes(r.status), `${path} -> ${r.status}`);
    }
  });

  test("admin logs in through the normal login; the role comes from the database", async () => {
    const r = await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, "ADMIN");
    assert.equal((await admin.get("/api/admin/overview")).status, 200);
  });
});

describe("shop onboarding", () => {
  test("a shop applies; no account is created", async () => {
    const c = new Client();
    const bad = await c.post("/api/shops/applications", { shopName: "K" });
    assert.equal(bad.status, 422);
    const r = await c.post("/api/shops/applications", { ...APPLICATION, role: "SHOP", status: "APPROVED" });
    assert.equal(r.status, 201);
    assert.equal(r.json.application.status, "PENDING");
    state.applicationId = r.json.application.id;
    assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE email = $1", [APPLICATION.email])).rows[0].n, 0);
    assert.equal((await c.post("/api/auth/login", { identifier: APPLICATION.email, password: PASSWORD, accountType: "shop" })).status, 401);
    assert.equal((await c.post("/api/shops/applications", APPLICATION)).status, 409, "one open application per email");
    assert.equal((await c.get("/api/admin/applications")).status, 401);
  });

  test("admin reviews, and approval needs a real location", async () => {
    const list = await admin.get("/api/admin/applications?status=PENDING");
    assert.equal(list.json.items.length, 1);
    assert.equal((await admin.post(`/api/admin/applications/${state.applicationId}/review`, { note: "Called the owner" })).json.application.status, "UNDER_REVIEW");
    const noLocation = await admin.post(`/api/admin/applications/${state.applicationId}/approve`, { shop: { ...SHOP, latitude: "", longitude: "" }, accountEmail: APPLICATION.email });
    assert.equal(noLocation.status, 422);
    assert.ok(noLocation.json.error.fields.latitude && noLocation.json.error.fields.longitude);
    const zero = await admin.post(`/api/admin/applications/${state.applicationId}/approve`, { shop: { ...SHOP, latitude: 0, longitude: 0 }, accountEmail: APPLICATION.email });
    assert.equal(zero.status, 422);
    const outOfRange = await admin.post(`/api/admin/applications/${state.applicationId}/approve`, { shop: { ...SHOP, latitude: 120 }, accountEmail: APPLICATION.email });
    assert.equal(outOfRange.status, 422);
  });

  test("approval creates the shop, a unique Shop ID and a login that needs password setup", async () => {
    clearDevOutbox();
    const r = await admin.post(`/api/admin/applications/${state.applicationId}/approve`, { shop: SHOP, accountEmail: APPLICATION.email });
    assert.equal(r.status, 201);
    assert.match(r.json.shop.shopCode, /^FRX-SHOP-\d{4}$/);
    assert.equal(r.json.shop.status, "ACTIVE");
    assert.equal(r.json.shop.account.status, "PENDING_SETUP");
    assert.ok(r.json.credentials.setupUrl.includes("#token="));
    assert.ok(!r.text.includes("scrypt$"));
    state.shopCode = r.json.shop.shopCode;
    state.shopUuid = r.json.shop.uuid;
    state.setupToken = r.json.credentials.setupUrl.split("#token=")[1];
    assert.ok(latestMailTo(APPLICATION.email).text.includes(state.shopCode), "the shop is told its Shop ID");
    const user = (await db.query("SELECT password_hash, status, role FROM users WHERE email = $1", [APPLICATION.email])).rows[0];
    assert.equal(user.password_hash, null, "no password exists until the shop sets one");
    assert.equal(user.role, "SHOP");
    assert.equal((await admin.post(`/api/admin/applications/${state.applicationId}/approve`, { shop: SHOP, accountEmail: "again@example.com" })).status, 409, "an application is decided once");
    assert.equal((await admin.get(`/api/admin/applications/${state.applicationId}`)).json.application.status, "APPROVED");
  });

  test("the shop can't log in before setting its password", async () => {
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: PASSWORD, accountType: "shop" })).status, 401);
    assert.equal((await shopUser.post("/api/auth/recovery/start", { identifier: APPLICATION.email })).status, 404, "an account that isn't set up yet can't be 'recovered'");
    assert.equal((await shopUser.post("/api/auth/recovery/start", { identifier: state.shopCode })).status, 404);
  });

  test("setup link sets the password once; then Shop ID or email logs in", async () => {
    const info = await shopUser.post("/api/auth/token-info", { token: state.setupToken });
    assert.equal(info.json.purpose, "ACCOUNT_SETUP");
    assert.equal(info.json.shop.shopCode, state.shopCode);
    const SHOP_PASSWORD = "Workshop-Glue-88";
    const done = await shopUser.post("/api/auth/reset-password", { token: state.setupToken, password: SHOP_PASSWORD, confirmPassword: SHOP_PASSWORD });
    assert.equal(done.status, 200);
    assert.equal(done.json.purpose, "ACCOUNT_SETUP");
    assert.equal((await shopUser.post("/api/auth/reset-password", { token: state.setupToken, password: SHOP_PASSWORD, confirmPassword: SHOP_PASSWORD })).status, 400);
    // The customer tab never finds a shop account, and the shop tab never finds a customer.
    assert.equal((await shopUser.post("/api/auth/login", { identifier: APPLICATION.email, password: SHOP_PASSWORD, accountType: "customer" })).status, 401);
    assert.equal((await shopUser.post("/api/auth/login", { identifier: "riya@example.com", password: PASSWORD, accountType: "shop" })).status, 401);
    const byEmail = await shopUser.post("/api/auth/login", { identifier: APPLICATION.email, password: SHOP_PASSWORD, accountType: "shop" });
    assert.equal(byEmail.status, 200);
    await shopUser.post("/api/auth/logout");
    const byCode = await shopUser.post("/api/auth/login", { identifier: state.shopCode.toLowerCase(), password: SHOP_PASSWORD, accountType: "shop" });
    assert.equal(byCode.status, 200);
    assert.equal(byCode.json.user.role, "SHOP");
    assert.equal(byCode.json.user.shop.shopCode, state.shopCode);
    state.shopPassword = SHOP_PASSWORD;
  });

  test("a shop sees and edits only its own shop", async () => {
    const own = await shopUser.get(`/api/shops/${state.shopCode}/dashboard`);
    assert.equal(own.status, 200);
    assert.equal(own.json.shop.name, "Kalinga Frames");
    assert.equal(own.json.shop.location.latitude, 20.6586);

    // A second shop, created directly by the admin.
    const other = await admin.post("/api/admin/shops", { shop: { ...SHOP, name: "Mahanadi Frames", city: "Cuttack", postalCode: "753001", latitude: 20.4625, longitude: 85.883 }, accountEmail: "owner@mahanadi.example" });
    assert.equal(other.status, 201);
    state.otherCode = other.json.shop.shopCode;
    state.otherUuid = other.json.shop.uuid;
    assert.notEqual(state.otherCode, state.shopCode);

    assert.equal((await shopUser.get(`/api/shops/${state.otherCode}/dashboard`)).status, 403, "changing the Shop ID in the URL is refused");
    assert.equal((await shopUser.patch(`/api/shops/${state.otherCode}/profile`, { description: "hacked" })).status, 403);
    assert.equal((await shopUser.get(`/api/admin/shops/${state.otherUuid}`)).status, 403);
    assert.equal((await shopUser.post(`/api/admin/shops/${state.shopUuid}/activate`)).status, 403);
    assert.equal((await shopUser.get("/api/admin/applications")).status, 403);

    const edit = await shopUser.patch(`/api/shops/${state.shopCode}/profile`, { description: "Custom framing since 2012", phone: "98765 00009", name: "Renamed", latitude: 1, approvalStatus: "APPROVED", shopCode: "FRX-SHOP-1" });
    assert.equal(edit.status, 200);
    assert.equal(edit.json.shop.description, "Custom framing since 2012");
    assert.equal(edit.json.shop.name, "Kalinga Frames", "identity fields stay with FrameX admins");
    assert.equal(edit.json.shop.location.latitude, 20.6586);
    assert.equal(edit.json.shop.shopCode, state.shopCode);
  });

  test("an admin has no shop dashboard; admin tools are separate", async () => {
    assert.equal((await admin.get(`/api/shops/${state.shopCode}/dashboard`)).status, 403);
    assert.equal((await admin.get(`/api/admin/shops/${state.shopUuid}`)).json.shop.account.email, APPLICATION.email);
  });

  test("rejecting an application creates nothing", async () => {
    const c = new Client();
    const applied = await c.post("/api/shops/applications", { ...APPLICATION, shopName: "Second Try Frames", email: "second@example.com", phone: "9876500002" });
    const id = applied.json.application.id;
    const r = await admin.post(`/api/admin/applications/${id}/reject`, { reason: "Could not verify the address" });
    assert.equal(r.json.application.status, "REJECTED");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE email = 'second@example.com'")).rows[0].n, 0);
    assert.equal((await admin.post(`/api/admin/applications/${id}/approve`, { shop: SHOP, accountEmail: "second@example.com" })).status, 409);
  });

  test("the audit log records who approved, rejected and created", async () => {
    const log = (await admin.get("/api/admin/audit")).json.items;
    const actions = log.map((l) => l.action);
    for (const a of ["APPLICATION_SUBMITTED", "APPLICATION_UNDER_REVIEW", "SHOP_APPROVED", "SHOP_ACCOUNT_CREATED", "ACCOUNT_SETUP_COMPLETED", "APPLICATION_REJECTED", "SHOP_PROFILE_UPDATED"]) assert.ok(actions.includes(a), a);
    const approved = log.find((l) => l.action === "SHOP_APPROVED" && l.targetId === state.shopCode);
    assert.equal(approved.actor.email, "admin@framex.example");
    assert.ok(approved.at);
  });
});

describe("nearby shops", () => {
  const dhenkanalBusStand = { latitude: 20.6652, longitude: 85.5912 }; // a point in Dhenkanal town

  test("distances are measured by the database from stored coordinates", async () => {
    const c = new Client();
    const r = await c.get(`/api/shops/nearby?lat=${dhenkanalBusStand.latitude}&lng=${dhenkanalBusStand.longitude}&radius=50`);
    assert.equal(r.status, 200);
    assert.equal(r.json.radiusKm, 50);
    const names = r.json.items.map((s) => s.name);
    assert.deepEqual(names, ["Kalinga Frames", "Mahanadi Frames"], "nearest first");
    for (const s of r.json.items) {
      const expected = haversineKm(dhenkanalBusStand, s.location);
      assert.ok(Math.abs(s.distanceKm - expected) < 0.02, `${s.name}: ${s.distanceKm} vs ${expected}`);
    }
    assert.ok(r.json.items[0].distanceKm < 2);
    assert.ok(r.json.items[1].distanceKm > 30 && r.json.items[1].distanceKm < 45);
    // Public data only.
    assert.equal(r.json.items[0].email, undefined);
    assert.equal(r.json.items[0].ownerName, undefined);
    assert.equal(r.json.items[0].account, undefined);
  });

  test("the radius is respected and validated", async () => {
    const c = new Client();
    const q = `lat=${dhenkanalBusStand.latitude}&lng=${dhenkanalBusStand.longitude}`;
    assert.deepEqual((await c.get(`/api/shops/nearby?${q}&radius=5`)).json.items.map((s) => s.name), ["Kalinga Frames"]);
    assert.equal((await c.get(`/api/shops/nearby?${q}`)).json.radiusKm, config.nearby.defaultRadiusKm);
    assert.equal((await c.get(`/api/shops/nearby?lat=19.07&lng=72.87&radius=50`)).json.items.length, 0, "nothing near Mumbai");
    assert.equal((await c.get(`/api/shops/nearby?${q}&radius=5000`)).status, 422);
    assert.equal((await c.get(`/api/shops/nearby?lat=95&lng=85`)).status, 422);
    assert.equal((await c.get(`/api/shops/nearby?lng=85`)).status, 422);
  });

  test("inactive, pending and rejected shops are hidden from the public", async () => {
    const c = new Client();
    const q = `lat=${dhenkanalBusStand.latitude}&lng=${dhenkanalBusStand.longitude}&radius=50`;
    assert.equal((await admin.post(`/api/admin/shops/${state.otherUuid}/deactivate`)).json.shop.status, "INACTIVE");
    assert.deepEqual((await c.get(`/api/shops/nearby?${q}`)).json.items.map((s) => s.name), ["Kalinga Frames"]);
    assert.equal((await c.get(`/api/shops/${state.otherCode}`)).status, 404);
    assert.equal((await c.get("/api/shops")).json.total, 1);
    assert.equal((await admin.post(`/api/admin/shops/${state.otherUuid}/activate`)).json.shop.status, "ACTIVE");
    assert.equal((await c.get(`/api/shops/nearby?${q}`)).json.items.length, 2);

    const pending = await admin.post("/api/admin/shops", { shop: { ...SHOP, name: "Pending Frames", latitude: "", longitude: "" }, approve: false });
    assert.equal(pending.status, 201);
    assert.equal(pending.json.shop.status, "PENDING");
    assert.equal((await admin.post(`/api/admin/shops/${pending.json.shop.uuid}/activate`)).status, 409, "only approved shops can be activated");
    assert.equal((await admin.post(`/api/admin/shops/${pending.json.shop.uuid}/approval`, { status: "APPROVED" })).status, 422, "approval needs coordinates");
    assert.equal((await c.get(`/api/shops/nearby?${q}`)).json.items.length, 2);
    assert.equal((await admin.post(`/api/admin/shops/${pending.json.shop.uuid}/approval`, { status: "REJECTED" })).json.shop.status, "REJECTED");
  });

  test("the list endpoint filters by text and adds distance when a point is given", async () => {
    const c = new Client();
    assert.deepEqual((await c.get("/api/shops?q=cuttack")).json.items.map((s) => s.name), ["Mahanadi Frames"]);
    assert.equal((await c.get("/api/shops?q=759001")).json.items[0].distanceKm, null);
    const withPoint = (await c.get(`/api/shops?lat=${dhenkanalBusStand.latitude}&lng=${dhenkanalBusStand.longitude}`)).json.items;
    assert.ok(withPoint[0].distanceKm < withPoint[1].distanceKm);
    assert.equal((await c.get(`/api/shops/${state.shopCode}`)).json.shop.name, "Kalinga Frames");
  });

  test("admin can move a shop; the distance follows the new coordinates", async () => {
    const moved = await admin.patch(`/api/admin/shops/${state.otherUuid}`, { latitude: 20.6701, longitude: 85.6002, city: "Dhenkanal", catalogRef: "shop-002" });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.shop.catalogRef, "shop-002");
    const c = new Client();
    const r = await c.get(`/api/shops/nearby?lat=${dhenkanalBusStand.latitude}&lng=${dhenkanalBusStand.longitude}&radius=5`);
    assert.equal(r.json.items.length, 2);
    assert.equal((await c.get("/api/shops/shop-002")).json.shop.shopCode, state.otherCode, "catalogue reference resolves to the shop");
    assert.equal((await admin.patch(`/api/admin/shops/${state.otherUuid}`, { latitude: null })).status, 422, "an approved shop keeps its coordinates");
  });
});

describe("admin controls over shop accounts", () => {
  test("credentials: a fresh one-time link replaces the old one", async () => {
    const first = await admin.post(`/api/admin/shops/${state.otherUuid}/credentials`, {});
    assert.equal(first.status, 201);
    const second = await admin.post(`/api/admin/shops/${state.otherUuid}/credentials`, {});
    const c = new Client();
    assert.equal((await c.post("/api/auth/token-info", { token: first.json.credentials.setupUrl.split("#token=")[1] })).json.valid, false);
    assert.equal((await c.post("/api/auth/token-info", { token: second.json.credentials.setupUrl.split("#token=")[1] })).json.valid, true);
  });

  test("a deactivated shop is hidden but can still log in; a disabled login is cut off at once", async () => {
    await admin.post(`/api/admin/shops/${state.shopUuid}/deactivate`);
    assert.equal((await shopUser.get(`/api/shops/${state.shopCode}/dashboard`)).json.shop.status, "INACTIVE");
    await admin.post(`/api/admin/shops/${state.shopUuid}/activate`);

    assert.equal((await admin.post(`/api/admin/shops/${state.shopUuid}/account`, { enabled: false })).json.shop.account.status, "DISABLED");
    assert.equal((await shopUser.get(`/api/shops/${state.shopCode}/dashboard`)).status, 401, "existing session is revoked");
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: state.shopPassword, accountType: "shop" })).status, 403);
    await admin.post(`/api/admin/shops/${state.shopUuid}/account`, { enabled: true });
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: state.shopPassword, accountType: "shop" })).status, 200);
  });

  test("withdrawing approval ends the shop's access", async () => {
    await admin.post(`/api/admin/shops/${state.shopUuid}/approval`, { status: "REJECTED" });
    assert.equal((await shopUser.get(`/api/shops/${state.shopCode}/dashboard`)).status, 401);
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: state.shopPassword, accountType: "shop" })).status, 403);
    assert.equal((await new Client().get(`/api/shops/${state.shopCode}`)).status, 404);
    await admin.post(`/api/admin/shops/${state.shopUuid}/approval`, { status: "APPROVED" });
  });

  test("overview counts match", async () => {
    const o = (await admin.get("/api/admin/overview")).json;
    assert.equal(o.applications.approved, 1);
    assert.equal(o.applications.rejected, 1);
    assert.equal(o.shops.total, 3);
    assert.equal(o.shops.rejected, 1);
  });
});

describe("session transport", () => {
  test("the cookie is scoped to the API and not readable by scripts", async () => {
    const c = new Client();
    await c.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD });
    assert.ok(c.lastSetCookie.includes("Path=/api"));
    assert.match(c.lastSetCookie, /HttpOnly/);
  });

  test("bearer tokens work only when switched on", async () => {
    const c = new Client();
    const off = await c.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD });
    assert.equal(off.json.token, undefined);
    const fake = await fetch(base + "/api/users/me", { headers: { Authorization: "Bearer " + "a".repeat(43) } });
    assert.equal(fake.status, 401);

    config.allowBearer = true;
    const on = await new Client().post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD });
    assert.ok(on.json.token.length >= 40);
    const me = await fetch(base + "/api/users/me", { headers: { Authorization: "Bearer " + on.json.token } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.role, "ADMIN");
    const out = await fetch(base + "/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + on.json.token, "X-FrameX-Client": "test", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(out.status, 200);
    assert.equal((await fetch(base + "/api/users/me", { headers: { Authorization: "Bearer " + on.json.token } })).status, 401, "logout ends a bearer session too");
    config.allowBearer = false;
    assert.equal((await fetch(base + "/api/users/me", { headers: { Authorization: "Bearer " + on.json.token } })).status, 401);
  });

  test("place search reports when it is switched off", async () => {
    const r = await new Client().get("/api/geo/search?q=Dhenkanal");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { available: false, results: [] });
  });
});

describe("forgot password by mobile number (SMS code)", () => {
  const PHONE = "+919876543210"; // Riya's number from the sign-up test

  test("a 6-digit code is sent to the masked number; wrong codes are counted; the code dies after five", async () => {
    clearDevOutbox();
    await forgetEarlierCodes();
    const c = new Client();
    const { ticket, sent } = await recover(c, "98765 43210", "sms");
    assert.equal(sent.status, 200);
    assert.equal(sent.json.masked, "******3210");
    const real = codeFromSms(lastSmsTo(PHONE));
    assert.ok(!sent.text.includes(real));
    const wrong = real === "000000" ? "111111" : "000000";
    const first = await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "sms", code: wrong });
    assert.match(first.json.error.message, /4 tries left/);
    for (let i = 0; i < 3; i++) await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "sms", code: wrong });
    const fifth = await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "sms", code: wrong });
    assert.equal(fifth.json.error.code, "OTP_LOCKED");
    assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: ticket, channel: "sms", code: real })).status, 400, "even the right code is refused once locked");
  });

  test("the right code resets the password; a new code replaces the old one", async () => {
    clearDevOutbox();
    await forgetEarlierCodes();
    const c = new Client();
    const first = await recover(c, PHONE, "sms");
    const oldCode = codeFromSms(lastSmsTo(PHONE));
    await db.query("UPDATE otp_codes SET created_at = now() - interval '1 minute' WHERE used_at IS NULL"); // past the resend wait
    clearDevOutbox();
    assert.equal((await c.post("/api/auth/recovery/send", { recoveryToken: first.ticket, channel: "sms" })).status, 200);
    const newCode = codeFromSms(lastSmsTo(PHONE));
    if (oldCode !== newCode) assert.equal((await c.post("/api/auth/recovery/verify", { recoveryToken: first.ticket, channel: "sms", code: oldCode })).status, 400, "the earlier code no longer works");
    const ok = await c.post("/api/auth/recovery/verify", { recoveryToken: first.ticket, channel: "sms", code: newCode });
    assert.equal(ok.status, 200);
    const NEW = "Monsoon-Frame-31";
    assert.equal((await c.post("/api/auth/reset-password", { token: ok.json.resetToken, password: NEW, confirmPassword: NEW })).status, 200);
    assert.equal((await customer.post("/api/auth/login", { identifier: PHONE, password: NEW })).status, 200);
    // Put the original password back for the tests that follow.
    await customer.post("/api/auth/change-password", { currentPassword: NEW, newPassword: PASSWORD, confirmPassword: PASSWORD });
  });

  test("codes can't be requested without limit", async () => {
    await forgetEarlierCodes();
    const c = new Client();
    const start = await c.post("/api/auth/recovery/start", { identifier: PHONE });
    for (let i = 0; i < 5; i++) {
      assert.equal((await c.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel: "sms" })).status, 200, "send " + (i + 1));
      await db.query("UPDATE otp_codes SET created_at = created_at - interval '1 minute'"); // skip the resend wait, stay inside the hour
    }
    const sixth = await c.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel: "sms" });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.json.error.code, "OTP_LIMIT");
    await forgetEarlierCodes();
  });
});

describe("forgot password for shops and admins", () => {
  test("a shop recovers with its Shop ID, by email or by the shop's mobile number", async () => {
    clearDevOutbox();
    const c = new Client();
    const start = await c.post("/api/auth/recovery/start", { identifier: state.shopCode.toLowerCase() });
    assert.equal(start.status, 200);
    assert.equal(start.json.accountType, "shop");
    assert.deepEqual(start.json.channels.map((ch) => ch.type), ["email", "sms"]);
    assert.equal(start.json.channels[1].masked, "******0009", "the shop's own number, masked");

    assert.equal((await c.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel: "sms" })).status, 200);
    const code = codeFromSms(lastSmsTo("+919876500009"));
    const ok = await c.post("/api/auth/recovery/verify", { recoveryToken: start.json.recoveryToken, channel: "sms", code });
    const NEW = "Varnish-Mitre-64";
    const done = await c.post("/api/auth/reset-password", { token: ok.json.resetToken, password: NEW, confirmPassword: NEW });
    assert.equal(done.status, 200);
    assert.equal(done.json.role, "SHOP");
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: state.shopPassword, accountType: "shop" })).status, 401);
    assert.equal((await shopUser.post("/api/auth/login", { identifier: state.shopCode, password: NEW, accountType: "shop" })).status, 200);
    state.shopPassword = NEW;

    // By the shop's email as well.
    await forgetEarlierCodes();
    clearDevOutbox();
    const byEmail = await recover(c, APPLICATION.email, "email");
    assert.equal(byEmail.sent.status, 200);
    assert.ok(codeFromMail(latestMailTo(APPLICATION.email)));
    await forgetEarlierCodes();
  });

  test("admin accounts can't be reset from the public page", async () => {
    const c = new Client();
    const r = await c.post("/api/auth/recovery/start", { identifier: "admin@framex.example" });
    assert.equal(r.status, 404, "an admin password is only changed from the server");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM otp_codes o JOIN users u ON u.id = o.user_id WHERE u.role = 'ADMIN'")).rows[0].n, 0);
  });
});

describe("delivery is real or it is an error", () => {
  /** Answer provider URLs locally so no real message or key is needed; everything else goes through. */
  async function withProvider(host, handler, run) {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      if (!String(url).includes(host)) return realFetch(url, options);
      calls.push({ url: String(url), options });
      const { status, body } = handler(String(url), options);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    };
    try {
      await run(calls);
    } finally {
      globalThis.fetch = realFetch;
    }
  }
  const use = (changes, run) => {
    const before = { email: { ...config.email }, sms: { ...config.sms } };
    Object.assign(config.email, changes.email || {});
    Object.assign(config.sms, changes.sms || {});
    return run().finally(() => {
      Object.assign(config.email, before.email);
      Object.assign(config.sms, before.sms);
    });
  };

  test("nothing configured: the page is told, and sending is an error, not a pretend success", async () => {
    await forgetEarlierCodes();
    await use({ email: { provider: "none" }, sms: { provider: "none" } }, async () => {
      const c = new Client();
      const features = (await c.get("/api/config")).json.features;
      assert.equal(features.emailDelivery, "none");
      assert.equal(features.smsDelivery, "none");
      const start = await c.post("/api/auth/recovery/start", { identifier: "riya@example.com" });
      assert.deepEqual(start.json.channels.map((ch) => [ch.available, ch.reason]), [[false, "Email service is not configured."], [false, "SMS service is not configured."]]);
      const email = await c.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel: "email" });
      assert.equal(email.status, 503);
      assert.equal(email.json.error.message, "Email service is not configured.");
      const sms = await c.post("/api/auth/recovery/send", { recoveryToken: start.json.recoveryToken, channel: "sms" });
      assert.equal(sms.status, 503);
      assert.equal(sms.json.error.code, "SMS_NOT_CONFIGURED");
      assert.equal(await liveCodes(), 0, "no code exists when nothing was sent");
    });
  });

  test("a provider key without the rest of the settings also counts as not configured", async () => {
    await use({ email: { provider: "brevo", key: "", from: "" } }, async () => {
      assert.equal((await new Client().get("/api/config")).json.features.emailDelivery, "none");
    });
  });

  test("Brevo: the email request carries the code, the link and the sender; success needs the provider's id", async () => {
    await forgetEarlierCodes();
    await use({ email: { provider: "brevo", key: "xkeysib-test", from: "FrameX <support@framex.example>" } }, async () => {
      await withProvider("api.brevo.com", () => ({ status: 201, body: { messageId: "<202610.1@smtp-relay.mailin.fr>" } }), async (calls) => {
        const c = new Client();
        assert.equal((await c.get("/api/config")).json.features.emailDelivery, "real");
        const { sent } = await recover(c, "riya@example.com", "email");
        assert.equal(sent.status, 200);
        assert.equal(sent.json.devMode, false);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
        assert.equal(calls[0].options.headers["api-key"], "xkeysib-test");
        const body = JSON.parse(calls[0].options.body);
        assert.deepEqual(body.sender, { name: "FrameX", email: "support@framex.example" });
        assert.deepEqual(body.to, [{ email: "riya@example.com" }]);
        assert.equal(body.subject, "Reset your FrameX password");
        assert.match(body.textContent, /reset code: \d{6}/);
        assert.match(body.htmlContent, /reset-password\.html#token=[\w-]{40,}/);
        assert.match(body.htmlContent, /Reset your FrameX password/);
        assert.match(body.htmlContent, /expires in 10 minutes/);
        assert.match(body.htmlContent, /ignore this email/);
      });
    });
  });

  test("Brevo refuses (bad key): the user gets an error and no code stays valid", async () => {
    await forgetEarlierCodes();
    await use({ email: { provider: "brevo", key: "wrong", from: "FrameX <support@framex.example>" } }, async () => {
      await withProvider("api.brevo.com", () => ({ status: 401, body: { code: "unauthorized", message: "Key not found" } }), async () => {
        const { sent } = await recover(new Client(), "riya@example.com", "email");
        assert.equal(sent.status, 502);
        assert.equal(sent.json.error.code, "EMAIL_SEND_FAILED");
        assert.ok(!/Key not found|unauthorized/.test(sent.text), "provider internals aren't shown to the visitor");
        assert.equal(await liveCodes(), 0);
        assert.equal(await liveLinks(), 0);
      });
    });
  });

  test("Fast2SMS: the SMS request carries the code and the 10-digit number; refusals are errors", async () => {
    await forgetEarlierCodes();
    await use({ sms: { provider: "fast2sms", key: "f2s-test", senderId: "", templateId: "" } }, async () => {
      await withProvider("fast2sms.com", () => ({ status: 200, body: { return: true, request_id: "abc123", message: ["SMS sent successfully."] } }), async (calls) => {
        const { sent } = await recover(new Client(), "9876543210", "sms");
        assert.equal(sent.status, 200);
        assert.equal(sent.json.devMode, false);
        assert.equal(calls[0].url, "https://www.fast2sms.com/dev/bulkV2");
        assert.equal(calls[0].options.headers.authorization, "f2s-test");
        const body = JSON.parse(calls[0].options.body);
        assert.equal(body.route, "otp");
        assert.equal(body.numbers, "9876543210");
        assert.match(body.variables_values, /^\d{6}$/);
      });
      await forgetEarlierCodes();
      await withProvider("fast2sms.com", () => ({ status: 401, body: { return: false, status_code: 412, message: "Invalid Authentication, Check Authorization Key" } }), async () => {
        const { sent } = await recover(new Client(), "9876543210", "sms");
        assert.equal(sent.status, 502);
        assert.equal(sent.json.error.code, "SMS_SEND_FAILED");
        assert.equal(await liveCodes(), 0);
      });
    });
  });

  test("2Factor: the request follows its URL format", async () => {
    await forgetEarlierCodes();
    await use({ sms: { provider: "2factor", key: "tf-key", templateId: "FrameXOTP" } }, async () => {
      await withProvider("2factor.in", () => ({ status: 200, body: { Status: "Success", Details: "5D6EBEE6-EC04-4776-846D" } }), async (calls) => {
        const { sent } = await recover(new Client(), "9876543210", "sms");
        assert.equal(sent.status, 200);
        assert.match(calls[0].url, /^https:\/\/2factor\.in\/API\/V1\/tf-key\/SMS\/9876543210\/\d{6}\/FrameXOTP$/);
      });
    });
    await forgetEarlierCodes();
  });

  test("SMTP (the path Gmail uses): a real SMTP server receives the message with code and link", async () => {
    // A minimal local SMTP server stands in for Gmail; the sending code is the same.
    const net = await import("node:net");
    const received = [];
    const smtp = net.createServer((socket) => {
      let data = "";
      let inData = false;
      socket.write("220 test ESMTP\r\n");
      socket.on("data", (chunk) => {
        data += chunk.toString();
        if (inData) {
          if (data.endsWith("\r\n.\r\n")) {
            received.push(data);
            data = "";
            inData = false;
            socket.write("250 OK queued\r\n");
          }
          return;
        }
        let i;
        while ((i = data.indexOf("\r\n")) >= 0) {
          const line = data.slice(0, i);
          data = data.slice(i + 2);
          if (/^(EHLO|HELO)/i.test(line)) socket.write("250 test\r\n");
          else if (/^(MAIL FROM|RCPT TO)/i.test(line)) socket.write("250 OK\r\n");
          else if (/^DATA/i.test(line)) {
            inData = true;
            socket.write("354 go ahead\r\n");
          } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
          else socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
    await forgetEarlierCodes();
    try {
      await use({ email: { provider: "smtp", smtp: { host: "127.0.0.1", port: smtp.address().port, user: "", password: "" }, from: "FrameX <framex@example.com>" } }, async () => {
        const { sent } = await recover(new Client(), "riya@example.com", "email");
        assert.equal(sent.status, 200);
        assert.equal(sent.json.devMode, false);
        assert.equal(received.length, 1, "the SMTP server received one message");
        const raw = received[0].replace(/=\r\n/g, "").replace(/=3D/g, "=");
        assert.match(raw, /To: riya@example\.com/);
        assert.match(raw, /From: FrameX <framex@example\.com>/);
        assert.match(raw, /Subject: Reset your FrameX password/);
        assert.match(raw, /reset code: \d{6}/);
        assert.match(raw, /reset-password\.html#token=[\w-]{40,}/);
      });
    } finally {
      smtp.close();
      await forgetEarlierCodes();
    }
  });
});

describe("rate limiting", () => {
  test("repeated wrong passwords are slowed down", async () => {
    config.rateLimit.enabled = true;
    resetRateLimits();
    const c = new Client();
    let last;
    for (let i = 0; i < 12; i++) last = await c.post("/api/auth/login", { identifier: "riya@example.com", password: "Wrong-Password-1" });
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get("retry-after")) > 0);
    config.rateLimit.enabled = false;
    resetRateLimits();
  });
});

/* ==========================================================================
   Log in / sign up with a code sent by email (owner, 2026-10-31). Run with "npm test".
   Emails go to the development mailbox (EMAIL_PROVIDER=dev); the codes are read from it.
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
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox } = await import("../src/lib/mailer.js");
const { newId } = await import("../src/lib/tokens.js");

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
}

const PASSWORD = "Sunrise-Frame-42";
/** The newest email to that address (the dev mailbox keeps the newest first). */
const mailTo = (email) => devOutbox().find((m) => m.kind === "email" && m.to === email);
const codeIn = (mail) => (String(mail && mail.text).match(/login code: (\d{6})/) || [])[1];
const loggedIn = async (client) => (await client.get("/api/auth/me")).json.authenticated;

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("Log in / sign up with an email code", () => {
  test("a new address: code -> name -> a new customer account without a password, logged in", async () => {
    const ravi = new Client();
    const sent = await ravi.post("/api/auth/code/send", { email: "Ravi.Code@Example.com" });
    assert.equal(sent.status, 200, sent.text);
    assert.deepEqual([sent.json.ok, sent.json.masked, sent.json.expiresInMinutes > 0, sent.json.resendAfterSeconds > 0], [true, "r********@example.com", true, true]);
    const mail = mailTo("ravi.code@example.com");
    assert.match(mail.subject, /^\d{6} is your FrameX login code$/);
    const code = codeIn(mail);
    assert.ok(code, mail.text);
    assert.ok(!sent.text.includes(code), "the code is never in the answer to the website");

    const wrong = await ravi.post("/api/auth/code/verify", { email: "ravi.code@example.com", code: code === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 400);
    assert.match(wrong.json.error.message, /4 tries left/);

    const ok = await ravi.post("/api/auth/code/verify", { email: "RAVI.code@example.com", code });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.newAccount, true);
    assert.ok(ok.json.signupToken.length > 20);
    assert.equal(await loggedIn(ravi), false, "no account and no session before the name");

    const made = await ravi.post("/api/auth/code/signup", { signupToken: ok.json.signupToken, name: "Ravi Kumar", phone: "9876500991" });
    assert.equal(made.status, 201, made.text);
    assert.deepEqual([made.json.user.role, made.json.user.email, made.json.user.name, made.json.user.phone, made.json.user.hasPassword], ["CUSTOMER", "ravi.code@example.com", "Ravi Kumar", "+919876500991", false]);
    assert.equal(await loggedIn(ravi), true);

    const again = await new Client().post("/api/auth/code/signup", { signupToken: ok.json.signupToken, name: "Someone Else" });
    assert.equal(again.status, 409, "the same sign-up can't make a second account");
  });

  test("an existing customer (made with a password): the code logs them in to that account", async () => {
    const made = await new Client().post("/api/auth/signup", { name: "Asha Verma", email: "asha.code@example.com", phone: "9876500992", password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(made.status, 201, made.text);
    const asha = new Client();
    assert.equal((await asha.post("/api/auth/code/send", { email: "asha.code@example.com" })).status, 200);
    const r = await asha.post("/api/auth/code/verify", { email: "asha.code@example.com", code: codeIn(mailTo("asha.code@example.com")) });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.newAccount, undefined);
    assert.deepEqual([r.json.user.id, r.json.user.hasPassword], [made.json.user.id, true]);
    assert.equal(await loggedIn(asha), true);
  });

  test("a code works once", async () => {
    const c = new Client();
    await c.post("/api/auth/code/send", { email: "once.code@example.com" });
    const code = codeIn(mailTo("once.code@example.com"));
    assert.equal((await c.post("/api/auth/code/verify", { email: "once.code@example.com", code })).status, 200);
    const second = await new Client().post("/api/auth/code/verify", { email: "once.code@example.com", code });
    assert.equal(second.status, 400);
    assert.equal(second.json.error.code, "OTP_INVALID");
  });

  test("too many wrong tries: the code stops working, even the right one", async () => {
    const c = new Client();
    await c.post("/api/auth/code/send", { email: "guess.code@example.com" });
    const code = codeIn(mailTo("guess.code@example.com"));
    const wrong = code === "123456" ? "654321" : "123456";
    let last;
    for (let i = 0; i < 5; i++) last = await c.post("/api/auth/code/verify", { email: "guess.code@example.com", code: wrong });
    assert.equal(last.json.error.code, "OTP_LOCKED");
    const right = await c.post("/api/auth/code/verify", { email: "guess.code@example.com", code });
    assert.equal(right.status, 400);
    assert.equal(await loggedIn(c), false);
  });

  test("a second code at once is refused (wait before asking again)", async () => {
    const c = new Client();
    assert.equal((await c.post("/api/auth/code/send", { email: "wait.code@example.com" })).status, 200);
    const again = await c.post("/api/auth/code/send", { email: "wait.code@example.com" });
    assert.equal(again.status, 429);
    assert.equal(again.json.error.code, "OTP_COOLDOWN");
  });

  test("a shop / artist / staff address: the same answer, an email that says to use the password, no code works", async () => {
    await db.query("INSERT INTO users (id, name, email, role, status, password_hash) VALUES ($1, 'Staff Person', 'staff.code@example.com', 'ADMIN', 'ACTIVE', 'x')", [newId()]);
    const c = new Client();
    const sent = await c.post("/api/auth/code/send", { email: "staff.code@example.com" });
    assert.equal(sent.status, 200, sent.text);
    const newOne = await new Client().post("/api/auth/code/send", { email: "nobody.code@example.com" });
    assert.deepEqual(Object.keys(sent.json).sort(), Object.keys(newOne.json).sort(), "the answer never tells whether the address has an account");
    const mail = mailTo("staff.code@example.com");
    assert.equal(mail.subject, "Your FrameX login");
    assert.match(mail.text, /Log in using password/);
    assert.equal(codeIn(mail), undefined);
    for (const code of ["000000", "123456"]) assert.equal((await c.post("/api/auth/code/verify", { email: "staff.code@example.com", code })).status, 400);
    assert.equal(await loggedIn(c), false);
  });

  test("a disabled customer gets no code", async () => {
    const made = await new Client().post("/api/auth/signup", { name: "Off Account", email: "off.code@example.com", password: PASSWORD, confirmPassword: PASSWORD });
    await db.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [made.json.user.id]);
    const c = new Client();
    assert.equal((await c.post("/api/auth/code/send", { email: "off.code@example.com" })).status, 200);
    const mail = mailTo("off.code@example.com");
    assert.match(mail.text, /disabled/);
    assert.equal(codeIn(mail), undefined);
  });

  test("a changed or made-up sign-up token is refused; the name and email are checked", async () => {
    const bad = await new Client().post("/api/auth/code/signup", { signupToken: "eyJmYWtlIjoidG9rZW4ifQ.not-a-real-signature-at-all", name: "Fake" });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, "SIGNUP_EXPIRED");
    const c = new Client();
    await c.post("/api/auth/code/send", { email: "tamper.code@example.com" });
    const ok = await c.post("/api/auth/code/verify", { email: "tamper.code@example.com", code: codeIn(mailTo("tamper.code@example.com")) });
    const [payload, sig] = ok.json.signupToken.split(".");
    const other = Buffer.from(Buffer.from(payload, "base64url").toString().replace("tamper.code@", "victim.code@")).toString("base64url");
    assert.equal((await c.post("/api/auth/code/signup", { signupToken: `${other}.${sig}`, name: "Tamper" })).status, 400);
    assert.equal((await c.post("/api/auth/code/signup", { signupToken: ok.json.signupToken, name: "A" })).status, 422, "a name needs 2 letters");
    assert.equal((await c.post("/api/auth/code/send", { email: "not-an-email" })).status, 422);
  });
});

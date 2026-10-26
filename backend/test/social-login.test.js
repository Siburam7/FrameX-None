/* ==========================================================================
   "Continue with Google / Facebook" (owner, 2026-10-26). Run with "npm test".

   Google and Facebook are stand-ins on this computer: Google's public keys
   (a key made here signs the ID tokens) and Facebook's Graph API
   (debug_token + me). Nothing reaches the real Google or Facebook.
   ========================================================================== */
import crypto from "node:crypto";
import http from "node:http";

const CLIENT_ID = "1234567890-framex-test.apps.googleusercontent.com";
const FB_APP = "998877665544";
const FB_SECRET = "fb-test-secret-0123456789abcdef";

// Google's keys and Facebook's Graph API, both on this computer
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key-1";
const FB_TOKENS = {
  "EAAgood-token-for-framex-0001": { app_id: FB_APP, user_id: "fb-100", is_valid: true, me: { id: "fb-100", name: "Ravi Kumar", email: "ravi.fb@example.com" } },
  "EAAother-app-token-000000002": { app_id: "111", user_id: "fb-200", is_valid: true, me: { id: "fb-200", name: "Other", email: "other@example.com" } },
  "EAAno-email-token-0000000003": { app_id: FB_APP, user_id: "fb-300", is_valid: true, me: { id: "fb-300", name: "No Mail" } }
};
const stand = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body) => res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }).end(JSON.stringify(body));
  if (url.pathname === "/certs") return send(200, { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] });
  if (url.pathname === "/graph/debug_token") {
    if (url.searchParams.get("access_token") !== `${FB_APP}|${FB_SECRET}`) return send(400, { error: "bad app token" });
    const t = FB_TOKENS[url.searchParams.get("input_token")];
    return send(200, { data: t ? { app_id: t.app_id, user_id: t.user_id, is_valid: t.is_valid } : { is_valid: false } });
  }
  if (url.pathname === "/graph/me") {
    const token = url.searchParams.get("access_token");
    const proof = crypto.createHmac("sha256", FB_SECRET).update(token).digest("hex");
    if (url.searchParams.get("appsecret_proof") !== proof) return send(400, { error: "bad proof" });
    const t = FB_TOKENS[token];
    return t ? send(200, t.me) : send(400, { error: "bad token" });
  }
  send(404, {});
});
await new Promise((r) => stand.listen(0, "127.0.0.1", r));
const STAND = `http://127.0.0.1:${stand.address().port}`;

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
process.env.GOOGLE_JWKS_URL = `${STAND}/certs`;
process.env.FACEBOOK_APP_ID = FB_APP;
process.env.FACEBOOK_APP_SECRET = FB_SECRET;
process.env.FACEBOOK_GRAPH_URL = `${STAND}/graph`;

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");

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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** A Google ID token, signed with the stand-in's key (or another key / other claims, to be refused). */
function idToken(claims = {}, { key = privateKey, kid = KID } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "g-1001", email: "meera.g@example.com", email_verified: true, name: "Meera Nair", iat: now, exp: now + 3600, ...claims };
  const head = b64({ alg: "RS256", kid, typ: "JWT" }) + "." + b64(body);
  return head + "." + crypto.sign("RSA-SHA256", Buffer.from(head), key).toString("base64url");
}

const PASSWORD = "Sunrise-Frame-42";
const S = {};

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

describe("Continue with Google", () => {
  test("the website is told which buttons to show (public ids only, never the Facebook secret)", async () => {
    const r = await new Client().get("/api/config");
    assert.deepEqual(r.json.auth, { google: CLIENT_ID, facebook: FB_APP });
    assert.ok(!r.text.includes(FB_SECRET));
  });

  test("a new email: a customer account is made and logged in (no password, no phone)", async () => {
    const meera = new Client();
    const r = await meera.post("/api/auth/google", { credential: idToken() });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.json.user.role, r.json.user.email, r.json.user.name, r.json.user.phone, r.json.user.hasPassword, r.json.user.linked.google], ["CUSTOMER", "meera.g@example.com", "Meera Nair", null, false, true]);
    assert.equal((await meera.get("/api/auth/me")).json.user.id, r.json.user.id);
    S.meera = r.json.user.id;
    S.meeraClient = meera;
  });

  test("the same Google account again: the same customer (even if the Google email changed)", async () => {
    const r = await new Client().post("/api/auth/google", { credential: idToken({ email: "meera.new@example.com" }) });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.user.id, S.meera);
  });

  test("an existing customer with that email: Google joins that account", async () => {
    const asha = new Client();
    const made = await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.g@example.com", phone: "9876500071", password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(made.status, 201);
    const r = await new Client().post("/api/auth/google", { credential: idToken({ sub: "g-2002", email: "Asha.G@example.com", name: "Asha" }) });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.user.id, r.json.user.hasPassword, r.json.user.phone], [made.json.user.id, true, "+919876500071"]);
    // a different Google account with the same email can't take it over
    const other = await new Client().post("/api/auth/google", { credential: idToken({ sub: "g-9999", email: "asha.g@example.com" }) });
    assert.equal(other.status, 409);
  });

  test("a forged, someone else's, expired or unverified token is refused", async () => {
    const c = new Client();
    const { privateKey: wrongKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const cases = [
      idToken({}, { key: wrongKey }), // not signed by Google
      idToken({ aud: "another-app.apps.googleusercontent.com" }), // for another website
      idToken({ iss: "https://evil.example.com" }),
      idToken({ exp: Math.floor(Date.now() / 1000) - 3600 }), // expired
      idToken({ email_verified: false, sub: "g-3003", email: "x@example.com" }),
      idToken({}, { kid: "unknown-key" }),
      "not.a.token",
      idToken().replace(/\.[^.]+\./, "." + b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "g-1001", email: "meera.g@example.com", email_verified: true, exp: 9999999999 }) + ".") // claims changed after signing
    ];
    for (const credential of cases) {
      const r = await c.post("/api/auth/google", { credential });
      assert.ok([401, 422].includes(r.status), `${r.status} ${r.text}`);
    }
    assert.equal((await c.get("/api/auth/me")).json.authenticated, false);
  });

  test("a staff, shop or artist email can't log in through Google (their password only)", async () => {
    await db.query("INSERT INTO users (id, name, email, role, status) VALUES ($1, 'Boss', 'boss.g@example.com', 'ADMIN', 'ACTIVE')", [crypto.randomUUID()]);
    const r = await new Client().post("/api/auth/google", { credential: idToken({ sub: "g-4004", email: "boss.g@example.com" }) });
    assert.deepEqual([r.status, r.json.error.code], [403, "USE_PASSWORD"]);
  });

  test("a Google customer can set a password once, then also log in with email + password", async () => {
    const c = S.meeraClient;
    assert.equal((await c.post("/api/auth/set-password", { newPassword: PASSWORD, confirmPassword: "nope" })).status, 422);
    assert.equal((await c.post("/api/auth/set-password", { newPassword: PASSWORD, confirmPassword: PASSWORD })).status, 200);
    assert.equal((await c.post("/api/auth/set-password", { newPassword: PASSWORD, confirmPassword: PASSWORD })).status, 409, "only the first time");
    const login = await new Client().post("/api/auth/login", { identifier: "meera.g@example.com", password: PASSWORD });
    assert.equal(login.status, 200, login.text);
    assert.equal(login.json.user.hasPassword, true);
  });

  test("a Google customer without a password deletes the account by typing DELETE; a new Google login is a new account", async () => {
    const c = new Client();
    const made = await c.post("/api/auth/google", { credential: idToken({ sub: "g-5005", email: "kiran.g@example.com", name: "Kiran" }) });
    assert.equal(made.status, 201);
    assert.equal((await c.post("/api/users/me/delete", { confirm: "nope" })).status, 422);
    const gone = await c.post("/api/users/me/delete", { confirm: "DELETE" });
    assert.equal(gone.status, 200, gone.text);
    const again = await new Client().post("/api/auth/google", { credential: idToken({ sub: "g-5005", email: "kiran.g@example.com", name: "Kiran" }) });
    assert.equal(again.status, 201);
    assert.notEqual(again.json.user.id, made.json.user.id);
  });
});

describe("Continue with Facebook", () => {
  test("a token made for FrameX's app: the customer is made and logged in", async () => {
    const c = new Client();
    const r = await c.post("/api/auth/facebook", { accessToken: "EAAgood-token-for-framex-0001" });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.json.user.email, r.json.user.name, r.json.user.linked.facebook, r.json.user.hasPassword], ["ravi.fb@example.com", "Ravi Kumar", true, false]);
    const again = await new Client().post("/api/auth/facebook", { accessToken: "EAAgood-token-for-framex-0001" });
    assert.deepEqual([again.status, again.json.user.id], [200, r.json.user.id]);
  });

  test("a token from another app, an unknown token or no email is refused", async () => {
    for (const accessToken of ["EAAother-app-token-000000002", "EAAunknown-token-00000000004", "EAAno-email-token-0000000003"]) {
      const r = await new Client().post("/api/auth/facebook", { accessToken });
      assert.equal(r.status, 401, `${accessToken}: ${r.text}`);
    }
  });
});

/* ==========================================================================
   Staying logged in: run with "npm test" in backend/.
   A real server on a random port and an in-memory PostgreSQL.

   A login lasts until Log out. A session only runs out when it is NOT used
   for SESSION_TTL_DAYS: every visit gives it its full lifetime again (at most
   once a day). Logging out, a changed password or a disabled account still
   end it at once.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.AUTH_ALLOW_BEARER = "true";
delete process.env.SESSION_TTL_DAYS;

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");

let server;
let base;
const PASSWORD = "Sunrise-Frame-42";
const DAY = 24 * 60 * 60 * 1000;
const S = {};

const call = (method, url, { body, token, cookie } = {}) =>
  fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(token ? { Authorization: "Bearer " + token } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), cookies: r.headers.getSetCookie() }));
const session = async (id) => (await db.query("SELECT * FROM sessions WHERE id = $1", [id])).rows[0];
const daysLeft = (row) => (new Date(row.expires_at).getTime() - Date.now()) / DAY;
/** The renewal is written without holding the request up: give it a moment. */
const settled = async (id, test) => {
  for (let i = 0; i < 40; i++) {
    const row = await session(id);
    if (test(row)) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
  return session(id);
};

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const signup = await call("POST", "/api/auth/signup", { body: { name: "Asha Verma", email: "asha@example.com", phone: "9876500091", password: PASSWORD, confirmPassword: PASSWORD } });
  assert.equal(signup.status, 201);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("staying logged in", () => {
  test("a login is good for 90 days without a visit", async () => {
    assert.equal(config.sessionTtlDays, 90);
    const login = await call("POST", "/api/auth/login", { body: { identifier: "asha@example.com", password: PASSWORD } });
    assert.equal(login.status, 200);
    S.token = login.json.token;
    S.cookie = login.cookies.find((c) => c.startsWith(config.cookie.name + "=")).split(";")[0];
    S.id = (await db.query("SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1")).rows[0].id;
    const left = daysLeft(await session(S.id));
    assert.ok(left > 89.9 && left <= 90, `expires in ${left} days`);
  });

  test("a visit the same day changes nothing", async () => {
    const before = (await session(S.id)).expires_at.getTime();
    assert.equal((await call("GET", "/api/users/me", { token: S.token })).status, 200);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal((await session(S.id)).expires_at.getTime(), before);
  });

  test("a visit weeks later gives the session its full 90 days again (token and cookie)", async () => {
    // 80 days have passed since the login: 10 days are left.
    await db.query("UPDATE sessions SET expires_at = now() + interval '10 days', last_seen_at = now() - interval '3 days' WHERE id = $1", [S.id]);
    const viaToken = await call("GET", "/api/users/me", { token: S.token });
    assert.equal(viaToken.status, 200);
    let row = await settled(S.id, (r) => daysLeft(r) > 89);
    assert.ok(daysLeft(row) > 89.9, `renewed to ${daysLeft(row)} days`);
    assert.deepEqual(viaToken.cookies, [], "a token session sets no cookie");

    // The same with the cookie (a website on the backend's own address): the cookie's own expiry moves too.
    await db.query("UPDATE sessions SET expires_at = now() + interval '10 days' WHERE id = $1", [S.id]);
    const viaCookie = await call("GET", "/api/users/me", { cookie: S.cookie });
    assert.equal(viaCookie.status, 200);
    row = await settled(S.id, (r) => daysLeft(r) > 89);
    assert.ok(daysLeft(row) > 89.9);
    const renewed = viaCookie.cookies.find((c) => c.startsWith(S.cookie + ";"));
    assert.ok(renewed, "the same session cookie is sent again");
    const expires = new Date(/Expires=([^;]+)/i.exec(renewed)[1]).getTime();
    assert.ok((expires - Date.now()) / DAY > 89.9, "with the new expiry");
  });

  test("a session nobody used for 90 days has run out, and is not brought back", async () => {
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1", [S.id]);
    assert.equal((await call("GET", "/api/users/me", { token: S.token })).status, 401);
    assert.equal((await call("GET", "/api/auth/me", { token: S.token })).json.authenticated, false);
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(daysLeft(await session(S.id)) < 0, "still expired");
  });

  test("logging out ends the session at once, and no later visit brings it back", async () => {
    const login = await call("POST", "/api/auth/login", { body: { identifier: "asha@example.com", password: PASSWORD } });
    const id = (await db.query("SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1")).rows[0].id;
    await db.query("UPDATE sessions SET expires_at = now() + interval '10 days' WHERE id = $1", [id]);
    assert.equal((await call("POST", "/api/auth/logout", { token: login.json.token, body: {} })).status, 200);
    assert.equal((await call("GET", "/api/users/me", { token: login.json.token })).status, 401);
    await new Promise((r) => setTimeout(r, 150));
    assert.ok((await session(id)).revoked_at, "revoked");
    assert.equal((await call("GET", "/api/users/me", { token: login.json.token })).status, 401, "and still refused on the next visit");
    assert.equal((await call("GET", "/api/auth/me", { token: login.json.token })).json.authenticated, false);
  });

  test("a disabled account loses its session, however fresh", async () => {
    const login = await call("POST", "/api/auth/login", { body: { identifier: "asha@example.com", password: PASSWORD } });
    assert.equal((await call("GET", "/api/users/me", { token: login.json.token })).status, 200);
    await db.query("UPDATE users SET status = 'DISABLED' WHERE email = 'asha@example.com'");
    assert.equal((await call("GET", "/api/users/me", { token: login.json.token })).status, 401);
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE email = 'asha@example.com'");
  });

  test("the lifetime can be set, within sensible limits", async () => {
    const read = async (value) => {
      const { execFileSync } = await import("node:child_process");
      return execFileSync(process.execPath, ["--input-type=module", "-e", 'const { config } = await import("./src/config.js"); console.log(config.sessionTtlDays);'], { env: { ...process.env, SESSION_TTL_DAYS: value }, encoding: "utf8" }).trim();
    };
    assert.deepEqual([await read("30"), await read("0"), await read("5000")], ["30", "1", "400"]);
  });
});

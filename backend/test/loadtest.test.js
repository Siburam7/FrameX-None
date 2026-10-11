/* ==========================================================================
   The load-test key and the "how am I seen" check: run with "npm test".
   A real server on a random port and an in-memory PostgreSQL, with the
   request limits switched ON (the other test files run with them off).
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "true";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.TRUST_PROXY = "1";
process.env.LOAD_TEST_KEY = "a-key-for-this-test-only-0123456789";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { resetRateLimits } = await import("../src/lib/rate-limit.js");

let server;
let base;
const get = (url, headers = {}) => fetch(base + url, { headers }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
/** `count` requests, a few at a time. -> how many of each status */
async function burst(count, headers) {
  const seen = {};
  for (let i = 0; i < count; i += 25) {
    const batch = await Promise.all(Array.from({ length: Math.min(25, count - i) }, () => get("/api/config", headers)));
    batch.forEach((r) => (seen[r.status] = (seen[r.status] || 0) + 1));
  }
  return seen;
}

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

describe("load testing", () => {
  test("one address is limited to 300 requests a minute", async () => {
    resetRateLimits();
    assert.deepEqual(await burst(310), { 200: 300, 429: 10 });
  });

  test("requests that carry the server's key are let through that limit; a wrong or missing key is not", async () => {
    // the address is already over its limit from the test above
    assert.equal((await get("/api/config")).status, 429);
    assert.deepEqual(await burst(400, { "X-Load-Test": config.loadTestKey }), { 200: 400 });
    assert.equal((await get("/api/config", { "X-Load-Test": "a-key-for-this-test-only-012345678X" })).status, 429);
    assert.equal((await get("/api/config", { "X-Load-Test": "short" })).status, 429);
    assert.equal((await get("/api/config", { "X-Load-Test": "" })).status, 429);
  });

  test("the key opens nothing else: other limits and logins are as strict as ever", async () => {
    resetRateLimits();
    const headers = { "Content-Type": "application/json", "X-FrameX-Client": "test", "X-Load-Test": config.loadTestKey };
    const statuses = [];
    for (let i = 0; i < 14; i++) statuses.push((await fetch(base + "/api/auth/login", { method: "POST", headers, body: JSON.stringify({ identifier: "nobody@example.com", password: "Wrong-Password-1" }) })).status);
    assert.ok(statuses.includes(429), `wrong logins are still slowed down: ${statuses.join(",")}`);
    assert.ok(!statuses.includes(200));
    assert.equal((await get("/api/admin/overview", { "X-Load-Test": config.loadTestKey })).status, 401);
  });

  test("a key shorter than 24 characters is no key at all", async () => {
    const { execFileSync } = await import("node:child_process");
    const read = (value) => execFileSync(process.execPath, ["--input-type=module", "-e", 'const { config } = await import("./src/config.js"); console.log(JSON.stringify(config.loadTestKey));'], { env: { ...process.env, LOAD_TEST_KEY: value }, encoding: "utf8" }).trim();
    assert.deepEqual([read("too-short"), read(""), read("  exactly-twenty-four-char  ")], ['""', '""', '"exactly-twenty-four-char"']);
  });

  test("the server tells a caller how it sees them, shortened, and nothing about anyone else", async () => {
    resetRateLimits();
    const r = await get("/api/health/client", { "X-Forwarded-For": "203.0.113.77, 198.51.100.9", "CF-Connecting-IP": "203.0.113.77" });
    assert.equal(r.status, 200);
    // One trusted proxy: the caller is the last address in the list (what that proxy saw), not the first (which a caller can write themselves).
    assert.deepEqual(r.json, { seenAs: "198.51.x.x", connectedFrom: "127.0.x.x", forwardedFor: ["203.0.x.x", "198.51.x.x"], cfConnectingIp: "203.0.x.x", trueClientIp: null, trustProxy: 1, loadTestKey: true });
    assert.equal(JSON.stringify(r.json).includes(config.loadTestKey), false);
  });
});

/* ==========================================================================
   A pinger keeps the free host awake; the database still sleeps (F-04).
   Run with "npm test" in backend/.

   - GET /api/ping answers without the database and is not a visitor;
   - GET /api/health checks the database only while the site is used;
   - a background job that comes due during a quiet time waits, and runs once
     when the next visitor arrives.
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
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { isQuiet, markVisit, unlessQuiet, waitingJobs } = await import("../src/lib/activity.js");

let server;
let base;
let queries = 0;
const realQuery = db.query;

const get = async (url) => {
  const response = await fetch(base + url);
  return { status: response.status, json: await response.json().catch(() => null), cache: response.headers.get("cache-control") };
};
/** The database queries one call makes. */
async function queriesOf(fn) {
  const start = queries;
  const result = await fn();
  return { result, queries: queries - start };
}
const quietTime = () => markVisit(Date.now() - (config.quietAfterMinutes + 1) * 60 * 1000);

before(async () => {
  await initDb();
  await migrate();
  db.query = (text, params) => {
    queries += 1;
    return realQuery(text, params);
  };
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  db.query = realQuery;
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("the pinger keeps the server awake, the database can sleep", () => {
  test("a quiet time starts after 15 minutes without a visitor", () => {
    assert.equal(config.quietAfterMinutes, 15);
    markVisit(Date.now() - 14 * 60 * 1000);
    assert.equal(isQuiet(), false);
    markVisit(Date.now() - 16 * 60 * 1000);
    assert.equal(isQuiet(), true);
  });

  test("GET /api/ping answers without the database, is never cached, and is not a visitor", async () => {
    quietTime();
    const { result, queries: n } = await queriesOf(() => get("/api/ping"));
    assert.deepEqual([result.status, result.json, result.cache], [200, { ok: true }, "no-store"]);
    assert.equal(n, 0, "no database query");
    assert.equal(isQuiet(), true, "the pinger doesn't end a quiet time");
  });

  test("GET /api/health: while the site is used it checks the database; in a quiet time it leaves it asleep", async () => {
    markVisit();
    const used = await queriesOf(() => get("/api/health"));
    assert.deepEqual([used.result.status, used.result.json.ok, used.result.json.checked], [200, true, true]);
    assert.ok(used.queries >= 1);

    quietTime();
    const quiet = await queriesOf(() => get("/api/health"));
    assert.deepEqual([quiet.result.status, quiet.result.json.ok, quiet.result.json.checked], [200, true, false]);
    assert.equal(quiet.queries, 0, "no database query");
    assert.equal(isQuiet(), true, "the health check doesn't end a quiet time");
  });

  test("a job runs at once while the site is used", () => {
    markVisit();
    let runs = 0;
    unlessQuiet("test job", () => (runs += 1))();
    assert.equal(runs, 1);
    assert.deepEqual(waitingJobs(), []);
  });

  test("in a quiet time a job waits; the next visitor runs it once (however often it came due)", async () => {
    quietTime();
    let runs = 0;
    const timer = unlessQuiet("unpaid orders (test)", () => (runs += 1));
    timer();
    timer();
    timer();
    assert.equal(runs, 0, "nothing runs while nobody uses the site");
    assert.deepEqual(waitingJobs(), ["unpaid orders (test)"]);

    await get("/api/ping"); // the pinger is not a visitor
    assert.equal(runs, 0);

    assert.equal((await get("/api/config")).status, 200); // a visitor
    assert.equal(runs, 1);
    assert.deepEqual(waitingJobs(), []);
    assert.equal(isQuiet(), false);
  });
});

/* ==========================================================================
   Finding shops (owner, 2026-10-21). Run with "npm test" in backend/.

   - Without a location, "recommended": featured shops first (an admin's
     choice, e.g. a paid promotion, optionally until a day), then shops with
     something on sale; each group in an order that changes once a day.
   - With a location: nearest first, whatever is featured.
   - Every listed shop carries its rating (published reviews) and whether it
     is featured; never when the promotion ends or who set it.
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
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { indiaDay, listPublicShops } = await import("../src/services/shop-service.js");

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
const admin = new Client();
const visitor = new Client();
// name, city, latitude, longitude, catalogue link (shop-002 has products in the catalogue file)
const SHOPS = [
  ["Asha Frames", "Dhenkanal", 20.66, 85.6, "shop-002"],
  ["Bina Frames", "Cuttack", 20.46, 85.88, null],
  ["Chitra Frames", "Bhubaneswar", 20.3, 85.82, null],
  ["Deepa Frames", "Puri", 19.81, 85.83, null],
  ["Esha Frames", "Angul", 20.84, 85.1, null],
  ["Fatima Frames", "Sambalpur", 21.47, 83.97, null]
];
const S = { ids: {}, codes: {} };
const codes = (items) => items.map((s) => s.shopCode);

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  S.userId = newId();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Ravi', 'ravi@example.com', $2, 'CUSTOMER', 'ACTIVE')", [S.userId, await hashPassword(PASSWORD)]);
  let n = 2001;
  for (const [name, city, lat, lng, ref] of SHOPS) {
    const id = newId();
    const code = `FRX-SHOP-${n++}`;
    await db.query(
      `INSERT INTO shops (id, shop_code, catalog_ref, name, phone, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
       VALUES ($1, $2, $3, $4, '+919876511111', $5, 'Odisha', '759001', $6, $7, 'APPROVED', 'ACTIVE', now())`,
      [id, code, ref, name, city, lat, lng]
    );
    S.ids[name] = id;
    S.codes[name] = code;
  }
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("finding shops: recommended, featured, nearest, ratings", () => {
  test("the day is India's (it changes at midnight IST, not UTC)", () => {
    assert.equal(indiaDay(new Date("2026-10-20T18:29:00Z")), "2026-10-20");
    assert.equal(indiaDay(new Date("2026-10-20T18:31:00Z")), "2026-10-21");
  });

  test("recommended: a shop with something on sale first; the order holds all day and changes on other days", async () => {
    const day = "2026-10-21";
    const once = codes((await listPublicShops({ limit: 20, day })).items);
    assert.equal(once.length, SHOPS.length);
    assert.equal(once[0], S.codes["Asha Frames"], "the only shop with products on sale leads");
    assert.deepEqual(codes((await listPublicShops({ limit: 20, day })).items), once, "same day, same order");
    const days = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];
    const others = await Promise.all(days.map(async (d) => codes((await listPublicShops({ limit: 20, day: d })).items).join()));
    assert.ok(others.some((o) => o !== once.join()), "another day, another order");
    // The public list is today's order
    assert.deepEqual(codes((await visitor.get("/api/shops?limit=20")).json.items), codes((await listPublicShops({ limit: 20 })).items));
  });

  test("an admin features a shop: it comes first, with featured: true; the end day is not public", async () => {
    const name = "Fatima Frames";
    const r = await admin.post(`/api/admin/shops/${S.ids[name]}/featured`, { featured: true, until: "" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.shop.featuredOn, r.json.shop.featured, r.json.shop.featuredUntil], [true, true, null]);
    const list = (await visitor.get("/api/shops?limit=3")).json.items;
    assert.equal(list[0].shopCode, S.codes[name]);
    assert.equal(list[0].featured, true);
    assert.ok(list.slice(1).every((s) => s.featured === false));
    assert.ok(!/featuredUntil|featured_until|featuredOn/.test(JSON.stringify(list)), "not public");
    const one = (await visitor.get(`/api/shops/${S.codes[name]}`)).json.shop;
    assert.equal(one.featured, true);
  });

  test("until a day: featured through that day; a past day is refused; once it has passed, the shop is not first", async () => {
    const name = "Fatima Frames";
    const yesterday = indiaDay(new Date(Date.now() - 86400000));
    assert.equal((await admin.post(`/api/admin/shops/${S.ids[name]}/featured`, { featured: true, until: yesterday })).status, 422);
    assert.equal((await admin.post(`/api/admin/shops/${S.ids[name]}/featured`, { featured: true, until: "31-12-2026" })).status, 422);
    const today = indiaDay();
    const r = await admin.post(`/api/admin/shops/${S.ids[name]}/featured`, { featured: true, until: today });
    assert.equal(r.status, 200, r.text);
    assert.ok(new Date(r.json.shop.featuredUntil).getTime() > Date.now());
    assert.equal((await visitor.get("/api/shops?limit=1")).json.items[0].shopCode, S.codes[name]);
    // The promotion ran out
    await db.query("UPDATE shops SET featured_until = now() - interval '1 minute' WHERE id = $1", [S.ids[name]]);
    const list = (await visitor.get("/api/shops?limit=20")).json.items;
    assert.equal(list.find((s) => s.shopCode === S.codes[name]).featured, false);
    assert.equal(list[0].shopCode, S.codes["Asha Frames"]);
    // Switched off
    const off = await admin.post(`/api/admin/shops/${S.ids[name]}/featured`, { featured: false });
    assert.deepEqual([off.json.shop.featuredOn, off.json.shop.featuredUntil], [false, null]);
  });

  test("only FrameX staff can feature a shop, and it is in the audit log", async () => {
    assert.equal((await visitor.post(`/api/admin/shops/${S.ids["Bina Frames"]}/featured`, { featured: true })).status, 401);
    const { rows } = await db.query("SELECT target_id, metadata FROM audit_logs WHERE action = 'SHOP_FEATURED' ORDER BY created_at");
    assert.ok(rows.length >= 3);
    assert.equal(rows[0].target_id, S.codes["Fatima Frames"]);
  });

  test("with a location: nearest first, whatever is featured", async () => {
    assert.equal((await admin.post(`/api/admin/shops/${S.ids["Fatima Frames"]}/featured`, { featured: true })).status, 200);
    const near = (await visitor.get("/api/shops?lat=20.65&lng=85.6&limit=3")).json.items;
    assert.deepEqual(codes(near), [S.codes["Asha Frames"], S.codes["Bina Frames"], S.codes["Chitra Frames"]]);
    assert.ok(near[0].distanceKm < near[1].distanceKm && near[1].distanceKm < near[2].distanceKm);
    const nearby = (await visitor.get("/api/shops/nearby?lat=20.65&lng=85.6&radius=50")).json.items;
    assert.equal(nearby[0].shopCode, S.codes["Asha Frames"]);
    assert.ok(nearby.every((s) => "featured" in s && "rating" in s));
    await admin.post(`/api/admin/shops/${S.ids["Fatima Frames"]}/featured`, { featured: false });
  });

  test("ratings: the published reviews of the shop (hidden ones don't count); none = null", async () => {
    const code = S.codes["Chitra Frames"];
    for (const [rating, status, source] of [[5, "PUBLISHED", "FX-1"], [4, "PUBLISHED", "FX-2"], [1, "HIDDEN", "FX-3"]]) {
      await db.query("INSERT INTO reviews (id, user_id, target_type, target_id, source_type, source_id, rating, body, author_name, status) VALUES ($1, $2, 'SHOP', $3, 'ORDER', $4, $5, '', 'Ravi', $6)", [newId(), S.userId, code, source, rating, status]);
    }
    const list = (await visitor.get("/api/shops?limit=20")).json.items;
    assert.deepEqual(list.find((s) => s.shopCode === code).rating, { average: 4.5, count: 2 });
    assert.equal(list.find((s) => s.shopCode === S.codes["Deepa Frames"]).rating, null);
    assert.deepEqual((await visitor.get(`/api/shops/${code}`)).json.shop.rating, { average: 4.5, count: 2 });
  });

  test("searching by name, city or PIN code still works", async () => {
    assert.deepEqual(codes((await visitor.get("/api/shops?q=chitra")).json.items), [S.codes["Chitra Frames"]]);
    assert.deepEqual(codes((await visitor.get("/api/shops?q=puri")).json.items), [S.codes["Deepa Frames"]]);
    assert.equal((await visitor.get("/api/shops?q=759001")).json.total, SHOPS.length);
    assert.equal((await visitor.get("/api/shops?q=nowhere-town")).json.total, 0);
  });
});

/* ==========================================================================
   Admin -> Promotions (owner, 2026-10-26). Run with "npm test".

   The home banners and the promotion strips come from the database: the
   website asks GET /api/promotions; only an admin can add, change, order,
   switch off or delete them, and upload their pictures (made into a WebP no
   wider than the place needs).
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
const { default: sharp } = await import("sharp");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const storage = await import("../src/lib/storage.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, url, body, headers = {}) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": raw ? "image/png" : "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
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
  patch = (url, body = {}) => this.request("PATCH", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const admin = new Client();
const customer = new Client();
const visitor = new Client();
const S = {};
const png = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 30 } } }).png().toBuffer();
const ymd = (days) => new Date(Date.now() + days * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Promo Admin', 'promo.admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  assert.equal((await admin.post("/api/auth/login", { identifier: "promo.admin@framex.example", password: PASSWORD })).status, 200);
  assert.equal((await customer.post("/api/auth/signup", { name: "Asha Verma", email: "asha.promo@example.com", phone: "9876500081", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("Promotions", () => {
  test("the website gets today's banners and strips (the 11 already on the site), in order", async () => {
    const r = await visitor.get("/api/promotions");
    assert.equal(r.status, 200);
    const banners = r.json.items.filter((i) => i.placement === "home-banners");
    assert.equal(r.json.items.length, 11);
    assert.deepEqual(banners.map((b) => b.link), ["shop.html", "wall-art-studio.html", "shop.html?category=gifts#collection", "#shops", "home-decor.html"]);
    assert.deepEqual(banners[0].hide, { coupon: "XUSE10" });
    assert.deepEqual(banners[1].hide, { feature: "firstOrderFree" });
    assert.match(banners[0].laptop, /^assets\/img\/home\/banners\/banner-1-diwali-laptop\.webp$/);
    assert.ok(!("active" in banners[0]), "visitors don't see the admin's details");
  });

  test("only an admin can manage them", async () => {
    assert.equal((await visitor.get("/api/admin/promotions")).status, 401);
    assert.equal((await customer.get("/api/admin/promotions")).status, 403);
    assert.equal((await customer.post("/api/admin/promotions", { placement: "home-after-banners", title: "Hack", link: "shop.html" })).status, 403);
    const list = await admin.get("/api/admin/promotions");
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 11);
    assert.equal(list.json.placements["home-banners"].laptop[0], 2400);
  });

  test("a new strip: checked, then shown only once it has a picture", async () => {
    const bad = await admin.post("/api/admin/promotions", { placement: "nowhere", title: "x", link: "javascript:alert(1)", startsOn: "2026-11-10", endsOn: "2026-11-01" });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["link", "placement", "title"].sort());
    const dates = await admin.post("/api/admin/promotions", { placement: "home-after-banners", title: "Sale strip", link: "shop.html", startsOn: "2026-11-10", endsOn: "2026-11-01" });
    assert.ok(dates.json.error.fields.endsOn);
    const made = await admin.post("/api/admin/promotions", { placement: "home-after-banners", title: "Festive sale: 15% off frames", link: "https://shopframex.in/shop.html", hideWhen: "coupon:fest15" });
    assert.equal(made.status, 201, made.text);
    S.id = made.json.promotion.id;
    assert.deepEqual([made.json.promotion.state, made.json.promotion.hideWhen, made.json.promotion.position], ["NO_PICTURE", "COUPON:FEST15", 2]);
    assert.ok(!(await visitor.get("/api/promotions")).json.items.some((i) => i.id === S.id), "no picture yet: not on the website");
  });

  test("its picture is made into a WebP no wider than the place needs; the phone uses it too until it has its own", async () => {
    const up = await admin.request("POST", `/api/admin/promotions/${S.id}/picture/laptop`, await png(3000, 375));
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.warning, null, "the right shape: no warning");
    const shown = (await visitor.get("/api/promotions")).json.items.find((i) => i.id === S.id);
    assert.match(shown.laptop, new RegExp(`^/media/promo/${S.id}/laptop\\?v=\\d+$`));
    assert.equal(shown.phone, shown.laptop);
    const file = await fetch(base + shown.laptop);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(file.headers.get("content-type"), "image/webp");
    const meta = await sharp(bytes).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 2400, 300]);
    // a picture of a very different shape is kept, with a warning
    const odd = await admin.request("POST", `/api/admin/promotions/${S.id}/picture/phone`, await png(800, 800));
    assert.match(odd.json.warning, /800 × 800/);
    const phone = (await visitor.get("/api/promotions")).json.items.find((i) => i.id === S.id).phone;
    assert.match(phone, /\/phone\?v=/);
    S.keys = (await db.query("SELECT laptop_key, phone_key FROM promotions WHERE id = $1", [S.id])).rows[0];
    // not a picture
    assert.equal((await admin.request("POST", `/api/admin/promotions/${S.id}/picture/laptop`, Buffer.from("<svg onload=alert(1)>"))).status, 415);
    assert.equal((await customer.request("POST", `/api/admin/promotions/${S.id}/picture/laptop`, await png(100, 20))).status, 403);
  });

  test("switched off, not started yet or ended: not on the website", async () => {
    const on = async () => (await visitor.get("/api/promotions")).json.items.some((i) => i.id === S.id);
    assert.equal((await admin.patch(`/api/admin/promotions/${S.id}`, { active: false })).json.promotion.state, "OFF");
    assert.equal(await on(), false);
    assert.equal((await admin.patch(`/api/admin/promotions/${S.id}`, { active: true, startsOn: ymd(3) })).json.promotion.state, "SCHEDULED");
    assert.equal(await on(), false);
    assert.equal((await admin.patch(`/api/admin/promotions/${S.id}`, { startsOn: ymd(-5), endsOn: ymd(-1) })).json.promotion.state, "ENDED");
    assert.equal(await on(), false);
    assert.equal((await admin.patch(`/api/admin/promotions/${S.id}`, { startsOn: "", endsOn: ymd(0) })).json.promotion.state, "LIVE", "the last day still counts");
    assert.equal(await on(), true);
  });

  test("moved up and down in its place", async () => {
    const order = async () => (await visitor.get("/api/promotions")).json.items.filter((i) => i.placement === "home-after-banners").map((i) => i.id);
    assert.equal((await order())[1], S.id);
    await admin.post(`/api/admin/promotions/${S.id}/move`, { direction: "up" });
    assert.equal((await order())[0], S.id);
    await admin.post(`/api/admin/promotions/${S.id}/move`, { direction: "up" }); // already first: nothing changes
    assert.equal((await order())[0], S.id);
    await admin.post(`/api/admin/promotions/${S.id}/move`, { direction: "down" });
    assert.equal((await order())[1], S.id);
  });

  test("deleted: gone from the website, its pictures removed, and the change is in the activity log", async () => {
    assert.ok(await storage.exists(S.keys.laptop_key));
    const r = await admin.del(`/api/admin/promotions/${S.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 11);
    assert.equal(await storage.exists(S.keys.laptop_key), false);
    assert.equal(await storage.exists(S.keys.phone_key), false);
    assert.equal((await fetch(`${base}/media/promo/${S.id}/laptop`)).status, 404);
    const logged = (await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'PROMOTION_CHANGED' AND target_id = $1", [S.id])).rows[0].n;
    assert.ok(logged >= 5);
  });
});

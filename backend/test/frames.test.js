/* ==========================================================================
   The simple "Add a frame" (owner, 2026-10-27). Run with "npm test".

   A shop (or the FrameX admin for any shop) uploads the frame's FRONT
   picture: the server removes the plain background outside it and the photo
   space inside it, and finds that space. The frame is saved with its model
   photos, its front and its layers; customers get the front's address; the
   admin can add, edit and publish a frame for any shop.
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
process.env.PRODUCT_MODERATION = "true";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { default: sharp } = await import("sharp");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, url, body, type) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": raw ? type || "image/jpeg" : "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) },
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
    return { status: response.status, json, text, headers: response.headers };
  }
  get = (url) => this.request("GET", url);
  put = (url, body) => this.request("PUT", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const admin = new Client();
const shop = new Client();
const other = new Client();
const S = {};

/** An empty frame photographed on a plain wall: a dark border with a cream mat, the wall showing inside. */
async function framePhoto() {
  const wall = { r: 226, g: 220, b: 210 };
  const W = 1200;
  const H = 1500;
  const svg = `<svg width="${W}" height="${H}"><rect x="200" y="200" width="800" height="1100" fill="#4a3322"/><rect x="270" y="270" width="660" height="960" fill="#f3eee4"/><rect x="340" y="340" width="520" height="820" fill="rgb(${wall.r},${wall.g},${wall.b})"/></svg>`;
  return sharp({ create: { width: W, height: H, channels: 3, background: wall } }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 92 }).toBuffer();
}
const photo = (w = 1200, h = 1500) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 160, b: 200 } } }).jpeg().toBuffer();

async function makeShop(client, name) {
  const id = newId();
  const code = "FRX-SHOP-" + (await db.query("SELECT nextval('shop_code_seq')::int AS n")).rows[0].n;
  await db.query(
    `INSERT INTO shops (id, shop_code, name, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, $2, $3, 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', 'ACTIVE', now())`,
    [id, code, name]
  );
  const email = `${code.toLowerCase()}@shops.example`;
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id, password_changed_at) VALUES ($1, $2, $3, $4, 'SHOP', 'ACTIVE', $5, now())", [newId(), name + " owner", email, await hashPassword(PASSWORD), id]);
  assert.equal((await client.request("POST", "/api/auth/login", { identifier: email, password: PASSWORD, accountType: "shop" })).status, 200);
  return { id, code };
}

/** A frame as the simple editor sends it. */
const frame = (over = {}) => ({
  name: "Modern Oak Wall Frame",
  productType: "photo-frame",
  category: "photo-frames",
  personalization: { photos: 1 },
  frame: { type: "modern", material: "Wood", color: "natural-wood" },
  protection: { options: [{ id: "glass", priceModifier: 0, description: "" }], default: "glass" },
  sizes: [{ id: "sz-a", label: "8 × 10 in", width: 8, height: 10, unit: "in", price: 449 }, { id: "sz-b", label: "12 × 16 in", width: 12, height: 16, unit: "in", price: 699 }],
  pricing: { basePrice: 449, discountPercent: 0 },
  componentOrder: "own",
  components: [{ id: "c1", type: "frame", name: "Frame", material: "Natural oak" }, { id: "c2", type: "glass", name: "Front cover", material: "Glass" }],
  ...over
});

before(async () => {
  await initDb();
  await migrate();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Frames Admin', 'frames.admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.request("POST", "/api/auth/login", { identifier: "frames.admin@framex.example", password: PASSWORD })).status, 200);
  S.shop = await makeShop(shop, "Oak & Co Frames");
  S.other = await makeShop(other, "Other Frames");
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("Frame front picture", () => {
  test("a frame on a plain wall: background and photo space removed, the space found", async () => {
    const r = await shop.request("POST", `/api/shops/${S.shop.code}/media/frame-art`, await framePhoto());
    assert.equal(r.status, 201, r.text);
    const m = r.json.media;
    assert.equal(m.removedBackground, true);
    assert.ok(m.opening, "the photo space was found");
    // the space is the inside of the mat: 140 / 800 from the left, 520 / 800 wide (the frame is cut to its edges)
    assert.ok(Math.abs(m.opening.x - 140 / 800) < 0.02 && Math.abs(m.opening.w - 520 / 800) < 0.02, JSON.stringify(m.opening));
    assert.ok(Math.abs(m.opening.y - 140 / 1100) < 0.02 && Math.abs(m.opening.h - 820 / 1100) < 0.02, JSON.stringify(m.opening));
    assert.deepEqual([m.width, m.height], [800, 1100]);
    S.front = m;
    // the picture: transparent outside and inside, the frame itself kept
    const file = await fetch(`${base}/media/${m.id}`, { headers: { Origin: "http://localhost:5500" } });
    assert.equal(file.headers.get("access-control-allow-origin"), "http://localhost:5500", "the website may draw it on a canvas");
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    assert.equal(alpha(Math.round(info.width / 2), Math.round(info.height / 2)), 0, "the photo space is transparent");
    assert.equal(alpha(10, 10), 255, "the frame is kept");
    assert.equal(alpha(100, 100), 255, "the mat is kept");
  });

  test("a PNG kept as it is ('keep'), and a picture that isn't one is refused", async () => {
    const png = await sharp(await framePhoto()).png().toBuffer();
    const kept = await shop.request("POST", `/api/shops/${S.shop.code}/media/frame-art?mode=keep`, png, "image/png");
    assert.equal(kept.status, 201, kept.text);
    assert.equal(kept.json.media.removedBackground, false);
    assert.equal((await shop.request("POST", `/api/shops/${S.shop.code}/media/frame-art`, Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).status, 415);
    assert.equal((await other.request("POST", `/api/shops/${S.shop.code}/media/frame-art`, await framePhoto())).status, 403, "only the shop itself");
  });
});

describe("A frame with its front", () => {
  test("saved by the shop with model photos, front and layers; customers get the front's address", async () => {
    const view = await shop.request("POST", `/api/shops/${S.shop.code}/media`, await photo());
    assert.equal(view.status, 201, view.text);
    const id = "lp-frametest01";
    const body = frame({ views: [{ id: "v1", url: view.json.media.ref, type: "PHOTO", alt: "Oak frame on a wall", isMain: true }], frameArt: { front: S.front.ref, frontSize: { w: 800, h: 1100 }, opening: S.front.opening, wall: "", modelOnly: false }, status: "published" });
    const r = await shop.put(`/api/shops/${S.shop.code}/products/${id}`, body);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.product.status, "pending_review", "FrameX checks it first");
    assert.deepEqual(r.json.product.frameArt.opening, S.front.opening);
    assert.deepEqual(r.json.product.components.map((c) => c.name), ["Frame", "Front cover"]);
    S.id = id;
    // another shop's picture can't be used
    const stolen = await other.put(`/api/shops/${S.other.code}/products/lp-frametest02`, frame({ frameArt: { front: S.front.ref, opening: S.front.opening }, status: "draft" }));
    assert.equal(stolen.status, 422);
  });

  test("a front without its photo space can't be published", async () => {
    const r = await shop.put(`/api/shops/${S.shop.code}/products/lp-frametest03`, frame({ views: [], frameArt: { front: S.front.ref, opening: null }, status: "published" }));
    assert.equal(r.status, 422);
    assert.ok(r.json.error.details.issues.some((i) => /customer's photo goes/.test(i.message)), JSON.stringify(r.json.error.details.issues));
  });
});

describe("The admin, for any shop", () => {
  test("all frames, filtered by shop, with the front / price summary", async () => {
    assert.equal((await shop.get("/api/admin/products")).status, 403);
    const r = await admin.get(`/api/admin/products?shop=${S.shop.id}`);
    assert.equal(r.status, 200);
    const row = r.json.items.find((x) => x.id === S.id);
    assert.deepEqual([row.shopId, row.hasFront, row.sizes, row.priceFrom, row.priceTo, row.status], [S.shop.id, true, 2, 449, 699, "pending_review"]);
    assert.ok(!(await admin.get(`/api/admin/products?shop=${S.other.id}`)).json.items.some((x) => x.id === S.id));
  });

  test("the admin adds a frame for a shop and publishes it at once; the shop sees it and can edit it", async () => {
    const pic = await admin.request("POST", `/api/admin/shops/${S.other.id}/media`, await photo());
    assert.equal(pic.status, 201, pic.text);
    const front = await admin.request("POST", `/api/admin/shops/${S.other.id}/media/frame-art`, await framePhoto());
    assert.equal(front.status, 201, front.text);
    const id = "lp-adminframe01";
    const r = await admin.put(`/api/admin/shops/${S.other.id}/products/${id}`, frame({ name: "Walnut Classic", views: [{ id: "v1", url: pic.json.media.ref, type: "PHOTO", alt: "Walnut frame", isMain: true }], frameArt: { front: front.json.media.ref, opening: front.json.media.opening }, status: "published" }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.product.status, "published", "the admin is the reviewer");
    const own = await other.get(`/api/shops/${S.other.code}/products/${id}`);
    assert.equal(own.status, 200);
    assert.equal(own.json.product.name, "Walnut Classic");
    // customers: on sale, with the front as a /media address
    const live = (await new Client().get("/api/catalog/shop-products")).json;
    const p = (live.items || live.products || []).find((x) => x.id === id);
    assert.ok(p, "on sale");
    assert.match(p.frameArt.front, /^\/media\/[0-9a-f-]{36}$/);
    // the admin can't save into a shop that doesn't exist
    assert.equal((await admin.put(`/api/admin/shops/${newId()}/products/lp-adminframe02`, frame({ status: "draft" }))).status, 403);
  });
});

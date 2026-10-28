/* ==========================================================================
   The easy "Add artwork" (owner, 2026-10-27). Run with "npm test".

   An artist sends an artwork with several sizes (each with its price), the
   delivery time and the original photo it was drawn from (buyers compare the
   two: Before / After). FrameX approves it; buyers then see the sizes, the
   delivery time and the original photo, and the cart prices the chosen size.
   The admin can add and publish an artwork for any artist.
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
    return { status: response.status, json, text };
  }
  get = (url) => this.request("GET", url);
  post = (url, body = {}) => this.request("POST", url, body);
  put = (url, body) => this.request("PUT", url, body);
}

const PASSWORD = "Sunrise-Frame-42";
const admin = new Client();
const artist = new Client();
const buyer = new Client();
const S = {};
const photo = (w = 1200, h = 1500) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 60, g: 110, b: 170 } } }).jpeg().toBuffer();
const body = (over = {}) => ({
  title: "River at Dusk",
  artType: "painting",
  medium: "Acrylic on canvas",
  kind: "PRINT",
  stock: 20,
  description: "The river near Cuttack in the evening.",
  sizes: [{ width: 12, height: 16, price: 1499 }, { width: 18, height: 24, price: 2499 }],
  delivery: { readyDays: 2, transitMin: 3, transitMax: 6, packing: "tube", shipsFrom: "Cuttack, Odisha" },
  images: [S.pic],
  ...over
});

before(async () => {
  await initDb();
  await migrate();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Art Admin', 'art.admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "art.admin@framex.example", password: PASSWORD })).status, 200);
  const made = await admin.post("/api/admin/artists", { artist: { name: "Ravi Sahu", city: "Cuttack", state: "Odisha", styles: ["Landscape"], mediums: ["Acrylic"] }, accountEmail: "ravi.steps@art.example" });
  assert.equal(made.status, 201, made.text);
  S.artistUuid = made.json.artist.uuid;
  const token = made.json.credentials.setupUrl.split("#token=")[1];
  assert.equal((await new Client().post("/api/auth/reset-password", { token, password: PASSWORD, confirmPassword: PASSWORD })).status, 200);
  assert.equal((await artist.post("/api/auth/login", { identifier: "ravi.steps@art.example", password: PASSWORD })).status, 200);
  assert.equal((await buyer.post("/api/auth/signup", { name: "Asha Verma", email: "asha.art@example.com", phone: "9876500091", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  S.pic = (await artist.request("POST", "/api/artist/media", await photo())).json.media.ref;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("Add artwork: sizes, delivery, Before / After", () => {
  test("the original photo: shown only when the artist may show it; never one of the artwork's pictures", async () => {
    S.ref = (await artist.request("POST", "/api/artist/media", await photo(1600, 1200))).json.media.ref;
    const noTick = await artist.put("/api/artist/artworks/aw-steps0009", body({ reference: { media: S.ref, consent: false } }));
    assert.equal(noTick.status, 422);
    assert.match(noTick.json.error.fields.reference, /may show/);
    const notMine = await artist.put("/api/artist/artworks/aw-steps0009", body({ reference: { media: "media:0f0f0f0f-0000-4000-8000-000000000000", consent: true } }));
    assert.equal(notMine.status, 422);
    const none = await artist.put("/api/artist/artworks/aw-steps0009", body({ title: "From Memory", reference: { media: null, imagination: true } }));
    assert.equal(none.status, 200, none.text);
    assert.deepEqual([none.json.artwork.reference, none.json.artwork.imagination], ["", true]);
  });

  test("an artist sends prints in two sizes with the delivery time; checked fields", async () => {
    const bad = await artist.put("/api/artist/artworks/aw-steps0001", body({ sizes: [{ width: 0, height: 16, price: 1499 }], delivery: { readyDays: 2, transitMin: 6, transitMax: 3 } }));
    assert.equal(bad.status, 422);
    assert.ok(bad.json.error.fields.sizes && bad.json.error.fields.delivery, JSON.stringify(bad.json.error.fields));
    const r = await artist.put("/api/artist/artworks/aw-steps0001", body({ reference: { media: S.ref, consent: true } }));
    assert.equal(r.status, 200, r.text);
    const w = r.json.artwork;
    assert.deepEqual([w.status, w.price, w.sizes.map((s) => [s.label, s.price]), w.delivery.transitMax, w.referenceRef, w.images.length], ["PENDING_REVIEW", 1499, [["12 × 16 in", 1499], ["18 × 24 in", 2499]], 6, S.ref, 1]);
    assert.match(w.deliveryText, /Ready to send in 2 days, then 3–6 days on the way \(usually 5–8 days in all\)\. Rolled in a tube, from Cuttack, Odisha\./);
    // an original has exactly one size
    const one = await artist.put("/api/artist/artworks/aw-steps0002", body({ title: "Morning Light", kind: "ORIGINAL", stock: 1, sizes: [{ width: 18, height: 24, price: 8500 }, { width: 24, height: 36, price: 12000 }] }));
    assert.deepEqual([one.status, one.json.artwork.sizes.length, one.json.artwork.price], [200, 1, 8500]);
  });

  test("approved: buyers see the sizes, the delivery time and the original photo; the cart prices the chosen size", async () => {
    assert.equal((await admin.post("/api/admin/artworks/aw-steps0001/review", { decision: "APPROVED" })).status, 200);
    const pub = (await new Client().get("/api/artworks/aw-steps0001")).json.artwork;
    assert.deepEqual([pub.sizes.length, pub.delivery.readyDays], [2, 2]);
    assert.equal(pub.reference, `/media/${S.ref.slice(6)}`);
    assert.equal(pub.images.length, 1, "the original photo is not one of the artwork's pictures");
    assert.equal((await fetch(base + pub.reference)).status, 200);
    const big = await buyer.post("/api/cart/items", { productId: "aw-steps0001", quantity: 1, selection: { sizeId: "s2" } });
    assert.equal(big.status, 201, big.text);
    const line = big.json.cart.items.find((i) => i.productId === "aw-steps0001");
    assert.equal(line.unitPrice, 2499, "the larger print's price");
  });

  test("the admin lists the artworks of one artist and adds one for them, published at once", async () => {
    const list = await admin.get(`/api/admin/artworks?artist=${S.artistUuid}`);
    assert.equal(list.status, 200);
    assert.ok(list.json.items.every((w) => w.artistId === S.artistUuid) && list.json.items.length === 3);
    assert.equal((await artist.get(`/api/admin/artworks`)).status, 403);
    const pic = await admin.request("POST", `/api/admin/artists/${S.artistUuid}/media`, await photo());
    assert.equal(pic.status, 201, pic.text);
    const r = await admin.put(`/api/admin/artists/${S.artistUuid}/artworks/aw-steps0003`, body({ title: "Temple Steps", images: [pic.json.media.ref], publish: true }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.artwork.status, "APPROVED", "FrameX is the reviewer");
    assert.equal((await artist.get("/api/artist/artworks/aw-steps0003")).json.artwork.title, "Temple Steps", "the artist sees it as their own");
    assert.equal((await new Client().get("/api/artworks/aw-steps0003")).status, 200, "live");
  });
});

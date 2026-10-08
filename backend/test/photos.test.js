/* ==========================================================================
   Customer photos, gift wrapping, shop fulfilment and shop products:
   run with "npm test" in backend/.

   A real server, an in-memory PostgreSQL, real HTTP and real files (in a
   throw-away folder). The stand-in payment gateway is the one the checkout
   tests use. The numbered tests follow the list in the brief:

      1  photo frame without a photo           -> refused, with a clear message
      2  photo frame with a photo              -> cart, checkout, order; the ORIGINAL stays with the order
      3  custom frame (FrameX Studio)          -> upload, customise, cart, checkout
      4  Home Decor                            -> no photo needed
      5  3-photo template with 2 photos        -> refused
      6  3-photo template with 3 photos        -> cart, checkout
      7  gift wrapping yes                     -> the charge is shown and stored
      8  gift wrapping no                      -> no charge
      9  a shop sells a Photo Frame            -> the customer's photo is required
     10  a shop sells Home Decor               -> no photo is asked for
     11  the shop that makes an order line     -> gets the correct original
     12  another shop (or anyone else)         -> is refused
     13  online payment (Razorpay)             -> still works, gift wrap included in the amount
     14  Cash on Delivery                      -> still works
   ========================================================================== */
import { createMockRazorpay } from "./support/mock-razorpay.js";

const mock = await createMockRazorpay().listen();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.PAYMENT_MODE = "test";
process.env.RAZORPAY_KEY_ID = mock.keyId;
process.env.RAZORPAY_KEY_SECRET = mock.keySecret;
process.env.RAZORPAY_WEBHOOK_SECRET = mock.webhookSecret;
process.env.RAZORPAY_API_BASE = mock.url;
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.COD_FEE = "40";
process.env.COD_MAX_ORDER_VALUE = "0";
process.env.GIFT_WRAP_ENABLED = "true";
process.env.GIFT_WRAP_FEE = "75";
process.env.UPLOAD_MAX_MB = "2"; // small, so "too large" can be tested quickly
process.env.PRODUCT_MODERATION = "false";

const { default: assert } = await import("node:assert/strict");
const { default: crypto } = await import("node:crypto");
const { default: fs } = await import("node:fs");
const { default: path } = await import("node:path");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { makeFileToken } = await import("../src/lib/file-links.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { sweepUnusedMedia } = await import("../src/services/shop-product-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { sweepUnusedUploads } = await import("../src/services/upload-service.js");
const { jpeg, png, webp, uploadPhoto, uploadMany } = await import("./support/photos.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body, headers = {}) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + url, {
      method,
      headers: { ...(raw ? {} : { "Content-Type": "application/json" }), "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
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
  post = (url, body = {}, headers) => this.request("POST", url, body, headers);
  put = (url, body = {}) => this.request("PUT", url, body);
  patch = (url, body = {}) => this.request("PATCH", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const person = (name, n) => ({ name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: `98765000${n}`, password: PASSWORD, confirmPassword: PASSWORD });
const ADDRESS = { fullName: "Asha Verma", phone: "98765 00041", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const asha = new Client();
const binod = new Client();
const visitor = new Client();
const admin = new Client();
const shopB = new Client(); // linked to the catalogue's "shop-002"
const shopC = new Client(); // linked to the catalogue's "shop-003"
const shopN = new Client(); // a new shop with no catalogue link: everything it sells, it created itself
const S = {};

const { seed, model, studio, templates: templateEngine } = siteEngine();
const product = (id) => model.normalize(seed.products.find((p) => p.id === id));
const FRAME = product("p-005"); // The Royal Arch, sold by shop-002
const FRAME_C = product("p-009"); // Nordic Oak, sold by shop-003
const SET_OF_4 = product("p-016");
const COLLAGE = product("p-013");
const ACCESSORY = product("p-017");
const WALL_ART = product("hd-never-give-up");
const TEMPLATE = seed.templates.find((t) => t.photosRequired === 3 && t.available !== false);

const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const row = async (sql, params) => (await db.query(sql, params)).rows[0];
const lines = (r) => r.json.cart.items;
const empty = async (client) => assert.equal((await client.del("/api/cart")).status, 200);
const upload = async (client, options) => {
  const r = await uploadPhoto(base, client, options);
  assert.equal(r.status, 201, r.text);
  return r.json.upload;
};
/** Follow a signed link and return the bytes. */
async function download(link, client = null) {
  const response = await fetch(`${base}/api${link.path}`, { headers: client && client.cookie ? { Cookie: client.cookie } : {} });
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
}
const quoteFor = async (client, { method = "COD", giftWrap = false } = {}) => (await client.get(`/api/checkout/quote?addressId=${S.home}&paymentMethod=${method}${giftWrap ? "&giftWrap=true" : ""}`)).json.quote;
async function placeCart(client, { method = "COD", giftWrap = false, channel = null } = {}) {
  const quote = await quoteFor(client, { method, giftWrap });
  return client.post("/api/checkout/orders", { addressId: client === asha ? S.home : S.homeBinod, paymentMethod: method, paymentChannel: channel, expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), giftWrap });
}

async function makeShop(client, { name, catalogRef = null, active = true }) {
  const id = newId();
  const code = "FRX-SHOP-" + (await row("SELECT nextval('shop_code_seq')::int AS n")).n;
  await db.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, city, state, postal_code, latitude, longitude, approval_status, active_status, approved_at)
     VALUES ($1, $2, $3, $4, 'Dhenkanal', 'Odisha', '759001', 20.66, 85.6, 'APPROVED', $5, now())`,
    [id, code, catalogRef, name, active ? "ACTIVE" : "INACTIVE"]
  );
  const email = `${code.toLowerCase()}@shops.example`;
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id, password_changed_at) VALUES ($1, $2, $3, $4, 'SHOP', 'ACTIVE', $5, now())", [newId(), name + " owner", email, await hashPassword(PASSWORD), id]);
  assert.equal((await client.post("/api/auth/login", { identifier: email, password: PASSWORD, accountType: "shop" })).status, 200);
  return { id, code, email };
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Test Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", person("Asha Verma", 41))).status, 201);
  assert.equal((await binod.post("/api/auth/signup", person("Binod Das", 42))).status, 201);
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  S.home = (await asha.post("/api/addresses", ADDRESS)).json.address.id;
  S.homeBinod = (await binod.post("/api/addresses", { ...ADDRESS, fullName: "Binod Das" })).json.address.id;
  S.shopB = await makeShop(shopB, { name: "Royal Frames", catalogRef: "shop-002" });
  S.shopC = await makeShop(shopC, { name: "Nordic Frames", catalogRef: "shop-003" });
  S.shopN = await makeShop(shopN, { name: "Kalinga Art House" });
  clearDevOutbox();
});

after(async () => {
  await emailsSettled();
  server.close();
  await mock.close();
  await db.close();
  fs.rmSync(config.uploads.dir, { recursive: true, force: true });
});

/* ====================================================================== Uploads */

describe("uploading a photo", () => {
  test("needs an account, and the header only the website's own code can add", async () => {
    assert.equal((await uploadPhoto(base, visitor)).status, 401);
    const noHeader = await fetch(base + "/api/uploads", { method: "POST", headers: { "Content-Type": "image/jpeg", Cookie: asha.cookie }, body: jpeg() });
    assert.equal(noHeader.status, 403);
    assert.equal((await row("SELECT count(*)::int AS n FROM uploads")).n, 0);
  });

  test("a 4K photo is kept byte for byte, and its type and size are read from the file itself", async () => {
    const original = jpeg({ width: 3840, height: 2160, bytes: 1_500_000, fill: 0x7b });
    // The browser claims a different type and a misleading name: neither is trusted.
    const r = await uploadPhoto(base, asha, { body: original, type: "image/png", name: "IMG_2041 (final).JPG" });
    assert.equal(r.status, 201, r.text);
    const u = r.json.upload;
    S.fourK = u.id;
    S.fourKBytes = original;
    assert.deepEqual([u.format, u.mime, u.width, u.height, u.bytes, u.megapixels, u.name, u.inOrder], ["jpeg", "image/jpeg", 3840, 2160, original.length, 8.3, "IMG_2041 (final).JPG", false]);
    assert.deepEqual(Object.keys(u).sort(), ["bytes", "format", "height", "id", "inOrder", "megapixels", "mime", "name", "orientation", "uploadedAt", "width"], "nothing about where the file is stored");
    const stored = await row("SELECT * FROM uploads WHERE id = $1", [u.id]);
    assert.equal(stored.sha256, sha(original));
    const onDisk = fs.readFileSync(path.join(config.uploads.dir, ...stored.storage_key.split("/")));
    assert.ok(onDisk.equals(original), "the stored file is exactly the uploaded file: not resized, not re-encoded");
    assert.match(stored.storage_key, /^private\//);
    assert.equal(r.text.includes(stored.storage_key), false);
  });

  test("PNG and WebP are accepted; the format comes from the bytes", async () => {
    const p = await upload(asha, { body: png({ width: 2400, height: 1600 }), type: "image/jpeg", name: "scan.png" });
    assert.deepEqual([p.format, p.width, p.height], ["png", 2400, 1600]);
    const w = await upload(asha, { body: webp({ width: 4096, height: 2304 }), type: "application/octet-stream", name: "pic.webp" });
    assert.deepEqual([w.format, w.mime, w.width, w.height], ["webp", "image/webp", 4096, 2304]);
  });

  test("a phone photo's EXIF orientation is recorded", async () => {
    const u = await upload(asha, { body: jpeg({ width: 4000, height: 3000, orientation: 6 }) });
    assert.equal(u.orientation, 6);
  });

  test("anything that isn't a supported image is refused with a clear message", async () => {
    const before = (await row("SELECT count(*)::int AS n FROM uploads")).n;
    const cases = [
      ["text", Buffer.from("just some text, named photo.jpg")],
      ["a GIF", Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(200)])],
      ["a PDF", Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(200)])],
      ["a JPEG cut off before its size", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      ["a script", Buffer.from("<script>alert(1)</script>")]
    ];
    for (const [what, body] of cases) {
      const r = await uploadPhoto(base, asha, { body, type: "image/jpeg", name: "photo.jpg" });
      assert.equal(r.status, 415, what);
      assert.equal(r.json.error.code, "UPLOAD_UNSUPPORTED");
      assert.match(r.json.error.message, /^Please upload a supported image format/);
    }
    assert.equal((await uploadPhoto(base, asha, { body: Buffer.alloc(0) })).status, 400);
    assert.equal((await row("SELECT count(*)::int AS n FROM uploads")).n, before, "nothing was stored");
    assert.deepEqual(fs.readdirSync(path.join(config.uploads.dir, "tmp")), [], "no half-written file is left behind");
  });

  test("a file over the limit is refused", async () => {
    const r = await uploadPhoto(base, asha, { body: jpeg({ bytes: 2 * 1024 * 1024 + 10 }) });
    assert.equal(r.status, 413);
    assert.equal(r.json.error.code, "UPLOAD_TOO_LARGE");
    assert.match(r.json.error.message, /larger than 2 MB/);
  });

  test("a file name can't carry a path or markup", async () => {
    const u = await upload(asha, { name: "../../etc/<b>pass</b>\u0007wd.jpg" });
    assert.ok(!/[<>/\\\u0000-\u001f]/.test(u.name), u.name);
    assert.match(u.name, /wd\.jpg$/);
    const nameless = await upload(asha, { name: "" });
    assert.equal(nameless.name, "photo.jpg");
  });

  test("the owner gets a short-lived link to the original; nobody else does", async () => {
    const mine = await asha.post(`/api/uploads/${S.fourK}/link`, { download: true });
    assert.equal(mine.status, 200);
    assert.match(mine.json.link.path, /^\/files\/[\w-]+\.[\w-]+$/);
    assert.ok(new Date(mine.json.link.expiresAt) - Date.now() <= config.uploads.linkSeconds * 1000 + 2000);
    const file = await download(mine.json.link);
    assert.equal(file.status, 200);
    assert.ok(file.body.equals(S.fourKBytes), "the download is the original, bit for bit");
    assert.equal(file.headers.get("content-type"), "image/jpeg");
    assert.match(file.headers.get("content-disposition"), /^attachment; filename="IMG_2041 \(final\)\.JPG"/);
    assert.match(file.headers.get("cache-control"), /private, no-store/);
    assert.match(file.headers.get("content-security-policy"), /sandbox/);
    assert.equal(file.headers.get("x-content-type-options"), "nosniff");
    // "View" instead of "download": the same original, shown in the browser.
    const view = await asha.post(`/api/uploads/${S.fourK}/link`, {});
    const shown = await download(view.json.link);
    assert.match(shown.headers.get("content-disposition"), /^inline; /);
    assert.ok(shown.body.equals(S.fourKBytes));

    assert.equal((await binod.post(`/api/uploads/${S.fourK}/link`)).status, 404, "another customer's id is 'not found'");
    assert.equal((await binod.get(`/api/uploads/${S.fourK}`)).status, 404);
    assert.equal((await visitor.post(`/api/uploads/${S.fourK}/link`)).status, 401);
    // There is no public address for the file.
    const stored = await row("SELECT storage_key FROM uploads WHERE id = $1", [S.fourK]);
    for (const guess of [`/uploads/${stored.storage_key}`, `/${stored.storage_key}`, `/api/uploads/${S.fourK}/file`, `/api/files/${S.fourK}`, `/media/${S.fourK}`]) assert.ok([401, 404].includes((await fetch(base + guess)).status), guess);
  });

  test("a link can't be forged, changed or used after it has expired", async () => {
    const { token } = makeFileToken(S.fourK);
    assert.equal((await download({ path: `/files/${token}` })).status, 200);
    const [payload, signature] = token.split(".");
    const other = Buffer.from(JSON.stringify({ u: S.fourK, e: Math.floor(Date.now() / 1000) + 99999, d: 1 })).toString("base64url");
    assert.equal((await download({ path: `/files/${other}.${signature}` })).status, 404, "a changed payload");
    assert.equal((await download({ path: `/files/${payload}.${"A".repeat(signature.length)}` })).status, 404, "a made-up signature");
    assert.equal((await download({ path: `/files/${makeFileToken(S.fourK, { seconds: -5 }).token}` })).status, 404, "an expired link");
    assert.equal((await download({ path: "/files/nonsense" })).status, 404);
  });

  test("an unused photo can be removed; the number of waiting photos is limited", async () => {
    const u = await upload(binod);
    assert.equal((await asha.del(`/api/uploads/${u.id}`)).status, 404, "not by someone else");
    assert.equal((await binod.del(`/api/uploads/${u.id}`)).status, 200);
    assert.equal((await binod.get(`/api/uploads/${u.id}`)).status, 404);
    const stored = await row("SELECT status, storage_key FROM uploads WHERE id = $1", [u.id]);
    assert.equal(stored.status, "DELETED");
    assert.equal(fs.existsSync(path.join(config.uploads.dir, ...stored.storage_key.split("/"))), false);

    const limit = config.uploads.maxWaitingPerUser;
    config.uploads.maxWaitingPerUser = 2;
    try {
      await uploadMany(base, binod, 2);
      const third = await uploadPhoto(base, binod);
      assert.equal(third.status, 409);
      assert.equal(third.json.error.code, "UPLOAD_LIMIT");
    } finally {
      config.uploads.maxWaitingPerUser = limit;
    }
  });

  test("a website on another address may send the file-name header (the browser asks first)", async () => {
    const preflight = await fetch(base + "/api/uploads", { method: "OPTIONS", headers: { Origin: "http://localhost:5500", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-file-name,x-framex-client" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5500");
    const allowed = preflight.headers.get("access-control-allow-headers").toLowerCase();
    for (const header of ["content-type", "x-file-name", "x-framex-client", "authorization"]) assert.ok(allowed.includes(header), header);
    // …and may read a download's file name; the file itself can be shown by that website
    const linked = await fetch(`${base}/api${(await asha.post(`/api/uploads/${S.fourK}/link`, { download: true })).json.link.path}`, { headers: { Origin: "http://localhost:5500" } });
    assert.equal(linked.headers.get("access-control-allow-origin"), "http://localhost:5500");
    assert.match(linked.headers.get("access-control-expose-headers"), /Content-Disposition/i);
    assert.equal(linked.headers.get("cross-origin-resource-policy"), "cross-origin");
    await linked.arrayBuffer();
    const stranger = await fetch(base + "/api/uploads", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    assert.equal(stranger.headers.get("access-control-allow-origin"), null);
    const blocked = await fetch(base + "/api/uploads", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "image/jpeg", "X-FrameX-Client": "web", Cookie: asha.cookie }, body: jpeg() });
    assert.equal(blocked.status, 403);
  });

  test("the website can ask what a photo may be", async () => {
    const r = await visitor.get("/api/config");
    assert.deepEqual(r.json.uploads, { maxBytes: 2 * 1024 * 1024, formats: ["jpeg", "png", "webp"], maxSide: 30000 });
    assert.deepEqual(r.json.giftWrap, { enabled: true, fee: 75 });
  });
});

/* ====================================================================== 1 + 2: photo frames */

describe("1 + 2. a photo frame is made from the customer's own photo", () => {
  test("1. without a photo it can't be added to the cart or bought", async () => {
    await empty(asha);
    for (const body of [{ productId: FRAME.id }, { productId: FRAME.id, photos: {} }, { productId: FRAME.id, photos: [] }, { productId: FRAME.id, photos: { photo1: "" } }]) {
      const r = await asha.post("/api/cart/items", body);
      assert.equal(r.status, 422, JSON.stringify(body));
      assert.equal(r.json.error.code, "PHOTOS_REQUIRED");
      assert.equal(r.json.error.message, "Please upload your photo to continue. Your photo is required to create this personalized frame.");
    }
    assert.equal(lines(await asha.get("/api/cart")).length, 0);

    // "Buy Now" goes through the same check.
    const quote = (await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "COD", buyNow: { productId: FRAME.id, quantity: 1 } })).json.quote;
    assert.equal(quote.ok, false);
    assert.equal(quote.issues[0].code, "PHOTOS_REQUIRED");
    const order = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), buyNow: { productId: FRAME.id, quantity: 1 } });
    assert.equal(order.status, 422);
    assert.equal(order.json.error.code, "PHOTOS_REQUIRED");
    assert.equal((await row("SELECT count(*)::int AS n FROM orders")).n, 0);
  });

  test("a photo id that isn't the customer's own upload counts as no photo", async () => {
    const binods = await upload(binod, { name: "binods-photo.jpg" });
    for (const photos of [{ photo1: binods.id }, { photo1: crypto.randomUUID() }, { photo1: "../../etc/passwd" }, { photo1: { uploadId: binods.id } }, [{ slot: "photo1", uploadId: binods.id }]]) {
      const r = await asha.post("/api/cart/items", { productId: FRAME.id, photos });
      assert.equal(r.status, 422, JSON.stringify(photos));
      assert.equal(r.json.error.code, "PHOTOS_REQUIRED");
    }
    assert.equal(lines(await asha.get("/api/cart")).length, 0);
  });

  test("a set needs one photo per frame, and a set sold in two sizes knows how many each needs", async () => {
    const three = await uploadMany(base, asha, 3);
    const short = await asha.post("/api/cart/items", { productId: SET_OF_4.id, photos: { photo1: three[0], photo2: three[1], photo3: three[2] } });
    assert.equal(short.status, 422);
    assert.equal(short.json.error.message, "Please upload all 4 required photos to continue.");
    const full = await asha.post("/api/cart/items", { productId: SET_OF_4.id, photos: { photo1: three[0], photo2: three[1], photo3: three[2], photo4: S.fourK } });
    assert.equal(full.status, 201, full.text);
    assert.equal(lines(full)[0].photosRequired, 4);
    assert.deepEqual(lines(full)[0].photos.map((p) => p.slot), ["photo1", "photo2", "photo3", "photo4"]);

    const nine = [...three, S.fourK, ...(await uploadMany(base, asha, 5))];
    const five = Object.fromEntries(nine.slice(0, 5).map((id, i) => [`photo${i + 1}`, id]));
    assert.equal((await asha.post("/api/cart/items", { productId: COLLAGE.id, selection: { sizeId: "0" }, photos: five })).status, 201, "Set of 5 with 5 photos");
    const tooFew = await asha.post("/api/cart/items", { productId: COLLAGE.id, selection: { sizeId: "1" }, photos: five });
    assert.equal(tooFew.status, 422);
    assert.equal(tooFew.json.error.message, "Please upload all 9 required photos to continue.");
    assert.equal((await asha.post("/api/cart/items", { productId: COLLAGE.id, selection: { sizeId: "1" }, photos: Object.fromEntries(nine.map((id, i) => [`photo${i + 1}`, id])) })).status, 201, "Set of 9 with 9 photos");
    await empty(asha);
  });

  test("an accessory needs no photo", async () => {
    const r = await asha.post("/api/cart/items", { productId: ACCESSORY.id, photos: { photo1: S.fourK } });
    assert.equal(r.status, 201, r.text);
    assert.equal(lines(r)[0].photosRequired, 0);
    assert.deepEqual(lines(r)[0].photos, [], "a photo sent for a product that has no use for it is not kept");
    await empty(asha);
  });

  test("2. with the photo: added, shown with the file's own details, and the same photo again is the same line", async () => {
    const r = await asha.post("/api/cart/items", { productId: FRAME.id, quantity: 1, selection: { sizeId: "l" }, photos: { photo1: { uploadId: S.fourK, placement: { x: 0.25, y: 2, zoom: 1.5 } } }, thumbnail: "data:image/jpeg;base64,AAAA" });
    assert.equal(r.status, 201, r.text);
    const [line] = lines(r);
    assert.equal(line.productType, "photo-frame");
    assert.equal(line.photosRequired, 1);
    assert.equal(line.unitPrice, model.cartLine(FRAME, { sizeId: "l" }).unitPrice, "the photo doesn't change the price");
    assert.deepEqual([line.photos[0].slot, line.photos[0].id, line.photos[0].name, line.photos[0].width, line.photos[0].height], ["photo1", S.fourK, "IMG_2041 (final).JPG", 3840, 2160]);
    assert.deepEqual(line.photos[0].placement, { x: 0.25, y: 1, zoom: 1.5 }, "where the customer put the photo, kept inside sane numbers");
    assert.equal(line.image, "data:image/jpeg;base64,AAAA", "the customer's own preview is shown for the line");

    const again = await asha.post("/api/cart/items", { productId: FRAME.id, selection: { sizeId: "l" }, photos: { photo1: { uploadId: S.fourK, placement: { x: 0.25, y: 1, zoom: 1.5 } } } });
    assert.equal(lines(again).length, 1);
    assert.equal(lines(again)[0].quantity, 2);
    const otherPhoto = await upload(asha, { name: "second.jpg", body: jpeg({ fill: 0x09 }) });
    S.second = otherPhoto.id;
    const second = await asha.post("/api/cart/items", { productId: FRAME.id, selection: { sizeId: "l" }, photos: { photo1: otherPhoto.id } });
    assert.equal(lines(second).length, 2, "the same frame with another photo is its own line");
    assert.equal((await asha.del(`/api/uploads/${S.fourK}`)).status, 409, "a photo that a cart line uses can't be removed");
  });

  test("2 + 14. Cash on Delivery: the order is placed and the ORIGINAL photo stays with its order line", async () => {
    await asha.patch(`/api/cart/items/${lines(await asha.get("/api/cart"))[0].id}`, { quantity: 1 });
    clearDevOutbox();
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    const order = placed.json.order;
    S.order = order.orderNumber;
    assert.equal(order.status, "PLACED");
    assert.equal(order.paymentMethod, "COD");
    assert.equal(order.paymentStatus, "PENDING");
    assert.equal(order.needsPhotos, false, "nothing has to be sent separately");
    assert.equal(order.photoCount, 2);
    assert.deepEqual(order.items.map((i) => [i.productId, i.productType, i.photosRequired, i.photos.map((p) => p.id)]), [[FRAME.id, "photo-frame", 1, [S.fourK]], [FRAME.id, "photo-frame", 1, [S.second]]]);
    assert.equal(order.items[0].photos[0].inOrder, true);
    assert.deepEqual(order.items[0].photos[0].placement, { x: 0.25, y: 1, zoom: 1.5 });

    // In the database: the line, the photo, the customer and the shop are tied together.
    const link = await row(
      `SELECT p.slot, p.position, i.shop_ref, i.product_id, i.product_type, i.photos_required, u.user_id, u.status, u.sha256, o.user_id AS buyer
         FROM order_item_photos p JOIN order_items i ON i.id = p.order_item_id JOIN orders o ON o.id = p.order_id JOIN uploads u ON u.id = p.upload_id
        WHERE o.order_number = $1 AND p.upload_id = $2`,
      [S.order, S.fourK]
    );
    assert.deepEqual([link.slot, link.position, link.shop_ref, link.product_id, link.product_type, link.photos_required, link.status], ["photo1", 1, "shop-002", FRAME.id, "photo-frame", 1, "ATTACHED"]);
    assert.equal(link.user_id, link.buyer);
    assert.equal(link.sha256, sha(S.fourKBytes));

    // The customer can see their own photo in their own order; it is still the original.
    const mine = await asha.post(`/api/orders/${S.order}/photos/${S.fourK}/link`, { download: true });
    assert.equal(mine.status, 200, mine.text);
    assert.ok((await download(mine.json.link)).body.equals(S.fourKBytes));
    assert.equal((await binod.post(`/api/orders/${S.order}/photos/${S.fourK}/link`)).status, 404, "not another customer");
    assert.equal((await asha.post(`/api/orders/${S.order}/photos/${crypto.randomUUID()}/link`)).status, 404, "not a photo of another order");

    // A photo that belongs to an order is kept: it can't be removed, and the clean-up never takes it.
    assert.equal((await asha.del(`/api/uploads/${S.fourK}`)).status, 409);
    await db.query("UPDATE uploads SET created_at = now() - interval '400 days'");
    await sweepUnusedUploads();
    assert.equal((await row("SELECT status FROM uploads WHERE id = $1", [S.fourK])).status, "ATTACHED");
    assert.ok((await download((await asha.post(`/api/orders/${S.order}/photos/${S.fourK}/link`)).json.link)).body.equals(S.fourKBytes));

    await emailsSettled();
    const mail = devOutbox().find((m) => /placed/.test(m.subject));
    assert.match(mail.text, /We have your 2 photos with this order\. They are printed in the same original quality you uploaded/);
    assert.doesNotMatch(mail.text, /WhatsApp/);
    assert.equal(lines(await asha.get("/api/cart")).length, 0);
  });

  test("photos that never reached an order are removed after a while; ones in a cart are not", async () => {
    const inCart = await upload(asha, { name: "in-cart.jpg" });
    const loose = await upload(asha, { name: "never-used.jpg" });
    assert.equal((await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: inCart.id } })).status, 201);
    await db.query("UPDATE uploads SET created_at = now() - interval '400 days' WHERE id IN ($1, $2)", [inCart.id, loose.id]);
    await sweepUnusedUploads();
    assert.equal((await row("SELECT status FROM uploads WHERE id = $1", [inCart.id])).status, "UPLOADED");
    assert.equal((await row("SELECT status FROM uploads WHERE id = $1", [loose.id])).status, "DELETED");
    // A line whose photo is gone says so instead of being ordered without it.
    await db.query("UPDATE uploads SET status = 'DELETED' WHERE id = $1", [inCart.id]);
    const cart = (await asha.get("/api/cart")).json.cart;
    assert.equal(cart.items[0].available, false);
    assert.equal(cart.items[0].issue.code, "PHOTOS_REQUIRED");
    assert.equal((await quoteFor(asha)).ok, false);
    await empty(asha);
  });
});

/* ====================================================================== Product information */

describe("every photo frame in the catalogue has complete product information", () => {
  const frames = seed.products.filter((p) => !p.decor && model.photoRequirement(model.normalize(p)).required);
  const projectRoot = path.resolve(config.catalogDir);

  test("a description, the print, the front cover, the back, what's included and how to care for it", () => {
    assert.ok(frames.length >= 16, `${frames.length} frames`);
    for (const raw of frames) {
      const p = model.normalize(raw);
      assert.ok(p.description.length >= 200 && /\n\n/.test(p.description), `${p.id}: a description of two paragraphs`);
      assert.ok(p.frame.material, `${p.id}: frame material`);
      assert.ok(p.print.materials.length >= 1 && p.print.materials.every((m) => m.name && m.finish && m.thickness), `${p.id}: print material`);
      assert.ok(model.protectionOptions(p).length >= 1, `${p.id}: front cover`);
      assert.ok(p.back.backing && (p.back.hanging || p.back.stand), `${p.id}: back and hanging`);
      assert.ok(p.included.length >= 3 && p.care.length >= 2, `${p.id}: what's included and care`);
      assert.ok(p.sizes.length >= 1, `${p.id}: sizes`);
      assert.deepEqual([...model.validateForPublish({ ...p, productType: "photo-frame", frame: { ...p.frame, type: p.frame.type || "other" } }).issues].filter((i) => /claims/.test(i.message)), [], `${p.id}: no claims only FrameX can make`);
    }
  });

  test("'Frame Components' shows the frame layer by layer: frame, front cover, print, backing, hanging", () => {
    for (const raw of frames) {
      const parts = model.componentsOf(model.normalize(raw)).map((c) => c.type);
      for (const part of ["frame", "print", "backing"]) assert.ok(parts.includes(part), `${raw.id}: ${part} in ${parts.join(", ")}`);
      assert.ok(parts.includes("acrylic") || parts.includes("glass"), `${raw.id}: a front cover`);
      assert.ok(parts.includes("hardware") || parts.includes("stand"), `${raw.id}: hanging hardware or a stand`);
      assert.ok(parts.length >= 5, `${raw.id}: ${parts.length} parts`);
    }
  });

  test("every picture a product names is a file that exists, with a description", () => {
    for (const raw of seed.products.filter((p) => !p.decor)) {
      const p = model.normalize(raw);
      assert.ok(p.views.length >= 1, `${p.id}: at least one picture`);
      for (const view of p.views) {
        assert.ok(fs.existsSync(path.join(projectRoot, view.url)), `${p.id}: ${view.url}`);
        assert.ok(String(view.alt || "").trim().length >= 3, `${p.id}: alt text for ${view.url}`);
      }
    }
  });

  test("the added details change no price and no photo rule", () => {
    // Prices come from the base price, the size and the discount only: the single print and cover carry no surcharge.
    for (const raw of frames) {
      const p = model.normalize(raw);
      for (const size of p.sizes) {
        const quote = model.quote(p, { ...model.defaultSelection(p), sizeId: size.id });
        assert.deepEqual([...quote.lines].map((l) => l.key), ["base"], `${p.id} / ${size.id}: only the frame's own price`);
        assert.equal(quote.unit, Math.round((size.price * (100 - (p.pricing.discountPercent || 0))) / 100), `${p.id} / ${size.id}`);
      }
    }
    assert.equal(model.photoRequirement(SET_OF_4).count, 4);
    assert.deepEqual([...COLLAGE.sizes].map((s) => model.photoRequirement(COLLAGE, { sizeId: s.id }).count), [5, 9]);
    assert.equal(model.photoRequirement(ACCESSORY).count, 0);
  });
});

/* ====================================================================== 3: custom frame */

describe("3. a custom frame designed in FrameX Studio", () => {
  const frame = product("p-001");
  const ctx = studio.context({ product: frame });
  const design = (change = {}) => ({ ...JSON.parse(JSON.stringify(studio.defaults(ctx))), photos: { photo1: "ph-device-1" }, photoMeta: { photo1: { w: 3840, h: 2160 } }, crop: { photo1: { fit: "crop", zoom: 1.4, px: 30, py: 60, rotate: 0 } }, ...change });

  test("can't be added or bought without the uploaded photo, whatever the design itself says", async () => {
    await empty(asha);
    for (const photos of [undefined, {}, { photo1: crypto.randomUUID() }]) {
      const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-custom0001", config: design() }, photos });
      assert.equal(r.status, 422);
      assert.equal(r.json.error.code, "PHOTOS_REQUIRED");
      assert.equal(r.json.error.message, "Please upload your photo to continue. Your photo is required to create this personalized frame.");
    }
  });

  test("with the photo: customised, priced by the server, ordered, and the original is with the order", async () => {
    const cfg = design();
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-custom0001", config: cfg, thumbnail: "data:image/jpeg;base64,AAAA" }, photos: { photo1: S.second } });
    assert.equal(r.status, 201, r.text);
    const [line] = lines(r);
    assert.deepEqual([line.kind, line.design.type, line.productType, line.photosRequired, line.photos[0].id], ["studio", "product-frame", "custom-frame", 1, S.second]);
    assert.equal(line.unitPrice, studio.price(cfg, ctx).total);
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    const item = placed.json.order.items[0];
    assert.equal(item.photos[0].id, S.second);
    assert.equal(placed.json.order.needsPhotos, false);
    const stored = await row("SELECT i.customization FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1", [placed.json.order.orderNumber]);
    assert.deepEqual(stored.customization.crop.photo1, { fit: "crop", zoom: 1.4, px: 30, py: 60, rotate: 0 }, "the crop the customer chose is kept with the order");
  });
});

/* ====================================================================== 4: Home Decor */

describe("4. Home Decor is ready-made", () => {
  test("no photo is asked for: cart, checkout and order work as before", async () => {
    await empty(asha);
    const r = await asha.post("/api/cart/items", { productId: WALL_ART.id, quantity: 2 });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([lines(r)[0].photosRequired, lines(r)[0].photos.length, lines(r)[0].productType], [0, 0, "wall-art"]);
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    assert.deepEqual([placed.json.order.needsPhotos, placed.json.order.photoCount, placed.json.order.items[0].photosRequired], [false, 0, 0]);
  });

  test("every ready-made piece in the catalogue is orderable without a photo; only the 'your photo' sets need one", () => {
    const decor = seed.products.filter((p) => p.section === "decor").map((p) => [p, model.photoRequirement(model.normalize(p)).count]);
    assert.ok(decor.length > 200);
    assert.ok(decor.every(([p, count]) => count === (p.decor.customPhoto ? 1 : 0)));
    assert.equal(decor.filter(([, count]) => count === 1).length, 4);
  });
});

/* ====================================================================== 5 + 6: templates */

describe("5 + 6. a template with three photo spaces", () => {
  const ctx = studio.context({ template: TEMPLATE });
  const slots = [...templateEngine.slotsOf(TEMPLATE)];
  const cfg = JSON.parse(JSON.stringify(studio.defaults(ctx)));
  slots.forEach((slot, i) => {
    cfg.photos[slot] = `ph-device-${i + 1}`;
    cfg.photoMeta[slot] = { w: 3000, h: 2000 };
  });

  test("5. with only two photos it is refused, in the cart and in Buy Now", async () => {
    await empty(asha);
    assert.equal(slots.length, 3);
    S.three = [S.fourK, S.second, (await upload(asha, { name: "third.jpg", body: jpeg({ fill: 0x17 }) })).id];
    const two = { [slots[0]]: S.three[0], [slots[1]]: S.three[1] };
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-tpl00001", config: cfg }, photos: two });
    assert.equal(r.status, 422);
    assert.equal(r.json.error.code, "PHOTOS_REQUIRED");
    assert.equal(r.json.error.message, "Please upload all 3 required photos to continue.");
    const quote = (await asha.post("/api/checkout/quote", { addressId: S.home, paymentMethod: "COD", buyNow: { kind: "studio", design: { id: "d-tpl00001", config: cfg }, photos: two } })).json.quote;
    assert.deepEqual([quote.ok, quote.issues[0].code, quote.issues[0].message], [false, "PHOTOS_REQUIRED", "Please upload all 3 required photos to continue."]);
    assert.equal(lines(await asha.get("/api/cart")).length, 0);
  });

  test("6. with all three: each space has its own photo, in order, through checkout", async () => {
    const all = Object.fromEntries(slots.map((slot, i) => [slot, S.three[i]]));
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-tpl00001", config: cfg }, photos: all });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([lines(r)[0].productType, lines(r)[0].photosRequired], ["template", 3]);
    assert.deepEqual(lines(r)[0].photos.map((p) => [p.slot, p.id]), slots.map((slot, i) => [slot, S.three[i]]));
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    S.templateOrder = placed.json.order.orderNumber;
    assert.deepEqual(placed.json.order.items[0].photos.map((p) => [p.slot, p.id]), slots.map((slot, i) => [slot, S.three[i]]));
    assert.equal(placed.json.order.items[0].shopId, "framex-studio", "a FrameX design: made by FrameX itself");
  });
});

/* ====================================================================== 7 + 8 + 13: gift wrapping */

describe("7 + 8. gift wrapping", () => {
  test("8. without it there is no charge; the quote says it can be chosen and what it would cost", async () => {
    await empty(asha);
    await asha.post("/api/cart/items", { productId: WALL_ART.id });
    const quote = await quoteFor(asha);
    assert.deepEqual(quote.giftWrap, { available: true, fee: 75, reason: null, selected: false });
    assert.equal(quote.giftWrapFee, 0);
    assert.equal(quote.total, quote.subtotal - quote.discount + 60 + 40);
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    assert.deepEqual([placed.json.order.giftWrap, placed.json.order.giftWrapFee], [false, 0]);
    const stored = await row("SELECT gift_wrap, gift_wrap_fee, total, subtotal, discount, shipping_fee, cod_fee FROM orders WHERE order_number = $1", [placed.json.order.orderNumber]);
    assert.deepEqual([stored.gift_wrap, stored.gift_wrap_fee], [false, 0]);
  });

  test("7 + 14. chosen: the charge is its own line before the customer pays, and the order remembers it (Cash on Delivery)", async () => {
    await asha.post("/api/cart/items", { productId: WALL_ART.id });
    const plain = await quoteFor(asha);
    const wrapped = await quoteFor(asha, { giftWrap: true });
    assert.deepEqual(wrapped.giftWrap, { available: true, fee: 75, reason: null, selected: true });
    assert.equal(wrapped.giftWrapFee, 75);
    assert.equal(wrapped.total, plain.total + 75);
    // The total the customer saw without wrapping is no longer the total: nothing is ordered until they have seen the new one.
    const stale = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: plain.total, idempotencyKey: crypto.randomUUID(), giftWrap: true });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, "TOTAL_CHANGED");
    clearDevOutbox();
    const placed = await placeCart(asha, { giftWrap: true });
    assert.equal(placed.status, 201, placed.text);
    const order = placed.json.order;
    assert.deepEqual([order.giftWrap, order.giftWrapFee, order.total], [true, 75, wrapped.total]);
    assert.equal(order.total, order.subtotal - order.discount + order.tax + order.shippingFee + order.giftWrapFee + order.codFee);
    const stored = await row("SELECT gift_wrap, gift_wrap_fee FROM orders WHERE order_number = $1", [order.orderNumber]);
    assert.deepEqual([stored.gift_wrap, stored.gift_wrap_fee], [true, 75]);
    await emailsSettled();
    const mail = devOutbox().find((m) => /placed/.test(m.subject));
    assert.match(mail.text, /Gift wrapping: ₹75/);
    assert.match(mail.text, /Your order will be gift wrapped\./);
  });

  test("13. paid online: the gateway is asked for the total including gift wrapping, and the verified payment places the order", async () => {
    await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: S.fourK } });
    const quote = await quoteFor(asha, { method: "ONLINE", giftWrap: true });
    assert.equal(quote.codFee, 0);
    assert.equal(quote.total, quote.subtotal - quote.discount + 60 + 75);
    const r = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "ONLINE", paymentChannel: "upi", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), giftWrap: true });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.status, "PENDING_PAYMENT");
    assert.equal(r.json.payment.amount, quote.total * 100, "in paise, gift wrapping included");
    assert.equal(mock.orders.get(r.json.payment.gatewayOrderId).amount, quote.total * 100);
    S.online = r.json.order.orderNumber;
    // Not paid yet: the shop doesn't see it, and its photo can't be fetched for printing.
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/orders/${S.online}`)).status, 404);

    const paid = mock.pay(r.json.payment.gatewayOrderId, { method: "upi" });
    const verified = await asha.post(`/api/orders/${S.online}/payments/verify`, paid.proof);
    assert.equal(verified.status, 200, verified.text);
    assert.deepEqual([verified.json.order.status, verified.json.order.paymentStatus, verified.json.order.giftWrap, verified.json.order.giftWrapFee, verified.json.order.total], ["PLACED", "PAID", true, 75, quote.total]);
    assert.equal(verified.json.order.items[0].photos[0].id, S.fourK);
    assert.equal(lines(await asha.get("/api/cart")).length, 0);
  });

  test("a shop that doesn't gift wrap, or a product that can't be wrapped, switches the option off with the reason", async () => {
    await empty(asha);
    await asha.post("/api/cart/items", { productId: FRAME_C.id, photos: { photo1: S.fourK } });
    assert.equal((await quoteFor(asha, { giftWrap: true })).giftWrap.selected, true);
    // The shop turns gift wrapping off in its own profile.
    const off = await shopC.patch(`/api/shops/${S.shopC.code}/profile`, { giftWrap: false });
    assert.equal(off.status, 200, off.text);
    assert.equal(off.json.shop.giftWrap, false);
    const quote = await quoteFor(asha, { giftWrap: true });
    assert.deepEqual(quote.giftWrap, { available: false, fee: 75, reason: `Gift wrapping is not available for ${FRAME_C.name}.`, selected: false });
    assert.equal(quote.giftWrapFee, 0);
    const asked = await asha.post("/api/checkout/orders", { addressId: S.home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), giftWrap: true });
    assert.equal(asked.status, 409);
    assert.equal(asked.json.error.code, "GIFT_WRAP_UNAVAILABLE");
    assert.equal((await shopC.patch(`/api/shops/${S.shopC.code}/profile`, { giftWrap: true })).json.shop.giftWrap, true);

    config.checkout.giftWrap.blockedProducts = [FRAME_C.id];
    assert.equal((await quoteFor(asha, { giftWrap: true })).giftWrap.available, false);
    config.checkout.giftWrap.blockedProducts = [];
    config.checkout.giftWrap.enabled = false;
    const closed = await quoteFor(asha, { giftWrap: true });
    assert.deepEqual([closed.giftWrap.available, closed.giftWrapFee], [false, 0]);
    config.checkout.giftWrap.enabled = true;
    await empty(asha);
  });
});

/* ====================================================================== 11 + 12: fulfilment */

describe("11 + 12. the shop that makes an order gets the original photo; nobody else does", () => {
  test("11. the shop sees its own orders, only its own lines, and what it needs to hand them over", async () => {
    // One order with lines of two shops and of FrameX: The Royal Arch (shop-002), Nordic Oak (shop-003), wall art (shop-001).
    await empty(asha);
    await asha.post("/api/cart/items", { productId: FRAME.id, photos: { photo1: S.fourK }, note: "Please print it bright" });
    await asha.post("/api/cart/items", { productId: FRAME_C.id, photos: { photo1: S.second } });
    await asha.post("/api/cart/items", { productId: WALL_ART.id });
    const placed = await placeCart(asha, { giftWrap: true });
    assert.equal(placed.status, 201, placed.text);
    S.mixed = placed.json.order.orderNumber;

    const list = await shopB.get(`/api/shops/${S.shopB.code}/orders`);
    assert.equal(list.status, 200, list.text);
    assert.deepEqual(list.json.items.map((o) => o.orderNumber).sort(), [S.mixed, S.online, S.order].sort(), "every order with a line of this shop, and no other");
    const mine = list.json.items.find((o) => o.orderNumber === S.mixed);
    assert.deepEqual([mine.itemCount, mine.photoCount, mine.giftWrap, mine.cashToCollect, mine.needsAction, mine.customerName], [1, 1, true, true, true, "Asha Verma"]);
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/orders?filter=open`)).json.total, 3);

    const r = await shopB.get(`/api/shops/${S.shopB.code}/orders/${S.mixed}`);
    assert.equal(r.status, 200, r.text);
    const order = r.json.order;
    assert.deepEqual(order.items.map((i) => [i.productId, i.shopId, i.note, i.productType, i.photosRequired]), [[FRAME.id, "shop-002", "Please print it bright", "photo-frame", 1]], "only this shop's line");
    assert.equal(order.otherShopsItems, 2);
    assert.deepEqual(order.deliverTo, { name: "Asha Verma", phone: "+919876500041", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" });
    const text = JSON.stringify(order);
    for (const secret of ["asha@example.com", S.second, "gatewayOrderId", "payments", WALL_ART.id, FRAME_C.id]) assert.equal(text.includes(secret), false, `the shop's view leaves out ${secret}`);
    const photo = order.items[0].photos[0];
    assert.deepEqual([photo.id, photo.slot, photo.name, photo.format, photo.width, photo.height, photo.bytes], [S.fourK, "photo1", "IMG_2041 (final).JPG", "jpeg", 3840, 2160, S.fourKBytes.length]);
    assert.equal(order.canDownloadPhotos, true);
  });

  test("11. it downloads the customer's ORIGINAL file, named after the order, and the download is logged", async () => {
    const link = await shopB.post(`/api/shops/${S.shopB.code}/orders/${S.mixed}/photos/${S.fourK}/link`);
    assert.equal(link.status, 200, link.text);
    assert.equal(link.json.link.name, `${S.mixed}-item1-photo1-IMG_2041 (final).JPG`);
    const file = await download(link.json.link);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-disposition"), `attachment; filename="${S.mixed}-item1-photo1-IMG_2041 (final).JPG"; filename*=UTF-8''${encodeURIComponent(`${S.mixed}-item1-photo1-IMG_2041 (final).JPG`)}`);
    assert.ok(file.body.equals(S.fourKBytes), "exactly the file the customer uploaded: full size, not a preview");
    assert.equal(sha(file.body), (await row("SELECT sha256 FROM uploads WHERE id = $1", [S.fourK])).sha256);
    const logged = await row("SELECT actor_role, metadata FROM audit_logs WHERE action = 'ORDER_PHOTO_ACCESSED' AND target_id = $1 ORDER BY created_at DESC LIMIT 1", [S.mixed]);
    assert.deepEqual([logged.actor_role, logged.metadata.uploadId, logged.metadata.shop], ["SHOP", S.fourK, S.shopB.code]);
  });

  test("12. another shop can't reach that photo, that line or that order's other lines", async () => {
    // Shop C has a line in the same order, but the other photo.
    const own = await shopC.post(`/api/shops/${S.shopC.code}/orders/${S.mixed}/photos/${S.second}/link`);
    assert.equal(own.status, 200, own.text);
    const cross = await shopC.post(`/api/shops/${S.shopC.code}/orders/${S.mixed}/photos/${S.fourK}/link`);
    assert.equal(cross.status, 404, "a photo of another shop's line in the same order");
    assert.equal(cross.json.error.code, "ORDER_PHOTO_NOT_FOUND");
    assert.equal((await shopC.get(`/api/shops/${S.shopC.code}/orders/${S.order}`)).status, 404, "an order with no line of this shop");
    assert.equal((await shopC.post(`/api/shops/${S.shopC.code}/orders/${S.order}/photos/${S.fourK}/link`)).status, 404);
    // Changing the Shop ID in the address to the right shop's doesn't help: the session decides.
    assert.equal((await shopC.get(`/api/shops/${S.shopB.code}/orders`)).status, 403);
    assert.equal((await shopC.get(`/api/shops/${S.shopB.code}/orders/${S.mixed}`)).status, 403);
    assert.equal((await shopC.post(`/api/shops/${S.shopB.code}/orders/${S.mixed}/photos/${S.fourK}/link`)).status, 403);
    // A shop with nothing in the order, a customer, a visitor.
    assert.equal((await shopN.get(`/api/shops/${S.shopN.code}/orders`)).json.total, 0);
    assert.equal((await shopN.post(`/api/shops/${S.shopN.code}/orders/${S.mixed}/photos/${S.fourK}/link`)).status, 404);
    assert.equal((await asha.get(`/api/shops/${S.shopB.code}/orders`)).status, 403);
    assert.equal((await binod.post(`/api/shops/${S.shopB.code}/orders/${S.mixed}/photos/${S.fourK}/link`)).status, 403);
    assert.equal((await visitor.post(`/api/shops/${S.shopB.code}/orders/${S.mixed}/photos/${S.fourK}/link`)).status, 401);
    // A shop is not FrameX staff, and a customer's own-upload route is not a way in either.
    assert.equal((await shopB.post(`/api/admin/orders/${S.mixed}/photos/${S.fourK}/link`)).status, 403);
    assert.equal((await shopB.post(`/api/uploads/${S.fourK}/link`)).status, 404);
    // The FrameX design order (made by FrameX itself) is in no shop's list.
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/orders/${S.templateOrder}`)).status, 404);
  });

  test("the shop says how far it is with its own line; the customer sees it in the order's history", async () => {
    const order = (await shopB.get(`/api/shops/${S.shopB.code}/orders/${S.mixed}`)).json.order;
    const itemId = order.items[0].id;
    assert.deepEqual(order.fulfilmentStatuses.map((s) => s.id), ["NEW", "ACCEPTED", "IN_PRODUCTION", "READY", "HANDED_OVER"]);
    const r = await shopB.patch(`/api/shops/${S.shopB.code}/orders/${S.mixed}/items/${itemId}`, { status: "IN_PRODUCTION", note: "Printing today" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.order.items[0].fulfilment.status, r.json.order.items[0].fulfilment.note], ["IN_PRODUCTION", "Printing today"]);
    const seen = (await asha.get(`/api/orders/${S.mixed}`)).json.order;
    assert.equal(seen.items.find((i) => i.productId === FRAME.id).fulfilment.status, "IN_PRODUCTION");
    assert.ok(seen.events.some((e) => e.by === "SHOP" && /Royal Frames: The Royal Arch is in production\. Printing today/.test(e.detail)));
    assert.equal(seen.status, "PLACED", "the order's own status is FrameX's to move");
    // Not another shop's line, not a made-up step, not someone else's shop.
    const other = (await shopC.get(`/api/shops/${S.shopC.code}/orders/${S.mixed}`)).json.order.items[0].id;
    assert.equal((await shopB.patch(`/api/shops/${S.shopB.code}/orders/${S.mixed}/items/${other}`, { status: "READY" })).status, 404);
    assert.equal((await shopB.patch(`/api/shops/${S.shopB.code}/orders/${S.mixed}/items/${itemId}`, { status: "DELIVERED" })).status, 422);
    assert.equal((await shopC.patch(`/api/shops/${S.shopB.code}/orders/${S.mixed}/items/${itemId}`, { status: "READY" })).status, 403);
  });

  test("FrameX staff can fetch any order's originals (logged); once an order is cancelled, the shop no longer can", async () => {
    const order = (await admin.get(`/api/admin/orders/${S.templateOrder}`)).json.order;
    assert.equal(order.items[0].photos.length, 3);
    const link = await admin.post(`/api/admin/orders/${S.templateOrder}/photos/${order.items[0].photos[2].id}/link`);
    assert.equal(link.status, 200, link.text);
    assert.equal((await download(link.json.link)).status, 200);
    assert.equal((await row("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ORDER_PHOTO_ACCESSED' AND actor_role = 'ADMIN'")).n, 1);
    assert.equal((await asha.post(`/api/admin/orders/${S.templateOrder}/photos/${order.items[0].photos[2].id}/link`)).status, 403);

    const cancelled = await asha.post(`/api/orders/${S.order}/cancel`, { reason: "Changed my mind" });
    assert.equal(cancelled.status, 200, cancelled.text);
    const view = (await shopB.get(`/api/shops/${S.shopB.code}/orders/${S.order}`)).json.order;
    assert.deepEqual([view.status, view.canDownloadPhotos, view.canUpdate], ["CANCELLED", false, false]);
    const refused = await shopB.post(`/api/shops/${S.shopB.code}/orders/${S.order}/photos/${S.fourK}/link`);
    assert.equal(refused.status, 409);
    assert.equal(refused.json.error.code, "ORDER_NOT_ACTIVE");
    assert.equal((await shopB.patch(`/api/shops/${S.shopB.code}/orders/${S.order}/items/${view.items[0].id}`, { status: "READY" })).status, 409);
  });
});

/* ====================================================================== 9 + 10: shop products */

describe("9 + 10. a shop decides what it sells; the platform keeps its rules", () => {
  const code = () => S.shopN.code;
  const picture = async (client, shopCode) => {
    const main = await client.post(`/api/shops/${shopCode}/media`, jpeg({ width: 1600, height: 2000, bytes: 30_000 }), { "Content-Type": "image/jpeg" });
    assert.equal(main.status, 201, main.text);
    const thumb = await client.post(`/api/shops/${shopCode}/media/${main.json.media.id}/thumb`, jpeg({ width: 480, height: 600, bytes: 6000 }), { "Content-Type": "image/jpeg" });
    assert.equal(thumb.status, 201, thumb.text);
    return thumb.json.media;
  };
  /** A complete product record, as the dashboard would send it. */
  const record = (media, change = {}) => {
    const p = model.emptyProduct("someone-elses-shop");
    return Object.assign(p, {
      name: "Teak Memory Frame",
      description: "A hand-finished teak frame with your photo printed on matte paper and fitted behind clear acrylic.",
      category: "photo-frames",
      productType: "photo-frame",
      pricing: { basePrice: 1299, currency: "USD", discountPercent: 10 },
      frame: { ...p.frame, type: "wood", material: "Teak wood", color: "walnut", colors: ["walnut", "black"], finish: "Matte", width: 30, depth: 22 },
      print: { materials: [{ id: "pm1", type: "matte-paper", name: "Matte Photo Paper", finish: "Matte", thickness: "260 gsm", priceModifier: 0 }], quality: "Standard", notes: "" },
      protection: { options: [{ type: "acrylic", priceModifier: 0 }], default: "acrylic" },
      back: { ...p.back, backing: "MDF backing board", hanging: "Sawtooth hanger" },
      sizes: [
        { id: "m", label: "Medium", width: 12, height: 16, unit: "in", price: 1299 },
        { id: "l", label: "Large", width: 16, height: 20, unit: "in", price: 1699 }
      ],
      views: [{ id: "v0", type: "FRONT", url: media.ref, thumb: media.thumb, alt: "Front of the teak frame", sortOrder: 0, isMain: true }],
      included: ["The frame", "Your photo, printed and fitted", "Hanging hook"],
      care: ["Wipe with a soft dry cloth"],
      availability: { status: "in_stock", stock: 3, leadTime: "3 days", pickup: true, delivery: true, deliveryNotes: "Delivered in bubble wrap" },
      status: "published",
      ...change
    });
  };

  test("9. the shop lists a Photo Frame: it is on sale, and the customer's photo is required for it", async () => {
    S.media = await picture(shopN, code());
    S.frameId = "lp-" + crypto.randomBytes(6).toString("hex");
    const saved = await shopN.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media, { personalization: { photos: 0 }, shopId: "shop-002", rating: { average: 5, count: 999 }, quality: { items: { frameQuality: "Standard" }, source: "framex", verification: { status: "framex_verified" } } }));
    assert.equal(saved.status, 200, saved.text);
    const p = saved.json.product;
    assert.deepEqual([p.status, p.onSale, p.shopId, p.productType, p.personalization.photos], ["published", true, code(), "photo-frame", 1], "a photo frame always needs the photo: the shop's 0 is brought back to 1");
    assert.deepEqual([p.rating, p.quality.source, p.quality.verification.status, p.pricing.currency], [undefined, "shop_claimed", "not_verified", "INR"], "no invented rating, no FrameX verification, rupees");

    // Customers find it in the public catalogue, with real picture addresses and the shop's name.
    const listed = (await visitor.get("/api/catalog/shop-products")).json.items;
    const mine = listed.find((x) => x.id === S.frameId);
    assert.deepEqual([mine.shopId, mine.shopName, mine.name, mine.views[0].url, mine.views[0].thumb, mine.listingImage], [code(), "Kalinga Art House", "Teak Memory Frame", `/media/${S.media.id}`, `/media/${S.media.id}/thumb`, `/media/${S.media.id}/thumb`]);
    const pic = await fetch(base + mine.views[0].url);
    assert.deepEqual([pic.status, pic.headers.get("content-type")], [200, "image/jpeg"]);
    assert.equal((await fetch(base + mine.views[0].thumb)).status, 200);

    // In the cart it behaves like any photo frame.
    await empty(asha);
    const refused = await asha.post("/api/cart/items", { productId: S.frameId });
    assert.equal(refused.status, 422);
    assert.equal(refused.json.error.message, "Please upload your photo to continue. Your photo is required to create this personalized frame.");
    const added = await asha.post("/api/cart/items", { productId: S.frameId, selection: { sizeId: "l" }, photos: { photo1: S.fourK } });
    assert.equal(added.status, 201, added.text);
    const [line] = lines(added);
    assert.deepEqual([line.name, line.shopId, line.shopName, line.unitPrice, line.image, line.photosRequired], ["Teak Memory Frame", code(), "Kalinga Art House", Math.round(1699 * 0.9), `/media/${S.media.id}/thumb`, 1]);
  });

  test("11. an order for the shop's own product reaches that shop, with the customer's original photo", async () => {
    const placed = await placeCart(asha);
    assert.equal(placed.status, 201, placed.text);
    const number = placed.json.order.orderNumber;
    const order = (await shopN.get(`/api/shops/${code()}/orders/${number}`)).json.order;
    assert.deepEqual(order.items.map((i) => [i.productId, i.shopId, i.photos[0].id]), [[S.frameId, code(), S.fourK]]);
    const link = await shopN.post(`/api/shops/${code()}/orders/${number}/photos/${S.fourK}/link`);
    assert.ok((await download(link.json.link)).body.equals(S.fourKBytes));
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/orders/${number}`)).status, 404);
    // Stock was taken from the shop's own count (3).
    const listed = (await visitor.get("/api/catalog/shop-products")).json.items.find((x) => x.id === S.frameId);
    assert.equal(listed.availability.stock, 2);
  });

  test("10. the shop lists a Home Decor piece: no photo is asked for, whatever number the shop sends", async () => {
    S.decorId = "lp-" + crypto.randomBytes(6).toString("hex");
    const saved = await shopN.put(`/api/shops/${code()}/products/${S.decorId}`, record(S.media, { name: "Brass Elephant Wall Hanging", category: "wall-art", productType: "home-decor", personalization: { photos: 3 }, customization: { photoUpload: true, crop: true }, frame: { type: "", material: "" }, giftWrap: false }));
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual([saved.json.product.productType, saved.json.product.personalization.photos, saved.json.product.customization.photoUpload, saved.json.product.giftWrap], ["home-decor", 0, false, false]);
    await empty(asha);
    const added = await asha.post("/api/cart/items", { productId: S.decorId });
    assert.equal(added.status, 201, added.text);
    assert.deepEqual([lines(added)[0].photosRequired, lines(added)[0].productType], [0, "home-decor"]);
    // The shop switched gift wrapping off for this product.
    const quote = await quoteFor(asha, { giftWrap: true });
    assert.deepEqual([quote.giftWrap.available, quote.giftWrap.reason, quote.giftWrapFee], [false, "Gift wrapping is not available for Brass Elephant Wall Hanging.", 0]);
    assert.equal((await placeCart(asha)).status, 201);
  });

  test("a template-based product needs every one of its photos", async () => {
    S.tplId = "lp-" + crypto.randomBytes(6).toString("hex");
    const saved = await shopN.put(`/api/shops/${code()}/products/${S.tplId}`, record(S.media, { name: "Four Seasons Collage Frame", productType: "template", personalization: { photos: 4 } }));
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json.product.personalization.photos, 4);
    const r = await asha.post("/api/cart/items", { productId: S.tplId, photos: { photo1: S.fourK, photo2: S.second } });
    assert.equal(r.status, 422);
    assert.equal(r.json.error.message, "Please upload all 4 required photos to continue.");
    const one = await shopN.put(`/api/shops/${code()}/products/${S.tplId}`, record(S.media, { name: "Four Seasons Collage Frame", productType: "template", personalization: { photos: 1 } }));
    assert.equal(one.json.product.personalization.photos, 2, "a template has at least two photo spaces");
  });

  test("an incomplete product can be kept as a draft but not published; a draft is not on sale", async () => {
    const id = "lp-" + crypto.randomBytes(6).toString("hex");
    const incomplete = record(S.media, { name: "No price yet", pricing: { basePrice: null, discountPercent: 0 }, sizes: [], views: [], productType: "" });
    const publish = await shopN.put(`/api/shops/${code()}/products/${id}`, incomplete);
    assert.equal(publish.status, 422);
    assert.equal(publish.json.error.code, "PRODUCT_INCOMPLETE");
    assert.deepEqual(publish.json.error.details.issues.map((i) => i.message).sort(), ["Add a base price", "Add at least one available size", "Add at least one product image", "Choose what you are selling (the product type)"]);
    const draft = await shopN.put(`/api/shops/${code()}/products/${id}`, { ...incomplete, status: "draft" });
    assert.equal(draft.status, 200, draft.text);
    assert.deepEqual([draft.json.product.status, draft.json.product.onSale], ["draft", false]);
    assert.equal((await visitor.get("/api/catalog/shop-products")).json.items.some((x) => x.id === id), false);
    assert.equal((await asha.post("/api/cart/items", { productId: id })).status, 409, "a draft can't be bought");
    const claims = await shopN.put(`/api/shops/${code()}/products/${id}`, record(S.media, { name: "FrameX Verified best quality frame" }));
    assert.equal(claims.status, 422);
    assert.match(claims.json.error.details.issues[0].message, /Remove claims only FrameX can make/);
    assert.equal((await shopN.del(`/api/shops/${code()}/products/${id}`)).status, 200);
    assert.equal((await shopN.get(`/api/shops/${code()}/products/${id}`)).status, 404);
  });

  test("a shop can only touch its own products and its own pictures", async () => {
    // Another shop can't read, change or remove it, and can't use this shop's pictures.
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/products/${S.frameId}`)).status, 404);
    assert.equal((await shopB.put(`/api/shops/${S.shopB.code}/products/${S.frameId}`, record(S.media, { name: "Hijacked" }))).status, 404);
    assert.equal((await shopB.del(`/api/shops/${S.shopB.code}/products/${S.frameId}`)).status, 404);
    assert.equal((await shopB.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media))).status, 403, "the Shop ID in the address must be the session's own");
    const stolen = await shopB.put(`/api/shops/${S.shopB.code}/products/lp-${crypto.randomBytes(6).toString("hex")}`, record(S.media, { name: "Uses someone else's picture" }));
    assert.equal(stolen.status, 422);
    assert.match(stolen.json.error.fields.images, /belongs to another shop/);
    // The catalogue file's products are FrameX's to manage: not reachable through the shop API.
    assert.equal((await shopB.put(`/api/shops/${S.shopB.code}/products/${FRAME.id}`, record(S.media))).status, 422);
    assert.equal((await shopB.get(`/api/shops/${S.shopB.code}/products`)).json.items.length, 0);
    assert.equal((await row("SELECT name, source FROM catalog_products WHERE id = $1", [FRAME.id])).source, "site");
    // Customers and visitors have no way in.
    assert.equal((await asha.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media))).status, 403);
    assert.equal((await visitor.get(`/api/shops/${code()}/products`)).status, 401);
    assert.equal((await asha.post(`/api/shops/${code()}/media`, jpeg(), { "Content-Type": "image/jpeg" })).status, 403);
    // Pictures must be real images, and addresses a browser could abuse are refused.
    assert.equal((await shopN.post(`/api/shops/${code()}/media`, Buffer.from("<svg onload=alert(1)>"), { "Content-Type": "image/jpeg" })).status, 415);
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "https://evil.example/x.jpg", "../../backend/.env", `media:${crypto.randomUUID()}`]) {
      const r = await shopN.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media, { views: [{ id: "v0", type: "FRONT", url, alt: "x", isMain: true }] }));
      assert.equal(r.status, 422, url);
    }
    for (const price of [-5, 10_000_000, "abc"]) assert.equal((await shopN.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media, { pricing: { basePrice: price, discountPercent: 0 } }))).status, 422, String(price));
    assert.equal((await shopN.put(`/api/shops/${code()}/products/${S.frameId}`, record(S.media, { pricing: { basePrice: 999, discountPercent: 95 } }))).status, 422);
    assert.equal((await shopN.get(`/api/shops/${code()}/products/${S.frameId}`)).json.product.name, "Teak Memory Frame", "none of that changed the product");
  });

  test("a picture no product uses any more is removed after a while; pictures in use are kept", async () => {
    const unused = await picture(shopN, code());
    assert.equal((await fetch(`${base}/media/${unused.id}`)).status, 200);
    await sweepUnusedMedia();
    assert.equal((await fetch(`${base}/media/${unused.id}`)).status, 200, "a fresh upload is left alone: the shop may still be editing");
    await db.query("UPDATE media_files SET created_at = now() - interval '30 days'");
    assert.equal(await sweepUnusedMedia(), 1);
    assert.equal((await fetch(`${base}/media/${unused.id}`)).status, 404);
    assert.equal((await fetch(`${base}/media/${unused.id}/thumb`)).status, 404);
    assert.equal((await fetch(`${base}/media/${S.media.id}`)).status, 200, "the picture the shop's products use is still there");
    assert.equal((await fetch(`${base}/media/${S.media.id}/thumb`)).status, 200);
  });

  test("restarting the server (catalogue import) leaves the shop's products alone", async () => {
    const before = await row("SELECT status, source, data FROM catalog_products WHERE id = $1", [S.frameId]);
    await syncCatalog();
    const after = await row("SELECT status, source, data FROM catalog_products WHERE id = $1", [S.frameId]);
    assert.deepEqual([after.status, after.source, after.data.name], [before.status, "shop", "Teak Memory Frame"]);
    assert.equal((await row("SELECT status FROM catalog_products WHERE id = $1", [FRAME.id])).status, "ACTIVE");
  });

  test("the platform keeps the last word: a shop that is not listed sells nothing; FrameX can take a product off sale", async () => {
    await empty(asha);
    await asha.post("/api/cart/items", { productId: S.frameId, photos: { photo1: S.fourK } });
    await db.query("UPDATE shops SET active_status = 'INACTIVE' WHERE id = $1", [S.shopN.id]);
    assert.equal((await visitor.get("/api/catalog/shop-products")).json.items.some((x) => x.shopId === code()), false);
    const cart = (await asha.get("/api/cart")).json.cart;
    assert.deepEqual([cart.items[0].available, cart.items[0].issue.code], [false, "PRODUCT_UNAVAILABLE"]);
    await db.query("UPDATE shops SET active_status = 'ACTIVE' WHERE id = $1", [S.shopN.id]);
    assert.equal((await asha.get("/api/cart")).json.cart.items[0].available, true);

    const all = await admin.get("/api/admin/products");
    assert.ok(all.json.items.some((x) => x.id === S.frameId && x.shopCode === code() && x.onSale));
    const off = await admin.post(`/api/admin/products/${S.frameId}/listing`, { status: "unpublished", note: "Picture is misleading" });
    assert.equal(off.status, 200, off.text);
    assert.deepEqual([off.json.product.status, off.json.product.onSale], ["unpublished", false]);
    assert.equal((await asha.get("/api/cart")).json.cart.items[0].available, false);
    assert.equal((await shopN.post(`/api/admin/products/${S.frameId}/listing`, { status: "published" })).status, 403, "a shop is not FrameX staff");
    assert.equal((await admin.post(`/api/admin/products/${S.frameId}/listing`, { status: "published" })).json.product.onSale, true);
    await empty(asha);
  });

  test("with moderation switched on, a shop's Publish waits for FrameX", async () => {
    config.catalog.productModeration = true;
    try {
      const id = "lp-" + crypto.randomBytes(6).toString("hex");
      const saved = await shopN.put(`/api/shops/${code()}/products/${id}`, record(S.media, { name: "Waiting for review" }));
      assert.deepEqual([saved.json.product.status, saved.json.product.onSale], ["pending_review", false]);
      assert.equal((await asha.post("/api/cart/items", { productId: id, photos: { photo1: S.fourK } })).status, 409);
      assert.equal((await admin.get("/api/admin/products?status=pending_review")).json.items.length, 1);
      assert.equal((await admin.post(`/api/admin/products/${id}/listing`, { status: "published" })).json.product.onSale, true);
      assert.equal((await asha.post("/api/cart/items", { productId: id, photos: { photo1: S.fourK } })).status, 201);
      // Once approved, the shop's later edits stay published.
      assert.equal((await shopN.put(`/api/shops/${code()}/products/${id}`, record(S.media, { name: "Waiting for review (edited)" }))).json.product.status, "published");
    } finally {
      config.catalog.productModeration = false;
    }
    await empty(asha);
  });
});

/* ==========================================================================
   Popular products (owner, 2026-11-01): GET /api/catalog/popular lists the
   products ordered most in the last 30 days, then those viewed most, for
   "Highly recommended frames" on the home page and the product page's
   suggestions. Run with "npm test". Orders are COD orders placed through
   the API; the test then changes them in the database (cancelled, test,
   older, refunded). Views are analytics rows (view_item) written directly.
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
const { default: crypto } = await import("node:crypto");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  get = (path) => this.request("GET", path);
  post = (path, body = {}) => this.request("POST", path, body);
}
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const PASSWORD = "Sunrise-Frame-42";
const { seed, model } = siteEngine();
const [A, B, C, D, E, F] = seed.products.map((p) => model.normalize(p)).filter((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty >= 3);
let buyer;

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  buyer = new Client();
  assert.equal((await buyer.post("/api/auth/signup", { name: "Rina Das", email: "rina.best@example.com", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  const address = await buyer.post("/api/addresses", { fullName: "Rina Das", phone: "9876500021", line1: "4 Temple Street", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" });
  assert.equal(address.status, 201, address.text);
  buyer.addressId = address.json.address.id;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

/** A COD order of these products; answers its id in the database. */
async function order(...lines) {
  for (const [p, quantity = 1] of lines) assert.equal((await buyer.post("/api/cart/items", { productId: p.id, quantity })).status, 201);
  const quote = (await buyer.get(`/api/checkout/quote?addressId=${buyer.addressId}&paymentMethod=COD`)).json.quote;
  const r = await buyer.post("/api/checkout/orders", { addressId: buyer.addressId, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201, r.text);
  return (await db.query("SELECT id FROM orders WHERE order_number = $1", [r.json.order.orderNumber])).rows[0].id;
}
const best = async () => {
  const r = await new Client().get("/api/catalog/popular");
  assert.equal(r.status, 200, r.text);
  return r.json;
};
const set = (id, sql, values = []) => db.query(`UPDATE orders SET ${sql} WHERE id = $1`, [id, ...values]);

/** A visitor (who allowed analytics) opened this product page. */
const view = (product, visitor, { daysAgo = 0, name = "view_item", type = "product" } = {}) =>
  db.query(
    `INSERT INTO analytics_events (id, occurred_at, source, name, visitor_id, session_id, page, path, item_type, item_id)
     VALUES ($1, now() - make_interval(days => $2), 'web', $3, $4, $4, 'product', '/product.html', $5, $6)`,
    [crypto.randomUUID(), daysAgo, name, "visitor-" + visitor + "-0000000000", type, product.id],
  );

describe("Popular products: ordered most, then viewed most, in the last 30 days", () => {
  test("no orders or views yet: an empty list, open to anyone (no login)", async () => {
    assert.ok(A && B && C && D && E && F, "six products that can be ordered");
    assert.deepEqual(await best(), { days: 30, items: [] });
  });

  let cOrder;
  test("most orders first: a product in 2 orders comes before one ordered 3 at once; only ids are given out, no counts", async () => {
    await order([B, 1]);
    await order([A, 3], [B, 1]);
    cOrder = await order([C, 1]);
    const r = await best();
    assert.deepEqual(r.items.slice(0, 2), [B.id, A.id]);
    assert.deepEqual(Object.keys(r).sort(), ["days", "items"]);
    assert.ok(r.items.every((id) => typeof id === "string"), "ids only");
    assert.ok(r.items.includes(C.id));
  });

  test("a new order changes the list straight away", async () => {
    await order([C, 1]);
    await order([C, 1]);
    assert.equal((await best()).items[0], C.id, "C now has 3 orders");
    await db.query("DELETE FROM order_items WHERE product_id = $1 AND order_id <> $2", [C.id, cOrder]);
  });

  for (const [what, sql, values, undo] of [
    ["a cancelled order", "status = 'CANCELLED'", [], "status = 'PLACED'"],
    ["a returned order", "status = 'RETURNED'", [], "status = 'PLACED'"],
    ["a refunded order", "payment_status = 'REFUNDED'", [], "payment_status = 'PENDING'"],
    ["a test order", "is_test = true", [], "is_test = false"],
    ["an order older than 30 days", "created_at = now() - interval '31 days'", [], "created_at = now()"],
  ]) {
    test(`${what} doesn't count`, async () => {
      assert.ok((await best()).items.includes(C.id), "C counts before");
      await set(cOrder, sql, values);
      assert.ok(!(await best()).items.includes(C.id), `${what} is left out`);
      await set(cOrder, undo);
      assert.ok((await best()).items.includes(C.id), "and counts again once undone");
    });
  }

  test("then the products viewed most, counted once per visitor (opening it again adds nothing)", async () => {
    for (const v of ["a", "b", "c"]) await view(D, v);
    for (let i = 0; i < 5; i++) await view(E, "z");
    await view(E, "y");
    const items = (await best()).items;
    assert.deepEqual(items, [B.id, A.id, C.id, D.id, E.id], "the ordered ones first, then 3 visitors before 2 visitors (who opened it 6 times)");
  });

  test("a product both ordered and viewed is listed once, where its orders put it", async () => {
    for (const v of ["a", "b", "c", "d", "e"]) await view(A, v);
    const items = (await best()).items;
    assert.equal(items.filter((id) => id === A.id).length, 1);
    assert.equal(items.indexOf(A.id), 1, "second, by its orders");
  });

  test("views older than 30 days, and views of other things, don't count", async () => {
    for (const v of ["p", "q", "r", "s"]) await view(F, v, { daysAgo: 31 });
    await view(F, "t", { name: "view_template" });
    await view(F, "u", { type: "artwork" }); // a product view must say "product"
    await view(F, "w", { name: "view_artwork" }); // an artwork view must say "artwork"
    assert.ok(!(await best()).items.includes(F.id));
  });

  test("an artwork's page views count too (its id is its product id)", async () => {
    const artwork = { id: "6f1c2b9e-0000-4000-8000-00000000a001" };
    for (const v of ["m", "n", "o", "p"]) await view(artwork, v, { name: "view_artwork", type: "artwork" });
    const items = (await best()).items;
    assert.equal(items.indexOf(artwork.id), 3, "after the 3 ordered ones, before D (3 visitors) as 4 visitors saw it");
  });
});

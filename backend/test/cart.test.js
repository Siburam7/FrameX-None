/* ==========================================================================
   Cart tests: run with "npm test" in backend/.
   A real server on a random port, an in-memory PostgreSQL (PGlite), the real
   catalogue files, and every check through HTTP like the website.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "none";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");

let server;
let base;

/** A browser-like client: keeps the session cookie between requests. */
class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
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
  get = (path) => this.request("GET", path);
  post = (path, body = {}) => this.request("POST", path, body);
  patch = (path, body = {}) => this.request("PATCH", path, body);
  del = (path) => this.request("DELETE", path);
}

const PASSWORD = "Sunrise-Frame-42";
// A product that is made from the customer's photo can't be ordered without one:
// items these tests add or buy get the uploads they need (test/support/photos.js).
const { autoPhotos } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const ASHA = { name: "Asha Rout", email: "asha@example.com", phone: "9876500011", password: PASSWORD, confirmPassword: PASSWORD };
const BINOD = { name: "Binod Das", email: "binod@example.com", password: PASSWORD, confirmPassword: PASSWORD };
const asha = new Client();
const binod = new Client();

const { seed, model, studio, templates: templateEngine } = siteEngine();
const normalized = (id) => model.normalize(seed.products.find((p) => p.id === id));
// A product with several sizes and plenty of stock, one with little stock, and a second ordinary one.
const roomy = seed.products.map((p) => model.normalize(p)).find((p) => p.sizes.length > 1 && model.orderLimits(p).maxQty === model.MAX_CART_QTY);
const scarce = seed.products.map((p) => model.normalize(p)).find((p) => model.orderLimits(p).orderable && model.orderLimits(p).maxQty < 10);
const other = seed.products.map((p) => model.normalize(p)).find((p) => p.id !== roomy.id && p.id !== scarce.id && model.orderLimits(p).orderable);
const priceOf = (p, sel = {}) => model.cartLine(p, sel).unitPrice;
const sizeIds = roomy.sizes.map((s) => s.id);
const lines = (r) => r.json.cart.items;
const itemsInDb = async (email) => (await db.query("SELECT i.* FROM cart_items i JOIN carts c ON c.id = i.cart_id JOIN users u ON u.id = c.user_id WHERE u.email = $1 ORDER BY i.created_at", [email])).rows;

/** A complete design for a template: every photo slot filled. */
function templateDesign(template, change = {}) {
  const ctx = studio.context({ template });
  const cfg = JSON.parse(JSON.stringify(studio.defaults(ctx)));
  templateEngine.slotsOf(template).forEach((slot, i) => {
    cfg.photos[slot] = `photo-${i + 1}`;
    cfg.photoMeta[slot] = { w: 1600, h: 1200 };
  });
  return { ctx, cfg: Object.assign(cfg, change) };
}

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.close();
});

describe("catalogue in the database", () => {
  test("products and templates are imported from the website's catalogue", async () => {
    const products = (await db.query("SELECT id, status, shop_name, data FROM catalog_products ORDER BY id")).rows;
    assert.equal(products.length, seed.products.length);
    const row = products.find((p) => p.id === roomy.id);
    assert.equal(row.status, "ACTIVE");
    assert.ok(row.shop_name, "the shop's name is stored with the product");
    assert.equal(row.data.price, seed.products.find((p) => p.id === roomy.id).price);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM catalog_templates")).rows[0].n, seed.templates.length);
  });

  test("importing again changes nothing", async () => {
    assert.equal((await syncCatalog()).changed, 0);
  });
});

describe("no cart without an account", () => {
  test("every cart address answers 401 to a visitor, and nothing is stored", async () => {
    const visitor = new Client();
    assert.equal((await visitor.get("/api/cart")).status, 401);
    assert.equal((await visitor.post("/api/cart/items", { productId: roomy.id })).status, 401);
    assert.equal((await visitor.patch("/api/cart/items/00000000-0000-4000-8000-000000000000", { quantity: 2 })).status, 401);
    assert.equal((await visitor.del("/api/cart/items/00000000-0000-4000-8000-000000000000")).status, 401);
    assert.equal((await visitor.del("/api/cart")).status, 401);
    assert.equal((await visitor.post("/api/cart/validate")).status, 401);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM carts")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cart_items")).rows[0].n, 0);
  });

  test("a new account starts with an empty cart", async () => {
    assert.equal((await asha.post("/api/auth/signup", ASHA)).status, 201);
    const r = await asha.get("/api/cart");
    assert.equal(r.status, 200);
    assert.deepEqual(lines(r), []);
    assert.equal(r.json.cart.count, 0);
    assert.equal(r.json.cart.subtotal, 0);
  });
});

describe("adding products", () => {
  test("the server sets the name, the options and the price; what the browser claims is ignored", async () => {
    const sel = { sizeId: sizeIds[1] };
    const r = await asha.post("/api/cart/items", {
      productId: roomy.id,
      quantity: 2,
      selection: sel,
      note: "  Gift wrap please  ",
      // none of these may have any effect:
      unitPrice: 1,
      price: 1,
      name: "Free frame",
      userId: "someone-else",
      cartId: "another-cart",
      discount: 100
    });
    assert.equal(r.status, 201, r.text);
    assert.equal(lines(r).length, 1);
    const line = lines(r)[0];
    assert.equal(line.id, r.json.itemId);
    assert.equal(line.name, roomy.name);
    assert.equal(line.unitPrice, priceOf(roomy, sel), "price comes from the catalogue");
    assert.equal(line.lineTotal, priceOf(roomy, sel) * 2);
    assert.equal(line.quantity, 2);
    assert.equal(line.note, "Gift wrap please");
    assert.equal(line.size, model.cartLine(roomy, sel).size);
    assert.equal(line.available, true);
    assert.equal(line.maxQuantity, model.MAX_CART_QTY);
    assert.ok(line.shopName);
    assert.equal(r.json.cart.count, 2);
    assert.equal(r.json.cart.subtotal, priceOf(roomy, sel) * 2);

    const stored = await itemsInDb(ASHA.email);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].unit_price, priceOf(roomy, sel));
    assert.deepEqual(Object.keys(stored[0].selection).sort(), ["colorId", "printMaterialId", "protection", "sizeId"]);
    state.first = line.id;
  });

  test("the same choice adds to the line; another size or note is its own line", async () => {
    const same = await asha.post("/api/cart/items", { productId: roomy.id, quantity: 1, selection: { sizeId: sizeIds[1] }, note: "Gift wrap please" });
    assert.equal(lines(same).length, 1);
    assert.equal(lines(same)[0].quantity, 3);
    assert.equal(same.json.itemId, state.first);

    const otherSize = await asha.post("/api/cart/items", { productId: roomy.id, selection: { sizeId: sizeIds[0] } });
    assert.equal(lines(otherSize).length, 2);
    assert.equal(lines(otherSize)[1].unitPrice, priceOf(roomy, { sizeId: sizeIds[0] }));
    assert.equal(lines(otherSize)[1].quantity, 1, "quantity defaults to 1");
    assert.equal(otherSize.json.cart.count, 4);
    assert.equal(otherSize.json.cart.subtotal, priceOf(roomy, { sizeId: sizeIds[1] }) * 3 + priceOf(roomy, { sizeId: sizeIds[0] }));
    state.second = otherSize.json.itemId;
  });

  test("a missing option falls back to the product's default", async () => {
    const r = await asha.post("/api/cart/items", { productId: other.id });
    assert.equal(r.status, 201, r.text);
    const line = lines(r).find((l) => l.id === r.json.itemId);
    assert.equal(line.unitPrice, priceOf(other, model.defaultSelection(other)));
    state.third = line.id;
  });

  test("unknown products, options the product doesn't have and bad quantities are refused", async () => {
    const count = (await itemsInDb(ASHA.email)).length;
    assert.equal((await asha.post("/api/cart/items", { productId: "p-does-not-exist" })).status, 404);
    assert.equal((await asha.post("/api/cart/items", { productId: "<script>" })).status, 422);
    assert.equal((await asha.post("/api/cart/items", {})).status, 422);
    const badSize = await asha.post("/api/cart/items", { productId: roomy.id, selection: { sizeId: "giant" } });
    assert.equal(badSize.status, 422);
    assert.equal(badSize.json.error.code, "OPTION_UNAVAILABLE");
    for (const quantity of [0, -1, 1.5, "two", model.MAX_CART_QTY + 1]) {
      assert.equal((await asha.post("/api/cart/items", { productId: roomy.id, quantity })).status, 422, `quantity ${quantity}`);
    }
    assert.equal((await asha.post("/api/cart/items", { productId: roomy.id, note: "x".repeat(301) })).status, 422);
    assert.equal((await itemsInDb(ASHA.email)).length, count, "nothing was added");
  });

  test("a line can't grow past the limit, and the stock sets a lower limit", async () => {
    const tooMany = await asha.post("/api/cart/items", { productId: roomy.id, quantity: model.MAX_CART_QTY - 2, selection: { sizeId: sizeIds[1] }, note: "Gift wrap please" });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.json.error.code, "QUANTITY_LIMIT");
    assert.equal((await itemsInDb(ASHA.email)).find((i) => i.id === state.first).quantity, 3, "the refused change left the line alone");

    const max = model.orderLimits(scarce).maxQty;
    const over = await asha.post("/api/cart/items", { productId: scarce.id, quantity: max + 1 });
    assert.equal(over.status, 409);
    const fits = await asha.post("/api/cart/items", { productId: scarce.id, quantity: max });
    assert.equal(fits.status, 201);
    assert.equal(lines(fits).find((l) => l.id === fits.json.itemId).maxQuantity, max);
    assert.equal((await asha.post("/api/cart/items", { productId: scarce.id, quantity: 1 })).status, 409);
    state.scarce = fits.json.itemId;
  });

  test("hidden and sold-out products can't be added", async () => {
    await db.query("UPDATE catalog_products SET status = 'INACTIVE' WHERE id = $1", [other.id]);
    const hidden = await asha.post("/api/cart/items", { productId: other.id });
    assert.equal(hidden.status, 409);
    assert.equal(hidden.json.error.code, "PRODUCT_UNAVAILABLE");
    await db.query("UPDATE catalog_products SET status = 'ACTIVE', data = jsonb_set(data, '{stock}', '0') WHERE id = $1", [other.id]);
    const soldOut = await asha.post("/api/cart/items", { productId: other.id });
    assert.equal(soldOut.status, 409);
    assert.equal(soldOut.json.error.code, "OUT_OF_STOCK");
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '20') WHERE id = $1", [other.id]);
  });
});

const state = {};

describe("changing a cart", () => {
  test("quantity can be changed within the limits", async () => {
    const r = await asha.patch(`/api/cart/items/${state.second}`, { quantity: 5 });
    assert.equal(r.status, 200, r.text);
    assert.equal(lines(r).find((l) => l.id === state.second).quantity, 5);
    assert.equal((await asha.patch(`/api/cart/items/${state.second}`, { quantity: 0 })).status, 422);
    assert.equal((await asha.patch(`/api/cart/items/${state.second}`, {})).status, 422);
    assert.equal((await asha.patch(`/api/cart/items/${state.second}`, { quantity: model.MAX_CART_QTY + 1 })).status, 422);
    assert.equal((await asha.patch(`/api/cart/items/${state.scarce}`, { quantity: model.orderLimits(scarce).maxQty + 1 })).status, 409);
    assert.equal((await asha.get("/api/cart")).json.cart.items.find((l) => l.id === state.second).quantity, 5);
  });

  test("an item can be removed; ids that aren't in the cart answer 404", async () => {
    const r = await asha.del(`/api/cart/items/${state.scarce}`);
    assert.equal(r.status, 200);
    assert.equal(lines(r).some((l) => l.id === state.scarce), false);
    assert.equal((await asha.del(`/api/cart/items/${state.scarce}`)).status, 404);
    assert.equal((await asha.del("/api/cart/items/not-an-id")).status, 404);
    assert.equal((await asha.patch("/api/cart/items/00000000-0000-4000-8000-000000000000", { quantity: 1 })).status, 404);
  });
});

describe("one cart per account, and only its owner can touch it", () => {
  test("another customer sees an empty cart and can't read, change or remove someone else's items", async () => {
    assert.equal((await binod.post("/api/auth/signup", BINOD)).status, 201);
    assert.deepEqual(lines(await binod.get("/api/cart")), []);

    const before = JSON.stringify(await itemsInDb(ASHA.email));
    assert.equal((await binod.patch(`/api/cart/items/${state.first}`, { quantity: 9 })).status, 404);
    assert.equal((await binod.del(`/api/cart/items/${state.first}`)).status, 404);
    assert.equal((await binod.del("/api/cart")).status, 200, "clearing only ever clears the caller's own cart");
    assert.equal((await binod.post("/api/cart/validate")).json.ok, false);
    assert.equal(JSON.stringify(await itemsInDb(ASHA.email)), before, "the other cart is untouched");
  });

  test("each account gets its own cart row, linked by user id", async () => {
    const mine = await binod.post("/api/cart/items", { productId: roomy.id, selection: { sizeId: sizeIds[0] } });
    assert.equal(mine.status, 201);
    assert.equal(lines(mine).length, 1);
    const carts = (await db.query("SELECT c.id, u.email FROM carts c JOIN users u ON u.id = c.user_id ORDER BY u.email")).rows;
    assert.deepEqual(carts.map((c) => c.email), [ASHA.email, BINOD.email]);
    assert.notEqual(carts[0].id, carts[1].id);
    assert.equal(mine.json.cart.id, carts[1].id);
    assert.equal((await asha.get("/api/cart")).json.cart.id, carts[0].id);
    // The same product and options in two carts stay two separate rows.
    assert.equal((await itemsInDb(BINOD.email)).length, 1);
    assert.equal((await asha.patch(`/api/cart/items/${mine.json.itemId}`, { quantity: 2 })).status, 404);
  });
});

describe("the cart stays with the account", () => {
  test("log out, log in again (or from another device): the same cart is back", async () => {
    const was = (await asha.get("/api/cart")).json.cart;
    assert.ok(was.items.length >= 3);
    assert.equal((await asha.post("/api/auth/logout")).status, 200);
    assert.equal((await asha.get("/api/cart")).status, 401);

    const otherDevice = new Client();
    assert.equal((await otherDevice.post("/api/auth/login", { identifier: ASHA.email, password: PASSWORD })).status, 200);
    const now = (await otherDevice.get("/api/cart")).json.cart;
    assert.equal(now.id, was.id);
    assert.deepEqual(now.items.map((i) => [i.id, i.quantity, i.unitPrice]), was.items.map((i) => [i.id, i.quantity, i.unitPrice]));
    assert.equal(now.subtotal, was.subtotal);

    assert.equal((await asha.post("/api/auth/login", { identifier: ASHA.phone, password: PASSWORD })).status, 200);
    assert.equal((await asha.get("/api/cart")).json.cart.id, was.id);
  });
});

describe("prices and availability are checked again on every read", () => {
  test("a new catalogue price shows at once; checkout reports it once, then accepts it", async () => {
    const old = priceOf(roomy, { sizeId: sizeIds[0] });
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{price}', to_jsonb((data->>'price')::int + 100)) WHERE id = $1", [roomy.id]);
    const cart = (await asha.get("/api/cart")).json.cart;
    const line = cart.items.find((l) => l.id === state.second);
    assert.notEqual(line.unitPrice, old);
    assert.deepEqual(line.priceChange, { from: old, to: line.unitPrice });
    assert.equal(cart.hasIssues, true);
    assert.equal(cart.subtotal, cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), "the subtotal uses today's prices");

    const first = await asha.post("/api/cart/validate");
    assert.equal(first.json.ok, false);
    assert.ok(first.json.issues.some((i) => i.code === "PRICE_CHANGED" && i.itemId === state.second));
    const second = await asha.post("/api/cart/validate");
    assert.equal(second.json.ok, true, second.text);
    assert.deepEqual(second.json.issues, []);
    assert.equal((await itemsInDb(ASHA.email)).find((i) => i.id === state.second).unit_price, line.unitPrice);
  });

  test("a product that left the catalogue is flagged, not counted, and blocks checkout until removed", async () => {
    const before = (await asha.get("/api/cart")).json.cart;
    await db.query("UPDATE catalog_products SET status = 'REMOVED' WHERE id = $1", [other.id]);
    const cart = (await asha.get("/api/cart")).json.cart;
    const gone = cart.items.find((l) => l.id === state.third);
    assert.equal(gone.available, false);
    assert.equal(gone.issue.code, "PRODUCT_UNAVAILABLE");
    assert.ok(gone.name, "it still has its name");
    assert.equal(cart.subtotal, before.subtotal - before.items.find((l) => l.id === state.third).lineTotal);

    const check = await asha.post("/api/cart/validate");
    assert.equal(check.json.ok, false);
    assert.ok(check.json.issues.some((i) => i.code === "PRODUCT_UNAVAILABLE" && i.itemId === state.third));
    assert.equal((await asha.patch(`/api/cart/items/${state.third}`, { quantity: 2 })).status, 409);
    assert.equal((await asha.del(`/api/cart/items/${state.third}`)).status, 200);
    assert.equal((await asha.post("/api/cart/validate")).json.ok, true);
    await db.query("UPDATE catalog_products SET status = 'ACTIVE' WHERE id = $1", [other.id]);
  });

  test("when stock drops below the quantity in the cart, checkout says so", async () => {
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '2') WHERE id = $1", [roomy.id]);
    const check = await asha.post("/api/cart/validate");
    assert.equal(check.json.ok, false);
    assert.ok(check.json.issues.some((i) => i.code === "QUANTITY_LIMIT"));
    await db.query("UPDATE catalog_products SET data = jsonb_set(data, '{stock}', '20') WHERE id = $1", [roomy.id]);
  });
});

describe("FrameX Studio designs", () => {
  const template = seed.templates.find((t) => t.available !== false);

  test("a finished design is priced by the server from its options", async () => {
    const { ctx, cfg } = templateDesign(template);
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0001", config: { ...cfg, total: 1, evil: "<script>" }, thumbnail: "data:image/jpeg;base64,AAAA" }, unitPrice: 1 });
    assert.equal(r.status, 201, r.text);
    const line = lines(r).find((l) => l.id === r.json.itemId);
    assert.equal(line.kind, "studio");
    assert.equal(line.name, template.title);
    assert.equal(line.unitPrice, studio.price(cfg, ctx).total);
    assert.equal(line.design.id, "d-test0001");
    assert.equal(line.design.type, "template");
    assert.equal(line.design.photoCount, templateEngine.slotsOf(template).length);
    assert.equal(line.image, "data:image/jpeg;base64,AAAA");
    assert.equal(line.shopName, "FrameX custom designs");
    const stored = (await itemsInDb(ASHA.email)).find((i) => i.id === line.id);
    assert.equal(stored.template_id, template.id);
    assert.equal("evil" in stored.customization, false, "unknown fields never reach the database");
    assert.equal("total" in stored.customization, false);
    state.design = line.id;
  });

  test("a dearer option costs more, and the server works that out", async () => {
    const sizes = studio.context({ template }).caps.sizes;
    const dearest = [...sizes].sort((a, b) => b.priceModifier - a.priceModifier)[0];
    const { ctx, cfg } = templateDesign(template, { sizeId: dearest.id });
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0002", config: cfg } });
    assert.equal(r.status, 201, r.text);
    const line = lines(r).find((l) => l.id === r.json.itemId);
    assert.equal(line.unitPrice, studio.price(cfg, ctx).total);
    assert.ok(line.image, "falls back to a site image when no preview was sent");
    assert.equal((await asha.del(`/api/cart/items/${line.id}`)).status, 200);
  });

  test("adding the same design again replaces it and counts one more", async () => {
    const { cfg } = templateDesign(template);
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0001", config: cfg } });
    assert.equal(r.status, 201);
    assert.equal(r.json.itemId, state.design);
    assert.equal(lines(r).find((l) => l.id === state.design).quantity, 2);
  });

  test("unfinished designs, unknown options and unknown templates are refused", async () => {
    const { cfg } = templateDesign(template);
    // A design without its uploaded photos is refused, whatever photo ids the design itself names.
    const noPhotos = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0003", config: cfg }, photos: {} });
    assert.equal(noPhotos.status, 422);
    assert.equal(noPhotos.json.error.code, "PHOTOS_REQUIRED");
    assert.match(noPhotos.json.error.message, /^Please upload /);
    const badOption = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0003", config: { ...cfg, sizeId: "gigantic" } } });
    assert.equal(badOption.status, 422);
    assert.equal(badOption.json.error.code, "OPTION_UNAVAILABLE");
    assert.equal((await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0003", config: { ...cfg, templateId: "tpl-nope" } } })).status, 409);
    assert.equal((await asha.post("/api/cart/items", { kind: "studio", design: { id: "../../etc", config: cfg } })).status, 422);
    assert.equal((await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0003" } })).status, 422);
    assert.equal((await asha.post("/api/cart/items", { kind: "studio" })).status, 422);
    assert.equal((await itemsInDb(ASHA.email)).filter((i) => i.kind === "STUDIO").length, 1);
  });

  test("text is cut to the template's limit; a script address is not accepted as a picture", async () => {
    const field = (template.textFields || [])[0];
    const { cfg } = templateDesign(template);
    if (field) cfg.text[field.id] = "A".repeat(500);
    const r = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0004", config: cfg, thumbnail: "javascript:alert(1)" } });
    assert.equal(r.status, 201, r.text);
    const stored = (await itemsInDb(ASHA.email)).find((i) => i.id === r.json.itemId);
    if (field) assert.equal(stored.customization.text[field.id].length, field.maxLength || 80);
    assert.equal(stored.thumbnail, null);
    assert.equal((await asha.del(`/api/cart/items/${r.json.itemId}`)).status, 200);
  });

  test("a single framed photo and a customised product are priced the same way", async () => {
    const photoCtx = studio.context({});
    const photo = { ...JSON.parse(JSON.stringify(studio.defaults(photoCtx))), photos: { photo1: "photo-1" } };
    const a = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0005", config: photo } });
    assert.equal(a.status, 201, a.text);
    const photoLine = lines(a).find((l) => l.id === a.json.itemId);
    assert.equal(photoLine.unitPrice, studio.price(photo, photoCtx).total);
    assert.equal(photoLine.design.type, "simple-photo");

    const frame = seed.products.map((p) => model.normalize(p)).find((p) => model.studioSupport(p).ok && model.orderLimits(p).orderable && p.id !== roomy.id && p.id !== other.id);
    const frameCtx = studio.context({ product: frame });
    const design = { ...JSON.parse(JSON.stringify(studio.defaults(frameCtx))), photos: { photo1: "photo-1" } };
    const b = await asha.post("/api/cart/items", { kind: "studio", design: { id: "d-test0006", config: design } });
    assert.equal(b.status, 201, b.text);
    const frameLine = lines(b).find((l) => l.id === b.json.itemId);
    assert.equal(frameLine.unitPrice, studio.price(design, frameCtx).total);
    assert.equal(frameLine.design.type, "product-frame");
    assert.equal(frameLine.productId, frame.id);
    assert.equal(frameLine.name, frame.name);
    assert.notEqual(frameLine.shopName, "FrameX custom designs", "a customised product belongs to its shop");
  });
});

describe("clearing", () => {
  test("clear empties only the caller's cart; the cart row stays with the account", async () => {
    const id = (await asha.get("/api/cart")).json.cart.id;
    const r = await asha.del("/api/cart");
    assert.equal(r.status, 200);
    assert.deepEqual(lines(r), []);
    assert.equal(r.json.cart.subtotal, 0);
    assert.equal(r.json.cart.id, id);
    assert.equal((await itemsInDb(BINOD.email)).length, 1);
    const check = await asha.post("/api/cart/validate");
    assert.equal(check.json.ok, false);
    assert.equal(check.json.issues[0].code, "CART_EMPTY");
  });

  test("deleting an account deletes its cart", async () => {
    await db.query("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)", [BINOD.email]);
    await db.query("DELETE FROM users WHERE email = $1", [BINOD.email]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM carts")).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cart_items")).rows[0].n, 0);
  });
});

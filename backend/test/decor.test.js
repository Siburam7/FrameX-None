/* ==========================================================================
   Home Decor & Wall Art: run with "npm test" in backend/.

   The wall-art catalogue (js/decor.js) is loaded by the same site engine as
   every other product, so these tests go through the ordinary cart, checkout
   and order routes: a real server, an in-memory PostgreSQL, real HTTP.
   What is special is checked here: the catalogue itself, and the "your photo"
   sets, whose customisation the server has to clean and verify.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.TAX_PERCENT = "0";
process.env.SHIPPING_FEE = "60";
process.env.SHIPPING_FREE_ABOVE = "0";
process.env.COD_ENABLED = "true";
process.env.COD_FEE = "40";
process.env.COD_MAX_ORDER_VALUE = "0";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const { createApp } = await import("../src/app.js");
const { siteEngine } = await import("../src/catalog/site-engine.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");

let server;
let base;

class Client {
  cookie = "";
  async request(method, url, body) {
    const response = await fetch(base + url, {
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
  get = (url) => this.request("GET", url);
  post = (url, body = {}) => this.request("POST", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
// A product that is made from the customer's photo can't be ordered without one:
// items these tests add or buy get the uploads they need (test/support/photos.js).
const { autoPhotos, jpeg, uploadPhoto } = await import("./support/photos.js");
autoPhotos(Client, () => base);

const MEERA = { name: "Meera Sahu", email: "meera@example.com", phone: "9876500033", password: PASSWORD, confirmPassword: PASSWORD };
const HOME = { fullName: "Meera Sahu", phone: "98765 00033", line1: "5 College Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" };
const meera = new Client();

const { seed, model, decor: rules } = siteEngine();
const wallArt = seed.products.filter((p) => p.section === "decor");
const byId = (id) => model.normalize(seed.products.find((p) => p.id === id));
const READY = byId("hd-never-give-up");
const SET = byId("hd-mp-cherry-tree-3");
const CUSTOM = byId("hd-custom-split-3");
const PHOTO = { name: "family-trip.jpg", width: 4032, height: 3024, x: 0.4, y: 0.55, zoom: 1.3 };
const good = (change = {}) => ({ layout: "side", spacing: "standard", border: "medium", photo: PHOTO, ...change });
const THUMB = "data:image/jpeg;base64," + Buffer.from("not really a picture, just bytes").toString("base64");
const lines = (r) => r.json.cart.items;
const empty = async () => assert.equal((await meera.del("/api/cart")).status, 200);

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await meera.post("/api/auth/signup", MEERA)).status, 201);
});

after(async () => {
  await emailsSettled();
  server.close();
  await db.close();
});

describe("the wall-art catalogue", () => {
  test("is imported into the database with the rest of the catalogue", async () => {
    assert.ok(wallArt.length >= 200, `${wallArt.length} wall-art products`);
    const rows = (await db.query("SELECT id, status, shop_name FROM catalog_products WHERE id LIKE 'hd-%'")).rows;
    assert.equal(rows.length, wallArt.length);
    assert.ok(rows.every((r) => r.status === "ACTIVE" && r.shop_name));
    assert.equal(new Set(seed.products.map((p) => p.id)).size, seed.products.length, "every product id is unique");
    assert.equal(new Set(seed.products.map((p) => p.slug)).size, seed.products.length, "every product address is unique");
  });

  test("has the 20 collections, each with a real range, and sets of 2 to 5 panels", () => {
    const collections = seed.decor.collections;
    assert.equal(collections.length, 20);
    for (const name of ["Motivational", "Quotes", "Funny / Comedy", "Emotional", "Gaming", "Anime", "Movies & Films", "Cars & Bikes", "Nature", "Travel", "Sports", "Music", "Minimalist", "Abstract Art", "Couple / Love", "Kids", "Luxury / Premium", "Modern Wall Art", "3D Wall Art", "Multi-Panel Frames"])
      assert.ok(collections.some((c) => c.name === name), name);
    for (const c of collections) assert.ok(c.count >= 8, `${c.name} has ${c.count}`);
    for (const count of [2, 3, 4, 5]) {
      assert.ok(wallArt.some((p) => p.decor.panelCount === count && !p.decor.customPhoto), `a ready-made ${count}-panel set`);
      assert.ok(wallArt.some((p) => p.decor.panelCount === count && p.decor.customPhoto), `a custom ${count}-panel set`);
    }
    assert.ok(seed.categories.some((c) => c.id === "home-decor" && c.name === "Home Decor & Wall Art"));
  });

  test("every product is complete: prices, sizes, options, pictures on disk, and no invented ratings", () => {
    const pictures = new Set();
    for (const raw of wallArt) {
      const p = model.normalize(raw);
      assert.ok(p.categoryIds.includes("home-decor") && p.categoryIds.includes("hd-" + raw.decor.collection), raw.id);
      assert.ok(p.pricing.basePrice >= 300 && p.sizes.length >= 3 && p.sizes.every((s) => s.price > 0 && s.width > 0 && s.height > 0), `${raw.id} sizes`);
      assert.ok(p.frame.colors.length >= 4 && p.print.materials.length === 2 && p.components.length >= 4 && p.specifications.length >= 4, `${raw.id} options`);
      assert.ok(p.description.length > 20 && p.tags.length >= 4, `${raw.id} text`);
      assert.ok(!raw.rating && !raw.reviews, `${raw.id} must not carry made-up ratings`);
      assert.equal(model.studioSupport(p).ok, false, `${raw.id} is not a FrameX Studio frame`);
      assert.equal(p.views[0].type, "FRONT");
      assert.ok(p.views.some((v) => v.type === "WALL_PREVIEW") && p.views.some((v) => v.type === "BACK"), `${raw.id} views`);
      if (raw.decor.panelCount > 1) assert.ok(p.views.some((v) => v.type === "DETAIL") && p.specifications.some((s) => /separate framed panels/.test(s.value)), `${raw.id} panels`);
      for (const view of p.views) {
        assert.match(view.url, /^assets\/img\/decor\/[\w-]+\.webp$/);
        assert.ok(fs.existsSync(path.join(config.catalogDir, view.url)), `${view.url} is missing: run "npm run build" in tools/decor`);
      }
      pictures.add(p.image);
    }
    assert.equal(pictures.size, wallArt.length, "no two products share a picture");
  });

  test("View on My Wall: every ready-made piece has its artwork picture on disk; photo sets are shown from their customiser", () => {
    for (const raw of wallArt) {
      const p = model.normalize(raw);
      const live = model.liveDemoSupport(p);
      assert.deepEqual([p.liveDemo.enabled, p.liveDemo.model], [null, ""], `${raw.id}: no product is switched by hand, and none has a 3D model yet`);
      if (raw.decor.customPhoto) {
        assert.deepEqual([live.ok, live.kind, p.decor.art], [true, "panels", null], raw.id);
        continue;
      }
      assert.deepEqual([live.ok, live.kind, live.reasons.join(" ")], [true, "decor", ""], raw.id);
      assert.match(p.decor.art.url, /^assets\/img\/decor\/art\/[\w-]+\.webp$/);
      assert.ok(fs.existsSync(path.join(config.catalogDir, p.decor.art.url)), `${p.decor.art.url} is missing: run "node build.mjs --art-only" in tools/decor`);
      assert.ok(p.decor.art.wallGapIn > 0 && p.decor.art.gapPx >= 0 && (raw.decor.panelCount === 1) === (p.decor.art.gapPx === 0), `${raw.id} panel gaps`);
    }
    // Without the artwork picture, or without measurements, there is nothing honest to hang: the button stays away.
    const noArt = model.liveDemoSupport({ ...READY, decor: { ...READY.decor, art: null } });
    assert.deepEqual([noArt.ok, noArt.reasons.join(" / ")], [false, "This product has no artwork picture for the Live Demo."]);
    const noSize = model.liveDemoSupport({ ...READY, sizes: READY.sizes.map((s) => ({ ...s, width: 0, height: 0 })) });
    assert.deepEqual([noSize.ok, noSize.reasons.join(" / ")], [false, "Add at least one size with width and height."]);
    assert.equal(model.liveDemoSupport({ ...READY, liveDemo: { enabled: false } }).ok, false, "FrameX can switch one design off");
    assert.equal(model.liveDemoSupport({ ...READY, availability: { ...READY.availability, status: "out_of_stock" } }).ok, false);
  });

  test("View on My Wall: among the frames, only those that can be drawn at their real size have it", () => {
    const frames = seed.products.filter((p) => p.section !== "decor").map((p) => model.normalize(p));
    const on = frames.filter((p) => model.liveDemoSupport(p).ok).map((p) => p.id).sort();
    assert.equal(on.join(" "), "p-001 p-002 p-003 p-004 p-007 p-008 p-009 p-010");
    const why = (id) => model.liveDemoSupport(frames.find((p) => p.id === id)).reasons.join(" ");
    assert.match(why("p-005"), /arched frames/);
    assert.match(why("p-006"), /out of stock/);
    assert.match(why("p-013"), /several photos/);
    assert.match(why("p-017"), /off for a Other unless it is switched on.*sold ready-made/);
    // A frame does not have to be offered in FrameX Studio to be shown on a wall: the page's own choices are enough.
    const plain = { ...frames.find((p) => p.id === "p-001") };
    plain.customization = { ...plain.customization, photoUpload: false, frameColor: false, orientation: false };
    assert.deepEqual([model.studioSupport(plain).ok, model.liveDemoSupport(plain).ok], [false, true]);
    // Switching it on by hand can't make a product showable that has nothing to draw or measure.
    const forced = model.liveDemoSupport({ ...frames.find((p) => p.id === "p-011"), liveDemo: { enabled: true } });
    assert.equal(forced.ok, false);
    assert.match(forced.reasons.join(" "), /Add at least one size with width and height/);
    assert.equal(model.LIVE_DEMO_TYPES.join(" "), "photo-frame custom-frame template wall-art multi-panel");
  });

  test("museum paintings carry their credit; everything else is a FrameX original or the customer's photo", () => {
    const credited = wallArt.filter((p) => p.decor.credit);
    assert.ok(credited.length >= 15);
    for (const p of credited) assert.match(p.decor.credit, /Public domain; image from (the Art Institute of Chicago|The Metropolitan Museum of Art) \(CC0\)\.$/, p.id);
    for (const p of wallArt) assert.equal(Number(Boolean(p.decor.credit)) + Number(p.decor.original) + Number(p.decor.customPhoto), 1, p.id);
  });
});

describe("ready-made wall art in the one FrameX cart", () => {
  test("the server prices it from the catalogue and ignores what the browser claims", async () => {
    await empty();
    const r = await meera.post("/api/cart/items", { productId: READY.id, quantity: 2, selection: { sizeId: "l", colorId: "white", printMaterialId: "glossy" }, price: 1, unitPrice: 1, name: "Free poster", image: "https://example.com/x.png" });
    assert.equal(r.status, 201);
    const [line] = lines(r);
    const expected = model.cartLine(READY, { sizeId: "l", colorId: "white", printMaterialId: "glossy" });
    assert.equal(line.unitPrice, expected.unitPrice);
    assert.equal(line.lineTotal, expected.unitPrice * 2);
    assert.equal(line.name, "Never Give Up");
    assert.equal(line.image, "assets/img/decor/hd-never-give-up.webp");
    assert.match(line.size, /^Large \(16 × 20 in\)$/);
    assert.equal(line.color, "White");
    assert.deepEqual(line.options, ["Print: Glossy"]);
    assert.ok(line.unitDiscount > 0 && line.unitListPrice === line.unitPrice + line.unitDiscount);
  });

  test("no options sent means the listed ones: Medium, the design's own frame, matte", async () => {
    await empty();
    const [line] = lines(await meera.post("/api/cart/items", { productId: SET.id }));
    assert.match(line.size, /^Medium set/);
    assert.equal(line.color, "Black");
    assert.equal(line.unitPrice, model.cartLine(SET, {}).unitPrice);
    assert.equal(line.design, null);
  });

  test("a customisation or preview sent for a ready-made product is ignored", async () => {
    await empty();
    const r = await meera.post("/api/cart/items", { productId: SET.id, customization: good(), thumbnail: THUMB });
    assert.equal(r.status, 201);
    assert.equal(lines(r)[0].design, null);
    assert.equal(lines(r)[0].image, "assets/img/decor/hd-mp-cherry-tree-3.webp");
    const stored = (await db.query("SELECT customization, thumbnail FROM cart_items WHERE product_id = $1", [SET.id])).rows[0];
    assert.equal(stored.customization, null);
    assert.equal(stored.thumbnail, null);
    // and it still merges with a plain add of the same product
    assert.equal(lines(await meera.post("/api/cart/items", { productId: SET.id }))[0].quantity, 2);
  });

  test("unknown sizes, colours and finishes are refused", async () => {
    for (const selection of [{ sizeId: "xxl" }, { colorId: "pink" }, { printMaterialId: "velvet" }]) {
      const r = await meera.post("/api/cart/items", { productId: READY.id, selection });
      assert.equal(r.status, 422, JSON.stringify(selection));
      assert.equal(r.json.error.code, "OPTION_UNAVAILABLE");
    }
  });
});

describe("your photo across panels", () => {
  test("can't be ordered without the photo, without the photo details, or with choices that don't exist", async () => {
    await empty();
    // No uploaded photo: refused before anything else, with the words the customer reads.
    for (const photos of [{}, null, { photo1: "not-an-upload" }, { photo1: crypto.randomUUID() }]) {
      const r = await meera.post("/api/cart/items", { productId: CUSTOM.id, customization: good(), photos });
      assert.equal(r.status, 422, JSON.stringify(photos));
      assert.equal(r.json.error.code, "PHOTOS_REQUIRED");
      assert.equal(r.json.error.message, "Please upload your photo to continue. Your photo is required to create this personalized frame.");
    }
    // With the photo uploaded: the layout still has to make sense.
    const cases = [undefined, {}, good({ layout: "diagonal" }), good({ spacing: "huge" }), good({ border: "none" })];
    for (const customization of cases) {
      const r = await meera.post("/api/cart/items", { productId: CUSTOM.id, customization });
      assert.equal(r.status, 422, JSON.stringify(customization));
      assert.equal(r.json.error.code, "CUSTOMIZATION_INVALID");
    }
    assert.equal(lines(await meera.get("/api/cart")).length, 0);
  });

  test("a complete one is stored cleaned, priced like the product, and shown with its summary and preview", async () => {
    const r = await meera.post("/api/cart/items", { productId: CUSTOM.id, selection: { sizeId: "l", colorId: "natural-wood", printMaterialId: "glossy" }, customization: good({ layout: "stacked", spacing: "wide", border: "thick", price: 5, panels: 9, extra: "<script>" }), thumbnail: THUMB });
    assert.equal(r.status, 201);
    const [line] = lines(r);
    assert.equal(line.unitPrice, model.cartLine(CUSTOM, { sizeId: "l" }).unitPrice);
    assert.equal(line.kind, "product");
    assert.equal(line.image, THUMB);
    assert.equal(line.color, "Natural Wood");
    assert.deepEqual(line.design, {
      id: null,
      type: "decor-photo",
      summary: ["3 panels, stacked", "Spacing: Wide", "Frame thickness: Thick", "Your photo: family-trip.jpg (4032 × 3024 px)", "Photo position: 40% across, 55% down, zoom 1.3×"],
      customText: {},
      photoCount: 1
    });
    const stored = (await db.query("SELECT customization, thumbnail FROM cart_items WHERE product_id = $1", [CUSTOM.id])).rows[0];
    assert.deepEqual(stored.customization, { kind: "decor-photo", panels: 3, layout: "stacked", spacing: "wide", border: "thick", photo: PHOTO });
    assert.equal(stored.thumbnail, THUMB);
  });

  test("the photo's name and size are the uploaded file's, not the browser's; numbers are clamped; a bad preview is dropped", async () => {
    await empty();
    const r = await meera.post("/api/cart/items", {
      productId: CUSTOM.id,
      customization: good({ photo: { name: "  <img src=x onerror=alert(1)>\u0007 holiday.png" + "z".repeat(300), width: 99999999, height: "2000", x: 7, y: -3, zoom: 99 } }),
      thumbnail: "javascript:alert(1)"
    });
    assert.equal(r.status, 201);
    const stored = (await db.query("SELECT customization, thumbnail FROM cart_items WHERE product_id = $1", [CUSTOM.id])).rows[0];
    const photo = stored.customization.photo;
    assert.equal(photo.name, "family-trip.jpg", "the uploaded file's own name");
    assert.deepEqual([photo.width, photo.height, photo.x, photo.y, photo.zoom], [4032, 3024, 1, 0, rules.CUSTOM.zoom.max]);
    assert.equal(stored.thumbnail, null);
    assert.equal(lines(r)[0].image, "assets/img/decor/hd-custom-split-3.webp", "without a usable preview the product picture is shown");
  });

  test("the same set twice adds up; another photo or layout is its own line", async () => {
    await empty();
    const add = (customization) => meera.post("/api/cart/items", { productId: CUSTOM.id, customization, thumbnail: THUMB });
    await add(good());
    assert.equal(lines(await add(good()))[0].quantity, 2);
    await add(good({ layout: "stacked" }));
    // Another photo = another upload of the same account.
    const other = await uploadPhoto(base, meera, { name: "wedding.jpg", body: jpeg({ width: 3000, height: 2000, fill: 0x41 }) });
    assert.equal(other.status, 201, other.text);
    const cart = lines(await meera.post("/api/cart/items", { productId: CUSTOM.id, customization: good(), thumbnail: THUMB, photos: { photo1: other.json.upload.id } }));
    assert.deepEqual(cart.map((l) => l.quantity), [2, 1, 1]);
    assert.match(cart[2].design.summary.join(), /wedding\.jpg \(3000 × 2000 px\)/);
    assert.equal(new Set(cart.map((l) => l.design.summary.join())).size, 3);
  });

  test("every panel count has its own product and price", async () => {
    await empty();
    const prices = [];
    for (const count of [2, 3, 4, 5]) {
      const product = byId(`hd-custom-split-${count}`);
      const r = await meera.post("/api/cart/items", { productId: product.id, customization: good() });
      assert.equal(r.status, 201);
      const line = lines(r).find((l) => l.productId === product.id);
      assert.equal(line.unitPrice, model.cartLine(product, {}).unitPrice);
      assert.match(line.design.summary[0], new RegExp(`^${count} panels, side by side$`));
      prices.push(line.unitPrice);
    }
    assert.deepEqual([...prices].sort((a, b) => a - b), prices, "more panels cost more");
  });
});

describe("wall art through checkout", () => {
  let home;

  test("Cash on Delivery: the order keeps every choice and the uploaded photo, takes stock and empties the cart", async () => {
    home = (await meera.post("/api/addresses", HOME)).json.address.id;
    await empty();
    await meera.post("/api/cart/items", { productId: READY.id, quantity: 2, selection: { sizeId: "s", colorId: "walnut" } });
    await meera.post("/api/cart/items", { productId: SET.id, selection: { sizeId: "l" } });
    await meera.post("/api/cart/items", { productId: CUSTOM.id, selection: { sizeId: "m", printMaterialId: "glossy" }, customization: good({ layout: "stacked" }), thumbnail: THUMB });
    const quote = (await meera.get(`/api/checkout/quote?addressId=${home}&paymentMethod=COD`)).json.quote;
    const sum = model.cartLine(READY, { sizeId: "s" }).unitPrice * 2 + model.cartLine(SET, { sizeId: "l" }).unitPrice + model.cartLine(CUSTOM, { sizeId: "m" }).unitPrice;
    assert.equal(quote.ok, true);
    assert.equal(quote.total, sum + 60 + 40);
    const before = (await db.query("SELECT stock_reserved FROM catalog_products WHERE id = $1", [READY.id])).rows[0].stock_reserved;

    const placed = await meera.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(placed.status, 201, placed.text);
    const order = (await meera.get(`/api/orders/${placed.json.order.orderNumber}`)).json.order;
    assert.equal(order.status, "PLACED");
    assert.equal(order.total, quote.total);
    assert.equal(order.needsPhotos, false, "the photo is part of the order");
    assert.deepEqual(order.items.map((i) => [i.productId, i.quantity, i.color, i.photos.length]), [[READY.id, 2, "Walnut", 0], [SET.id, 1, "Black", 0], [CUSTOM.id, 1, "Black", 1]]);
    const own = order.items[2];
    assert.equal(own.image, THUMB);
    assert.equal(own.design.summary[0], "3 panels, stacked");
    assert.ok(own.options.includes("Print: Glossy"));
    const stored = (await db.query("SELECT kind, customization FROM order_items WHERE product_id = $1", [CUSTOM.id])).rows[0];
    assert.equal(stored.kind, "PRODUCT");
    assert.deepEqual(stored.customization, { kind: "decor-photo", panels: 3, layout: "stacked", spacing: "standard", border: "medium", photo: PHOTO });
    assert.equal((await db.query("SELECT stock_reserved FROM catalog_products WHERE id = $1", [READY.id])).rows[0].stock_reserved, before + 2);
    assert.equal(lines(await meera.get("/api/cart")).length, 0);
  });

  test("an order of ready-made pieces only does not ask for photos", async () => {
    await empty();
    await meera.post("/api/cart/items", { productId: READY.id });
    const quote = (await meera.get(`/api/checkout/quote?addressId=${home}&paymentMethod=COD`)).json.quote;
    const placed = await meera.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
    assert.equal(placed.status, 201);
    assert.equal((await meera.get(`/api/orders/${placed.json.order.orderNumber}`)).json.order.needsPhotos, false);
  });

  test("Buy Now carries the customisation too, and refuses a custom set without one", async () => {
    await empty();
    const missing = (await meera.post("/api/checkout/quote", { addressId: home, paymentMethod: "COD", buyNow: { productId: CUSTOM.id, quantity: 1 } })).json.quote;
    assert.equal(missing.ok, false);
    assert.equal(missing.issues[0].code, "CUSTOMIZATION_INVALID");
    const refused = await meera.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: missing.total, idempotencyKey: crypto.randomUUID(), buyNow: { productId: CUSTOM.id, quantity: 1 } });
    assert.ok(refused.status >= 400 && refused.status < 500, refused.text);

    const buyNow = { productId: "hd-custom-split-5", quantity: 1, selection: { sizeId: "s" }, customization: good({ spacing: "close" }), thumbnail: THUMB };
    const quote = (await meera.post("/api/checkout/quote", { addressId: home, paymentMethod: "COD", buyNow })).json.quote;
    assert.equal(quote.ok, true);
    assert.equal(quote.total, model.cartLine(byId("hd-custom-split-5"), { sizeId: "s" }).unitPrice + 60 + 40);
    const placed = await meera.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID(), buyNow });
    assert.equal(placed.status, 201, placed.text);
    const order = (await meera.get(`/api/orders/${placed.json.order.orderNumber}`)).json.order;
    assert.equal(order.items[0].design.summary[0], "5 panels, side by side");
    assert.equal(order.items[0].design.summary[1], "Spacing: Close");
    assert.equal(order.needsPhotos, false);
    assert.equal(order.items[0].photos.length, 1);
    assert.equal(lines(await meera.get("/api/cart")).length, 0, "the cart was not touched");
  });

  test("when Cash on Delivery is switched off for personalised items, a custom-photo set counts as one", async () => {
    await empty();
    await meera.post("/api/cart/items", { productId: CUSTOM.id, customization: good() });
    config.checkout.cod.allowCustomDesigns = false;
    try {
      const quote = (await meera.get(`/api/checkout/quote?addressId=${home}`)).json.quote;
      assert.equal(quote.payment.cod.available, false);
      assert.match(quote.payment.cod.reason, /Your Photo — 3 Panel Split/);
      await empty();
      await meera.post("/api/cart/items", { productId: SET.id });
      assert.equal((await meera.get(`/api/checkout/quote?addressId=${home}`)).json.quote.payment.cod.available, true, "ready-made sets can still be paid on delivery");
    } finally {
      config.checkout.cod.allowCustomDesigns = true;
    }
  });
});

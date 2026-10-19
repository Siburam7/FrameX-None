/* ==========================================================================
   FrameX Studio designs saved in the account (/api/designs, F-17).
   Run with "npm test" in backend/.

   A real server on a random port and an in-memory PostgreSQL (PGlite):
     - a design with the customer's photo is saved, listed, opened and changed;
     - only the account's own designs and own photos can be used;
     - wrong pictures, oversized designs and more than 30 are refused;
     - a photo a saved design uses is kept: it can't be deleted from the photo
       list and the 30-day tidy-up leaves it; once the design is gone it can be.
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
const storage = await import("../src/lib/storage.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { sweepUnusedUploads } = await import("../src/services/upload-service.js");
const { uploadPhoto } = await import("./support/photos.js");

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
  put = (url, body = {}) => this.request("PUT", url, body);
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const asha = new Client();
const binod = new Client();
const S = {};
const THUMB = "data:image/jpeg;base64," + Buffer.from("a small picture").toString("base64");
const design = (photos, extra = {}) => ({ title: "Our wedding", mode: "template", templateId: "wedding-memories", productId: null, config: { mode: "template", templateId: "wedding-memories", photos: { photo1: "ph-local-1" }, text: { names: "Asha & Ravi" } }, photos, thumbnail: THUMB, ...extra });

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.designs@example.com", phone: "9876500071", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  assert.equal((await binod.post("/api/auth/signup", { name: "Binod Das", email: "binod.designs@example.com", phone: "9876500072", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  S.photo = (await uploadPhoto(base, asha, { name: "wedding.jpg" })).json.upload.id;
  S.binodPhoto = (await uploadPhoto(base, binod, { name: "his.jpg" })).json.upload.id;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("designs saved in the account", () => {
  test("only with a login", async () => {
    assert.equal((await new Client().get("/api/designs")).status, 401);
    assert.equal((await new Client().post("/api/designs", design({}))).status, 401);
  });

  test("save, list, open and change a design with the customer's own photo", async () => {
    const made = await asha.post("/api/designs", design({ photo1: S.photo }));
    assert.equal(made.status, 201, made.text);
    S.id = made.json.design.id;
    assert.deepEqual(made.json.design.photos, { photo1: S.photo });
    assert.equal(made.json.design.config.text.names, "Asha & Ravi");
    const list = await asha.get("/api/designs");
    assert.deepEqual([list.json.items.length, list.json.items[0].id, list.json.items[0].title, list.json.max], [1, S.id, "Our wedding", 30]);
    assert.equal(list.json.items[0].config, undefined, "the list is light: no full configuration");
    assert.equal(list.json.items[0].thumbnail, THUMB);
    const one = await asha.get(`/api/designs/${S.id}`);
    assert.deepEqual(one.json.design.config, design({}).config);
    const changed = await asha.put(`/api/designs/${S.id}`, design({ photo1: S.photo }, { title: "Our wedding (gold frame)" }));
    assert.equal(changed.status, 200, changed.text);
    assert.equal((await asha.get("/api/designs")).json.items[0].title, "Our wedding (gold frame)");
  });

  test("another account can't see, change or delete it, nor use someone else's photo", async () => {
    assert.equal((await binod.get(`/api/designs/${S.id}`)).status, 404);
    assert.equal((await binod.put(`/api/designs/${S.id}`, design({}))).status, 404);
    assert.equal((await binod.del(`/api/designs/${S.id}`)).status, 404);
    assert.deepEqual((await binod.get("/api/designs")).json.items, []);
    const stolen = await asha.post("/api/designs", design({ photo1: S.binodPhoto }));
    assert.equal(stolen.status, 422, stolen.text);
    assert.ok(stolen.json.error.fields.photos);
  });

  test("wrong input is refused: no name, a picture that isn't one, a design too large", async () => {
    const bad = async (body, field) => {
      const r = await asha.post("/api/designs", body);
      assert.equal(r.status, 422, r.text);
      assert.ok(r.json.error.fields[field], `${field}: ${r.text}`);
    };
    await bad(design({}, { title: " " }), "title");
    await bad(design({}, { thumbnail: "javascript:alert(1)" }), "thumbnail");
    await bad(design({}, { thumbnail: "data:image/svg+xml;base64,PHN2Zz4=" }), "thumbnail");
    await bad(design({}, { config: null }), "config");
    await bad(design({}, { config: { big: "x".repeat(110 * 1024) } }), "config");
    await bad(design({}, { mode: "<script>" }), "mode");
  });

  test("at most 30 designs per account", async () => {
    const have = (await asha.get("/api/designs")).json.items.length;
    for (let i = have; i < 30; i++) assert.equal((await asha.post("/api/designs", design({}, { title: `Design ${i}` }))).status, 201);
    const more = await asha.post("/api/designs", design({}, { title: "One too many" }));
    assert.equal(more.status, 409, more.text);
    assert.equal(more.json.error.code, "TOO_MANY_DESIGNS");
    // Deleting one makes room
    const extra = (await asha.get("/api/designs")).json.items.find((d) => d.id !== S.id);
    assert.equal((await asha.del(`/api/designs/${extra.id}`)).status, 200);
    assert.equal((await asha.post("/api/designs", design({}, { title: "Fits again" }))).status, 201);
  });

  test("a photo a saved design uses is kept; once the design is gone it can be removed", async () => {
    const key = (await db.query("SELECT storage_key FROM uploads WHERE id = $1", [S.photo])).rows[0].storage_key;
    const del = await asha.del(`/api/uploads/${S.photo}`);
    assert.equal(del.status, 409, del.text);
    assert.equal(del.json.error.code, "UPLOAD_IN_DESIGN");
    // The 30-day tidy-up of photos nothing uses: this one is used by the design
    await db.query("UPDATE uploads SET created_at = now() - interval '60 days' WHERE id = $1", [S.photo]);
    await sweepUnusedUploads();
    assert.equal((await db.query("SELECT status FROM uploads WHERE id = $1", [S.photo])).rows[0].status, "UPLOADED");
    assert.ok(await storage.exists(key));
    // The design goes: now the photo can be removed
    assert.equal((await asha.del(`/api/designs/${S.id}`)).status, 200);
    assert.equal((await asha.get(`/api/designs/${S.id}`)).status, 404);
    assert.equal((await asha.del(`/api/uploads/${S.photo}`)).status, 200);
    assert.equal(await storage.exists(key), false);
  });

  test("deleting the account deletes its designs, and the data download lists them", async () => {
    const data = await binod.get("/api/users/me/data");
    assert.deepEqual(data.json.savedDesigns, []);
    const mine = await binod.post("/api/designs", design({ photo1: S.binodPhoto }, { title: "Binod's design" }));
    assert.equal(mine.status, 201, mine.text);
    assert.equal((await binod.get("/api/users/me/data")).json.savedDesigns[0].title, "Binod's design");
    const userId = (await db.query("SELECT id FROM users WHERE email = 'binod.designs@example.com'")).rows[0].id;
    assert.equal((await binod.post("/api/users/me/delete", { password: PASSWORD, confirm: "DELETE" })).status, 200);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM saved_designs WHERE user_id = $1", [userId])).rows[0].n, 0);
  });
});

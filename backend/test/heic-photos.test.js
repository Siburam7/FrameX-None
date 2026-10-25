/* ==========================================================================
   HEIC / AVIF customer photos (owner, 2026-10-25). Run with "npm test".

   A photo saved by an iPhone or a newer Android (HEIC) or by some apps (AVIF)
   is accepted: the original is kept exactly as uploaded, and FrameX makes one
   full-quality JPEG copy that is what links show (and shops print). The
   original can still be asked for. Removing the photo removes both files.

   The AVIF photo is made here with sharp. A HEIC sample can't be made here
   (no HEVC encoder): set FRAMEX_HEIC_SAMPLE to a .heic file to check that too.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";

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
const storage = await import("../src/lib/storage.js");
const { linkTo } = await import("../src/services/upload-service.js");
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
  del = (url) => this.request("DELETE", url);
}

const PASSWORD = "Sunrise-Frame-42";
const asha = new Client();
const S = {};
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fetchFile = async (path) => {
  const r = await fetch(base + "/api" + path);
  return { status: r.status, type: r.headers.get("content-type"), name: r.headers.get("content-disposition"), body: Buffer.from(await r.arrayBuffer()) };
};

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.heic@example.com", phone: "9876500061", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  // a 1200 x 800 AVIF photo with some colour in it
  const raw = Buffer.alloc(1200 * 800 * 3);
  for (let i = 0; i < raw.length; i += 3) [raw[i], raw[i + 1], raw[i + 2]] = [(i / 3) % 256, 120, 200];
  S.avif = await sharp(raw, { raw: { width: 1200, height: 800, channels: 3 } }).avif({ quality: 70 }).toBuffer();
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("HEIC / AVIF photos", () => {
  test("an AVIF photo is accepted: original kept as it is, a full-quality JPEG copy made", async () => {
    const r = await uploadPhoto(base, asha, { body: S.avif, type: "image/avif", name: "IMG_2041.avif" });
    assert.equal(r.status, 201, r.text);
    const u = r.json.upload;
    assert.deepEqual([u.format, u.printCopy, u.width, u.height], ["avif", true, 1200, 800]);
    S.id = u.id;
    const row = (await db.query("SELECT * FROM uploads WHERE id = $1", [u.id])).rows[0];
    assert.equal(row.sha256, sha(S.avif), "the stored original is the uploaded file");
    assert.ok(row.print_key && row.print_bytes > 0);
    S.row = row;
  });

  test("its link shows the JPEG copy (named .jpg); the original can be asked for, byte for byte", async () => {
    const link = (await asha.post(`/api/uploads/${S.id}/link`, { download: true })).json.link;
    const copy = await fetchFile(link.path);
    assert.equal(copy.status, 200);
    assert.equal(copy.type, "image/jpeg");
    assert.deepEqual([copy.body[0], copy.body[1], copy.body[2]], [0xff, 0xd8, 0xff], "a real JPEG");
    assert.match(copy.name, /IMG_2041\.jpg/);
    const meta = await sharp(copy.body).metadata();
    assert.deepEqual([meta.width, meta.height], [1200, 800], "same pixels: not resized");
    const original = await fetchFile(linkTo(S.row, { download: true, original: true }).path);
    assert.equal(original.type, "image/avif");
    assert.equal(sha(original.body), sha(S.avif));
  });

  test("JPG photos are as before: no copy", async () => {
    const r = await uploadPhoto(base, asha, { name: "family.jpg" });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.json.upload.format, r.json.upload.printCopy], ["jpeg", false]);
  });

  test("a file that only looks like a photo is still refused", async () => {
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(200)]);
    const r = await uploadPhoto(base, asha, { body: fake, type: "image/heic", name: "video.heic" });
    assert.equal(r.status, 415);
    assert.match(r.json.error.message, /JPG, PNG, WebP, HEIC or AVIF/);
  });

  test("removing the photo removes the original and its copy", async () => {
    assert.ok(await storage.exists(S.row.print_key));
    assert.equal((await asha.del(`/api/uploads/${S.id}`)).status, 200);
    assert.equal(await storage.exists(S.row.storage_key), false);
    assert.equal(await storage.exists(S.row.print_key), false);
  });

  const sample = process.env.FRAMEX_HEIC_SAMPLE;
  test("a HEIC photo (set FRAMEX_HEIC_SAMPLE) becomes a JPEG copy the right way up", { skip: !sample || !fs.existsSync(sample) }, async () => {
    const body = fs.readFileSync(sample);
    const r = await uploadPhoto(base, asha, { body, type: "image/heic", name: "IMG_0001.HEIC" });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.json.upload.format, r.json.upload.printCopy], ["heic", true]);
    const copy = await fetchFile((await asha.post(`/api/uploads/${r.json.upload.id}/link`, { download: true })).json.link.path);
    assert.equal(copy.type, "image/jpeg");
    const meta = await sharp(copy.body).metadata();
    assert.deepEqual([meta.width, meta.height], [r.json.upload.width, r.json.upload.height]);
  });
});

/* ==========================================================================
   Uploaded files kept in a bucket (STORAGE_PROVIDER=s3): run with "npm test".

   A real server on a random port, an in-memory PostgreSQL, and a stand-in for
   an S3-compatible object store (test/support/mock-s3.js). What is checked is
   what a customer would notice: a photo uploaded through the API is in the
   bucket and NOT on the server's disk, comes back byte for byte, and survives
   the server's own folder being wiped (which is what a restart does on a host
   without a lasting disk).

   Not checked here: the request signature against a real store. That needs a
   real bucket: "npm run storage:test" with the real settings.
   ========================================================================== */
import { createMockS3 } from "./support/mock-s3.js";

const s3 = await createMockS3().listen();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.STORAGE_PROVIDER = "";
process.env.S3_ENDPOINT = s3.url + "/";
process.env.S3_BUCKET = s3.bucket; // naming a bucket is what chooses it
process.env.S3_ACCESS_KEY_ID = s3.keyId;
process.env.S3_SECRET_ACCESS_KEY = s3.secret;
process.env.S3_REGION = "auto";
process.env.S3_LIST_PAGE_SIZE = "2"; // small pages, so that listing has to ask several times

const { default: assert } = await import("node:assert/strict");
const { default: crypto } = await import("node:crypto");
const { default: fs } = await import("node:fs");
const { default: path } = await import("node:path");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { makeFileToken } = await import("../src/lib/file-links.js");
const storage = await import("../src/lib/storage.js");
const { sweepUnusedUploads } = await import("../src/services/upload-service.js");
const { jpeg, uploadPhoto } = await import("./support/photos.js");

let server;
let base;
const asha = { cookie: "" };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const filesOnDisk = (area) => {
  const dir = path.join(config.uploads.dir, area);
  return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()) : [];
};
const read = (stream) =>
  new Promise((resolve, reject) => {
    const parts = [];
    stream.on("data", (c) => parts.push(c)).on("end", () => resolve(Buffer.concat(parts))).on("error", reject);
  });

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const signup = await fetch(base + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json", "X-FrameX-Client": "test" }, body: JSON.stringify({ name: "Asha Verma", email: "asha@example.com", phone: "9876500071", password: "Sunrise-Frame-42", confirmPassword: "Sunrise-Frame-42" }) });
  assert.equal(signup.status, 201);
  asha.cookie = signup.headers.getSetCookie()[0].split(";")[0];
});

after(async () => {
  await new Promise((r) => server.close(r));
  await s3.close();
  await db.close();
});

describe("uploaded files in a bucket", () => {
  test("the settings choose the bucket, and the website is told only a word", async () => {
    assert.deepEqual([config.storage.provider, config.storage.s3.endpoint, config.storage.s3.missing], ["s3", s3.url, []]);
    const told = await (await fetch(base + "/api/config")).text();
    assert.equal(JSON.parse(told).features.fileStorage, "object");
    for (const secret of [s3.secret, s3.keyId, s3.bucket, s3.url]) assert.equal(told.includes(secret), false, "nothing about the bucket is told to browsers");
  });

  test("the start-up check makes a real round trip and leaves nothing behind", async () => {
    const status = await storage.storageStatus();
    assert.deepEqual([status.ready, status.kind, status.dir], [true, "object", `object storage, bucket "${s3.bucket}"`]);
    assert.equal(s3.objects.size, 0);
    assert.deepEqual(s3.requests.map((r) => r.split(" ")[0]), ["PUT", "GET", "DELETE"]);
    assert.equal(s3.unsigned, 0, "every request was signed");
  });

  test("a customer photo goes to the bucket, not to the server's disk, and comes back byte for byte", async () => {
    const original = jpeg({ width: 3840, height: 2160, bytes: 1_200_000, fill: 0x6c });
    const r = await uploadPhoto(base, asha, { body: original, name: "family.jpg" });
    assert.equal(r.status, 201, r.text);
    const stored = (await db.query("SELECT * FROM uploads WHERE id = $1", [r.json.upload.id])).rows[0];
    assert.match(stored.storage_key, /^private\//);
    assert.equal(stored.sha256, sha(original));
    assert.ok(s3.objects.get(stored.storage_key).body.equals(original), "the bucket holds exactly the uploaded bytes");
    assert.deepEqual([filesOnDisk("private"), filesOnDisk("tmp")], [[], []], "nothing is left on the server's disk");
    assert.equal(r.text.includes(stored.storage_key), false);

    // The server's own folder is wiped (a restart on a host without a lasting disk): the photo is still served.
    fs.rmSync(config.uploads.dir, { recursive: true, force: true });
    const link = await fetch(`${base}/api/files/${makeFileToken(stored.id).token}`);
    const body = Buffer.from(await link.arrayBuffer());
    assert.deepEqual([link.status, link.headers.get("content-type"), body.length, sha(body)], [200, "image/jpeg", original.length, sha(original)]);
    assert.equal(s3.unsigned, 0);

    // Removed by its owner: gone from the bucket too.
    const removed = await fetch(`${base}/api/uploads/${stored.id}`, { method: "DELETE", headers: { "X-FrameX-Client": "test", Cookie: asha.cookie } });
    assert.equal(removed.status, 200);
    assert.equal(s3.objects.has(stored.storage_key), false);
    assert.equal((await fetch(`${base}/api/files/${makeFileToken(stored.id).token}`)).status, 404);
  });

  test("a file that is too large or not a picture never reaches the bucket", async () => {
    const before = s3.objects.size;
    assert.equal((await uploadPhoto(base, asha, { body: Buffer.from("<svg onload=alert(1)>") })).status, 415);
    assert.equal((await uploadPhoto(base, asha, { body: Buffer.alloc(0) })).status, 400);
    assert.equal(s3.objects.size, before);
    assert.deepEqual(filesOnDisk("tmp"), []);
  });

  test("keep, look for, read, list (over several pages) and remove", async () => {
    const keys = [];
    for (let i = 0; i < 5; i++) {
      const key = storage.newKey("public");
      await storage.put(key, Buffer.from(`picture ${i}`));
      keys.push(key);
    }
    const thumb = storage.newKey("public", keys[0].split("/").pop(), "-thumb");
    await storage.put(thumb, Buffer.from("small"));
    s3.objects.set("public/not-one-of-ours.txt", { body: Buffer.from("x"), at: Date.now() });

    assert.equal(await storage.exists(keys[2]), true);
    assert.equal(await storage.exists(storage.newKey("public")), false);
    assert.equal((await read(storage.open(keys[2]))).toString(), "picture 2");
    await assert.rejects(read(storage.open(storage.newKey("public"))), /refused to send a file/);

    const listed = await storage.listFiles("public");
    assert.deepEqual(listed.map((f) => f.key).sort(), [...keys, thumb].sort(), "only our own files, across pages");
    assert.equal(listed.find((f) => f.key === thumb).id, keys[0].split("/").pop());
    assert.ok(s3.requests.filter((r) => r === "GET (list)").length >= 4, "the list was asked for page by page");
    assert.deepEqual(await storage.listFiles("private"), []);

    for (const key of [...keys, thumb]) await storage.remove(key);
    await storage.remove(keys[0]); // removing what is already gone is not an error
    assert.deepEqual(await storage.listFiles("public"), []);
    s3.objects.clear();
  });

  test("a key that was not made here is never used as an address", async () => {
    for (const bad of ["../secret", "private/../../etc/passwd", "public/ab/not-a-uuid", "other/ab/" + crypto.randomUUID(), ""]) {
      await assert.rejects(async () => storage.exists(bad), /Invalid storage key/);
      await assert.rejects(async () => storage.remove(bad), /Invalid storage key/);
      assert.throws(() => storage.open(bad), /Invalid storage key/);
    }
  });

  test("an outage is an error, not a missing file; and an upload during it is refused, not half kept", async () => {
    const key = storage.newKey("public");
    await storage.put(key, Buffer.from("here"));
    s3.down = true;
    await assert.rejects(storage.exists(key), /file storage/);
    await assert.rejects(read(storage.open(key)), /file storage/);
    const during = await uploadPhoto(base, asha, { body: jpeg({ bytes: 5000 }) });
    assert.ok(during.status >= 500, `an upload during an outage answers ${during.status}`);
    assert.equal(during.text.includes(s3.url), false, "the error does not show where the bucket is");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM uploads WHERE status = 'UPLOADED'")).rows[0].n, 0, "no record without a file");
    const status = await storage.storageStatus();
    assert.deepEqual([status.ready, status.kind, /503/.test(status.problem)], [false, "object", true]);
    s3.down = false;
    assert.equal(await storage.exists(key), true);
    await storage.remove(key);
    assert.deepEqual(filesOnDisk("tmp"), []);
  });

  test("only the live server tidies away files its database does not know", async () => {
    const stranger = storage.newKey("private");
    s3.objects.set(stranger, { body: Buffer.from("another server's photo"), at: Date.now() - 3 * 24 * 60 * 60 * 1000 });
    assert.equal(storage.ownsEveryFile(), false, "this is not a production server");
    await sweepUnusedUploads();
    assert.equal(s3.objects.has(stranger), true, "a development machine leaves the bucket's other files alone");
    config.isProd = true;
    assert.equal(storage.ownsEveryFile(), true);
    await sweepUnusedUploads();
    config.isProd = false;
    assert.equal(s3.objects.has(stranger), false, "the live server removes a two-day-old file nothing points at");
  });

  test("a wrong key is reported plainly", async () => {
    config.storage.s3.accessKeyId = "SOMEONE-ELSES-KEY";
    const fresh = await import("../src/lib/storage.js?wrong-key");
    const status = await fresh.storageStatus();
    assert.deepEqual([status.ready, /403/.test(status.problem), status.problem.includes(s3.secret)], [false, true, false]);
    config.storage.s3.accessKeyId = s3.keyId;
  });
});

/* ==========================================================================
   File storage for uploaded files (customer photos, product and review pictures).

   Two places a file can be kept, chosen by STORAGE_PROVIDER:

     disk  (default)  config.uploads.dir (UPLOAD_DIR; default backend/.data/uploads,
                      which Git ignores). Right for a development machine, or a
                      server whose disk survives restarts and redeploys.
     s3               a bucket in an S3-compatible object store (Cloudflare R2,
                      Backblaze B2, Amazon S3 …): S3_ENDPOINT, S3_BUCKET,
                      S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION. Right for
                      a host whose own disk is wiped on every restart (Render's
                      free plan): the files then outlive the server.

   Either way nothing is served as a static file, and the bucket stays PRIVATE:
     private/…  customer photos, sent only through signed links (file-links.js)
     public/…   product and review pictures, sent by GET /media/<id>
   The server reads the file and sends it itself; no browser ever talks to the
   bucket, and the storage keys never leave the server.

   A file's name is a random id made here. Nothing a browser sends (file name,
   path, id) is ever used to build a path or an object key.

   A customer photo is stored byte for byte as it arrived: no resizing, no
   re-encoding, no "enhancement". receive() returns the SHA-256 of what was
   written so that can be checked.

   An upload is always received into a temporary file on the server's own disk
   first (counted, hashed and inspected there), and only then kept.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AwsClient } from "aws4fetch";
import { config } from "../config.js";

const KEY = /^(private|public)\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?$/;

/** Thrown when a stream is longer than allowed. */
export class TooLarge extends Error {}

const root = () => config.uploads.dir;
const checked = (key) => {
  if (!KEY.test(String(key))) throw new Error("Invalid storage key.");
  return key;
};
const fullPath = (key) => path.join(root(), ...checked(key).split("/"));

/* ---------------------------------------------------------------- Object storage (S3-compatible) */

const inBucket = () => config.storage.provider === "s3";

let client = null;
const signer = () => {
  const { accessKeyId, secretAccessKey, region } = config.storage.s3;
  client = client || new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region, retries: 2 });
  return client;
};
// Path-style addresses (endpoint/bucket/key): every S3-compatible store understands them.
const bucketUrl = () => `${config.storage.s3.endpoint}/${encodeURIComponent(config.storage.s3.bucket)}`;
const objectUrl = (name) => `${bucketUrl()}/${name.split("/").map(encodeURIComponent).join("/")}`;

/** One request to the bucket. The answer's headers must arrive within `waitMs`; a body may take longer. */
async function bucket(method, url, { body, waitMs = 30000 } = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), waitMs);
  try {
    return await signer().fetch(url, { method, body, signal: stop.signal, headers: body ? { "Content-Type": "application/octet-stream" } : undefined });
  } catch (error) {
    // Never the address or a key: only that it failed.
    throw new Error(`The file storage could not be reached (${error.name === "AbortError" ? "no answer in time" : error.message}).`);
  } finally {
    clearTimeout(timer);
  }
}
const failed = (what, response) => new Error(`The file storage refused to ${what} (it answered ${response.status}).`);

async function putObject(name, buffer) {
  const response = await bucket("PUT", objectUrl(name), { body: buffer, waitMs: 5 * 60000 });
  if (!response.ok) throw failed("keep a file", response);
  await response.arrayBuffer().catch(() => {});
}

/* ---------------------------------------------------------------- What the rest of the backend uses */

/** A new random key in the private or the public area. */
export function newKey(area, id = crypto.randomUUID(), suffix = "") {
  if (area !== "private" && area !== "public") throw new Error("Unknown storage area.");
  return `${area}/${id.slice(0, 2)}/${id}${suffix}`;
}

/**
 * Write a stream to a temporary file, counting and hashing it on the way.
 * Stops (and removes the file) as soon as it grows past maxBytes.
 * -> { tempPath, bytes, sha256 }
 */
export async function receive(stream, maxBytes) {
  const dir = path.join(root(), "tmp");
  await fs.promises.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, crypto.randomUUID());
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _enc, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(new TooLarge());
      hash.update(chunk);
      done(null, chunk);
    }
  });
  try {
    await pipeline(stream, meter, fs.createWriteStream(tempPath, { flags: "wx", mode: 0o600 }));
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }
  return { tempPath, bytes, sha256: hash.digest("hex") };
}

/** Move a received file to its place. */
export async function keep(tempPath, key) {
  if (inBucket()) {
    await putObject(checked(key), await fs.promises.readFile(tempPath));
    await fs.promises.rm(tempPath, { force: true });
    return;
  }
  const target = fullPath(key);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.rename(tempPath, target);
}

/** Write a small buffer (a thumbnail) straight to its place. */
export async function put(key, buffer) {
  if (inBucket()) return putObject(checked(key), buffer);
  const target = fullPath(key);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, buffer, { mode: 0o600 });
}

export const discard = (tempPath) => fs.promises.rm(tempPath, { force: true });

/** A read stream of a stored file. A file that can't be read ends the stream with an "error". */
export function open(key) {
  if (!inBucket()) return fs.createReadStream(fullPath(key));
  const out = new PassThrough();
  bucket("GET", objectUrl(checked(key)))
    .then((response) => {
      if (!response.ok || !response.body) throw failed("send a file", response);
      Readable.fromWeb(response.body).on("error", (error) => out.destroy(error)).pipe(out);
    })
    .catch((error) => out.destroy(error));
  return out;
}

/** Is the file there? In a bucket, "couldn't ask" is an error, not a "no": an outage must not look like a missing file. */
export async function exists(key) {
  if (inBucket()) {
    const response = await bucket("HEAD", objectUrl(checked(key)));
    if (response.status === 404) return false;
    if (!response.ok) throw failed("look for a file", response);
    return true;
  }
  try {
    return (await fs.promises.stat(fullPath(key))).isFile();
  } catch {
    return false;
  }
}

export async function remove(key) {
  if (!inBucket()) return fs.promises.rm(fullPath(key), { force: true });
  const response = await bucket("DELETE", objectUrl(checked(key)));
  if (!response.ok && response.status !== 404) throw failed("remove a file", response);
  await response.arrayBuffer().catch(() => {});
}

/** Temporary files left behind by a crash or a dropped connection (always on the server's own disk). */
export async function sweepTemp(olderThanMs = 60 * 60 * 1000) {
  const dir = path.join(root(), "tmp");
  let names = [];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (Date.now() - (await fs.promises.stat(file)).mtimeMs > olderThanMs) {
        await fs.promises.rm(file, { force: true });
        removed += 1;
      }
    } catch {
      /* gone already */
    }
  }
  return removed;
}

const xmlText = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** The ids of every file kept in an area ("private" or "public"), with each file's age: [{ id, key, ageMs }]. */
export async function listFiles(area) {
  const out = [];
  if (inBucket()) {
    let token = "";
    do {
      const query = new URLSearchParams({ "list-type": "2", prefix: `${area}/`, "max-keys": String(config.storage.s3.pageSize) });
      if (token) query.set("continuation-token", token);
      const response = await bucket("GET", `${bucketUrl()}?${query}`);
      if (!response.ok) throw failed("list its files", response);
      const xml = await response.text();
      for (const item of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || []) {
        const key = xmlText((/<Key>([\s\S]*?)<\/Key>/.exec(item) || [])[1] || "");
        if (!KEY.test(key)) continue;
        const changed = Date.parse((/<LastModified>([\s\S]*?)<\/LastModified>/.exec(item) || [])[1] || "");
        out.push({ id: key.split("/").pop().replace(/-thumb$/, ""), key, ageMs: Number.isFinite(changed) ? Date.now() - changed : 0 });
      }
      token = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml) ? xmlText((/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml) || [])[1] || "") : "";
    } while (token);
    return out;
  }
  const base = path.join(root(), area);
  let folders = [];
  try {
    folders = await fs.promises.readdir(base);
  } catch {
    return out;
  }
  for (const folder of folders) {
    let names = [];
    try {
      names = await fs.promises.readdir(path.join(base, folder));
    } catch {
      continue;
    }
    for (const name of names) {
      const key = `${area}/${folder}/${name}`;
      if (!KEY.test(key)) continue;
      try {
        out.push({ id: name.replace(/-thumb$/, ""), key, ageMs: Date.now() - (await fs.promises.stat(path.join(base, folder, name))).mtimeMs });
      } catch {
        /* gone already */
      }
    }
  }
  return out;
}

/**
 * May this server remove stored files that its own database does not know?
 * On a disk: yes, the folder is this server's alone. In a bucket: only the live server (production).
 * A development machine that was given the same bucket has another database, to which every live file
 * is a stranger: it must never tidy them away.
 */
export const ownsEveryFile = () => !inBucket() || config.isProd;

/** Where files are kept, in words (no key, no secret). */
export const storagePlace = () => (inBucket() ? `object storage, bucket "${config.storage.s3.bucket}"` : root());

/**
 * Can files be written (and read back) here? Used at start-up, by "npm run doctor" and "npm run storage:test".
 * -> { ready, kind: "disk" | "object", dir, problem? }
 */
export async function storageStatus() {
  const kind = inBucket() ? "object" : "disk";
  const dir = storagePlace();
  try {
    // Uploads are received on the server's own disk first, wherever they are kept afterwards.
    await fs.promises.mkdir(root(), { recursive: true });
    const probe = path.join(root(), `.probe-${process.pid}`);
    await fs.promises.writeFile(probe, "ok");
    await fs.promises.rm(probe, { force: true });
    if (inBucket()) {
      const missing = config.storage.s3.missing;
      if (missing.length) return { ready: false, kind, dir, problem: `not set: ${missing.join(", ")}` };
      // A real round trip: write a small object, read it back, remove it.
      const name = `probe/${crypto.randomUUID()}`;
      const sent = crypto.randomBytes(24);
      await putObject(name, sent);
      const back = await bucket("GET", objectUrl(name));
      if (!back.ok) throw failed("send back a file it had just kept", back);
      const same = Buffer.from(await back.arrayBuffer()).equals(sent);
      const gone = await bucket("DELETE", objectUrl(name));
      await gone.arrayBuffer().catch(() => {});
      if (!same) throw new Error("The file storage sent back something other than what was kept.");
    }
    return { ready: true, kind, dir };
  } catch (error) {
    return { ready: false, kind, dir, problem: error.message };
  }
}

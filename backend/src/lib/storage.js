/* ==========================================================================
   File storage for uploaded files (customer photos and shop product pictures).

   Files live in config.uploads.dir (UPLOAD_DIR; default backend/.data/uploads,
   which Git ignores). Nothing in that folder is served as a static file:
     private/…  customer photos, sent only through signed links (file-links.js)
     public/…   product pictures, sent by GET /media/<id>
   A file's name on disk is a random id made here. Nothing a browser sends
   (file name, path, id) is ever used to build a path.

   A customer photo is stored byte for byte as it arrived: no resizing, no
   re-encoding, no "enhancement". save() returns the SHA-256 of what was
   written so that can be checked.

   This is the one file to replace to keep files in object storage instead of
   on the server's disk: save(), open(), remove() and exists() are all it offers.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";

const KEY = /^(private|public)\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?$/;

/** Thrown when a stream is longer than allowed. */
export class TooLarge extends Error {}

const root = () => config.uploads.dir;

function fullPath(key) {
  if (!KEY.test(String(key))) throw new Error("Invalid storage key.");
  return path.join(root(), ...key.split("/"));
}

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
  const target = fullPath(key);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.rename(tempPath, target);
}

/** Write a small buffer (a thumbnail) straight to its place. */
export async function put(key, buffer) {
  const target = fullPath(key);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, buffer, { mode: 0o600 });
}

export const discard = (tempPath) => fs.promises.rm(tempPath, { force: true });

/** A read stream of a stored file. */
export const open = (key) => fs.createReadStream(fullPath(key));

export async function exists(key) {
  try {
    return (await fs.promises.stat(fullPath(key))).isFile();
  } catch {
    return false;
  }
}

export const remove = (key) => fs.promises.rm(fullPath(key), { force: true });

/** Temporary files left behind by a crash or a dropped connection. */
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

/** The ids of every file kept in an area ("private" or "public"), with each file's age: [{ id, key, ageMs }]. */
export async function listFiles(area) {
  const out = [];
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

/** Can files be written here? Used at start-up and by "npm run doctor". */
export async function storageStatus() {
  try {
    await fs.promises.mkdir(root(), { recursive: true });
    const probe = path.join(root(), `.probe-${process.pid}`);
    await fs.promises.writeFile(probe, "ok");
    await fs.promises.rm(probe, { force: true });
    return { ready: true, dir: root() };
  } catch (error) {
    return { ready: false, dir: root(), problem: error.message };
  }
}

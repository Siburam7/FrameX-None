/* ==========================================================================
   npm run storage:test

   Checks the place where uploaded files are kept (backend/.env: UPLOAD_DIR, or
   the S3_… settings of a bucket) with a real round trip: a small test file is
   written, looked for, read back, compared byte for byte, listed and removed.
   Nothing else in the storage is touched, and no key is printed.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.js";
import * as storage from "../src/lib/storage.js";

const say = (ok, text) => console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${text}`);
const read = (stream) =>
  new Promise((resolve, reject) => {
    const parts = [];
    stream.on("data", (c) => parts.push(c)).on("end", () => resolve(Buffer.concat(parts))).on("error", reject);
  });

console.log(`\nFrameX file storage check\nKept in: ${storage.storagePlace()}${config.storage.provider === "s3" ? ` (region "${config.storage.s3.region}")` : ""}\n`);

if (config.storage.provider === "s3" && config.storage.s3.missing.length) {
  say(false, `Not set in backend/.env: ${config.storage.s3.missing.join(", ")}`);
  process.exit(1);
}

const key = storage.newKey("private");
const sent = crypto.randomBytes(64 * 1024);
const temp = path.join(os.tmpdir(), `framex-storage-test-${process.pid}`);
let failed = false;
try {
  fs.writeFileSync(temp, sent);
  const received = await storage.receive(fs.createReadStream(temp), 1024 * 1024);
  await storage.keep(received.tempPath, key);
  say(true, "a test file (64 KB) was kept");
  const there = await storage.exists(key);
  say(there, there ? "it is there when looked for" : "it is NOT there when looked for");
  const back = await read(storage.open(key));
  const same = back.equals(sent);
  say(same, same ? "read back: byte for byte what was sent" : `read back ${back.length} bytes that are NOT what was sent`);
  const listed = (await storage.listFiles("private")).some((f) => f.key === key);
  say(listed, listed ? "it appears in the list of files" : "it does NOT appear in the list of files");
  await storage.remove(key);
  const gone = !(await storage.exists(key));
  say(gone, gone ? "removed again" : "it could NOT be removed");
  failed = !(there && same && listed && gone);
} catch (error) {
  failed = true;
  say(false, error.message);
  await storage.remove(key).catch(() => {});
} finally {
  fs.rmSync(temp, { force: true });
}
console.log(failed ? "\nThe file storage is NOT working. Uploaded photos would be lost or refused.\n" : "\nThe file storage works.\n");
process.exit(failed ? 1 : 0);

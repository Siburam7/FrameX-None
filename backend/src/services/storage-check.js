/* ==========================================================================
   Are the files the database knows still in the file storage?

   Every customer photo (uploads), product / artist picture and its small copy
   (media_files) and review photo (reviews) has a row that names its storage
   key. Checked when the server starts (and by "npm run doctor"): the storage
   is listed once per area and every key the database knows must be in it.

   A file that the database knows but the storage does not have was lost,
   typically because it was kept on a server disk that a restart or a
   redeploy wiped. Because the check runs at every start, a clean result after
   a redeploy shows that the files of the earlier deploys are still there.

   Only reads. Reports counts, never a key or a file name.
   ========================================================================== */
import { db } from "../db/index.js";
import { listFiles } from "../lib/storage.js";

let last = null;
/** What the last check found: null (none yet, or it could not run) or { known, missing, checkedAt }. */
export const knownFilesStatus = () => last;

/** -> { known, missing, checkedAt } (counts). Throws when the storage can't be listed. */
export async function checkKnownFiles() {
  const known = new Set();
  const add = (rows) => rows.forEach((r) => r.k && known.add(r.k));
  add((await db.query("SELECT storage_key AS k FROM uploads WHERE status <> 'DELETED'")).rows);
  add((await db.query("SELECT storage_key AS k FROM media_files")).rows);
  add((await db.query("SELECT thumb_key AS k FROM media_files WHERE thumb_key IS NOT NULL")).rows);
  add((await db.query("SELECT photo_key AS k FROM reviews WHERE photo_key IS NOT NULL")).rows);
  const kept = new Set();
  for (const area of ["private", "public"]) for (const f of await listFiles(area)) kept.add(f.key);
  let missing = 0;
  for (const key of known) if (!kept.has(key)) missing += 1;
  last = { known: known.size, missing, checkedAt: new Date().toISOString() };
  return last;
}

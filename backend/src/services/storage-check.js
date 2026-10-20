/* ==========================================================================
   Are the files the database knows still in the file storage?

   Every customer photo (uploads), product / artist picture and its small copy
   (media_files) and review photo (reviews) has a row that names its storage
   key. Checked when the server starts (the start-up log lists what each missing file belonged to): the storage
   is listed once per area and every key the database knows must be in it.

   A file that the database knows but the storage does not have was lost,
   typically because it was kept on a server disk that a restart or a
   redeploy wiped. Because the check runs at every start, a clean result after
   a redeploy shows that the files of the earlier deploys are still there.

   Only reads. Reports counts and, for each missing file, what it belongs to (an order number and its
   status, a shop or artist code, a product name, a date) — never a key, a file name or a person.
   ========================================================================== */
import { db } from "../db/index.js";
import { listFiles } from "../lib/storage.js";

let last = null;
/** What the last check found: null (none yet, or it could not run) or { known, missing, lost, checkedAt }. */
export const knownFilesStatus = () => last;

const ORDER_FINISHED = new Set(["DELIVERED", "CANCELLED", "RETURNED"]);
const PAINTING_FINISHED = new Set(["DELIVERED", "CANCELLED", "DECLINED"]);
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : "?");
const list = (v) => (v ? String(v).split(", ").filter(Boolean) : []);

/** Everything the database knows is stored: key -> what it belongs to (for the report; never shown with the key). */
async function knownFiles() {
  const known = new Map();
  const uploads = await db.query(
    `SELECT u.storage_key AS k, u.status, u.created_at,
            (SELECT string_agg(DISTINCT o.order_number || ' ' || o.status, ', ') FROM order_item_photos p JOIN orders o ON o.id = p.order_id WHERE p.upload_id = u.id) AS orders,
            (SELECT string_agg(DISTINCT r.request_number || ' ' || r.status, ', ') FROM painting_request_photos rp JOIN painting_requests r ON r.id = rp.request_id WHERE rp.upload_id = u.id) AS paintings,
            EXISTS (SELECT 1 FROM cart_items i WHERE i.photos @> jsonb_build_array(jsonb_build_object('uploadId', u.id::text))) AS in_cart,
            EXISTS (SELECT 1 FROM saved_designs d, jsonb_each_text(d.photos) dp WHERE dp.value = u.id::text) AS in_design
       FROM uploads u WHERE u.status <> 'DELETED'`
  );
  for (const r of uploads.rows) {
    const orders = list(r.orders).map((x) => x.split(" "));
    const paintings = list(r.paintings).map((x) => x.split(" "));
    const used = [...orders.map(([n, st]) => `order ${n} (${st})`), ...paintings.map(([n, st]) => `custom painting ${n} (${st})`)];
    if (r.in_cart) used.push("in a cart");
    if (r.in_design) used.push("in a saved design");
    const underWay = orders.some(([, st]) => !ORDER_FINISHED.has(st)) || paintings.some(([, st]) => !PAINTING_FINISHED.has(st));
    known.set(r.k, { what: "customer photo", where: used.join(", ") || `not used (${r.status})`, since: day(r.created_at), underWay });
  }
  const media = await db.query(
    `SELECT m.storage_key, m.thumb_key, m.created_at, s.shop_code, a.artist_code,
            (SELECT p.name FROM catalog_products p WHERE p.owner_shop_id = m.shop_id AND p.status <> 'REMOVED' AND p.data::text LIKE '%' || m.id::text || '%' LIMIT 1) AS product
       FROM media_files m LEFT JOIN shops s ON s.id = m.shop_id LEFT JOIN artists a ON a.id = m.artist_id`
  );
  for (const r of media.rows) {
    const owner = r.shop_code ? `shop ${r.shop_code}${r.product ? `, product "${String(r.product).slice(0, 60)}"` : ", no product uses it"}` : `artist ${r.artist_code || "?"}`;
    const what = r.shop_code ? "product picture" : "artist picture";
    if (r.storage_key) known.set(r.storage_key, { what, where: owner, since: day(r.created_at), underWay: false });
    if (r.thumb_key) known.set(r.thumb_key, { what: `${what} (small copy)`, where: owner, since: day(r.created_at), underWay: false });
  }
  const reviews = await db.query("SELECT photo_key, source_type, source_id, created_at FROM reviews WHERE photo_key IS NOT NULL");
  for (const r of reviews.rows) known.set(r.photo_key, { what: "review photo", where: `review of ${r.source_type === "ORDER" ? "order" : "custom painting"} ${r.source_id}`, since: day(r.created_at), underWay: false });
  return known;
}

/** -> { known, missing, lost, checkedAt }: counts, and what each missing file belonged to (under-way orders first). Throws when the storage can't be listed. */
export async function checkKnownFiles() {
  const known = await knownFiles();
  const kept = new Set();
  for (const area of ["private", "public"]) for (const f of await listFiles(area)) kept.add(f.key);
  const lost = [...known].filter(([key]) => !kept.has(key)).map(([, info]) => info);
  lost.sort((a, b) => Number(b.underWay) - Number(a.underWay) || a.since.localeCompare(b.since));
  last = { known: known.size, missing: lost.length, lost, checkedAt: new Date().toISOString() };
  return last;
}

/** One line per missing file, for the start-up log and the doctor. */
export const describeLost = (info) => `${info.underWay ? "STILL UNDER WAY - " : ""}${info.what}: ${info.where}; uploaded ${info.since}`;

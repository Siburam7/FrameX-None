/* ==========================================================================
   Catalogue: the products and design templates customers can order.

   They are imported into the database from the website's catalogue files
   every time the server starts (syncCatalog). From then on the cart reads
   them from the database only: a product id sent by a browser is looked up
   here, and what the browser says about its price or options is ignored.

   When products get their own admin screens, those screens write to these
   same tables and the import is no longer needed.
   ========================================================================== */
import crypto from "node:crypto";
import { siteEngine } from "../catalog/site-engine.js";
import { db } from "../db/index.js";

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const WRITE = {
  catalog_products: (q, r) =>
    q.query(
      `INSERT INTO catalog_products (id, slug, name, shop_ref, shop_name, status, data, source_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, shop_ref = EXCLUDED.shop_ref, shop_name = EXCLUDED.shop_name,
         status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, updated_at = now(),
         -- A new stock number in the catalogue is a fresh count: what orders took from the old count no longer applies.
         stock_reserved = CASE WHEN (catalog_products.data->>'stock') IS DISTINCT FROM (EXCLUDED.data->>'stock') THEN 0 ELSE catalog_products.stock_reserved END,
         data = EXCLUDED.data
       -- A product a shop created in its dashboard is never overwritten by the catalogue file.
       WHERE catalog_products.source = 'site'`,
      [r.id, r.slug, r.name, r.shopRef, r.shopName, r.status, JSON.stringify(r.data), r.sourceHash]
    ),
  catalog_templates: (q, r) =>
    q.query(
      `INSERT INTO catalog_templates (id, title, status, data, source_hash) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, data = EXCLUDED.data, source_hash = EXCLUDED.source_hash, updated_at = now()`,
      [r.id, r.title, r.status, JSON.stringify(r.data), r.sourceHash]
    )
};

/** Write the rows that changed, and mark what left the catalogue as REMOVED (carts may still point at it). */
async function upsert(q, table, rows) {
  // Only what came from the catalogue files is compared: products shops created in their dashboards are theirs.
  const fromFiles = table === "catalog_products" ? " WHERE source = 'site'" : "";
  const known = new Map((await q.query(`SELECT id, source_hash FROM ${table}${fromFiles}`)).rows.map((r) => [r.id, r.source_hash]));
  let changed = 0;
  for (const row of rows) {
    if (known.get(row.id) === row.sourceHash) continue;
    await WRITE[table](q, row);
    changed += 1;
  }
  const ids = new Set(rows.map((r) => r.id));
  for (const id of known.keys()) {
    if (ids.has(id)) continue;
    const gone = await q.query(`UPDATE ${table} SET status = 'REMOVED', source_hash = 'removed', updated_at = now() WHERE id = $1 AND status <> 'REMOVED'`, [id]);
    changed += gone.rowCount || 0;
  }
  return changed;
}

/** Import the website's catalogue into the database. Safe to run on every start. */
export async function syncCatalog({ log = () => {} } = {}) {
  const { seed, warnings } = siteEngine();
  warnings.forEach((w) => log(`catalogue warning: ${w}`));
  const shops = new Map((seed.shops || []).map((s) => [s.id, s]));

  const products = (seed.products || [])
    .filter((p) => p && p.id && p.name)
    .map((p) => {
      const shop = shops.get(p.shopId);
      const status = p.isVisible !== false && shop && shop.isActive !== false ? "ACTIVE" : "INACTIVE";
      const row = { id: String(p.id), slug: String(p.slug || p.id), name: String(p.name), shopRef: String(p.shopId || ""), shopName: shop ? String(shop.name) : "", status, data: p };
      return { ...row, sourceHash: hash(row) };
    });

  const templates = (seed.templates || [])
    .filter((t) => t && t.id && t.title)
    .map((t) => {
      const row = { id: String(t.id), title: String(t.title), status: t.available === false ? "INACTIVE" : "ACTIVE", data: t };
      return { ...row, sourceHash: hash(row) };
    });

  const result = await db.tx(async (q) => ({
    products: await upsert(q, "catalog_products", products),
    templates: await upsert(q, "catalog_templates", templates)
  }));
  log(`Catalogue: ${products.length} products and ${templates.length} templates in the database (${result.products + result.templates} changed)`);
  return { products: products.length, templates: templates.length, changed: result.products + result.templates };
}

/* ---------------------------------------------------------------- Stock
   The catalogue says how many of a product there are ("stock"). Orders take
   from that number through stock_reserved, so what can still be ordered is
   stock - stock_reserved. A product without a stock number is never limited. */

/** The stock number in a product record, or null when the product isn't counted. */
export function stockOf(data) {
  if (data && data.schema === 2) return data.availability && typeof data.availability.stock === "number" ? data.availability.stock : null;
  if (data && typeof data.stock === "number") return data.stock;
  if (data && data.availability && typeof data.availability.stock === "number") return data.availability.stock;
  return null;
}

/** The product record as customers should see it now: its stock minus what orders have taken. */
function withLiveStock(data, reserved) {
  const stock = stockOf(data);
  if (stock === null || !reserved) return data;
  const left = Math.max(0, stock - reserved);
  // The catalogue file keeps the number in "stock"; a product made in a shop's dashboard keeps it in "availability".
  if (data.schema !== 2 && typeof data.stock === "number") return { ...data, stock: left };
  return { ...data, availability: { ...data.availability, stock: left, ...(left === 0 ? { status: "out_of_stock" } : {}) } };
}

/**
 * Take stock for an order, inside the order's transaction.
 * wanted: Map(productId -> units). Rows are locked first, so two customers
 * can't both get the last one. Returns the products that don't have enough:
 * [{ productId, name, wanted, available }] (empty = everything was taken).
 */
export async function reserveStock(q, wanted) {
  const ids = [...wanted.keys()].sort();
  if (!ids.length) return [];
  const marks = ids.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await q.query(`SELECT id, name, status, data, stock_reserved FROM catalog_products WHERE id IN (${marks}) ORDER BY id FOR UPDATE`, ids);
  const short = [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    const stock = row ? stockOf(row.data) : 0;
    const available = !row || row.status !== "ACTIVE" ? 0 : stock === null ? Infinity : Math.max(0, stock - row.stock_reserved);
    if (wanted.get(id) > available) short.push({ productId: id, name: row ? row.name : id, wanted: wanted.get(id), available: Number.isFinite(available) ? available : null });
  }
  if (short.length) return short;
  for (const id of ids) await q.query("UPDATE catalog_products SET stock_reserved = stock_reserved + $2 WHERE id = $1", [id, wanted.get(id)]);
  return [];
}

/** Give stock back (a cancelled order). */
export async function releaseStock(q, wanted) {
  for (const [id, units] of wanted) await q.query("UPDATE catalog_products SET stock_reserved = GREATEST(0, stock_reserved - $2) WHERE id = $1", [id, units]);
}

// A listed (approved + active) shop linked to the catalogue shop gives the product its shop name.
// A product a shop created itself is only on sale while that shop is listed.
const PRODUCT_SQL = `
  SELECT p.id, p.slug, p.name, p.shop_ref, p.data, p.stock_reserved, p.updated_at, coalesce(sh.name, p.shop_name) AS shop_name,
         CASE WHEN p.source = 'shop' AND p.status = 'ACTIVE' AND sh.id IS NULL THEN 'INACTIVE' ELSE p.status END AS status
    FROM catalog_products p
    LEFT JOIN shops sh ON (sh.catalog_ref = p.shop_ref OR sh.shop_code = p.shop_ref) AND sh.approval_status = 'APPROVED' AND sh.active_status = 'ACTIVE'`;

const product = (row) => ({ id: row.id, slug: row.slug, name: row.name, shopRef: row.shop_ref, shopName: row.shop_name, status: row.status, data: withLiveStock(row.data, row.stock_reserved) });
const template = (row) => ({ id: row.id, title: row.title, status: row.status, data: row.data });

/** Products by id, as a Map. Unknown ids are simply absent. */
export async function productsById(ids, q = db) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Map();
  const marks = wanted.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await q.query(`${PRODUCT_SQL} WHERE p.id IN (${marks})`, wanted);
  return new Map(rows.map((r) => [r.id, product(r)]));
}

export async function templatesById(ids, q = db) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Map();
  const marks = wanted.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await q.query(`SELECT id, title, status, data FROM catalog_templates WHERE id IN (${marks})`, wanted);
  return new Map(rows.map((r) => [r.id, template(r)]));
}

export const getProduct = async (id, q = db) => (await productsById([id], q)).get(id) || null;
export const getTemplate = async (id, q = db) => (await templatesById([id], q)).get(id) || null;

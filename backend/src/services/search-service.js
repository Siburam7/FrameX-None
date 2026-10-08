/* ==========================================================================
   One search across what FrameX has: products, templates, shops, artists and
   artworks. Each kind answers with a short list (the first few matches and
   how many there are); the page for that kind shows the rest.

   Only what the public may see is searched: products on sale, listed shops,
   listed artists, approved artworks. Matching is done in the database with
   LIKE on a handful of fields, a few rows per kind: fine for a catalogue of
   thousands. A larger catalogue would move this to a text index.
   ========================================================================== */
import { db } from "../db/index.js";
import { listArtists } from "./artist-service.js";
import { listPublic as listArtworks } from "./artwork-service.js";
import { listPublicShops } from "./shop-service.js";

const like = (text) => `%${String(text).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
export const SEARCH_KINDS = ["products", "templates", "shops", "artists", "artworks"];

async function products(q, limit) {
  const where = `p.status = 'ACTIVE' AND p.source <> 'artist'
    AND (p.source <> 'shop' OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.owner_shop_id AND s.approval_status = 'APPROVED' AND s.active_status = 'ACTIVE'))
    AND (lower(p.name) LIKE $1 OR lower(p.shop_name) LIKE $1 OR lower(coalesce(p.data->>'description', '')) LIKE $1 OR lower(coalesce((p.data->'tags')::text, '')) LIKE $1
         OR lower(coalesce((p.data->'categoryIds')::text, '')) LIKE $1 OR lower(coalesce(p.data->>'category', '')) LIKE $1)`;
  const total = (await db.query(`SELECT count(*)::int AS n FROM catalog_products p WHERE ${where}`, [like(q)])).rows[0].n;
  const { rows } = await db.query(`SELECT p.id, p.slug, p.name, p.shop_name, p.data FROM catalog_products p WHERE ${where} ORDER BY (lower(p.name) LIKE $1) DESC, p.name LIMIT $2`, [like(q), limit]);
  return {
    total,
    items: rows.map((r) => ({ id: r.id, name: r.name, shopName: r.shop_name, image: r.data.listingImage || r.data.image || "", url: `product.html?id=${encodeURIComponent(r.id)}` }))
  };
}

async function templates(q, limit) {
  const where = "status = 'ACTIVE' AND (lower(title) LIKE $1 OR lower(coalesce(data->>'category', '')) LIKE $1 OR lower(coalesce((data->'tags')::text, '')) LIKE $1 OR lower(coalesce(data->>'occasion', '')) LIKE $1)";
  const total = (await db.query(`SELECT count(*)::int AS n FROM catalog_templates WHERE ${where}`, [like(q)])).rows[0].n;
  const { rows } = await db.query(`SELECT id, title, data FROM catalog_templates WHERE ${where} ORDER BY title LIMIT $2`, [like(q), limit]);
  return { total, items: rows.map((r) => ({ id: r.id, name: r.title, image: typeof r.data.thumbnail === "string" && !r.data.thumbnail.startsWith("data:") ? r.data.thumbnail : "", url: `template.html?t=${encodeURIComponent(r.data.slug || r.id)}` })) };
}

/** q: what was typed. kinds: which of SEARCH_KINDS to search (default all). */
export async function searchAll({ q, kinds = SEARCH_KINDS, limit = 5 }) {
  const term = String(q || "").trim();
  const size = Math.min(Math.max(1, limit), 12);
  const out = { q: term, results: {} };
  if (term.length < 2) return out;
  const wanted = SEARCH_KINDS.filter((k) => kinds.includes(k));
  await Promise.all(
    wanted.map(async (kind) => {
      if (kind === "products") out.results.products = await products(term, size);
      else if (kind === "templates") out.results.templates = await templates(term, size);
      else if (kind === "shops") {
        const r = await listPublicShops({ q: term, limit: size });
        out.results.shops = { total: r.total, items: r.items.map((s) => ({ id: s.shopCode, name: s.name, city: s.address.city, url: `shop-detail.html?id=${encodeURIComponent(s.catalogRef || s.shopCode)}` })) };
      } else if (kind === "artists") {
        const r = await listArtists({ q: term, limit: size });
        out.results.artists = { total: r.total, items: r.items.map((a) => ({ id: a.artistCode, name: a.name, username: a.username, city: a.location.city, image: a.photo, url: `artist.html?artist=${encodeURIComponent(a.username)}` })) };
      } else if (kind === "artworks") {
        const r = await listArtworks({ q: term, limit: size });
        out.results.artworks = { total: r.total, items: r.items.map((w) => ({ id: w.id, name: w.title, artistName: w.artist.name, price: w.price, image: w.image, url: `artwork.html?id=${encodeURIComponent(w.id)}` })) };
      }
    })
  );
  return out;
}

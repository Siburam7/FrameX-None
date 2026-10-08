/* ==========================================================================
   Test helpers for customer photos.

     jpeg / png / webp      a file whose header says what size it is (enough for
                            the server, which reads the header and never decodes)
     uploadPhoto            POST /api/uploads the way a browser does: raw bytes
     autoPhotos(Client, base)
                            older tests add a photo frame to a cart without
                            thinking about photos. A photo frame can no longer
                            be ordered without one, so this gives those requests
                            the uploads they need (unless the test sets `photos`
                            itself, e.g. to check that a missing photo is refused).
   ========================================================================== */
import { siteEngine } from "../../src/catalog/site-engine.js";

/** A JPEG header for a picture of this size, padded to `bytes`. */
export function jpeg({ width = 4032, height = 3024, bytes = 4096, orientation = null, fill = 0x5a } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    // APP1 / EXIF with one tag: Orientation.
    const tiff = Buffer.alloc(26);
    tiff.write("II", 0, "latin1");
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8); // one entry
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12); // SHORT
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
    const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);
  const used = parts.reduce((n, p) => n + p.length, 0) + 2;
  parts.push(Buffer.alloc(Math.max(0, bytes - used), fill), Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

export function png({ width = 1200, height = 800, bytes = 2048 } = {}) {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "latin1");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  head[24] = 8;
  head[25] = 2;
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - 33), 0x11)]);
}

export function webp({ width = 1600, height = 900, bytes = 2048 } = {}) {
  const head = Buffer.alloc(30);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(Math.max(bytes, 30) - 8, 4);
  head.write("WEBP", 8, "latin1");
  head.write("VP8X", 12, "latin1");
  head.writeUInt32LE(10, 16);
  head.writeUIntLE(width - 1, 24, 3);
  head.writeUIntLE(height - 1, 27, 3);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - 30), 0x22)]);
}

/** Send one photo as a browser would. -> { status, json, text } */
export async function uploadPhoto(base, client, { body = jpeg(), type = "image/jpeg", name = "family-trip.jpg", headers = {} } = {}) {
  const response = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: { "Content-Type": type, "X-FrameX-Client": "test", "X-File-Name": encodeURIComponent(name), ...(client && client.cookie ? { Cookie: client.cookie } : {}), ...headers },
    body
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text };
}

/** Upload `count` different photos and return their ids. */
export async function uploadMany(base, client, count, options = {}) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const r = await uploadPhoto(base, client, { name: `photo-${i + 1}.jpg`, body: jpeg({ fill: 0x30 + i, ...options }) });
    if (r.status !== 201) throw new Error(`upload failed (${r.status}): ${r.text}`);
    ids.push(r.json.upload.id);
  }
  return ids;
}

/** The photo spaces an item (as a browser describes it) has to fill. */
export function slotsFor(item) {
  const { seed, model, studio } = siteEngine();
  if (!item || typeof item !== "object") return [];
  if (item.kind === "studio") {
    const cfg = (item.design && item.design.config) || {};
    const template = cfg.mode === "template" ? (seed.templates || []).find((t) => t.id === cfg.templateId) : null;
    const product = cfg.mode === "product" ? seed.products.find((p) => p.id === cfg.productId) : null;
    if ((cfg.mode === "template" && !template) || (cfg.mode === "product" && !product) || !["template", "photo", "product"].includes(cfg.mode)) return [];
    try {
      return studio.context({ template: template || null, product: product ? model.normalize(product) : null }).caps.photoSlots;
    } catch {
      return [];
    }
  }
  const product = seed.products.find((p) => p.id === item.productId);
  return product ? model.photoRequirement(model.normalize(product), item.selection || {}).slots : [];
}

/**
 * Wrap a test Client so that items it adds or buys carry the photos they need.
 * One upload per logged-in account is reused, so "the same item again" is still
 * the same line. A request that names `photos` itself is left exactly as written.
 */
export function autoPhotos(Client, getBase) {
  const original = Client.prototype.request;
  async function photosFor(client, item) {
    if (!client.cookie || "photos" in item) return item;
    const slots = slotsFor(item);
    if (!slots.length) return item;
    if (!client.photoFor || client.photoFor.cookie !== client.cookie) {
      const r = await uploadPhoto(getBase(), client);
      if (r.status !== 201) return item;
      client.photoFor = { cookie: client.cookie, id: r.json.upload.id };
    }
    return { ...item, photos: Object.fromEntries(slots.map((slot) => [slot, client.photoFor.id])) };
  }
  Client.prototype.request = async function (method, url, body, ...rest) {
    let sent = body;
    if (method === "POST" && body && typeof body === "object") {
      if (url === "/api/cart/items") sent = await photosFor(this, body);
      else if (/^\/api\/checkout\/(quote|orders)$/.test(url) && body.buyNow && typeof body.buyNow === "object") sent = { ...body, buyNow: await photosFor(this, body.buyNow) };
    }
    return original.call(this, method, url, sent, ...rest);
  };
}

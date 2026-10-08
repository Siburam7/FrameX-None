/* ==========================================================================
   A shop's own orders: what it has to make, and the customer's original
   photos it has to print.

   What a shop can see is decided here, on the server, from who is logged in:
     - only orders that contain at least one line sold by THIS shop, and of
       those orders only its own lines (never another shop's lines or amounts);
     - only once the order really exists for the shop: an online order that is
       still waiting for its payment is not shown;
     - the delivery details the shop needs to hand the order over (name,
       phone, address), not the customer's email or anything about the payment
       beyond "paid online" / "collect cash";
     - a customer photo only when it belongs to one of its own lines, and only
       through a link that lasts a few minutes. Every link is written to the
       audit log.
   A line belongs to a shop when its shop reference is the shop's catalogue
   link or its Shop ID (products a shop created in its dashboard use those).
   ========================================================================== */
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import * as orders from "./order-service.js";
import { linkTo } from "./upload-service.js";

const ORDER_NUMBER = /^FX-\d{6,12}$/;
const notFound = () => errors.notFound("We couldn't find that order.", "ORDER_NOT_FOUND");
// An order the shop should know about: placed (paid online or Cash on Delivery) and everything after.
const VISIBLE = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"];
const LABEL = { NEW: "New", ACCEPTED: "Accepted", IN_PRODUCTION: "In production", READY: "Ready", HANDED_OVER: "Handed over" };

/** The shop row behind a session's shop id, with the references its order lines carry. */
export async function shopContext(shopId) {
  const row = (await db.query("SELECT id, shop_code, catalog_ref, name FROM shops WHERE id = $1", [shopId])).rows[0];
  if (!row) throw errors.forbidden();
  return { id: row.id, code: row.shop_code, name: row.name, refs: [row.catalog_ref, row.shop_code].filter(Boolean) };
}

const refMarks = (shop, from) => orders.marks(shop.refs, from);

function summary(row, mine) {
  return {
    orderNumber: row.order_number,
    status: row.status,
    placedAt: row.placed_at || row.created_at,
    // What the shop needs to know about the money: nothing about cards or gateways.
    payment: row.payment_method === "COD" ? (row.payment_status === "PAID" ? "Cash collected" : "Cash on Delivery: collect on handover") : row.payment_status === "PAID" ? "Paid online" : "Online payment",
    cashToCollect: row.payment_method === "COD" && row.payment_status !== "PAID",
    giftWrap: Boolean(row.gift_wrap),
    customerName: row.customer_name,
    itemCount: mine.reduce((sum, i) => sum + i.quantity, 0),
    itemsTotal: mine.reduce((sum, i) => sum + i.line_total, 0),
    photoCount: mine.reduce((sum, i) => sum + (i.photo_count || 0), 0),
    needsAction: mine.some((i) => i.fulfilment_status === "NEW") && orders.ACTIVE_FOR_FULFILMENT.includes(row.status) && row.status !== "DELIVERED",
    firstItem: mine[0] ? { name: mine[0].name, image: mine[0].image } : null
  };
}

/** The shop's orders, newest first. filter: "open" (still to make / hand over), "done", or "" for all. */
export async function listOrders(shop, { filter = "", page = 1, limit = 20 } = {}) {
  const size = Math.min(Math.max(1, limit), 50);
  const at = Math.max(1, page);
  const params = [...shop.refs, ...VISIBLE];
  const visible = orders.marks(VISIBLE, shop.refs.length + 1);
  let extra = "";
  if (filter === "open") extra = " AND o.status IN ('PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY')";
  if (filter === "done") extra = " AND o.status IN ('DELIVERED', 'CANCELLED', 'RETURNED')";
  const where = `o.status IN (${visible})${extra} AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.shop_ref IN (${refMarks(shop, 1)}))`;
  const total = (await db.query(`SELECT count(*)::int AS n FROM orders o WHERE ${where}`, params)).rows[0].n;
  const { rows } = await db.query(`SELECT o.* FROM orders o WHERE ${where} ORDER BY o.created_at DESC, o.order_number DESC LIMIT ${size} OFFSET ${(at - 1) * size}`, params);
  const byOrder = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const items = (
      await db.query(
        `SELECT i.*, (SELECT count(*)::int FROM order_item_photos p WHERE p.order_item_id = i.id) AS photo_count
           FROM order_items i
          WHERE i.order_id IN (${orders.marks(ids, shop.refs.length + 1)}) AND i.shop_ref IN (${refMarks(shop, 1)})
          ORDER BY i.position`,
        [...shop.refs, ...ids]
      )
    ).rows;
    for (const i of items) {
      if (!byOrder.has(i.order_id)) byOrder.set(i.order_id, []);
      byOrder.get(i.order_id).push(i);
    }
  }
  return { items: rows.map((r) => summary(r, byOrder.get(r.id) || [])), total, page: at, limit: size };
}

/** The order row, if it is visible to shops and has a line of this shop. Otherwise 404, as if it didn't exist. */
async function shopOrderRow(shop, orderNumber, q = db) {
  if (!ORDER_NUMBER.test(String(orderNumber || ""))) throw notFound();
  const { rows } = await q.query(
    `SELECT o.* FROM orders o
      WHERE o.order_number = $${shop.refs.length + 1} AND o.status IN (${orders.marks(VISIBLE, shop.refs.length + 2)})
        AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.shop_ref IN (${refMarks(shop, 1)}))`,
    [...shop.refs, orderNumber, ...VISIBLE]
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

/** One order as the shop sees it: its own lines, their photos, and who to hand it to. */
export async function getOrder(shop, orderNumber) {
  const row = await shopOrderRow(shop, orderNumber);
  const lines = (await db.query(`SELECT * FROM order_items WHERE order_id = $${shop.refs.length + 1} AND shop_ref IN (${refMarks(shop, 1)}) ORDER BY position`, [...shop.refs, row.id])).rows;
  const photos = orders.photosByItem(lines.length ? (await db.query(`${orders.PHOTOS_SQL} WHERE p.order_item_id IN (${orders.marks(lines.map((l) => l.id))}) ORDER BY p.order_item_id, p.position`, lines.map((l) => l.id))).rows : []);
  const others = (await db.query(`SELECT count(*)::int AS n FROM order_items WHERE order_id = $${shop.refs.length + 1} AND shop_ref NOT IN (${refMarks(shop, 1)})`, [...shop.refs, row.id])).rows[0].n;
  const active = orders.ACTIVE_FOR_FULFILMENT.includes(row.status);
  const a = row.shipping_address || {};
  return {
    ...summary(row, lines.map((l) => ({ ...l, photo_count: (photos.get(l.id) || []).length }))),
    cancelledAt: row.cancelled_at,
    cancelReason: row.status === "CANCELLED" ? row.cancel_reason : null,
    // Who the order goes to. No email address, no payment references.
    deliverTo: { name: a.fullName || row.customer_name, phone: a.phone || row.customer_phone || null, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postalCode: a.postalCode },
    items: lines.map((l) => orders.item(l, photos.get(l.id) || [])),
    otherShopsItems: others, // how many lines of this order other sellers make (nothing else about them)
    // Photos can be downloaded, and lines worked on, only while the order is live.
    canDownloadPhotos: active,
    canUpdate: active && row.status !== "DELIVERED",
    fulfilmentStatuses: orders.FULFILMENT_STATUSES.map((id) => ({ id, label: LABEL[id] }))
  };
}

/** A short-lived link to the customer's ORIGINAL photo of one of this shop's own order lines. */
export async function photoLink(shop, orderNumber, uploadId, { actor, ip = null }) {
  const row = await shopOrderRow(shop, orderNumber);
  if (!orders.ACTIVE_FOR_FULFILMENT.includes(row.status)) throw errors.conflict("This order is no longer active, so its photos can't be downloaded.", null, "ORDER_NOT_ACTIVE");
  // Only a photo of one of THIS shop's lines in THIS order: any other id answers 404.
  const upload = await orders.orderPhotoRow(row.id, uploadId, { shopRefs: shop.refs });
  await audit(db, { actor, action: ACTIONS.ORDER_PHOTO_ACCESSED, targetType: "order", targetId: row.order_number, metadata: { uploadId: upload.id, slot: upload.slot, item: upload.item_name, shop: shop.code }, ip });
  return linkTo(upload, { download: true, name: orders.photoFileName(row.order_number, upload) });
}

/** The shop says where it is with one of its lines: accepted, in production, ready, handed over. */
export async function setFulfilment(shop, orderNumber, itemId, { status, note = "" }, { actor, ip = null }) {
  if (!orders.FULFILMENT_STATUSES.includes(status)) throw errors.validation({ status: "Choose one of the listed steps." });
  await db.tx(async (q) => {
    const row = await shopOrderRow(shop, orderNumber, q);
    if (!orders.ACTIVE_FOR_FULFILMENT.includes(row.status) || row.status === "DELIVERED") throw errors.conflict(`This order is ${row.status.replace(/_/g, " ").toLowerCase()}, so it can't be changed.`, null, "ORDER_NOT_ACTIVE");
    const { rows } = await q.query(
      `UPDATE order_items SET fulfilment_status = $1, fulfilment_note = $2, fulfilment_updated_at = now(), fulfilment_updated_by = $3
        WHERE id = $4 AND order_id = $5 AND shop_ref IN (${refMarks(shop, 6)}) RETURNING name, fulfilment_status`,
      [status, note || null, actor.id, itemId, row.id, ...shop.refs]
    );
    if (!rows[0]) throw errors.notFound("That item isn't one of your shop's items in this order.", "ORDER_ITEM_NOT_FOUND");
    // The customer and FrameX see it in the order's history.
    await orders.addEvent(q, row.id, { kind: "NOTE", status: null, detail: `${shop.name}: ${rows[0].name} is ${LABEL[status].toLowerCase()}.${note ? " " + note : ""}`, actor: { id: actor.id, role: actor.role === "ARTIST" ? "ARTIST" : "SHOP" } });
    await audit(q, { actor, action: ACTIONS.ORDER_ITEM_FULFILMENT_CHANGED, targetType: "order", targetId: row.order_number, metadata: { item: rows[0].name, status, shop: shop.code }, ip });
  });
  return getOrder(shop, orderNumber);
}

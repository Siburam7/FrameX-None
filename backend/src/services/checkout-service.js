/* ==========================================================================
   Checkout: the price of an order, and turning a cart into an order.

   The browser sends an address id, a payment method, the total it showed the
   customer, and a key that identifies this one checkout. Everything else is
   worked out here from the database:
     items + their prices    the cart, re-checked against the catalogue now
     discounts               each product's own discount
     tax, shipping, COD fee  the server's settings (config.checkout)
     gift wrapping           optional; the server's fee, shown before paying
     total                   subtotal - discount + tax + shipping + gift wrapping + COD fee
   The total the browser sent is only compared with the server's: if they
   differ (a price changed meanwhile), nothing is charged and the customer is
   shown the new total first.

   One checkout = one order: the same key always answers with the same order.

   What is ordered is either the whole cart, or one item bought directly
   ("Buy Now": `buyNow`, the same item description the cart accepts). Buy Now
   goes through exactly the same checks and pricing, and leaves the cart alone.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { HttpError, errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { gateway, paymentStatus } from "../payments/index.js";
import { addressSnapshot, ownAddress, publicAddress } from "./address-service.js";
import { gatewayInTestMode } from "./analytics-service.js";
import { checkoutLines, directLines, removePurchased } from "./cart-service.js";
import { reserveStock } from "./catalog-service.js";
import * as orders from "./order-service.js";
import * as payments from "./payment-service.js";
import { attachUploads } from "./upload-service.js";

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const KEY = /^[A-Za-z0-9_-]{16,80}$/;

/* ---------------------------------------------------------------- Cash on Delivery rules */

/** Can this order be paid in cash on delivery? -> { available, fee, reason } */
function codFor({ lines, payable, address }) {
  const c = config.checkout.cod;
  const no = (reason) => ({ available: false, fee: c.fee, reason });
  if (!c.enabled) return no("Cash on Delivery is not available.");
  if (c.maxOrderValue && payable > c.maxOrderValue) return no(`Cash on Delivery is available for orders up to ${rupees(c.maxOrderValue)}.`);
  if (address && c.blockedPincodes.some((p) => address.postal_code.startsWith(p))) return no("Cash on Delivery is not available for this PIN code.");
  const blocked = lines.find((l) => !l.cod || c.blockedShops.includes(l.item.shopId) || c.blockedProducts.includes(l.item.productId) || (!c.allowCustomDesigns && (l.kind === "STUDIO" || l.customization)));
  if (blocked) return no(`Cash on Delivery is not available for ${blocked.item.name}.`);
  return { available: true, fee: c.fee, reason: null };
}

/* ---------------------------------------------------------------- Gift wrapping rules */

/** The shops among these (catalogue ids or Shop IDs) that have switched gift wrapping off. */
async function shopsWithoutGiftWrap(shopIds, q = db) {
  const ids = [...new Set(shopIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const marks = ids.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await q.query(`SELECT catalog_ref, shop_code FROM shops WHERE gift_wrap = false AND (catalog_ref IN (${marks}) OR shop_code IN (${marks}))`, ids);
  return new Set(rows.flatMap((r) => [r.catalog_ref, r.shop_code]).filter(Boolean));
}

/**
 * Can this order be gift wrapped? -> { available, fee, reason }
 * It is offered only when every item in the order can be wrapped: a product
 * or a shop that doesn't offer it switches the option off, with the reason.
 */
function giftWrapFor({ lines, noWrapShops }) {
  const g = config.checkout.giftWrap;
  const no = (reason) => ({ available: false, fee: g.fee, reason });
  if (!g.enabled) return no("Gift wrapping is not available right now.");
  if (!lines.length) return no("There is nothing to wrap yet.");
  const blocked = lines.find((l) => l.giftWrap === false || g.blockedProducts.includes(l.item.productId) || g.blockedShops.includes(l.item.shopId) || noWrapShops.has(l.item.shopId));
  if (blocked) return no(`Gift wrapping is not available for ${blocked.item.name}.`);
  return { available: true, fee: g.fee, reason: null };
}

/* ---------------------------------------------------------------- The price */

/**
 * Everything the checkout page shows, calculated from the cart as it is now.
 * paymentMethod (COD | ONLINE | null) decides whether the COD fee is included;
 * giftWrap (true | false) whether the gift-wrapping fee is.
 */
function compute({ cart, lines, address, paymentMethod, direct = false, giftWrap = false, noWrapShops = new Set() }) {
  const issues = [];
  if (!cart.items.length) issues.push({ code: "CART_EMPTY", message: "Your cart is empty.", itemId: null });
  for (const item of cart.items) if (item.issue) issues.push({ ...item.issue, itemId: item.id, name: item.name });

  const good = lines.filter((l) => l.item.available);
  const subtotal = good.reduce((sum, l) => sum + l.item.unitListPrice * l.item.quantity, 0);
  const discount = good.reduce((sum, l) => sum + l.item.unitDiscount * l.item.quantity, 0);
  const itemsTotal = subtotal - discount;
  const k = config.checkout;
  const tax = Math.round((itemsTotal * k.taxPercent) / 100);
  const shippingFee = itemsTotal > 0 && !(k.freeShippingAbove && itemsTotal >= k.freeShippingAbove) ? k.shippingFee : 0;
  const wrap = giftWrapFor({ lines: good, noWrapShops });
  const wrapped = Boolean(giftWrap && wrap.available);
  const giftWrapFee = wrapped ? wrap.fee : 0;
  const cod = codFor({ lines: good, payable: itemsTotal + tax + shippingFee + giftWrapFee, address });
  const codFee = paymentMethod === "COD" && cod.available ? cod.fee : 0;
  const gw = paymentStatus();

  return {
    mode: direct ? "buy-now" : "cart",
    ok: issues.length === 0,
    issues,
    // Lines whose price differs from the one stored when they were added to the cart.
    priceChanges: cart.items.filter((i) => i.available && i.priceChange).map((i) => ({ itemId: i.id, name: i.name, from: i.priceChange.from, to: i.priceChange.to })),
    items: good.map((l) => l.item),
    itemCount: good.reduce((sum, l) => sum + l.item.quantity, 0),
    currency: "INR",
    subtotal,
    discount,
    tax,
    taxPercent: k.taxPercent,
    shippingFee,
    // Gift wrapping: whether it can be chosen for this order, what it costs, and whether it is in this total.
    giftWrap: { ...wrap, selected: wrapped },
    giftWrapFee,
    codFee,
    total: itemsTotal + tax + shippingFee + giftWrapFee + codFee,
    paymentMethod: paymentMethod || null,
    address: address ? publicAddress(address) : null,
    payment: {
      // Online methods are offered only when a gateway is really configured.
      online: gw.ready ? { available: true, provider: gw.provider, mode: gw.mode, methods: gateway().methods } : { available: false, provider: null, mode: null, methods: [], reason: "Online payment is not available right now." },
      cod
    },
    lines: good // for placeOrder only; removed from the answer
  };
}

const publicQuote = ({ lines, ...quote }) => quote;

/** What is being ordered: the cart, or the one item of a "Buy Now". */
const linesFor = (userId, buyNow, q = db) => (buyNow ? directLines(userId, buyNow, q) : checkoutLines(userId, q));

/** The quote for the checkout page. */
export async function getQuote(userId, { addressId = null, paymentMethod = null, buyNow = null, giftWrap = false } = {}) {
  const { cart, lines } = await linesFor(userId, buyNow);
  const address = addressId ? await ownAddress(userId, addressId) : null;
  const noWrapShops = await shopsWithoutGiftWrap(lines.map((l) => l.item.shopId));
  return publicQuote(compute({ cart, lines, address, paymentMethod, direct: Boolean(buyNow), giftWrap, noWrapShops }));
}

/* ---------------------------------------------------------------- Placing an order */

/** The same checkout key again: answer with the order it already made. */
async function resume(user, existing, { paymentMethod, paymentChannel }) {
  if (existing.payment_method !== paymentMethod) throw new HttpError(409, "CHECKOUT_CHANGED", "Your checkout changed. Please review it and try again.");
  if (existing.status === "CANCELLED") throw new HttpError(409, "CHECKOUT_EXPIRED", "This checkout has expired. Please review your order and try again.");
  if (existing.payment_method === "ONLINE" && existing.status === "PENDING_PAYMENT") {
    // Refreshed or pressed "Pay" again: first see whether the earlier payment went through.
    const state = await payments.reconcile(existing);
    if (!state.placed && !state.already) {
      const { session } = await payments.openAttempt(await orders.orderRowById(existing.id), paymentChannel);
      return { order: await orders.getOwnOrder(user.id, existing.order_number), payment: session, repeated: true };
    }
  }
  return { order: await orders.getOwnOrder(user.id, existing.order_number), payment: null, repeated: true };
}

/** An earlier online order of this user that never got paid makes way for the new checkout. */
async function clearUnpaid(user) {
  const { rows } = await db.query("SELECT * FROM orders WHERE user_id = $1 AND status = 'PENDING_PAYMENT'", [user.id]);
  for (const old of rows) {
    try {
      await payments.cancelOrder(old, { from: ["PENDING_PAYMENT"], reason: "Replaced by a new checkout.", actor: { id: user.id, role: "CUSTOMER" }, email: false });
    } catch (error) {
      if (error.code === "ORDER_ALREADY_PAID") throw new HttpError(409, "EARLIER_ORDER_PAID", `Your earlier payment went through: order ${old.order_number} is placed.`, { details: { orderNumber: old.order_number } });
      if (error.code !== "ORDER_NOT_CANCELLABLE") throw error;
    }
  }
}

/**
 * Who sells each line: Map(productId | "ref:<seller reference>" -> { type, artistId }).
 *   ARTIST          an artist's artwork
 *   SHOP            a product a shop created, or a catalogue product of a shop that is on FrameX
 *   FRAME_X_STUDIO  everything else: FrameX's own catalogue and FrameX Studio designs
 */
async function sellersOf(q, lines) {
  const out = new Map();
  const ids = [...new Set(lines.map((l) => l.item.productId).filter(Boolean))];
  const refs = [...new Set(lines.map((l) => l.item.shopId).filter(Boolean))];
  const shopRefs = new Set();
  if (refs.length) {
    const marks = refs.map((_, n) => `$${n + 1}`).join(", ");
    for (const r of (await q.query(`SELECT shop_code, catalog_ref FROM shops WHERE shop_code IN (${marks}) OR catalog_ref IN (${marks})`, refs)).rows) [r.shop_code, r.catalog_ref].filter(Boolean).forEach((x) => shopRefs.add(x));
  }
  for (const ref of refs) out.set(`ref:${ref}`, { type: shopRefs.has(ref) ? "SHOP" : "FRAME_X_STUDIO", artistId: null });
  if (ids.length) {
    const { rows } = await q.query(`SELECT id, source, owner_artist_id, shop_ref FROM catalog_products WHERE id IN (${ids.map((_, n) => `$${n + 1}`).join(", ")})`, ids);
    for (const r of rows) out.set(r.id, r.source === "artist" ? { type: "ARTIST", artistId: r.owner_artist_id } : { type: r.source === "shop" || shopRefs.has(r.shop_ref) ? "SHOP" : "FRAME_X_STUDIO", artistId: null });
  }
  return out;
}

/** The kind of order, from what is in it (how it is paid is in payment_method). */
function orderTypeOf(lines, sellers) {
  const kinds = new Set(
    lines.map((l) => {
      const seller = sellers.get(l.item.productId);
      if (seller && seller.type === "ARTIST") return "ARTWORK_ORDER";
      if (l.item.templateId) return "TEMPLATE_ORDER";
      return l.kind === "STUDIO" || (l.photosRequired || 0) > 0 ? "PERSONALIZED_PRODUCT_ORDER" : "STANDARD_PRODUCT_ORDER";
    })
  );
  return kinds.size === 1 ? [...kinds][0] : "MIXED_ORDER";
}

async function insertOrder(q, user, { quote, address, paymentMethod, idempotencyKey }) {
  const id = newId();
  const number = "FX-" + (await q.query("SELECT nextval('order_number_seq') AS n")).rows[0].n;
  const cod = paymentMethod === "COD";
  await q.query(
    `INSERT INTO orders (id, order_number, user_id, idempotency_key, status, payment_method, payment_status, currency,
                         subtotal, discount, tax, tax_percent, shipping_fee, cod_fee, total, item_count,
                         address_id, shipping_address, customer_name, customer_email, customer_phone, placed_at, expires_at,
                         gift_wrap, gift_wrap_fee, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             CASE WHEN $21 THEN now() ELSE NULL END,
             CASE WHEN $21 THEN NULL ELSE now() + interval '${config.payments.pendingMinutes} minutes' END,
             $22, $23, $24)`,
    [id, number, user.id, idempotencyKey, cod ? "PLACED" : "PENDING_PAYMENT", paymentMethod, quote.currency, quote.subtotal, quote.discount, quote.tax, quote.taxPercent, quote.shippingFee, quote.codFee, quote.total, quote.itemCount,
      address.id, JSON.stringify(addressSnapshot(address)), user.name, user.email, address.phone || user.phone || null, cod, quote.giftWrap.selected, quote.giftWrapFee,
      // Paid through a gateway that is in TEST mode: not real money, so the reports keep it out of sales.
      !cod && gatewayInTestMode()]
  );
  const sellers = await sellersOf(q, quote.lines);
  let position = 0;
  const used = [];
  const templatePhotos = [];
  for (const line of quote.lines) {
    const i = line.item;
    const itemId = newId();
    const seller = sellers.get(i.productId) || sellers.get(`ref:${i.shopId}`) || { type: "FRAME_X_STUDIO", artistId: null };
    await q.query(
      `INSERT INTO order_items (id, order_id, position, kind, product_id, template_id, shop_ref, shop_name, name, image, size, color, options, selection,
                                customization, design_ref, design_summary, note, quantity, unit_list_price, unit_discount, unit_price, line_total, cart_item_id,
                                product_type, photos_required, seller_type, artist_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [itemId, id, (position += 1), line.kind, i.productId || null, i.templateId || null, i.shopId, i.shopName, i.name, i.image, i.size, i.color, JSON.stringify(i.options || []), JSON.stringify(line.selection || {}),
        line.customization ? JSON.stringify(line.customization) : null, line.designRef, i.design ? JSON.stringify(i.design) : null, i.note || "", i.quantity, i.unitListPrice, i.unitDiscount, i.unitPrice, i.lineTotal, line.cartItemId,
        line.productType || null, line.photosRequired || 0, seller.type, seller.artistId]
    );
    // The originals this line is printed from stay tied to it: this is what the shop (or FrameX) later downloads.
    let at = 0;
    for (const photo of line.photos || []) {
      await q.query("INSERT INTO order_item_photos (id, order_item_id, order_id, upload_id, slot, position, placement) VALUES ($1, $2, $3, $4, $5, $6, $7)", [newId(), itemId, id, photo.uploadId, photo.slot, (at += 1), photo.placement ? JSON.stringify(photo.placement) : null]);
      used.push(photo.uploadId);
      if (i.templateId) templatePhotos.push(photo.uploadId);
    }
  }
  await attachUploads(q, used);
  // What each photo is for: a template's photos fill its slots; every other one is the picture that is printed.
  if (templatePhotos.length) await q.query(`UPDATE uploads SET role = 'TEMPLATE_SLOT_IMAGE' WHERE id IN (${templatePhotos.map((_, n) => `$${n + 1}`).join(", ")})`, templatePhotos);
  await q.query("UPDATE orders SET order_type = $2 WHERE id = $1", [id, orderTypeOf(quote.lines, sellers)]);
  return { id, number };
}

/**
 * Place an order from the logged-in user's cart.
 *   COD     -> the order is PLACED, payment PENDING (paid on delivery), cart lines removed.
 *   ONLINE  -> the order waits for its payment (PENDING_PAYMENT) and a payment
 *              attempt is opened. It becomes PLACED only when the server has
 *              verified the payment (payment-service.js). The cart is untouched until then.
 * Returns { order, payment } where payment is what the browser needs to open
 * the gateway's checkout (null for COD).
 * buyNow (optional): order this one item instead of the cart; the cart stays as it is.
 * giftWrap (optional): the customer asked for gift wrapping; its fee is part of the total they saw.
 */
export async function placeOrder(user, { addressId, paymentMethod, paymentChannel = null, expectedTotal, idempotencyKey, buyNow = null, giftWrap = false }) {
  if (!KEY.test(String(idempotencyKey || ""))) throw errors.validation({ idempotencyKey: "The checkout could not be identified. Reload the page and try again." });
  const find = async () => (await db.query("SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2", [user.id, idempotencyKey])).rows[0];
  const existing = await find();
  if (existing) return resume(user, existing, { paymentMethod, paymentChannel });

  if (paymentMethod === "ONLINE") gateway(); // 503 before anything is created when online payment isn't configured
  await clearUnpaid(user);

  let created;
  try {
    created = await db.tx(async (q) => {
      const { cart, lines } = await linesFor(user.id, buyNow, q);
      const address = await ownAddress(user.id, addressId, q);
      const noWrapShops = await shopsWithoutGiftWrap(lines.map((l) => l.item.shopId), q);
      const quote = compute({ cart, lines, address, paymentMethod, direct: Boolean(buyNow), giftWrap, noWrapShops });
      if (!quote.ok) throw new HttpError(quote.issues[0].code === "PHOTOS_REQUIRED" ? 422 : 409, quote.issues[0].code === "PHOTOS_REQUIRED" ? "PHOTOS_REQUIRED" : "CART_NOT_READY", quote.issues[0].message, { details: { issues: quote.issues } });
      if (paymentMethod === "COD" && !quote.payment.cod.available) throw new HttpError(409, "COD_UNAVAILABLE", quote.payment.cod.reason);
      if (giftWrap && !quote.giftWrap.available) throw new HttpError(409, "GIFT_WRAP_UNAVAILABLE", quote.giftWrap.reason);
      // The customer must have seen this exact total. If a price or a fee changed since, show it first.
      if (expectedTotal !== quote.total) throw new HttpError(409, "TOTAL_CHANGED", `The total is now ${rupees(quote.total)}. Please review your order before you continue.`, { details: { total: quote.total } });

      // Take the stock now, for both ways of paying, so nobody else can buy the same last piece.
      const wanted = new Map();
      for (const l of quote.lines) if (l.item.productId) wanted.set(l.item.productId, (wanted.get(l.item.productId) || 0) + l.item.quantity);
      const short = await reserveStock(q, wanted);
      if (short.length) {
        const s = short[0];
        throw new HttpError(409, "OUT_OF_STOCK", s.available ? `Only ${s.available} of ${s.name} ${s.available === 1 ? "is" : "are"} left. Please change the quantity in your cart.` : `${s.name} has just sold out. Please remove it from your cart.`, { details: { issues: short } });
      }

      const { id, number } = await insertOrder(q, user, { quote, address, paymentMethod, idempotencyKey });
      const actor = { id: user.id, role: "CUSTOMER" };
      if (paymentMethod === "COD") {
        await q.query("INSERT INTO payments (id, order_id, attempt, provider, method_requested, status, amount, currency) VALUES ($1, $2, 1, 'cod', 'cod', 'PENDING', $3, $4)", [newId(), id, quote.total, quote.currency]);
        await orders.addEvent(q, id, { kind: "ORDER", status: "PLACED", detail: "Cash on Delivery.", actor });
        // Exactly the lines that were bought leave the cart (a "Buy Now" item was never in it).
        await removePurchased(q, user.id, quote.lines.map((l) => ({ cartItemId: l.cartItemId, quantity: l.item.quantity })));
      } else {
        await orders.addEvent(q, id, { kind: "ORDER", status: "PENDING_PAYMENT", detail: "Waiting for the online payment.", actor });
      }
      return { id, number };
    });
  } catch (error) {
    // Two identical requests at the same moment: the database let one through (UNIQUE user + key). Answer with that order.
    if (error && error.code === "23505") {
      const winner = await find();
      if (winner) return resume(user, winner, { paymentMethod, paymentChannel });
    }
    throw error;
  }

  if (paymentMethod === "COD") {
    orders.notify(created.id, "ORDER_PLACED_COD");
    return { order: await orders.getOwnOrder(user.id, created.number), payment: null };
  }
  // The order exists and holds its stock. If the gateway can't be reached now, the customer retries the payment on the same order.
  try {
    const { session } = await payments.openAttempt(await orders.orderRowById(created.id), paymentChannel);
    return { order: await orders.getOwnOrder(user.id, created.number), payment: session };
  } catch (error) {
    if (error.code !== "PAYMENT_GATEWAY_ERROR") throw error;
    return { order: await orders.getOwnOrder(user.id, created.number), payment: null, paymentError: { code: error.code, message: error.message } };
  }
}

/* ==========================================================================
   /api/cart — the logged-in user's cart. Every route needs a session.

   There is no cart id in any address or body: the cart is the one that
   belongs to the session's user. An item id is only looked for inside that
   cart, so another customer's item id answers 404.

   Bodies are read field by field. "price", "unitPrice", "total", "userId" or
   "cartId" sent by a browser are never looked at.
   ========================================================================== */
import { Router } from "express";
import { siteEngine } from "../catalog/site-engine.js";
import { config } from "../config.js";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as cart from "../services/cart-service.js";

const router = Router();
router.use(requireAuth);

const write = rateLimit("cart-write", { windowMs: 60_000, max: 120 });

/** A whole number of items, 1 up to the most any line may hold. */
function quantityFrom(value, { fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== null) return fallback;
    throw errors.validation({ quantity: "Quantity is required." });
  }
  const max = siteEngine().model.MAX_CART_QTY;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1) throw errors.validation({ quantity: "Quantity must be a whole number, 1 or more." });
  if (n > max) throw errors.validation({ quantity: `You can add up to ${max} of one item.` });
  return n;
}

/**
 * An item as a browser describes it, read field by field (the same shape for
 * "add to cart" and for "Buy Now"):
 *   { productId, quantity?, selection?: { sizeId, colorId, printMaterialId, protection }, note?,
 *     photos?,                          the customer's uploaded photos: { photo1: "<upload id>", ... }
 *                                       or [{ slot, uploadId, placement? }]. Required for every
 *                                       product that is made from the customer's photo.
 *     customization?, thumbnail? }      Home Decor custom-photo sets / a small preview picture
 *   { kind: "studio", design: { id, config, thumbnail? }, photos?, quantity? }
 * Prices, names and anything else in the body are never read. A customisation
 * is checked and rebuilt by the cart service before anything is stored, and
 * photo ids only count when they are uploads of the logged-in account.
 */
function readPhotos(value) {
  if (Array.isArray(value)) return value.slice(0, 24);
  return value && typeof value === "object" ? value : null;
}

export function readItem(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const quantity = quantityFrom(body.quantity, { fallback: 1 });
  if (body.kind === "studio") {
    const design = body.design && typeof body.design === "object" ? body.design : {};
    return { kind: "studio", designId: design.id, config: design.config, thumbnail: design.thumbnail, quantity, photos: readPhotos(body.photos) };
  }
  const data = validate(body, {
    productId: v.string({ min: 1, max: 80, label: "Product", pattern: /^[\w.:-]+$/, patternMessage: "That product isn't valid." }),
    note: v.string({ max: config.cart.noteMaxLength, label: "Note" })
  });
  const customization = body.customization && typeof body.customization === "object" && !Array.isArray(body.customization) ? body.customization : null;
  return { kind: "product", productId: data.productId, quantity, selection: cart.cleanSelection(body.selection), note: data.note, customization, thumbnail: typeof body.thumbnail === "string" ? body.thumbnail : null, photos: readPhotos(body.photos) };
}

router.get("/", async (req, res) => res.json({ cart: await cart.getCart(req.auth.user.id) }));

// Add a product:  { productId, quantity?, selection?: { sizeId, colorId, printMaterialId, protection }, note?, photos? }
// Add a design:   { kind: "studio", design: { id, config, thumbnail? }, photos?, quantity? }
router.post("/items", write, async (req, res) => {
  const item = readItem(req.body);
  const result = item.kind === "studio" ? await cart.addDesign(req.auth.user.id, item) : await cart.addProduct(req.auth.user.id, item);
  res.status(201).json(result);
});

router.patch("/items/:itemId", write, async (req, res) => {
  const quantity = quantityFrom(req.body && req.body.quantity);
  res.json(await cart.setQuantity(req.auth.user.id, req.params.itemId, quantity));
});

router.delete("/items/:itemId", write, async (req, res) => res.json(await cart.removeItem(req.auth.user.id, req.params.itemId)));

router.delete("/", write, async (req, res) => res.json(await cart.clearCart(req.auth.user.id)));

// The check to run before checkout: availability, quantities and today's prices.
router.post("/validate", write, async (req, res) => res.json(await cart.validateCart(req.auth.user.id)));

export default router;

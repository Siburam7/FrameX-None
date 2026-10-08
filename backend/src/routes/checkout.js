/* ==========================================================================
   /api/checkout — the price of the logged-in user's cart, and placing the order.

   The body of "place order" is read field by field. Amounts, prices, item
   lists, user ids or statuses sent by a browser are never used: the order is
   built from the user's cart in the database. `expectedTotal` is only
   compared with the server's own total.
   ========================================================================== */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as checkout from "../services/checkout-service.js";
import { readItem } from "./cart.js";

const router = Router();
router.use(requireAuth);

const METHODS = ["COD", "ONLINE"];
const CHANNELS = ["upi", "card", "netbanking", "wallet"];

// What the checkout page shows: items, discounts, tax, shipping, gift wrapping, COD fee, total, and the ways to pay.
// giftWrap=true adds the gift-wrapping fee when the order can be wrapped.
router.get("/quote", async (req, res) => {
  const { addressId, paymentMethod, giftWrap } = validate(req.query, { addressId: v.string({ max: 40 }), paymentMethod: v.enumOf(METHODS, { required: false, label: "Payment method" }), giftWrap: v.boolean() });
  res.json({ quote: await checkout.getQuote(req.auth.user.id, { addressId: addressId || null, paymentMethod: paymentMethod || null, giftWrap }) });
});

// The same quote for "Buy Now": one item sent in the body instead of the cart.
//   { addressId?, paymentMethod?, giftWrap?, buyNow: { productId, quantity, selection, note, photos? } | { kind: "studio", design, photos?, quantity } }
router.post("/quote", rateLimit("quote", { windowMs: 60_000, max: 120 }), async (req, res) => {
  const { addressId, paymentMethod, giftWrap } = validate(req.body, { addressId: v.string({ max: 40 }), paymentMethod: v.enumOf(METHODS, { required: false, label: "Payment method" }), giftWrap: v.boolean() });
  const buyNow = req.body && req.body.buyNow ? readItem(req.body.buyNow) : null;
  res.json({ quote: await checkout.getQuote(req.auth.user.id, { addressId: addressId || null, paymentMethod: paymentMethod || null, buyNow, giftWrap }) });
});

// buyNow (optional) = order that one item instead of the cart.
router.post("/orders", rateLimit("place-order", { windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  const data = validate(req.body, {
    addressId: v.string({ min: 1, max: 40, label: "Delivery address" }),
    paymentMethod: v.enumOf(METHODS, { label: "Payment method" }),
    paymentChannel: v.enumOf(CHANNELS, { required: false, label: "Payment option" }),
    idempotencyKey: v.string({ min: 16, max: 80, label: "Checkout" }),
    giftWrap: v.boolean()
  });
  const expectedTotal = req.body ? req.body.expectedTotal : undefined;
  if (!Number.isInteger(expectedTotal) || expectedTotal < 0) throw errors.validation({ expectedTotal: "Reload the page and try again." });
  const buyNow = req.body.buyNow ? readItem(req.body.buyNow) : null;
  const result = await checkout.placeOrder(req.auth.user, { ...data, paymentChannel: data.paymentChannel || null, expectedTotal, buyNow });
  res.status(result.repeated ? 200 : 201).json({ order: result.order, payment: result.payment, paymentError: result.paymentError || null });
});

export default router;

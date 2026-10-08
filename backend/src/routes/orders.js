/* ==========================================================================
   /api/orders — the logged-in user's own orders and their payments.
   Every lookup is "this order number AND this user": someone else's order
   number answers 404, exactly like a number that doesn't exist.

   /api/payments/webhook/<gateway> is not here: it has no session (the gateway
   calls it) and is mounted in app.js before the browser-only middleware.
   ========================================================================== */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as orders from "../services/order-service.js";
import * as payments from "../services/payment-service.js";

const router = Router();
router.use(requireAuth);

const pay = rateLimit("order-payment", { windowMs: 10 * 60_000, max: 60 });
const gatewayId = (label) => v.string({ min: 1, max: 100, label, pattern: /^[\w.:-]+$/, patternMessage: `${label} is not valid.` });

router.get("/", async (req, res) => {
  const { page, limit } = validate(req.query, { page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 50, required: false }) });
  res.json(await orders.listOwnOrders(req.auth.user.id, { page: page || 1, limit: limit || 10 }));
});

router.get("/:orderNumber", async (req, res) => res.json({ order: await orders.getOwnOrder(req.auth.user.id, req.params.orderNumber) }));

// A short-lived link to one of the customer's own photos in their own order.
router.post("/:orderNumber/photos/:uploadId/link", rateLimit("file-link", { windowMs: 60_000, max: 120 }), async (req, res) => {
  res.json({ link: await orders.ownPhotoLink(req.auth.user.id, req.params.orderNumber, req.params.uploadId, { download: Boolean(req.body && req.body.download) }) });
});

// "Retry payment": a new attempt on the same order (never a new order).
router.post("/:orderNumber/payments", pay, async (req, res) => {
  const { paymentChannel } = validate(req.body, { paymentChannel: v.enumOf(["upi", "card", "netbanking", "wallet"], { required: false, label: "Payment option" }) });
  res.json(await payments.retryPayment(req.auth.user.id, req.params.orderNumber, paymentChannel || null));
});

// What the gateway's checkout handed the browser. The server checks the signature and then asks the gateway itself.
router.post("/:orderNumber/payments/verify", pay, async (req, res) => {
  const proof = validate(req.body, { gatewayOrderId: gatewayId("Payment reference"), gatewayPaymentId: gatewayId("Payment reference"), signature: v.string({ min: 16, max: 256, label: "Signature" }) });
  res.json({ order: await payments.verifyCheckout(req.auth.user.id, req.params.orderNumber, proof) });
});

// The browser reports "failed" or "closed". Treated as a hint to go and ask the gateway.
router.post("/:orderNumber/payments/outcome", pay, async (req, res) => {
  const data = validate(req.body, { reason: v.enumOf(["failed", "dismissed", "returned"], { label: "Outcome" }), gatewayPaymentId: v.string({ max: 100, pattern: /^[\w.:-]*$/ }) });
  res.json({ order: await payments.reportOutcome(req.auth.user.id, req.params.orderNumber, { reason: data.reason, gatewayPaymentId: data.gatewayPaymentId || null }) });
});

// An order waiting for its payment: ask the gateway whether the money has arrived.
router.post("/:orderNumber/payments/refresh", pay, async (req, res) => res.json({ order: await payments.refresh(req.auth.user.id, req.params.orderNumber) }));

router.post("/:orderNumber/cancel", pay, async (req, res) => {
  const user = req.auth.user;
  const { reason } = validate(req.body, { reason: v.string({ max: 200, label: "Reason" }) });
  const order = await orders.ownOrderRow(user.id, req.params.orderNumber);
  await payments.cancelOrder(order, { from: orders.CUSTOMER_CAN_CANCEL, reason: reason || "Cancelled by the customer.", actor: { id: user.id, role: "CUSTOMER" }, ip: req.ip });
  res.json({ order: await orders.getOwnOrder(user.id, req.params.orderNumber) });
});

export default router;

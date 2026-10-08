/* ==========================================================================
   /api/paintings — a logged-in customer's custom painting requests.

     POST /                        send a request to an artist (no payment)
     GET  /                        your requests
     GET  /:number                 one request
     POST /:number/cancel          cancel a request nothing was paid for yet
     POST /:number/delivered       "I received it"
     POST /:number/photos/:uploadId/link   a short-lived link to your own reference photo

     POST /:number/payments            pay what is due now (the advance, or the remaining amount)
     POST /:number/payments/verify     a signed checkout result (gateways that sign theirs)
     POST /:number/payments/outcome    the checkout window closed / failed / was completed
     POST /:number/payments/refresh    did the money arrive?

   A request number only ever works for the account that made the request.
   Which amount is payable, and whether anything is, is decided by the server
   from the request's status. Nothing about money is read from the browser.

   /api/notifications and /api/reviews are in this file too: both are short
   and belong to the logged-in user.
   ========================================================================== */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as notifications from "../services/notification-service.js";
import * as payments from "../services/painting-payment-service.js";
import * as paintings from "../services/painting-service.js";
import * as reviews from "../services/review-service.js";

const router = Router();
router.use(requireAuth);
const pay = rateLimit("painting-payment", { windowMs: 10 * 60_000, max: 60 });
const gatewayId = (label) => v.string({ min: 1, max: 100, label, pattern: /^[\w.:-]+$/, patternMessage: `${label} is not valid.` });

router.post("/", rateLimit("painting-request", { windowMs: 60 * 60_000, max: 20 }), async (req, res) => {
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const data = validate(b, { artist: v.string({ min: 3, max: 40, label: "Artist" }), serviceId: v.string({ min: 1, max: 40, label: "Service" }), instructions: v.string({ max: 1500, label: "Instructions" }), addressId: v.string({ min: 1, max: 40, label: "Delivery address" }), idempotencyKey: v.string({ min: 16, max: 80 }) });
  res.status(201).json({ request: await paintings.createRequest(req.auth.user, { ...data, uploadIds: Array.isArray(b.uploadIds) ? b.uploadIds.slice(0, 20) : [] }, req.ip) });
});

router.get("/", async (req, res) => {
  const { page, limit } = validate(req.query, { page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 50, required: false }) });
  res.json(await paintings.listOwnRequests(req.auth.user.id, { page: page || 1, limit: limit || 10 }));
});

router.get("/:number", async (req, res) => res.json({ request: await paintings.getOwnRequest(req.auth.user.id, req.params.number) }));

router.post("/:number/cancel", async (req, res) => {
  const { reason } = validate(req.body, { reason: v.string({ max: 300, label: "Reason" }) });
  res.json({ request: await paintings.cancelOwn(req.auth.user, req.params.number, reason, req.ip) });
});

router.post("/:number/delivered", async (req, res) => res.json({ request: await paintings.confirmDelivery(req.auth.user, req.params.number) }));

router.post("/:number/photos/:uploadId/link", rateLimit("file-link", { windowMs: 60_000, max: 120 }), async (req, res) => {
  res.json({ link: await paintings.ownPhotoLink(req.auth.user.id, req.params.number, req.params.uploadId, { download: Boolean(req.body && req.body.download) }) });
});

/* ---- Payments ---- */

router.post("/:number/payments", pay, async (req, res) => {
  const { paymentChannel } = validate(req.body, { paymentChannel: v.enumOf(["upi", "card", "netbanking", "wallet"], { required: false, label: "Payment option" }) });
  res.json(await payments.startPayment(req.auth.user.id, req.params.number, paymentChannel || null));
});

router.post("/:number/payments/verify", pay, async (req, res) => {
  const proof = validate(req.body, { gatewayOrderId: gatewayId("Payment reference"), gatewayPaymentId: gatewayId("Payment reference"), signature: v.string({ min: 16, max: 256, label: "Signature" }) });
  res.json({ request: await payments.verifyCheckout(req.auth.user.id, req.params.number, proof) });
});

router.post("/:number/payments/outcome", pay, async (req, res) => {
  const data = validate(req.body, { reason: v.enumOf(["failed", "dismissed", "returned"], { label: "Outcome" }), gatewayPaymentId: v.string({ max: 100, pattern: /^[\w.:-]*$/ }) });
  res.json({ request: await payments.reportOutcome(req.auth.user.id, req.params.number, { reason: data.reason, gatewayPaymentId: data.gatewayPaymentId || null }) });
});

router.post("/:number/payments/refresh", pay, async (req, res) => res.json({ request: await payments.refresh(req.auth.user.id, req.params.number) }));

export default router;

/* ---------------------------------------------------------------- /api/notifications */

export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);

notificationRoutes.get("/", async (req, res) => {
  const { page, limit } = validate(req.query, { page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 50, required: false }) });
  res.json(await notifications.listOwn(req.auth.user.id, { page: page || 1, limit: limit || 20 }));
});
notificationRoutes.get("/unread", async (req, res) => res.json({ unread: await notifications.unreadCount(req.auth.user.id) }));
notificationRoutes.post("/read", async (req, res) => res.json({ unread: await notifications.markRead(req.auth.user.id, null) }));
notificationRoutes.post("/:id/read", async (req, res) => res.json({ unread: await notifications.markRead(req.auth.user.id, req.params.id) }));

/* ---------------------------------------------------------------- /api/reviews */

export const reviewRoutes = Router();

// Anyone can read published reviews.
reviewRoutes.get("/", async (req, res) => {
  const f = validate(req.query, { targetType: v.enumOf(reviews.TARGET_TYPES, { label: "Kind" }), targetId: v.string({ min: 1, max: 80, label: "Target" }), page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 50, required: false }) });
  res.json(await reviews.listFor(f.targetType, f.targetId, { page: f.page || 1, limit: f.limit || 10 }));
});
reviewRoutes.get("/latest", async (req, res) => res.json({ items: await reviews.latest({ limit: 8 }) }));

// What can I review from this delivered order or painting?
reviewRoutes.get("/mine", requireAuth, async (req, res) => {
  const f = validate(req.query, { sourceType: v.enumOf(["ORDER", "PAINTING"], { label: "Source" }), sourceId: v.string({ min: 3, max: 40, label: "Reference" }) });
  res.json({ items: await reviews.reviewable(req.auth.user.id, f) });
});

reviewRoutes.post("/", requireAuth, rateLimit("review", { windowMs: 60 * 60_000, max: 30 }), async (req, res) => {
  const data = validate(req.body, {
    targetType: v.enumOf(reviews.TARGET_TYPES, { label: "Kind" }),
    targetId: v.string({ min: 1, max: 80, label: "Target" }),
    sourceType: v.enumOf(["ORDER", "PAINTING"], { label: "Source" }),
    sourceId: v.string({ min: 3, max: 40, label: "Reference" }),
    rating: v.number({ min: 1, max: 5, label: "Rating" }),
    body: v.string({ max: 1500, label: "Review" })
  });
  res.status(201).json({ review: await reviews.saveReview(req.auth.user, data) });
});

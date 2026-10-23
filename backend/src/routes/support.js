/* /api/support — the logged-in customer's help chat (services/support-service.js).

     GET  /           the conversation (open one, else the latest) with its messages, or null
     GET  /unread     { unread }: FrameX answers not seen yet (the chat button's badge)
     POST /messages   { body, orderNumber?, topic? } write to FrameX
     POST /read       the customer has seen the conversation */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as support from "../services/support-service.js";

const router = Router();
router.use(requireAuth);
// The chat is for customers; shops and artists talk to FrameX from their dashboards.
router.use((req, res, next) => (req.auth.user.role === "CUSTOMER" ? next() : next(errors.forbidden("The help chat is for customer accounts."))));

router.get("/", async (req, res) => res.json({ thread: await support.ownThread(req.auth.user.id) }));
router.get("/unread", async (req, res) => res.json({ unread: await support.unreadCount(req.auth.user.id) }));
router.post("/messages", rateLimit("support", { windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  const data = validate(req.body, {
    body: v.string({ min: 1, max: 2000, label: "Message" }),
    orderNumber: v.string({ max: 20, label: "Order", pattern: /^(FX-\d{6,})?$/, patternMessage: "That isn't an order number." }),
    topic: v.enumOf(support.TOPICS, { required: false, label: "Topic" })
  });
  res.status(201).json({ thread: await support.customerSend(req.auth.user, { body: data.body.trim(), orderNumber: data.orderNumber, topic: data.topic || "" }) });
});
router.post("/read", async (req, res) => res.json(await support.customerRead(req.auth.user.id)));

export default router;

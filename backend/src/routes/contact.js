/* /api/contact — a message from the Contact page. Anyone may send one; nobody can read them here (see /api/admin/messages). */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import * as contact from "../services/contact-service.js";

const router = Router();

router.post("/", rateLimit("contact", { windowMs: 60 * 60_000, max: 6 }), async (req, res) => {
  const data = validate(req.body, {
    name: v.string({ min: 2, max: 80, label: "Name" }),
    email: v.email(),
    phone: v.string({ max: 30, label: "Phone", pattern: /^[+\d][\d\s\-()]{6,}$/, patternMessage: "Enter a valid phone number, or leave it empty." }),
    subject: v.string({ min: 3, max: 150, label: "Subject" }),
    message: v.string({ min: 10, max: 4000, label: "Message" }),
    // Not a real field: the page hides it from people. A program that fills in every box gives itself away.
    fxhp: v.string({ max: 200 })
  });
  if (!data.fxhp) await contact.submit(data, { user: req.auth ? req.auth.user : null });
  res.status(201).json({ received: true });
});

export default router;

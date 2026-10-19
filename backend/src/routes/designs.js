/* /api/designs — FrameX Studio designs saved in the logged-in account (services/design-service.js).

     GET    /             the account's designs (newest first, without their full configuration)
     GET    /:id          one design with its configuration
     POST   /             save a new one   { title, mode, templateId?, productId?, config, photos: { slot: uploadId }, thumbnail? }
     PUT    /:id          replace one of the account's own (same body)
     DELETE /:id          delete one */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import * as designs from "../services/design-service.js";

const router = Router();
router.use(requireAuth);
const saving = rateLimit("designs", { windowMs: 10 * 60_000, max: 120 });

router.get("/", async (req, res) => res.json({ items: await designs.list(req.auth.user.id), max: designs.MAX }));
router.get("/:id", async (req, res) => res.json({ design: await designs.get(req.auth.user.id, req.params.id) }));
router.post("/", saving, async (req, res) => res.status(201).json({ design: await designs.save(req.auth.user.id, req.body) }));
router.put("/:id", saving, async (req, res) => res.json({ design: await designs.save(req.auth.user.id, req.body, req.params.id) }));
router.delete("/:id", async (req, res) => {
  await designs.remove(req.auth.user.id, req.params.id);
  res.json({ ok: true });
});

export default router;

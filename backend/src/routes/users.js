/* /api/users — the logged-in user's own profile (any role). */
import { Router } from "express";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { publicUser, updateProfile } from "../services/auth-service.js";

const router = Router();
router.use(requireAuth);

router.get("/me", async (req, res) => res.json({ user: await publicUser(req.auth.user.id) }));

// Name and phone only. Email, role and status can't be changed from here.
router.patch("/me", async (req, res) => {
  const data = validate(req.body, { name: v.optional(v.string({ min: 2, max: 80, label: "Name" })), phone: v.optional(v.phone()) });
  await updateProfile(req.auth.user.id, data);
  res.json({ user: await publicUser(req.auth.user.id) });
});

export default router;

/* /api/users — the logged-in user's own profile (any role), their data, and deleting a customer account. */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { clearSessionCookie } from "../lib/security.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { blockers, deleteAccount, exportData } from "../services/account-service.js";
import { publicUser, updateProfile } from "../services/auth-service.js";

const router = Router();
router.use(requireAuth);
const MINUTE = 60_000;

router.get("/me", async (req, res) => res.json({ user: await publicUser(req.auth.user.id) }));

// Name and phone only. Email, role and status can't be changed from here.
router.patch("/me", async (req, res) => {
  const data = validate(req.body, { name: v.optional(v.string({ min: 2, max: 80, label: "Name" })), phone: v.optional(v.phone()) });
  await updateProfile(req.auth.user.id, data);
  res.json({ user: await publicUser(req.auth.user.id) });
});

// Everything FrameX keeps about this account, as a .json file to save
router.get("/me/data", rateLimit("my-data", { windowMs: 10 * MINUTE, max: 10 }), async (req, res) => {
  const data = await exportData(req.auth.user.id);
  res.set("Content-Disposition", `attachment; filename="framex-my-data-${data.exportedAt.slice(0, 10)}.json"`);
  res.json(data);
});

// Can this account be deleted now? (the orders and custom paintings still under way)
router.get("/me/deletion", async (req, res) => res.json({ canDelete: req.auth.user.role === "CUSTOMER" && !(await blockers(req.auth.user.id)).length, customer: req.auth.user.role === "CUSTOMER", waiting: await blockers(req.auth.user.id) }));

// { password, confirm: "DELETE" } -> the account is deleted and this browser logged out
router.post("/me/delete", rateLimit("delete-account", { windowMs: 15 * MINUTE, max: 10 }), async (req, res) => {
  const result = await deleteAccount(req.auth.user, { password: req.body && req.body.password, confirm: req.body && req.body.confirm }, { ip: req.ip });
  clearSessionCookie(res);
  res.json(result);
});

export default router;

/* /api/addresses — the logged-in user's delivery addresses. An id only works for its owner. */
import { Router } from "express";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as addresses from "../services/address-service.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => res.json({ items: await addresses.listAddresses(req.auth.user.id), states: addresses.INDIAN_STATES }));

router.post("/", async (req, res) => {
  const { makeDefault } = validate(req.body, { makeDefault: v.boolean() });
  const address = await addresses.addAddress(req.auth.user.id, addresses.readAddress(req.body), { makeDefault });
  res.status(201).json({ address, items: await addresses.listAddresses(req.auth.user.id) });
});

router.patch("/:id", async (req, res) => {
  const address = await addresses.updateAddress(req.auth.user.id, req.params.id, addresses.readAddress(req.body));
  res.json({ address, items: await addresses.listAddresses(req.auth.user.id) });
});

router.post("/:id/default", async (req, res) => res.json({ items: await addresses.setDefaultAddress(req.auth.user.id, req.params.id) }));

router.delete("/:id", async (req, res) => res.json({ items: await addresses.deleteAddress(req.auth.user.id, req.params.id) }));

export default router;
